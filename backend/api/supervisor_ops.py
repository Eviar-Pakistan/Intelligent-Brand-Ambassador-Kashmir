"""Supervisor roster helpers and live overview for assigned stores / BAs."""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime, time, timedelta

from django.db.models import Q
from django.utils import timezone

from .models import (
    Ambassador,
    BaAttendanceDay,
    BaDailyReport,
    BaWeeklyOff,
    Consumer,
    ShiftAssignment,
    Store,
    Supervisor,
    SurveyQuestion,
)

DAY_KEYS = ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')
_SHIFT_TIME_RE = re.compile(r'(\d{1,2}):(\d{2})\s*(AM|PM)', re.IGNORECASE)
MAX_ATTENDANCE_RANGE_DAYS = 31


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
    on_leave = set(
        Ambassador.objects.filter(status=Ambassador.Status.ON_LEAVE).values_list('id', flat=True)
    )
    shift = set(
        ShiftAssignment.objects.filter(
            store_id__in=store_ids,
            ambassador_id__isnull=False,
            status__in=(ShiftAssignment.Status.SCHEDULED, ShiftAssignment.Status.CONFLICT),
        )
        .exclude(ambassador_id__in=on_leave)
        .values_list('ambassador_id', flat=True)
    )
    return home | {ba_id for ba_id in shift if ba_id}


def _report_when_date(report: BaDailyReport) -> date:
    """
    Stable calendar day for a field report (download dropdown / Daily Reports WHEN).

    Prefer created_at — shift.checked_out_at on month-level shifts is often reused on
    later days and would collapse older reports onto the latest checkout day.
    """
    if report.created_at:
        return timezone.localtime(report.created_at).date()
    shift = getattr(report, 'shift', None)
    if shift is not None and shift.checked_out_at:
        return timezone.localtime(shift.checked_out_at).date()
    return report.date


def supervisor_report_dates(supervisor: Supervisor) -> list[str]:
    """
    Distinct WHEN-days (same as Daily Reports) for field reports under this supervisor.
    """
    ba_ids = supervisor_ambassador_ids(supervisor)
    if not ba_ids:
        return []
    qs = BaDailyReport.objects.filter(ambassador_id__in=ba_ids).select_related('shift')
    return sorted({_report_when_date(r).isoformat() for r in qs}, reverse=True)


