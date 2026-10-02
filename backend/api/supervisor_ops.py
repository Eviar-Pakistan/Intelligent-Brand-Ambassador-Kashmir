"""Supervisor roster helpers and live overview for assigned stores / BAs."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from django.db.models import Count
from django.utils import timezone

from .models import Ambassador, BaDailyReport, Consumer, ShiftAssignment, Store, Supervisor, SurveyQuestion


def supervisor_ambassador_ids(supervisor: Supervisor) -> set[int]:
    """
    BA ids under a supervisor: home-store on assigned stores, plus anyone
    scheduled on those stores (same roster idea as the overview).
    """
    store_ids = list(supervisor.stores.values_list('id', flat=True))
    if not store_ids:
        return set()
    home = set(
        Ambassador.objects.filter(
            store_id__in=store_ids,
            status__in=(Ambassador.Status.CERTIFIED, Ambassador.Status.DEPLOYED),
        ).values_list('id', flat=True)
    )
    shift = set(
        ShiftAssignment.objects.filter(
            store_id__in=store_ids,
            ambassador_id__isnull=False,
            status__in=(ShiftAssignment.Status.SCHEDULED, ShiftAssignment.Status.CONFLICT),
        ).values_list('ambassador_id', flat=True)
    )
    return home | {ba_id for ba_id in shift if ba_id}


def supervisor_report_dates(supervisor: Supervisor) -> list[str]:
    """Distinct YYYY-MM-DD dates that have daily reports for this supervisor's BAs."""
    ba_ids = supervisor_ambassador_ids(supervisor)
    if not ba_ids:
        return []
    dates = BaDailyReport.objects.filter(ambassador_id__in=ba_ids).values_list('date', flat=True).distinct()
    return sorted({d.isoformat() for d in dates}, reverse=True)


def supervisor_reports_for_date(supervisor: Supervisor, report_date: date) -> list[dict]:
    """
    One row per BA under this supervisor for the given date.
    BAs who did not submit still appear with submitted=False so Excel can
    include a sheet explaining the missing report.
    """
    ba_ids = supervisor_ambassador_ids(supervisor)
    if not ba_ids:
        return []

    ambassadors = {
        ba.id: ba
        for ba in Ambassador.objects.filter(id__in=ba_ids).select_related('store')
    }

    qs = (
        BaDailyReport.objects.filter(ambassador_id__in=ba_ids, date=report_date)
        .select_related('ambassador', 'store')
        .order_by('ambassador_id', '-updated_at', '-id')
    )
    latest: dict[int, BaDailyReport] = {}
    for report in qs:
        if report.ambassador_id not in latest:
            latest[report.ambassador_id] = report

    rows: list[dict] = []
    for ba_id in sorted(
        ambassadors.keys(),
        key=lambda i: (ambassadors[i].code or '', ambassadors[i].name.lower()),
    ):
        ba = ambassadors[ba_id]
        report = latest.get(ba_id)
        if report:
            store = report.store or ba.store
            other = report.other_brands_json if isinstance(report.other_brands_json, list) else []
            rows.append(
                {
                    'baId': str(ba.id),
                    'baCode': ba.code or '',
                    'baName': ba.name,
                    'storeName': store.name if store else '',
                    'city': (store.city if store else '') or ba.city or '',
                    'submitted': True,
                    'source': report.source,
                    'stock': report.stock_json if isinstance(report.stock_json, dict) else {},
                    'sales': report.sales_json if isinstance(report.sales_json, dict) else {},
                    'otherBrands': other,
                }
            )
        else:
            store = ba.store
            rows.append(
                {
                    'baId': str(ba.id),
                    'baCode': ba.code or '',
                    'baName': ba.name,
                    'storeName': store.name if store else '',
                    'city': (store.city if store else '') or ba.city or '',
                    'submitted': False,
                    'source': '',
                    'stock': {},
                    'sales': {},
                    'otherBrands': [],
                }
            )
    return rows


def _pct(part: int, whole: int) -> float:
    if whole <= 0:
        return 0.0
    return round((part / whole) * 100, 1)


