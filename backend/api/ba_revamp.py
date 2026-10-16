"""MIS Revamp BAs: cut operational history from an old BA onto a new BA."""

from __future__ import annotations

from datetime import date

from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from .models import (
    Ambassador,
    AmbassadorComplaint,
    BaAttendanceDay,
    BaDailyReport,
    BaIncentivePayout,
    BaTarget,
    ShiftAssignment,
    Store,
    UserInterception,
)

NEW_BA_OK_STATUSES = {
    Ambassador.Status.CERTIFIED,
    Ambassador.Status.DEPLOYED,
    Ambassador.Status.ON_LEAVE,
}


def _parse_iso_date(raw) -> date | None:
    if raw in (None, ''):
        return None
    try:
        return date.fromisoformat(str(raw)[:10])
    except (TypeError, ValueError):
        return False  # type: ignore[return-value]


def _months_in_range(from_date: date | None, to_date: date | None) -> list[str] | None:
    if not from_date and not to_date:
        return None
    start = from_date or to_date
    end = to_date or from_date
    assert start and end
    months: list[str] = []
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        months.append(f'{y:04d}-{m:02d}')
        m += 1
        if m > 12:
            m = 1
            y += 1
    return months


def _apply_date_filter(qs: QuerySet, field: str, from_date: date | None, to_date: date | None) -> QuerySet:
    if from_date:
        qs = qs.filter(**{f'{field}__gte': from_date})
    if to_date:
        qs = qs.filter(**{f'{field}__lte': to_date})
    return qs


def _apply_created_filter(qs: QuerySet, from_date: date | None, to_date: date | None) -> QuerySet:
    if from_date:
        qs = qs.filter(created_at__date__gte=from_date)
    if to_date:
        qs = qs.filter(created_at__date__lte=to_date)
    return qs


def _fmt_dates(values: list) -> str:
    out = []
    for d in sorted(set(values)):
        if isinstance(d, date):
            out.append(d.strftime('%d %b %Y'))
        else:
            out.append(str(d))
    return ', '.join(out)


def _collision_message(collisions: dict[str, list]) -> str:
    parts: list[str] = []
    reports = collisions.get('reports') or []
    if reports:
        noun = 'date' if len(reports) == 1 else 'dates'
        parts.append(f'Reports are colliding with the {noun} {_fmt_dates(reports)}')
    attendance = collisions.get('attendance') or []
    if attendance:
        noun = 'date' if len(attendance) == 1 else 'dates'
        parts.append(f'Attendance is colliding with the {noun} {_fmt_dates(attendance)}')
    targets = collisions.get('targets') or []
    if targets:
        parts.append(f'Targets are colliding: {", ".join(targets)}')
    incentives = collisions.get('incentives') or []
    if incentives:
        parts.append(f'Incentive weeks are colliding: {", ".join(incentives)}')
    shifts = collisions.get('shifts') or []
    if shifts:
        noun = 'date' if len(shifts) == 1 else 'dates'
        parts.append(f'Shifts are colliding with the {noun} {_fmt_dates(shifts)}')
    if not parts:
        return 'Revamp did not run because records collide.'
    return f'{". ".join(parts)}. Revamp did not run.'


def _target_qs(ba_id: int, from_date: date | None, to_date: date | None) -> QuerySet:
    qs = BaTarget.objects.filter(ambassador_id=ba_id)
    months = _months_in_range(from_date, to_date)
    if months is not None:
        qs = qs.filter(month__in=months)
    return qs


def _incentive_qs(ba_id: int, from_date: date | None, to_date: date | None) -> QuerySet:
    qs = BaIncentivePayout.objects.filter(ambassador_id=ba_id)
    if from_date:
        qs = qs.filter(week_end__gte=from_date)
    if to_date:
        qs = qs.filter(week_start__lte=to_date)
    return qs


def _recalc_store_bas(store_id: int | None) -> None:
    if not store_id:
        return
    store = Store.objects.filter(pk=store_id).first()
    if not store:
        return
    store.bas = Ambassador.objects.filter(
        store_id=store.id,
        status=Ambassador.Status.DEPLOYED,
    ).count()
    store.save(update_fields=['bas', 'updated_at'])


def _checkout_open_shifts(ambassador: Ambassador) -> int:
    now = timezone.now()
    n = 0
    open_shifts = ShiftAssignment.objects.filter(
        ambassador=ambassador,
        checked_in_at__isnull=False,
        checked_out_at__isnull=True,
    )
    for shift in open_shifts:
        shift.checked_out_at = now
        shift.save(update_fields=['checked_out_at', 'updated_at'])
        n += 1
    return n


