"""
Import weekly offs from Excel for exact-name matches only.
Sets:
  - Ambassador.preferred_weekly_off
  - BaWeeklyOff for the current week (Mon–Sun)
Skips hiring pending, Disabled, unmatched, fuzzy, store-only.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / 'backend'
SRC = Path(r'D:\chrome downloads\Kashmir BAs Details (CNIC, Contact, Timings).xlsx')
OUT = ROOT / 'scripts' / 'weekly_off_import_report.txt'

DAY_MAP = {
    'mon': 'Mon',
    'monday': 'Mon',
    'tue': 'Tue',
    'tues': 'Tue',
    'tuesday': 'Tue',
    'wed': 'Wed',
    'wednesday': 'Wed',
    'thu': 'Thu',
    'thur': 'Thu',
    'thurs': 'Thu',
    'thursday': 'Thu',
    'fri': 'Fri',
    'friday': 'Fri',
    'sat': 'Sat',
    'saturday': 'Sat',
    'sun': 'Sun',
    'sunday': 'Sun',
}


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def norm(s: str) -> str:
    s = (s or '').strip().lower()
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def parse_day(raw):
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    s = str(raw).strip()
    if not s or s.lower() in ('nan', 'none', '-'):
        return None
    key = re.sub(r'[^a-z]', '', s.lower())
    return DAY_MAP.get(key)


def main() -> None:
    load_dotenv(BACKEND / '.env')
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    sys.path.insert(0, str(BACKEND))
    import django

    django.setup()
    from django.utils import timezone

    from api.ba_attendance_views import week_start_monday
    from api.models import Ambassador, BaWeeklyOff

    df = pd.read_excel(SRC, sheet_name=0, header=2)
    df.columns = [str(c).strip() for c in df.columns]

    bas = (
        Ambassador.objects.filter(store_id__isnull=False)
        .exclude(status='Rejected')
        .select_related('store')
        .order_by('id')
    )
    by_code: dict[str, list] = {}
    by_name: dict[str, list] = {}
    for ba in bas:
        store = ba.store
        if not store:
            continue
        e = {
            'ba': ba,
            'ba_name': (ba.name or '').strip(),
            'status': ba.status,
            'store_code': (store.code or '').strip(),
            'store_name': (store.name or '').strip(),
        }
        ck = norm(store.code or '')
        nk = norm(store.name or '')
        if ck:
            by_code.setdefault(ck, []).append(e)
        if nk:
            by_name.setdefault(nk, []).append(e)

    def exact_ba(entries, ba_name):
        if not entries:
            return None
        bn = norm(ba_name)
        if not bn:
            return None
        named = [e for e in entries if norm(e['ba_name']) == bn]
        if len(named) != 1:
            # Prefer Deployed if duplicates somehow
            deployed = [e for e in named if e['status'] == 'Deployed']
            if len(deployed) == 1:
                return deployed[0]['ba']
            return named[0]['ba'] if len(named) == 1 else None
        return named[0]['ba']

    today = timezone.localdate()
    week_start = week_start_monday(today)

    imported = []
    skipped = []
    seen_ba_ids: set[int] = set()

    for _, row in df.iterrows():
        store_code = str(row.get('STORE CODE', '') or '').strip()
        store_name = str(row.get('STORE NAME', '') or '').strip()
        ba_name = str(row.get('BA Name', '') or '').strip()
        if not ba_name or ba_name.lower() in ('nan', '-'):
            continue
        if 'hiring pending' in ba_name.lower():
            skipped.append(f'SKIP hiring: {store_name} | {ba_name}')
            continue

        day = parse_day(row.get('BA Weekly Off'))
        if not day:
            skipped.append(f'SKIP no/invalid day: {store_name} | {ba_name} | {row.get("BA Weekly Off")}')
            continue

        entries = []
        ck, nk = norm(store_code), norm(store_name)
        if ck and ck in by_code:
            entries = by_code[ck]
        if not entries and nk and nk in by_name:
            entries = by_name[nk]
        if not entries and nk:
            fuzzy = []
            for name_key, ents in by_name.items():
                if nk in name_key or name_key in nk:
                    fuzzy.extend(ents)
            entries = fuzzy

        ba = exact_ba(entries, ba_name)
        if not ba:
            skipped.append(f'SKIP not exact name: {store_name} | {ba_name} | {day}')
            continue
        if ba.status == Ambassador.Status.ON_LEAVE:
            skipped.append(f'SKIP Disabled: {ba.code} {ba.name}')
            continue
        if ba.id in seen_ba_ids:
            skipped.append(f'SKIP duplicate sheet row for {ba.code} {ba.name} (kept first)')
            continue
        seen_ba_ids.add(ba.id)

        ba.preferred_weekly_off = day
        ba.save(update_fields=['preferred_weekly_off', 'updated_at'])

        obj, created = BaWeeklyOff.objects.update_or_create(
            ambassador=ba,
            week_start=week_start,
            defaults={'off_day': day},
        )
        imported.append(
            f"{'CREATE' if created else 'UPDATE'} {ba.code} {ba.name} @ {store_name} -> {day} "
            f"(week {week_start.isoformat()})"
        )

    lines = [
        f'Source: {SRC}',
        f'Week start: {week_start.isoformat()}',
        f'Imported: {len(imported)}',
        f'Skipped: {len(skipped)}',
        '--- IMPORTED ---',
        *imported,
        '--- SKIPPED ---',
        *skipped,
    ]
    OUT.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'Imported={len(imported)} Skipped={len(skipped)}')
    print(f'Wrote {OUT}')


if __name__ == '__main__':
    main()