def supervisor_reports_for_date(supervisor: Supervisor, report_date: date) -> list[dict]:
    """
    One row per BA under this supervisor for the given WHEN-day (Daily Reports date).
    BAs who did not submit that day still appear with submitted=False.
    """
    ba_ids = supervisor_ambassador_ids(supervisor)
    if not ba_ids:
        return []

    ambassadors = {
        ba.id: ba
        for ba in Ambassador.objects.filter(id__in=ba_ids).select_related('store')
    }

    # Match by WHEN day (checkout / created_at), not only BaDailyReport.date.
    qs = (
        BaDailyReport.objects.filter(ambassador_id__in=ba_ids)
        .select_related('ambassador', 'store', 'shift')
        .order_by('ambassador_id', '-created_at', '-id')
    )
    latest: dict[int, BaDailyReport] = {}
    for report in qs:
        if _report_when_date(report) != report_date:
            continue
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

    # Today's consumers for live engagement (answered ÷ total today).
    consumers_today_by_store: dict[int, int] = defaultdict(int)
    answered_today_by_store: dict[int, int] = defaultdict(int)
    if store_ids:
        tz = timezone.get_current_timezone()
        start_dt = timezone.make_aware(datetime.combine(today, time.min), tz)
        end_dt = timezone.make_aware(datetime.combine(today, time.max), tz)
        for c in Consumer.objects.filter(
            store_id__in=store_ids,
            created_at__gte=start_dt,
            created_at__lte=end_dt,
        ).only('store_id', 'answers'):
            consumers_today_by_store[c.store_id] += 1
            ans = c.answers if isinstance(c.answers, dict) else {}
            if any(str(v).strip() for v in ans.values()):
                answered_today_by_store[c.store_id] += 1

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
    on_leave_ids = set(
        Ambassador.objects.filter(status=Ambassador.Status.ON_LEAVE).values_list('id', flat=True)
    )
    shift_ba_ids = set(
        ShiftAssignment.objects.filter(
            store_id__in=store_ids,
            ambassador_id__isnull=False,
            status__in=(ShiftAssignment.Status.SCHEDULED, ShiftAssignment.Status.CONFLICT),
        )
        .exclude(ambassador_id__in=on_leave_ids)
        .values_list('ambassador_id', flat=True)
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

    # Staffed today: store has ≥1 BA checked in today (not on leave).
    staffed_store_ids: set[int] = set()
    if store_ids:
        staffed_store_ids = set(
            ShiftAssignment.objects.filter(
                store_id__in=store_ids,
                date=today,
                checked_in_at__isnull=False,
                ambassador_id__isnull=False,
            )
            .exclude(ambassador_id__in=on_leave_ids)
            .values_list('store_id', flat=True)
            .distinct()
        )

    store_rows = []
    for store in stores:
        answered = answered_by_store.get(store.id, 0)
        yes = yes_by_store.get(store.id, 0)
        conversion = _pct(yes, answered) if answered else 0.0
        footfall = store.today_footfall or 0
        today_total = consumers_today_by_store.get(store.id, 0)
        today_answered = answered_today_by_store.get(store.id, 0)
        engagement = _pct(today_answered, today_total) if today_total else 0.0
        assigned = [
            {
                'id': str(ba.id),
                'name': ba.name,
                'code': ba.code or '',
                'state': _ba_state(ba.id, today),
            }
            for ba in store_bas.get(store.id, [])
        ]
        peak = [p.strip() for p in (store.peak_hours or '').split(',') if p.strip()]
        store_coverage = 100 if store.id in staffed_store_ids else 0
        # Covered when a BA is checked in today (same rule as coverage 100%).
        if store.id in staffed_store_ids:
            ui_status = 'Covered'
        elif not assigned:
            ui_status = 'NEEDS BA'
        else:
            ui_status = 'Pending'
        store_rows.append(
            {
                'id': store.id,
                'name': store.name,
                'city': store.city,
                'address': store.address,
                'footfall': store.footfall,
                'bas': len(assigned),
                'coverage': store_coverage,
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
    week_start = today - timedelta(days=today.weekday())
    from .ba_attendance_views import ensure_weekly_offs_for_ambassadors

    weekly_offs = ensure_weekly_offs_for_ambassadors(ambassadors, week_start=week_start)
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
        off = weekly_offs.get(ba.id)
        ba_rows.append(
            {
                'id': str(ba.id),
                'name': ba.name,
                'code': ba.code or '',
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
                'weeklyOff': off.off_day if off else None,
                'weeklyOffDate': off.off_date.isoformat() if off else None,
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


def _parse_clock_token(hour: str, minute: str, ampm: str) -> time:
    h = int(hour) % 12
    if ampm.upper() == 'PM':
        h += 12
    return time(h, int(minute))


def _parse_shift_end(label: str) -> time | None:
    parts = _SHIFT_TIME_RE.findall(label or '')
    if len(parts) < 2:
        return None
    return _parse_clock_token(*parts[1])


def _photo_url(request, field) -> str | None:
    if not field:
        return None
    try:
        url = field.url
    except ValueError:
        return None
    if request is not None and hasattr(request, 'build_absolute_uri'):
        return request.build_absolute_uri(url)
    return url


def _filter_status_for_row(
    *,
    day: date,
    today: date,
    now: datetime,
    checked_in,
    checked_out,
    shift_label: str,
    on_leave: bool,
) -> str:
    if on_leave:
        return 'on_leave'
    if checked_in and checked_out:
        return 'present'
    if checked_in and not checked_out:
        return 'on_shift'
    # No check-in
    if day > today:
        return 'not_checked_in'
    if day < today:
        return 'absent'
    # Today
    end = _parse_shift_end(shift_label)
    if end is not None:
        end_dt = timezone.make_aware(
            datetime.combine(day, end),
            timezone.get_current_timezone(),
        )
        if now >= end_dt:
            return 'absent'
    return 'not_checked_in'


def build_supervisor_ba_attendance(
    supervisor: Supervisor,
    *,
    date_from: date,
    date_to: date,
    request=None,
) -> dict:
    """
    Flattened BA attendance rows for supervisor stores over [date_from, date_to].
    One row per BA per day when the BA is in roster for that day.
    """
    if date_to < date_from:
        date_from, date_to = date_to, date_from
    span = (date_to - date_from).days + 1
    if span > MAX_ATTENDANCE_RANGE_DAYS:
        raise ValueError(f'Date range cannot exceed {MAX_ATTENDANCE_RANGE_DAYS} days.')

    store_ids = list(supervisor.stores.values_list('id', flat=True))
    now = timezone.localtime()
    today = now.date()

    if not store_ids:
        return {
            'from': date_from.isoformat(),
            'to': date_to.isoformat(),
            'results': [],
        }

    # Active roster only — Disabled (ON_LEAVE) BAs are hidden from supervisor attendance.
    home_bas = list(
        Ambassador.objects.filter(
            store_id__in=store_ids,
            status__in=(
                Ambassador.Status.CERTIFIED,
                Ambassador.Status.DEPLOYED,
                Ambassador.Status.TRAINING,
            ),
        ).select_related('store')
    )
    home_ids = {ba.id for ba in home_bas}

    shifts = list(
        ShiftAssignment.objects.filter(
            store_id__in=store_ids,
            ambassador_id__isnull=False,
            date__gte=date_from,
            date__lte=date_to,
        )
        .exclude(status=ShiftAssignment.Status.OPEN)
        .exclude(ambassador__status=Ambassador.Status.ON_LEAVE)
        .select_related('store', 'ambassador', 'ambassador__store')
    )
    shift_ba_ids = {s.ambassador_id for s in shifts if s.ambassador_id}

    attendance_logs = list(
        BaAttendanceDay.objects.filter(
            date__gte=date_from,
            date__lte=date_to,
        )
        .filter(Q(store_id__in=store_ids) | Q(ambassador_id__in=home_ids | shift_ba_ids))
        .exclude(ambassador__status=Ambassador.Status.ON_LEAVE)
        .select_related('store', 'ambassador', 'ambassador__store')
    )
    log_ba_ids = {r.ambassador_id for r in attendance_logs}

    all_ids = home_ids | shift_ba_ids | log_ba_ids
    if not all_ids:
        return {
            'from': date_from.isoformat(),
            'to': date_to.isoformat(),
            'results': [],
        }

    ambassadors = {
        ba.id: ba
        for ba in Ambassador.objects.filter(id__in=all_ids)
        .exclude(status=Ambassador.Status.ON_LEAVE)
        .select_related('store')
    }
    # Ensure home_bas already loaded are used
    for ba in home_bas:
        ambassadors[ba.id] = ba

    shifts_by_ba_day: dict[tuple[int, date], ShiftAssignment] = {}
    for s in shifts:
        if s.ambassador_id:
            shifts_by_ba_day[(s.ambassador_id, s.date)] = s

    logs_by_ba_day: dict[tuple[int, date], BaAttendanceDay] = {}
    for row in attendance_logs:
        logs_by_ba_day[(row.ambassador_id, row.date)] = row

    # Weekly offs for all BAs in range
    week_from = date_from - timedelta(days=date_from.weekday())
    week_to = date_to - timedelta(days=date_to.weekday())
    weekly_off_map: dict[int, set[date]] = defaultdict(set)
    for row in BaWeeklyOff.objects.filter(
        ambassador_id__in=all_ids,
        week_start__gte=week_from,
        week_start__lte=week_to,
    ).only('ambassador_id', 'week_start', 'off_day'):
        try:
            idx = DAY_KEYS.index(row.off_day)
        except ValueError:
            continue
        off_date = row.week_start + timedelta(days=idx)
        if date_from <= off_date <= date_to:
            weekly_off_map[row.ambassador_id].add(off_date)

    report_pairs = set(
        BaDailyReport.objects.filter(
            ambassador_id__in=all_ids,
            date__gte=date_from,
            date__lte=date_to,
        ).values_list('ambassador_id', 'date')
    )

    results: list[dict] = []
    day_count = (date_to - date_from).days + 1
    for i in range(day_count):
        day = date_from + timedelta(days=i)
        day_key = DAY_KEYS[day.weekday()]
        for ba_id, ba in ambassadors.items():
            if ba.status == Ambassador.Status.ON_LEAVE:
                continue
            log = logs_by_ba_day.get((ba_id, day))
            shift = shifts_by_ba_day.get((ba_id, day))
            on_weekly_off = day in weekly_off_map.get(ba_id, set())
            # Weekly off only (Disabled BAs are excluded above).
            on_leave = on_weekly_off

            # Include row if BA is home-roster, has shift/attendance that day, or weekly off that day
            is_home = ba.store_id in store_ids if ba.store_id else False
            if not (is_home or shift or log or on_weekly_off):
                continue
            # For multi-day ranges, home BAs without activity on past days still appear
            # so filters like Absent / Not checked in work.

            store = None
            shift_label = ''
            checked_in = None
            checked_out = None
            check_in_lat = check_in_lng = None
            check_out_lat = check_out_lng = None
            check_in_photo_url = None

            if log:
                store = log.store
                shift_label = log.shift_label or ''
                checked_in = log.checked_in_at
                checked_out = log.checked_out_at
                check_in_lat = log.check_in_lat
                check_in_lng = log.check_in_lng
                check_out_lat = log.check_out_lat
                check_out_lng = log.check_out_lng
                check_in_photo_url = _photo_url(request, log.check_in_photo)
            if shift:
                store = store or shift.store
                shift_label = shift_label or (shift.shift_label or '')
                if not checked_in and shift.checked_in_at:
                    cin_day = timezone.localtime(shift.checked_in_at).date()
                    if cin_day == day:
                        checked_in = shift.checked_in_at
                        checked_out = shift.checked_out_at
                        check_in_lat = shift.check_in_lat
                        check_in_lng = shift.check_in_lng
                        check_out_lat = shift.check_out_lat
                        check_out_lng = shift.check_out_lng
            if not store:
                store = ba.store
            if not shift_label:
                shift_label = '9:00 AM – 6:00 PM'

            if not checked_in:
                check_in_lat = check_in_lng = None
                check_in_photo_url = None
            if not checked_out:
                check_out_lat = check_out_lng = None

            filter_status = _filter_status_for_row(
                day=day,
                today=today,
                now=now,
                checked_in=checked_in,
                checked_out=checked_out,
                shift_label=shift_label,
                on_leave=on_leave,
            )

            report_submitted = (ba_id, day) in report_pairs

            results.append(
                {
                    'date': day.isoformat(),
                    'day': day_key,
                    'baId': ba.id,
                    'baName': ba.name,
                    'baCode': ba.code or '',
                    'storeId': store.id if store else None,
                    'storeName': store.name if store else '',
                    'storeCode': (store.code or '') if store else '',
                    'city': (store.city if store else '') or ba.city or '',
                    'shift': shift_label,
                    'checkedInAt': checked_in.isoformat() if checked_in else None,
                    'checkedOutAt': checked_out.isoformat() if checked_out else None,
                    'checkInLat': check_in_lat,
                    'checkInLng': check_in_lng,
                    'checkOutLat': check_out_lat,
                    'checkOutLng': check_out_lng,
                    'checkInPhotoUrl': check_in_photo_url,
                    'reportSubmitted': report_submitted,
                    'filterStatus': filter_status,
                }
            )

    results.sort(key=lambda r: (r['date'], r['baName'].lower()), reverse=True)

    return {
        'from': date_from.isoformat(),
        'to': date_to.isoformat(),
        'results': results,
    }