def plan_revamp(
    *,
    old_id: int,
    new_id: int,
    from_date: date | None,
    to_date: date | None,
) -> dict:
    errors: list[str] = []
    if old_id == new_id:
        errors.append('Choose two different BAs.')

    old = Ambassador.objects.select_related('store').filter(pk=old_id).first()
    new = Ambassador.objects.select_related('store').filter(pk=new_id).first()
    if not old:
        errors.append('Old BA was not found.')
    if not new:
        errors.append('New BA was not found.')
    if old and old.status == Ambassador.Status.REJECTED:
        errors.append('A rejected BA cannot be revamped.')
    if new and new.status == Ambassador.Status.REJECTED:
        errors.append('A rejected BA cannot receive a revamp.')
    if new and new.status not in NEW_BA_OK_STATUSES:
        errors.append(
            f'New BA must be Certified, Deployed, or Disabled (currently {new.status}).'
        )
    if (
        old
        and new
        and old.store_id
        and new.store_id
        and old.store_id != new.store_id
    ):
        errors.append(
            f'New BA is already assigned to a different store '
            f'({new.store.name if new.store else new.store_id}).'
        )

    empty = {
        'ok': False,
        'errors': errors,
        'collisions': {},
        'collisionMessage': '',
        'counts': {},
        'old': None,
        'new': None,
        'fromDate': from_date.isoformat() if from_date else None,
        'toDate': to_date.isoformat() if to_date else None,
    }
    if errors or not old or not new:
        empty['collisionMessage'] = errors[0] if errors else ''
        return empty

    report_qs = _apply_date_filter(
        BaDailyReport.objects.filter(ambassador_id=old.id), 'date', from_date, to_date
    )
    attendance_qs = _apply_date_filter(
        BaAttendanceDay.objects.filter(ambassador_id=old.id), 'date', from_date, to_date
    )
    shift_qs = _apply_date_filter(
        ShiftAssignment.objects.filter(ambassador_id=old.id), 'date', from_date, to_date
    )
    target_qs = _target_qs(old.id, from_date, to_date)
    incentive_qs = _incentive_qs(old.id, from_date, to_date)
    interception_qs = _apply_created_filter(
        UserInterception.objects.filter(ambassador_id=old.id), from_date, to_date
    )
    complaint_qs = _apply_created_filter(
        AmbassadorComplaint.objects.filter(ambassador_id=old.id), from_date, to_date
    )

    old_report_dates = set(report_qs.values_list('date', flat=True))
    new_report_dates = set(
        BaDailyReport.objects.filter(
            ambassador_id=new.id, date__in=old_report_dates
        ).values_list('date', flat=True)
    ) if old_report_dates else set()

    old_att_dates = set(attendance_qs.values_list('date', flat=True))
    new_att_dates = set(
        BaAttendanceDay.objects.filter(
            ambassador_id=new.id, date__in=old_att_dates
        ).values_list('date', flat=True)
    ) if old_att_dates else set()

    old_shift_dates = set(shift_qs.values_list('date', flat=True))
    new_shift_dates = set(
        ShiftAssignment.objects.filter(
            ambassador_id=new.id, date__in=old_shift_dates
        ).values_list('date', flat=True)
    ) if old_shift_dates else set()

    old_targets = list(target_qs.values_list('month', 'sku'))
    colliding_targets: list[str] = []
    if old_targets:
        new_target_keys = set(
            BaTarget.objects.filter(ambassador_id=new.id).values_list('month', 'sku')
        )
        for month, sku in old_targets:
            if (month, sku) in new_target_keys:
                colliding_targets.append(f'{month} / {sku or "overall"}')

    old_weeks = list(incentive_qs.values_list('week_start', flat=True))
    colliding_weeks: list[str] = []
    if old_weeks:
        new_weeks = set(
            BaIncentivePayout.objects.filter(
                ambassador_id=new.id, week_start__in=old_weeks
            ).values_list('week_start', flat=True)
        )
        colliding_weeks = [d.isoformat() for d in sorted(new_weeks)]

    collisions = {
        'reports': sorted(new_report_dates),
        'attendance': sorted(new_att_dates),
        'shifts': sorted(new_shift_dates),
        'targets': colliding_targets,
        'incentives': colliding_weeks,
    }
    has_collision = any(collisions[k] for k in collisions)
    collision_message = _collision_message(collisions) if has_collision else ''

    def ba_payload(ba: Ambassador) -> dict:
        return {
            'id': ba.id,
            'name': ba.name,
            'code': ba.code or '',
            'status': ba.status,
            'storeId': ba.store_id,
            'storeName': ba.store.name if ba.store else '',
        }

    return {
        'ok': not has_collision,
        'errors': [],
        'collisions': {
            'reports': [d.isoformat() for d in collisions['reports']],
            'attendance': [d.isoformat() for d in collisions['attendance']],
            'shifts': [d.isoformat() for d in collisions['shifts']],
            'targets': collisions['targets'],
            'incentives': collisions['incentives'],
        },
        'collisionMessage': collision_message,
        'counts': {
            'reports': report_qs.count(),
            'targets': target_qs.count(),
            'attendance': attendance_qs.count(),
            'shifts': shift_qs.count(),
            'interceptions': interception_qs.count(),
            'complaints': complaint_qs.count(),
            'incentives': incentive_qs.count(),
        },
        'old': ba_payload(old),
        'new': ba_payload(new),
        'fromDate': from_date.isoformat() if from_date else None,
        'toDate': to_date.isoformat() if to_date else None,
        '_qs': {
            'reports': report_qs,
            'targets': target_qs,
            'attendance': attendance_qs,
            'shifts': shift_qs,
            'interceptions': interception_qs,
            'complaints': complaint_qs,
            'incentives': incentive_qs,
        },
        '_old': old,
        '_new': new,
    }