def _ba_state(ambassador_id: int, today) -> str:
    """Active if currently checked in (not out); else Offline."""
    from django.utils import timezone

    from .models import BaAttendanceDay

    # Prefer today's attendance log (survives month-shift clock roll).
    if BaAttendanceDay.objects.filter(
        ambassador_id=ambassador_id,
        date=today,
        checked_in_at__isnull=False,
        checked_out_at__isnull=True,
    ).exists():
        return 'Active'
    if BaAttendanceDay.objects.filter(
        ambassador_id=ambassador_id,
        date=today,
        checked_in_at__isnull=False,
        checked_out_at__isnull=False,
    ).exists():
        return 'Offline'

    exact = (
        ShiftAssignment.objects.filter(ambassador_id=ambassador_id, date=today)
        .order_by('-checked_in_at', '-id')
        .first()
    )
    if exact and exact.checked_in_at and not exact.checked_out_at:
        return 'Active'

    # Month-level shift row (usually dated the 1st) with live clocks today.
    month_qs = (
        ShiftAssignment.objects.filter(
            ambassador_id=ambassador_id,
            date__year=today.year,
            date__month=today.month,
            checked_in_at__isnull=False,
        )
        .order_by('-checked_in_at', '-id')
    )
    for shift in month_qs[:5]:
        cin_day = timezone.localtime(shift.checked_in_at).date()
        if cin_day != today:
            continue
        if not shift.checked_out_at:
            return 'Active'
        return 'Offline'
    return 'Offline'


