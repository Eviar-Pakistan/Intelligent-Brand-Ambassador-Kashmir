"""Verify Excel BA Weekly Off vs DB matches. Read-only — no DB writes."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / 'backend'
SRC = Path(r'D:\chrome downloads\Kashmir BAs Details (CNIC, Contact, Timings).xlsx')
OUT_CSV = ROOT / 'scripts' / 'weekly_off_verify_preview.csv'
OUT_TXT = ROOT / 'scripts' / 'weekly_off_verify_preview.txt'

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
        return None, 'missing'
    s = str(raw).strip()
    if not s or s.lower() in ('nan', 'none', '-'):
        return None, 'missing'
    key = re.sub(r'[^a-z]', '', s.lower())
    d = DAY_MAP.get(key)
    if not d:
        return None, f'invalid:{s}'
    return d, 'ok'


def main() -> None:
    load_dotenv(BACKEND / '.env')
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    sys.path.insert(0, str(BACKEND))
    import django

    django.setup()
    from api.models import Ambassador

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

    def pick(entries, ba_name):
        if not entries:
            return None, 'no store match'
        bn = norm(ba_name)
        named = [e for e in entries if norm(e['ba_name']) == bn]
        if not named and bn:
            named = [
                e
                for e in entries
                if bn in norm(e['ba_name']) or norm(e['ba_name']) in bn
            ]
        pool = named or entries
        deployed = [e for e in pool if e['status'] == 'Deployed']
        pool = deployed or pool
        real = [e for e in pool if 'hiring' not in norm(e['ba_name'])]
        pool = real or pool
        if named:
            how = 'exact name' if norm(named[0]['ba_name']) == bn else 'fuzzy name'
            return pool[0]['ba'], how
        if len({e['ba'].id for e in pool}) == 1:
            return pool[0]['ba'], 'store-only (single BA)'
        return None, 'ambiguous store BAs'

    rows = []
    for _, row in df.iterrows():
        store_code = str(row.get('STORE CODE', '') or '').strip()
        store_name = str(row.get('STORE NAME', '') or '').strip()
        ba_name = str(row.get('BA Name', '') or '').strip()
        town = str(row.get('TOWN', '') or '').strip()
        sr = row.get('SR')
        if not store_name and not ba_name:
            continue
        if not ba_name or ba_name.lower() in ('nan', '-'):
            continue

        day, day_st = parse_day(row.get('BA Weekly Off'))
        hiring = 'hiring pending' in ba_name.lower()
        ba_code = ''
        ba_db = ''
        ba_status = ''
        disabled = False

        if hiring:
            match_note = 'SKIP hiring pending'
            ba = None
        else:
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
            ba, match_note = pick(entries, ba_name)
            if ba:
                ba_code = ba.code or ''
                ba_db = ba.name
                ba_status = ba.status
                if ba.status == Ambassador.Status.ON_LEAVE:
                    match_note = 'SKIP Disabled'
                    disabled = True

        will = bool(day and not hiring and not disabled and ba)
        rows.append(
            {
                'SR': sr,
                'Town': town,
                'Store': store_name,
                'Store Code': store_code,
                'Excel BA': ba_name,
                'Weekly Off (Excel)': str(row.get('BA Weekly Off') or '').strip(),
                'Normalized': day or '',
                'Day status': day_st,
                'DB Code': ba_code,
                'DB Name': ba_db,
                'DB Status': ba_status,
                'Match': match_note,
                'Will import': 'YES' if will else 'NO',
            }
        )

    out = pd.DataFrame(rows)
    out.to_csv(OUT_CSV, index=False, encoding='utf-8-sig')

    lines = []
    lines.append(f'Source: {SRC}')
    lines.append(f'Total excel BA rows: {len(out)}')
    lines.append(f"Hiring pending skipped: {(out['Match'] == 'SKIP hiring pending').sum()}")
    lines.append(f"Will import YES: {(out['Will import'] == 'YES').sum()}")
    lines.append(f"Will import NO: {(out['Will import'] == 'NO').sum()}")
    lines.append('')
    lines.append('Day counts among YES:')
    lines.append(out.loc[out['Will import'] == 'YES', 'Normalized'].value_counts().to_string())
    lines.append('')
    lines.append('Match notes:')
    lines.append(out['Match'].value_counts().to_string())
    lines.append('')
    lines.append('=== ALL ROWS ===')
    lines.append(
        f"{'SR':>3} | {'Store':<30} | {'Excel BA':<22} | {'Off':<3} | {'DB Code':<7} | {'DB Name':<22} | Imp | Match"
    )
    for _, r in out.iterrows():
        off = r['Normalized'] or r['Weekly Off (Excel)'] or '-'
        lines.append(
            f"{str(r['SR']):>3} | {str(r['Store'])[:30]:<30} | {str(r['Excel BA'])[:22]:<22} | "
            f"{str(off)[:3]:<3} | {str(r['DB Code'] or '-'):<7} | {str(r['DB Name'] or '-')[:22]:<22} | "
            f"{r['Will import']:<3} | {r['Match']}"
        )
    lines.append('')
    lines.append('=== NO (will not import) ===')
    no = out[out['Will import'] == 'NO']
    for _, r in no.iterrows():
        lines.append(
            f"{r['SR']} | {r['Store']} | {r['Excel BA']} | off={r['Weekly Off (Excel)'] or '-'} | {r['Match']}"
        )

    OUT_TXT.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('\n'.join(lines[:20]))
    print('...')
    print(f'Wrote {OUT_TXT}')
    print(f'Wrote {OUT_CSV}')


if __name__ == '__main__':
    main()