def apply_revamp(plan: dict) -> dict:
    old: Ambassador = plan['_old']
    new: Ambassador = plan['_new']
    qs = plan['_qs']
    to_date = date.fromisoformat(plan['toDate']) if plan.get('toDate') else None

    old_store_id = old.store_id
    old_status = old.status
    new_status = new.status
    new_store_id = new.store_id

    with transaction.atomic():
        _checkout_open_shifts(old)

        qs['reports'].update(ambassador_id=new.id)
        qs['targets'].update(ambassador_id=new.id)
        qs['attendance'].update(ambassador_id=new.id)
        qs['shifts'].update(ambassador_id=new.id)
        qs['interceptions'].update(ambassador_id=new.id, ba_name=new.name)
        qs['complaints'].update(ambassador_id=new.id)
        qs['incentives'].update(ambassador_id=new.id)

        leftover = ShiftAssignment.objects.none()
        if to_date:
            leftover = ShiftAssignment.objects.filter(ambassador_id=old.id, date__gt=to_date)
        leftover_dates = set(leftover.values_list('date', flat=True))
        occupied = set(
            ShiftAssignment.objects.filter(
                ambassador_id=new.id, date__in=leftover_dates
            ).values_list('date', flat=True)
        ) if leftover_dates else set()
        leftover.exclude(date__in=occupied).update(ambassador_id=new.id)

        old.status = Ambassador.Status.ON_LEAVE
        old.save(update_fields=['status', 'updated_at'])

        if old_store_id and not (new.store_id and new.store_id != old_store_id):
            new.store_id = old_store_id
        if new.store_id:
            new.status = Ambassador.Status.DEPLOYED
            if not new.deployed_at:
                new.deployed_at = timezone.now()
            new.save(update_fields=['store', 'status', 'deployed_at', 'updated_at'])
            from .shifts import ensure_today_and_tomorrow

            ensure_today_and_tomorrow(new)
        else:
            new.save(update_fields=['updated_at'])

        _recalc_store_bas(old_store_id)
        if new.store_id != old_store_id:
            _recalc_store_bas(new.store_id)
        if new_store_id and new_store_id != new.store_id:
            _recalc_store_bas(new_store_id)

    new.refresh_from_db()
    old.refresh_from_db()
    after_counts = plan['counts']
    return {
        'ok': True,
        'old': {
            'id': old.id,
            'name': old.name,
            'code': old.code or '',
            'status': old.status,
            'storeId': old.store_id,
        },
        'new': {
            'id': new.id,
            'name': new.name,
            'code': new.code or '',
            'status': new.status,
            'storeId': new.store_id,
        },
        'fromDate': plan.get('fromDate'),
        'toDate': plan.get('toDate'),
        'moved': after_counts,
        'before': {
            'oldStatus': old_status,
            'newStatus': new_status,
            'oldStoreId': old_store_id,
            'newStoreId': new_store_id,
        },
    }


def parse_revamp_dates(data: dict) -> tuple[date | None, date | None, str | None]:
    raw_from = data.get('fromDate', data.get('from_date'))
    raw_to = data.get('toDate', data.get('to_date'))
    from_date = _parse_iso_date(raw_from)
    to_date = _parse_iso_date(raw_to)
    if from_date is False:
        return None, None, 'fromDate must be YYYY-MM-DD.'
    if to_date is False:
        return None, None, 'toDate must be YYYY-MM-DD.'
    if from_date and to_date and from_date > to_date:
        return None, None, 'fromDate cannot be after toDate.'
    return from_date, to_date, None