def build_supervisor_overview(supervisor: Supervisor) -> dict:
    from .deployment import reconcile_ambassador_deployments

    reconcile_ambassador_deployments()
    today = timezone.localdate()
    stores = list(supervisor.stores.all().order_by('name'))
    store_ids = [s.id for s in stores]

    consumer_counts = {
        row['store_id']: row['c']
        for row in Consumer.objects.filter(store_id__in=store_ids).values('store_id').annotate(c=Count('id'))
    }

    switch_q = SurveyQuestion.objects.filter(is_active=True, order=5).first()
    switch_id = str(switch_q.id) if switch_q else None
    yes_by_store: dict[int, int] = defaultdict(int)
    answered_by_store: dict[int, int] = defaultdict(int)
    if switch_id and store_ids:
        for c in Consumer.objects.filter(store_id__in=store_ids).only('store_id', 'answers'):
            ans = c.answers if isinstance(c.answers, dict) else {}
            val = str(ans.get(switch_id, ''))
            if not val:
                continue
            answered_by_store[c.store_id] += 1
            if val.lower().startswith('yes'):
                yes_by_store[c.store_id] += 1

    # Home-store BAs + anyone scheduled on these stores (deployment board).
    home_bas = list(
        Ambassador.objects.filter(
            store_id__in=store_ids,
            status__in=(Ambassador.Status.CERTIFIED, Ambassador.Status.DEPLOYED),
        ).select_related('store')
    )
    shift_ba_ids = set(
        ShiftAssignment.objects.filter(
            store_id__in=store_ids,
            ambassador_id__isnull=False,
            status__in=(ShiftAssignment.Status.SCHEDULED, ShiftAssignment.Status.CONFLICT),
        ).values_list('ambassador_id', flat=True)
    )
    # Soonest upcoming shift store, else latest past — for BAs without home store FK.
    future_pick: dict[int, tuple[int, object]] = {}
    past_pick: dict[int, tuple[int, object]] = {}
    for ba_id, sid, d in (
        ShiftAssignment.objects.filter(
            store_id__in=store_ids,
            ambassador_id__isnull=False,
            status__in=(ShiftAssignment.Status.SCHEDULED, ShiftAssignment.Status.CONFLICT),
        )
        .order_by('date', 'id')
        .values_list('ambassador_id', 'store_id', 'date')
    ):
        if ba_id is None or sid is None:
            continue
        if d >= today:
            if ba_id not in future_pick or d < future_pick[ba_id][1]:
                future_pick[ba_id] = (sid, d)
        else:
            if ba_id not in past_pick or d > past_pick[ba_id][1]:
                past_pick[ba_id] = (sid, d)
    shift_home = {ba_id: sid for ba_id, (sid, _) in past_pick.items()}
    shift_home.update({ba_id: sid for ba_id, (sid, _) in future_pick.items()})

    by_id: dict[int, Ambassador] = {ba.id: ba for ba in home_bas}
    missing_ids = shift_ba_ids - set(by_id)
    if missing_ids:
        for ba in Ambassador.objects.filter(id__in=missing_ids).select_related('store'):
            by_id[ba.id] = ba
    ambassadors = list(by_id.values())

    store_bas: dict[int, list[Ambassador]] = defaultdict(list)
    for ba in ambassadors:
        sid = ba.store_id if ba.store_id in store_ids else shift_home.get(ba.id)
        if sid in store_ids:
            store_bas[sid].append(ba)

    store_rows = []
    for store in stores:
        shoppers = consumer_counts.get(store.id, 0)
        answered = answered_by_store.get(store.id, 0)
        yes = yes_by_store.get(store.id, 0)
        conversion = _pct(yes, answered) if answered else 0.0
        footfall = store.today_footfall or 0
        engagement = _pct(shoppers, footfall) if footfall else (100.0 if shoppers else 0.0)
        if engagement > 100:
            engagement = 100.0
        assigned = [
            {
                'id': str(ba.id),
                'name': ba.name,
                'state': _ba_state(ba.id, today),
            }
            for ba in store_bas.get(store.id, [])
        ]
        peak = [p.strip() for p in (store.peak_hours or '').split(',') if p.strip()]
        status = store.status
        # Map API store status to FE-ish labels when needed
        if status == Store.Status.LIVE:
            ui_status = 'Covered' if assigned else 'NEEDS BA'
        elif status == Store.Status.PARTIAL:
            ui_status = 'PARTIAL'
        elif status == Store.Status.INACTIVE:
            ui_status = 'NEEDS BA'
        else:
            ui_status = status

        store_rows.append(
            {
                'id': store.id,
                'name': store.name,
                'city': store.city,
                'address': store.address,
                'footfall': store.footfall,
                'bas': len(assigned),
                'coverage': store.coverage,
                'status': ui_status,
                'todayFootfall': footfall,
                'engagement': engagement,
                'conversion': conversion,
                'peak': peak,
                'assigned': assigned,
                'qrCode': store.qr_slug or '',
                'contactPerson': store.contact_name,
                'contactPhone': store.contact_phone,
            }
        )

    ba_rows = []
    from .incentives import ba_month_achievement

    month = today.strftime('%Y-%m')
    for ba in ambassadors:
        sid = ba.store_id if ba.store_id in store_ids else shift_home.get(ba.id)
        store = next((s for s in stores if s.id == sid), ba.store)
        answered = answered_by_store.get(sid, 0) if sid else 0
        yes = yes_by_store.get(sid, 0) if sid else 0
        if answered:
            conversion = _pct(yes, answered)
        elif ba.overall_score:
            conversion = round(min(45.0, max(18.0, float(ba.overall_score) * 0.4)), 1)
        else:
            conversion = 0.0
        score = float(ba.overall_score or 0)
        checkins = ShiftAssignment.objects.filter(
            ambassador_id=ba.id,
            date__gte=today - timedelta(days=today.weekday()),
            date__lte=today,
            checked_in_at__isnull=False,
        ).count()
        sessions = checkins * 8 + max(0, int(score // 5))
        points = int(round(score * 10 + checkins * 40 + conversion * 5))
        _target_kg, _sales_kg, ach_pct = ba_month_achievement(ba.id, month)
        # Only show a % when a target exists; otherwise UI shows "—"
        target_achievement = round(ach_pct, 1) if _target_kg > 0 else None
        ba_rows.append(
            {
                'id': str(ba.id),
                'name': ba.name,
                'storeId': sid,
                'store': store.name if store else '',
                'state': _ba_state(ba.id, today),
                'conversion': conversion,
                'points': points,
                'sessions': sessions,
                'score': score,
                'targetKg': round(_target_kg, 1) if _target_kg > 0 else None,
                'salesKg': round(_sales_kg, 1),
                'targetAchievement': target_achievement,
            }
        )

    unique = {b['id']: b for b in ba_rows}
    conversions = [b['conversion'] for b in unique.values()]
    coverages = [s['coverage'] for s in store_rows]
    team_conversion = round(sum(conversions) / len(conversions), 1) if conversions else 0.0
    coverage = round(sum(coverages) / len(coverages)) if coverages else 0
    today_footfall = sum(s['todayFootfall'] for s in store_rows)

    return {
        'supervisorId': str(supervisor.id),
        'stores': store_rows,
        'bas': list(unique.values()),
        'teamConversion': team_conversion,
        'coverage': coverage,
        'todayFootfall': today_footfall,
    }
