"""MIS role APIs — mutations always write MisAuditLog rows."""

from __future__ import annotations

import re
from calendar import monthrange
from datetime import date, datetime, timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .mis_audit import is_ho_or_admin, is_mis_user, log_mis_action, require_mis
from .models import Ambassador, BaAttendanceDay, BaDailyReport, MisAuditLog, ShiftAssignment, Store, Supervisor
from .sales_report import normalize_sales_json
from .serializers import StoreSerializer, SupervisorSerializer


def _parse_month(raw: str | None) -> tuple[date, date] | None:
    if not raw:
        return None
    try:
        y, m = map(int, str(raw).split('-')[:2])
        start = date(y, m, 1)
        end = date(y, m, monthrange(y, m)[1])
        return start, end
    except (TypeError, ValueError):
        return None


def _parse_shift_minutes(label: str) -> tuple[int, int] | None:
    """Parse '10:00 AM - 6:00 PM' style labels into minutes-from-midnight."""
    if not label:
        return None
    parts = re.split(r'\s*[-–—]\s*', label.strip())
    if len(parts) != 2:
        return None

    def one(s: str) -> int | None:
        s = s.strip().upper().replace('.', '')
        for fmt in ('%I:%M %p', '%I %p', '%H:%M', '%H'):
            try:
                t = datetime.strptime(s, fmt).time()
                return t.hour * 60 + t.minute
            except ValueError:
                continue
        return None

    a, b = one(parts[0]), one(parts[1])
    if a is None or b is None:
        return None
    if b <= a:
        b += 24 * 60
    return a, b


def _ranges_overlap(a: tuple[int, int], b: tuple[int, float]) -> bool:
    return a[0] < b[1] and b[0] < a[1]


