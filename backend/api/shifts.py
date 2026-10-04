"""Shift scheduling helpers (week board dates, peak detection, daily clone)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import TYPE_CHECKING

from django.utils import timezone

if TYPE_CHECKING:
    from .models import Ambassador, ShiftAssignment


DAY_KEYS = ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')


def monday_of(d: date | None = None) -> date:
    d = d or date.today()
    return d - timedelta(days=d.weekday())  # Monday=0


def build_week_days(week_start: date | None = None) -> list[dict]:
    start = monday_of(week_start) if week_start else monday_of()
    days = []
    for i, key in enumerate(DAY_KEYS):
        d = start + timedelta(days=i)
        days.append(
            {
                'key': key,
                'label': key,
                'date': d.strftime('%d %b'),
                'iso': d.isoformat(),
            }
        )
    return days


def day_key_for(d: date) -> str:
    return DAY_KEYS[d.weekday()]


def peak_matches(shift_label: str, peak_hours: str) -> bool:
    """Heuristic: shift overlaps store peak_hours text."""
    peaks = (peak_hours or '').lower()
    shift = (shift_label or '').lower()
    if not peaks.strip():
        return False
    # Check hour tokens like "12", "6", "5" appearing in both
    for token in ('10', '11', '12', '1', '2', '3', '4', '5', '6', '7', '8', '9'):
        if token in shift and token in peaks:
            return True
    return 'peak' in peaks


def _pick_shift(qs):
    """Prefer an active (checked-in, not out) shift, else earliest not checked out, else any."""
    active = qs.filter(checked_in_at__isnull=False, checked_out_at__isnull=True).first()
    if active:
        return active
    pending = qs.filter(checked_out_at__isnull=True).first()
    if pending:
        return pending
    return qs.first()


def clone_shift_for_day(template: 'ShiftAssignment', day: date) -> 'ShiftAssignment | None':
    """
    Create a new shift for `day` from a template row.
    Never modifies or deletes the template.
    """
    from .models import ShiftAssignment

    if not template.ambassador_id or not template.store_id:
        return None

    existing = (
        ShiftAssignment.objects.filter(
            ambassador_id=template.ambassador_id,
            store_id=template.store_id,
            date=day,
            status__in=(
                ShiftAssignment.Status.SCHEDULED,
                ShiftAssignment.Status.CONFLICT,
            ),
        )
        .select_related('store', 'ambassador')
        .order_by('shift_label', 'id')
        .first()
    )
    if existing:
        return existing

    return ShiftAssignment.objects.create(
        store_id=template.store_id,
        ambassador_id=template.ambassador_id,
        date=day,
        day_key=day_key_for(day),
        shift_label=template.shift_label or '08:00 AM – 08:00 PM',
        peak_recommended=bool(template.peak_recommended),
        status=ShiftAssignment.Status.SCHEDULED,
        created_by_id=template.created_by_id,
    )


def _template_shift_for(ambassador: 'Ambassador', around: date) -> 'ShiftAssignment | None':
    """Latest scheduled shift in the same month to use as a blueprint."""
    from .models import ShiftAssignment

    month_qs = (
        ShiftAssignment.objects.filter(
            ambassador=ambassador,
            date__year=around.year,
            date__month=around.month,
            status__in=(
                ShiftAssignment.Status.SCHEDULED,
                ShiftAssignment.Status.CONFLICT,
            ),
        )
        .select_related('store', 'ambassador')
        .order_by('-date', 'shift_label', 'id')
    )
    found = _pick_shift(month_qs)
    if found:
        return found

    # Fall back to any recent scheduled shift for this BA (prior month template).
    return (
        ShiftAssignment.objects.filter(
            ambassador=ambassador,
            status__in=(
                ShiftAssignment.Status.SCHEDULED,
                ShiftAssignment.Status.CONFLICT,
            ),
        )
        .select_related('store', 'ambassador')
        .order_by('-date', '-id')
        .first()
    )


def ensure_shift_for_day(ambassador: 'Ambassador', day: date | None = None) -> 'ShiftAssignment | None':
    """
    Ensure the BA has a shift row for the given calendar day (local TZ default: today).
    Clones from month/template if needed; never clears clocks on older shifts.
    """
    from .models import ShiftAssignment

    day = day or timezone.localdate()
    exact = (
        ShiftAssignment.objects.filter(
            ambassador=ambassador,
            date=day,
            status__in=(
                ShiftAssignment.Status.SCHEDULED,
                ShiftAssignment.Status.CONFLICT,
            ),
        )
        .select_related('store', 'ambassador')
        .order_by('shift_label', 'id')
    )
    found = _pick_shift(exact)
    if found:
        return found

    template = _template_shift_for(ambassador, day)
    if template:
        if template.date == day:
            return template
        cloned = clone_shift_for_day(template, day)
        if cloned:
            return cloned

    store = ambassador.store
    if store is None:
        return None

    return ShiftAssignment.objects.create(
        store=store,
        ambassador=ambassador,
        date=day,
        day_key=day_key_for(day),
        shift_label='08:00 AM – 08:00 PM',
        status=ShiftAssignment.Status.SCHEDULED,
    )


def ensure_today_and_tomorrow(ambassador: 'Ambassador') -> 'ShiftAssignment | None':
    """
    Pre-create today + tomorrow so the BA can see upcoming shifts in advance.
    Returns today's shift.
    """
    today = timezone.localdate()
    tomorrow = today + timedelta(days=1)
    today_shift = ensure_shift_for_day(ambassador, today)
    ensure_shift_for_day(ambassador, tomorrow)
    return today_shift


def ensure_daily_shifts_for_all(*, days_ahead: int = 1) -> dict:
    """
    For every BA with a recent/month template (or home store), ensure shifts
    exist for today through today+days_ahead.
    """
    from .models import Ambassador, ShiftAssignment

    today = timezone.localdate()
    days = [today + timedelta(days=i) for i in range(0, max(0, days_ahead) + 1)]

    ba_ids = set(
        ShiftAssignment.objects.filter(
            ambassador_id__isnull=False,
            status__in=(
                ShiftAssignment.Status.SCHEDULED,
                ShiftAssignment.Status.CONFLICT,
            ),
        ).values_list('ambassador_id', flat=True)
    )
    ba_ids |= set(
        Ambassador.objects.filter(
            store_id__isnull=False,
            status__in=(Ambassador.Status.CERTIFIED, Ambassador.Status.DEPLOYED),
        ).values_list('id', flat=True)
    )

    created = 0
    ensured = 0
    for ba in Ambassador.objects.filter(id__in=ba_ids).select_related('store'):
        for day in days:
            before = ShiftAssignment.objects.filter(ambassador=ba, date=day).exists()
            row = ensure_shift_for_day(ba, day)
            if row:
                ensured += 1
                if not before:
                    created += 1
    return {'bas': len(ba_ids), 'days': [d.isoformat() for d in days], 'ensured': ensured, 'created': created}
