"""Shift scheduling helpers (week board dates, peak detection)."""

from __future__ import annotations

from datetime import date, timedelta


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