def _ba_checked_in_today(ba_id: int, today: date) -> bool:
    if BaAttendanceDay.objects.filter(
        ambassador_id=ba_id,
        date=today,
        checked_in_at__isnull=False,
        checked_out_at__isnull=True,
    ).exists():
        return True
    return ShiftAssignment.objects.filter(
        ambassador_id=ba_id,
        date=today,
        checked_in_at__isnull=False,
        checked_out_at__isnull=True,
    ).exists()


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mis_audit_logs(request):
    """GET /api/mis/audit-logs/ — HO (and MIS read-own optional: HO only for now)."""
    if not is_ho_or_admin(request.user) and not is_mis_user(request.user):
        return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

    qs = MisAuditLog.objects.select_related('mis_user', 'ambassador', 'store').all()
    action = (request.query_params.get('action') or '').strip()
    if action:
        qs = qs.filter(action=action)
    q = (request.query_params.get('q') or '').strip()
    if q:
        qs = qs.filter(
            Q(summary__icontains=q)
            | Q(mis_user__email__icontains=q)
            | Q(mis_user__first_name__icontains=q)
            | Q(mis_user__last_name__icontains=q)
        )
    date_from = request.query_params.get('from')
    date_to = request.query_params.get('to')
    if date_from:
        try:
            qs = qs.filter(created_at__date__gte=date.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            qs = qs.filter(created_at__date__lte=date.fromisoformat(date_to))
        except ValueError:
            pass

    rows = []
    for log in qs[:500]:
        user = log.mis_user
        name = ''
        email = ''
        if user:
            name = f'{user.first_name} {user.last_name}'.strip() or user.email
            email = user.email or ''
        rows.append(
            {
                'id': log.id,
                'when': log.created_at.isoformat(),
                'misUser': name,
                'misEmail': email,
                'action': log.action,
                'actionLabel': log.get_action_display(),
                'summary': log.summary,
                'before': log.before_json,
                'after': log.after_json,
            }
        )
    return Response({'results': rows})


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def mis_patch_daily_report(request, report_id: int):
    """PATCH /api/mis/daily-reports/<id>/ — edit stock/sales/competitors."""
    err = require_mis(request)
    if err:
        return err

    report = (
        BaDailyReport.objects.select_related('ambassador', 'store')
        .filter(pk=report_id)
        .first()
    )
    if not report:
        return Response({'detail': 'Report not found.'}, status=status.HTTP_404_NOT_FOUND)

    before = {
        'stock': report.stock_json if isinstance(report.stock_json, dict) else {},
        'sales': report.sales_json if isinstance(report.sales_json, dict) else {},
        'otherBrands': report.other_brands_json
        if isinstance(report.other_brands_json, list)
        else [],
    }

    stock = request.data.get('stock', request.data.get('stock_json'))
    sales = request.data.get('sales', request.data.get('sales_json'))
    other = request.data.get('otherBrands', request.data.get('other_brands_json'))

    if isinstance(stock, dict):
        report.stock_json = stock
    if isinstance(sales, dict):
        report.sales_json = normalize_sales_json(sales)
    if isinstance(other, list):
        report.other_brands_json = other
    report.save()

    after = {
        'stock': report.stock_json,
        'sales': report.sales_json,
        'otherBrands': report.other_brands_json,
    }
    ba_name = report.ambassador.name if report.ambassador_id else 'BA'
    source = report.source or 'checkout'
    log_mis_action(
        user=request.user,
        action=MisAuditLog.Action.EDIT_DAILY_REPORT,
        summary=f'Edited stock, sales, competitors for {ba_name} ({source}).',
        before=before,
        after=after,
        ambassador=report.ambassador,
        store=report.store,
        report=report,
    )
    return Response(
        {
            'id': report.id,
            'stock': report.stock_json,
            'sales': report.sales_json,
            'otherBrands': report.other_brands_json,
        }
    )


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def mis_patch_ambassador(request, ambassador_id: int):
    """PATCH /api/mis/ambassadors/<id>/ — profile + clear today's check-in/out."""
    err = require_mis(request)
    if err:
        return err

    ba = Ambassador.objects.select_related('store').filter(pk=ambassador_id).first()
    if not ba:
        return Response({'detail': 'Ambassador not found.'}, status=status.HTTP_404_NOT_FOUND)

    today = timezone.localdate()
    att = BaAttendanceDay.objects.filter(ambassador=ba, date=today).first()
    shift = (
        ShiftAssignment.objects.filter(ambassador=ba, date=today)
        .order_by('-checked_in_at', '-id')
        .first()
    )

    before = {
        'name': ba.name,
        'city': ba.city,
        'phone': ba.phone,
        'email': ba.email,
        'checkedInAt': (att.checked_in_at or (shift.checked_in_at if shift else None)),
        'checkedOutAt': (att.checked_out_at or (shift.checked_out_at if shift else None)),
    }
    if before['checkedInAt']:
        before['checkedInAt'] = before['checkedInAt'].isoformat()
    if before['checkedOutAt']:
        before['checkedOutAt'] = before['checkedOutAt'].isoformat()

    for field in ('name', 'city', 'phone', 'email'):
        if field in request.data and request.data[field] is not None:
            setattr(ba, field, str(request.data[field]).strip())
    ba.save()

    clear_in = bool(request.data.get('clearCheckIn'))
    clear_out = bool(request.data.get('clearCheckOut'))
    set_in = request.data.get('checkedInAt')
    set_out = request.data.get('checkedOutAt')

    if clear_in or clear_out or set_in is not None or set_out is not None:
        if att is None:
            att = BaAttendanceDay.objects.create(
                ambassador=ba,
                store=ba.store,
                shift=shift,
                date=today,
            )
        if clear_in:
            att.checked_in_at = None
            att.checked_out_at = None
            if shift:
                shift.checked_in_at = None
                shift.checked_out_at = None
                shift.ba_attendance_type = ''
                shift.save(
                    update_fields=[
                        'checked_in_at',
                        'checked_out_at',
                        'ba_attendance_type',
                        'updated_at',
                    ]
                )
        else:
            if clear_out:
                att.checked_out_at = None
                if shift:
                    shift.checked_out_at = None
                    shift.save(update_fields=['checked_out_at', 'updated_at'])
            if set_in:
                try:
                    att.checked_in_at = datetime.fromisoformat(str(set_in).replace('Z', '+00:00'))
                    if shift:
                        shift.checked_in_at = att.checked_in_at
                        shift.save(update_fields=['checked_in_at', 'updated_at'])
                except ValueError:
                    pass
            if set_out:
                try:
                    att.checked_out_at = datetime.fromisoformat(str(set_out).replace('Z', '+00:00'))
                    if shift:
                        shift.checked_out_at = att.checked_out_at
                        shift.save(update_fields=['checked_out_at', 'updated_at'])
                except ValueError:
                    pass
        att.save()

    after = {
        'name': ba.name,
        'city': ba.city,
        'phone': ba.phone,
        'email': ba.email,
        'checkedInAt': att.checked_in_at.isoformat() if att and att.checked_in_at else None,
        'checkedOutAt': att.checked_out_at.isoformat() if att and att.checked_out_at else None,
    }
    action = (
        MisAuditLog.Action.EDIT_ATTENDANCE
        if (clear_in or clear_out or set_in is not None or set_out is not None)
        else MisAuditLog.Action.EDIT_AMBASSADOR
    )
    summary = (
        f'Updated check-in/out for {ba.name} ({today.isoformat()})'
        if action == MisAuditLog.Action.EDIT_ATTENDANCE
        else f'Updated ambassador profile for {ba.name}'
    )
    log_mis_action(
        user=request.user,
        action=action,
        summary=summary,
        before=before,
        after=after,
        ambassador=ba,
        store=ba.store,
    )
    return Response(after)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def mis_patch_store(request, store_id: int):
    err = require_mis(request)
    if err:
        return err
    store = Store.objects.filter(pk=store_id).first()
    if not store:
        return Response({'detail': 'Store not found.'}, status=status.HTTP_404_NOT_FOUND)

    before = StoreSerializer(store, context={'request': request}).data
    allowed = {
        'name',
        'code',
        'city',
        'address',
        'footfall',
        'peak_hours',
        'contact_name',
        'contact_phone',
        'latitude',
        'longitude',
        'status',
    }
    # accept camelCase from frontend
    mapping = {
        'peakHours': 'peak_hours',
        'contactName': 'contact_name',
        'contactPhone': 'contact_phone',
        'footfallLevel': 'footfall',
    }
    data = dict(request.data)
    for src, dst in mapping.items():
        if src in data and dst not in data:
            data[dst] = data[src]

    for key in allowed:
        if key in data:
            setattr(store, key, data[key])
    store.save()
    after = StoreSerializer(store, context={'request': request}).data
    log_mis_action(
        user=request.user,
        action=MisAuditLog.Action.EDIT_STORE,
        summary=f'Updated store {store.name} ({store.code or store.id}).',
        before={'store': before},
        after={'store': after},
        store=store,
    )
    return Response(after)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def mis_patch_supervisor_stores(request, supervisor_id: int):
    err = require_mis(request)
    if err:
        return err
    supervisor = Supervisor.objects.select_related('user').filter(pk=supervisor_id).first()
    if not supervisor:
        return Response({'detail': 'Supervisor not found.'}, status=status.HTTP_404_NOT_FOUND)

    before_ids = list(supervisor.stores.values_list('id', flat=True))
    store_ids = request.data.get('storeIds', request.data.get('store_ids'))
    if not isinstance(store_ids, list):
        return Response({'detail': 'storeIds must be a list.'}, status=status.HTTP_400_BAD_REQUEST)
    stores = list(Store.objects.filter(id__in=store_ids))
    supervisor.stores.set(stores)
    after_ids = list(supervisor.stores.values_list('id', flat=True))
    log_mis_action(
        user=request.user,
        action=MisAuditLog.Action.EDIT_SUPERVISOR_STORES,
        summary=f'Updated stores for supervisor {supervisor.name}.',
        before={'storeIds': before_ids},
        after={'storeIds': after_ids},
    )
    return Response(SupervisorSerializer(supervisor, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mis_swap_candidates(request):
    """GET /api/mis/swap-candidates/?month=YYYY-MM — assigned shifts for swap dropdowns."""
    err = require_mis(request)
    if err:
        return err
    bounds = _parse_month(request.query_params.get('month'))
    if not bounds:
        today = timezone.localdate()
        bounds = date(today.year, today.month, 1), date(
            today.year, today.month, monthrange(today.year, today.month)[1]
        )
    start, end = bounds
    shifts = (
        ShiftAssignment.objects.filter(
            date__gte=start,
            date__lte=end,
            ambassador__isnull=False,
            status=ShiftAssignment.Status.SCHEDULED,
        )
        .select_related('ambassador', 'store')
        .order_by('ambassador__name', 'store__name', 'shift_label', 'date')
    )
    # One option per BA+store+shift_label for the month
    seen: set[tuple] = set()
    results = []
    for s in shifts:
        key = (s.ambassador_id, s.store_id, s.shift_label)
        if key in seen:
            continue
        seen.add(key)
        results.append(
            {
                'id': s.id,
                'ambassadorId': s.ambassador_id,
                'ambassadorName': s.ambassador.name if s.ambassador else '',
                'storeId': s.store_id,
                'storeName': s.store.name if s.store else '',
                'city': s.store.city if s.store else '',
                'shiftLabel': s.shift_label,
                'label': (
                    f'{s.ambassador.name if s.ambassador else "BA"} · '
                    f'{s.store.name if s.store else "Store"}'
                    f'{f" ({s.store.city})" if s.store and s.store.city else ""} · '
                    f'{s.shift_label}'
                ),
            }
        )
    return Response({'month': start.strftime('%Y-%m'), 'results': results})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mis_swap_bas(request):
    """
    POST /api/mis/swap-bas/
    Body: { shiftIdA, shiftIdB } or { firstShiftId, secondShiftId }
    """
    err = require_mis(request)
    if err:
        return err

    id_a = request.data.get('shiftIdA', request.data.get('firstShiftId'))
    id_b = request.data.get('shiftIdB', request.data.get('secondShiftId'))
    try:
        id_a = int(id_a)
        id_b = int(id_b)
    except (TypeError, ValueError):
        return Response({'detail': 'Two shift ids are required.'}, status=status.HTTP_400_BAD_REQUEST)
    if id_a == id_b:
        return Response({'detail': 'Select two different shifts.'}, status=status.HTTP_400_BAD_REQUEST)

    a = ShiftAssignment.objects.select_related('ambassador', 'store').filter(pk=id_a).first()
    b = ShiftAssignment.objects.select_related('ambassador', 'store').filter(pk=id_b).first()
    if not a or not b or not a.ambassador_id or not b.ambassador_id:
        return Response({'detail': 'Both shifts must be assigned.'}, status=status.HTTP_400_BAD_REQUEST)
    if a.ambassador_id == b.ambassador_id:
        return Response({'detail': 'Choose two different BAs.'}, status=status.HTTP_400_BAD_REQUEST)
    if a.store_id == b.store_id and a.shift_label == b.shift_label:
        return Response({'detail': 'Shifts already share the same store/slot.'}, status=status.HTTP_400_BAD_REQUEST)

    today = timezone.localdate()
    month_start = date(a.date.year, a.date.month, 1)
    month_end = date(a.date.year, a.date.month, monthrange(a.date.year, a.date.month)[1])

    effective_from = today
    if _ba_checked_in_today(a.ambassador_id, today) or _ba_checked_in_today(b.ambassador_id, today):
        effective_from = today + timedelta(days=1)

    if effective_from > month_end:
        return Response(
            {'detail': 'Both BAs are checked in and no remaining days this month to apply the swap.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    store_a, store_b = a.store_id, b.store_id
    ba_a, ba_b = a.ambassador_id, b.ambassador_id
    label_a, label_b = a.shift_label, b.shift_label

    # Future shifts for these BA+slot patterns in the month
    qs_a = ShiftAssignment.objects.filter(
        ambassador_id=ba_a,
        store_id=store_a,
        shift_label=label_a,
        date__gte=max(effective_from, month_start),
        date__lte=month_end,
    )
    qs_b = ShiftAssignment.objects.filter(
        ambassador_id=ba_b,
        store_id=store_b,
        shift_label=label_b,
        date__gte=max(effective_from, month_start),
        date__lte=month_end,
    )

    # Overlap check after hypothetical store swap: each BA keeps times, only store changes.
    # Conflict if BA already has another shift same day overlapping hours at a different slot.
    def would_overlap(ba_id: int, new_store_id: int, shift_label: str) -> str | None:
        rng = _parse_shift_minutes(shift_label)
        if not rng:
            return None
        other = ShiftAssignment.objects.filter(
            ambassador_id=ba_id,
            date__gte=max(effective_from, month_start),
            date__lte=month_end,
            ambassador__isnull=False,
        ).exclude(store_id=store_a if ba_id == ba_a else store_b, shift_label=shift_label)
        # After swap, exclude the pair we're moving
        for s in other:
            if s.store_id == new_store_id and s.shift_label == shift_label:
                continue
            other_rng = _parse_shift_minutes(s.shift_label)
            if other_rng and _ranges_overlap(rng, other_rng) and s.date:
                # same calendar day conflict
                # only if this other shift stays on that day for this BA
                pass
        # Simpler: same date + overlapping parsed times among remaining shifts for BA
        by_day: dict[date, list] = {}
        moving_dates = set(
            ShiftAssignment.objects.filter(
                ambassador_id=ba_id,
                store_id=store_a if ba_id == ba_a else store_b,
                shift_label=shift_label,
                date__gte=max(effective_from, month_start),
                date__lte=month_end,
            ).values_list('date', flat=True)
        )
        for s in ShiftAssignment.objects.filter(
            ambassador_id=ba_id,
            date__in=moving_dates,
        ):
            by_day.setdefault(s.date, []).append(s)
        for day, rows in by_day.items():
            ranges = []
            for s in rows:
                # after swap this moving row gets new store but same label
                r = _parse_shift_minutes(s.shift_label)
                if r:
                    ranges.append((r, s.shift_label))
            for i in range(len(ranges)):
                for j in range(i + 1, len(ranges)):
                    if _ranges_overlap(ranges[i][0], ranges[j][0]):
                        return f'Overlapping hours on {day.isoformat()} for BA #{ba_id}.'
        return None

    msg = would_overlap(ba_a, store_b, label_a) or would_overlap(ba_b, store_a, label_b)
    if msg:
        return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)

    before = {
        'baA': ba_a,
        'baB': ba_b,
        'storeA': store_a,
        'storeB': store_b,
        'effectiveFrom': effective_from.isoformat(),
        'month': month_start.strftime('%Y-%m'),
    }

    with transaction.atomic():
        updated_a = qs_a.update(store_id=store_b)
        updated_b = qs_b.update(store_id=store_a)
        # Home store FKs
        Ambassador.objects.filter(pk=ba_a).update(store_id=store_b)
        Ambassador.objects.filter(pk=ba_b).update(store_id=store_a)

    ba_a_obj = Ambassador.objects.filter(pk=ba_a).first()
    ba_b_obj = Ambassador.objects.filter(pk=ba_b).first()
    store_a_obj = Store.objects.filter(pk=store_a).first()
    store_b_obj = Store.objects.filter(pk=store_b).first()
    after = {
        **before,
        'shiftsUpdatedA': updated_a,
        'shiftsUpdatedB': updated_b,
    }
    log_mis_action(
        user=request.user,
        action=MisAuditLog.Action.SWAP_BAS,
        summary=(
            f'Swapped stores for {ba_a_obj.name if ba_a_obj else ba_a} '
            f'({store_a_obj.name if store_a_obj else store_a}) ↔ '
            f'{ba_b_obj.name if ba_b_obj else ba_b} '
            f'({store_b_obj.name if store_b_obj else store_b}) '
            f'from {effective_from.isoformat()}.'
        ),
        before=before,
        after=after,
        ambassador=ba_a_obj,
        store=store_b_obj,
    )
    return Response(
        {
            'ok': True,
            'effectiveFrom': effective_from.isoformat(),
            'shiftsUpdated': updated_a + updated_b,
            'summary': after,
        }
    )
