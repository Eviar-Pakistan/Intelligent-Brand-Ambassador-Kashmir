"""
Update ShiftAssignment.shift_label from nationwide Excel.
- Skip hiring pending
- Only dates >= FROM_DATE (tomorrow onward)
- Unmatched BAs left unchanged (reported)
- Shehla / Save Mart Rawat 11:00PM treated as 11:00AM
Does not touch weekly off, break, check-in/out, or past/today shifts.
"""
from __future__ import annotations

import os
import re
from datetime import date, datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / 'backend'
SRC = Path(r'C:\Users\Administrator\Downloads\Kashmire details required nationwide.xlsx')
FROM_DATE = date(2026, 11, 3)  # tomorrow onward (today's shifts left as-is)
DRY_RUN = False


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


def parse_clock(raw) -> datetime.time | None:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    if hasattr(raw, 'hour') and hasattr(raw, 'minute') and not isinstance(raw, str):
        return raw
    s = str(raw).strip().upper().replace('.', '').replace(' ', '')
    if not s or s in ('NAN', 'NONE', '-'):
        return None
    # 12:00PM / 08:00PM / 9:30AM
    for fmt in ('%I:%M%p', '%I%p', '%H:%M', '%H'):
        try:
            return datetime.strptime(s, fmt).time()
        except ValueError:
            continue
    return None


def format_label(start, end) -> str:
    def one(t) -> str:
        # Match common DB style: 12:00 PM – 8:00 PM (no leading zero on hour)
        h = t.hour % 12 or 12
        ampm = 'AM' if t.hour < 12 else 'PM'
        return f'{h}:{t.minute:02d} {ampm}'

    return f'{one(start)} – {one(end)}'


def main() -> None:
    load_dotenv(BACKEND / '.env')
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    import sys

    sys.path.insert(0, str(BACKEND))
    import django

    django.setup()
    from api.models import Ambassador, ShiftAssignment

    raw = pd.read_excel(SRC, sheet_name=0, header=None)
    header_row = None
    for i in range(min(10, len(raw))):
        vals = [str(x).strip() if pd.notna(x) else '' for x in raw.iloc[i].tolist()]
        if 'STORE NAME' in vals and 'BA Name' in vals:
            header_row = i
            break
    if header_row is None:
        raise SystemExit('Header row not found')

    df = pd.read_excel(SRC, sheet_name=0, header=header_row)
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
        entry = {
            'ba': ba,
            'ba_name': (ba.name or '').strip(),
            'status': ba.status,
            'store_code': (store.code or '').strip(),
            'store_name': (store.name or '').strip(),
        }
        ck = norm(store.code or '')
        nk = norm(store.name or '')
        if ck:
            by_code.setdefault(ck, []).append(entry)
        if nk:
            by_name.setdefault(nk, []).append(entry)

    def pick_ba(entries: list, ba_name: str):
        if not entries:
            return None
        # Prefer name match
        bn = norm(ba_name)
        named = [e for e in entries if norm(e['ba_name']) == bn]
        if not named and bn:
            named = [e for e in entries if bn in norm(e['ba_name']) or norm(e['ba_name']) in bn]
        pool = named or entries
        # Prefer Deployed
        deployed = [e for e in pool if e['status'] == 'Deployed']
        pool = deployed or pool
        # Skip hiring-pending-like names in DB if alternatives exist
        real = [e for e in pool if 'hiring' not in norm(e['ba_name'])]
        pool = real or pool
        if len(pool) == 1:
            return pool[0]['ba']
        # Multiple: exact name only
        if named and len(named) == 1:
            return named[0]['ba']
        if named:
            return named[0]['ba']
        return None

    matched = []
    unmatched = []
    ambiguous = []

    for _, row in df.iterrows():
        store_code = str(row.get('STORE CODE', '') or '').strip()
        store_name = str(row.get('STORE NAME', '') or '').strip()
        ba_name = str(row.get('BA Name', '') or '').strip()
        if not store_name and not store_code:
            continue
        if not ba_name or ba_name.lower() in ('nan', '-'):
            continue
        if 'hiring pending' in ba_name.lower():
            continue

        start = parse_clock(row.get('Shift Start Time'))
        end = parse_clock(row.get('Shift End Time'))
        if start is None or end is None:
            unmatched.append(
                {
                    'store': store_name,
                    'code': store_code,
                    'ba': ba_name,
                    'reason': 'Missing shift start/end time',
                }
            )
            continue

        # Known typo: Shehla @ Save Mart Rawat 11:00PM → 11:00AM
        if (
            start.hour == 23
            and 'shehla' in norm(ba_name)
            and 'rawat' in norm(store_name)
        ):
            start = start.replace(hour=11)

        label = format_label(start, end)

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

        ba = pick_ba(entries, ba_name)
        if ba is None:
            if entries and len({e['ba'].id for e in entries}) > 1 and not any(
                norm(ba_name) in norm(e['ba_name']) or norm(e['ba_name']) in norm(ba_name)
                for e in entries
            ):
                ambiguous.append(
                    {
                        'store': store_name,
                        'code': store_code,
                        'ba': ba_name,
                        'candidates': ', '.join(
                            f"{e['ba'].code}:{e['ba_name']}" for e in entries[:5]
                        ),
                        'reason': 'Ambiguous / no BA name match',
                    }
                )
            else:
                unmatched.append(
                    {
                        'store': store_name,
                        'code': store_code,
                        'ba': ba_name,
                        'reason': 'No BA matched in DB',
                    }
                )
            continue

        matched.append((ba, label, store_name, ba_name))

    # Dedupe by BA id (last wins if sheet has dupes)
    by_ba: dict[int, tuple] = {}
    for ba, label, store_name, ba_name in matched:
        by_ba[ba.id] = (ba, label, store_name, ba_name)

    updated_rows = 0
    updated_bas = 0
    details = []
    for ba_id, (ba, label, store_name, ba_name) in by_ba.items():
        qs = ShiftAssignment.objects.filter(
            ambassador_id=ba_id,
            date__gte=FROM_DATE,
        )
        count = qs.count()
        if count == 0:
            details.append(
                f'MATCH no future shifts: {ba.code} {ba.name} <- {ba_name} @ {store_name} -> {label}'
            )
            continue
        if not DRY_RUN:
            count = qs.update(shift_label=label)
        updated_rows += count
        updated_bas += 1
        details.append(
            f'UPDATED {count} row(s): {ba.code} {ba.name} <- {ba_name} @ {store_name} -> {label}'
        )

    report_path = ROOT / 'scripts' / 'shift_timing_update_report.txt'
    lines = [
        f'FROM_DATE={FROM_DATE} DRY_RUN={DRY_RUN}',
        f'Sheet rows matched to BA: {len(by_ba)}',
        f'BAs with future shifts updated: {updated_bas}',
        f'ShiftAssignment rows updated: {updated_rows}',
        f'Unmatched: {len(unmatched)}  Ambiguous: {len(ambiguous)}',
        '--- UPDATES ---',
        *details,
    ]
    if unmatched:
        lines.append('--- UNMATCHED (left unchanged) ---')
        for u in unmatched:
            lines.append(f"{u['code']} | {u['store']} | {u['ba']} | {u['reason']}")
    if ambiguous:
        lines.append('--- AMBIGUOUS (left unchanged) ---')
        for u in ambiguous:
            lines.append(
                f"{u['code']} | {u['store']} | {u['ba']} | {u['reason']} | {u['candidates']}"
            )
    report_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'Wrote {report_path}')
    print(f'Updated BAs={updated_bas} rows={updated_rows} unmatched={len(unmatched)}')


if __name__ == '__main__':
    main()
