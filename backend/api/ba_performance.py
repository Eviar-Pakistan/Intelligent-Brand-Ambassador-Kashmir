"""
HO Dashboard (BA Performance) — live aggregates from:
  BaTarget, BaDailyReport, ShiftAssignment, Store, Ambassador.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from calendar import month_name

from django.db.models import Q, Sum
from django.utils import timezone

from .models import Ambassador, BaDailyReport, BaTarget, ShiftAssignment, Store
from .sales_report import category_sales_from_json, kg_for_pack_units

MONTH_NAMES = list(month_name)  # index 1..12

OIL_SKU_KEYS = (
    'kpgoCan10',
    'kpgoBtl3',
    'kpgoBtl45',
    'kpgoTin5',
    'kpgoPouch1x5',
    'kpgoSup1x5',
    'kpgoPouch1',
    'kpgoSup1',
    'kpgoBkt16',
    'salesOil',
)
GHEE_SKU_KEYS = (
    'kbpBkt10',
    'kbpBkt25',
    'kbpBkt5',
    'kbpTin5',
    'kbpPouch1x5',
    'kbpPouch1',
    'kbpBkt16',
    'salesGhee',
)
WAADI_SKU_KEYS = (
    'wbpBkt5',
    'wbpPouch1x5',
    'wbpPouch1',
    'wbpBkt25',
    'wbpBkt16',
    'salesWaadi',
)

SKU_LABELS = {
    'kpgoCan10': 'KPGO 10 LTR CAN Cons. RED',
    'kpgoBtl3': 'KPGO 3.0 LTR BOTTLE (3LTR X 6) Cons. RED',
    'kpgoBtl45': 'KPGO 4.5 LTR BOTTLE (4.5LTRX 4) Cons. RED',
    'kpgoTin5': 'KPGO 5 LTR TIN Cons. RED',
    'kpgoPouch1x5': 'KPGO POUCH (1LTR x 5) Cons. RED',
    'kpgoSup1x5': 'KPGO Stand Up Pouch (1LTR x 5)',
    'kpgoPouch1': 'KPGO POUCH 1 LTR',
    'kpgoSup1': 'KPGO Stand Up Pouch 1 LTR',
    'kpgoBkt16': 'KPGO 16 LTR BKT',
    'salesOil': 'Sales-Oil (LTR)',
    'kbpBkt10': 'KBP GOLD 10 KG BKT',
    'kbpBkt25': 'KBP GOLD 2.5 KG BKT',
    'kbpBkt5': 'KBP GOLD 5 KG BKT',
    'kbpTin5': 'KBP GOLD 5 KG TIN',
    'kbpPouch1x5': 'KBP GOLD POUCH (1KG X 5)',
    'kbpPouch1': 'KBP POUCH 1 KG',
    'kbpBkt16': 'KBP 16 KG BKT',
    'salesGhee': 'Sales-Ghee (KG)',
    'wbpBkt5': 'WBP 5 KG BKT',
    'wbpPouch1x5': 'WBP POUCH (1KG X 5)',
    'wbpPouch1': 'WBP POUCH 1 KG',
    'wbpBkt25': 'WBP 2.5 KG BKT',
    'wbpBkt16': 'WBP 16 KG BKT',
    'salesWaadi': 'Sales-Waadi (KG)',
}


def _f(val) -> float:
    try:
        if val is None or val == '':
            return 0.0
        return float(val)
    except (TypeError, ValueError):
        return 0.0


def _parse_date(raw: str | None) -> date | None:
    if not raw:
        return None
    raw = str(raw).strip()[:10]
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def _month_key(d: date) -> str:
    return d.strftime('%Y-%m')


def _month_label(ym: str) -> str:
    try:
        y, m = ym.split('-')
        return f'{MONTH_NAMES[int(m)]} {y}'
    except (ValueError, IndexError):
        return ym


def _minutes_of_day(dt) -> int | None:
    if dt is None:
        return None
    local = timezone.localtime(dt) if timezone.is_aware(dt) else dt
    return local.hour * 60 + local.minute


def _format_clock(minutes: int | None) -> str:
    if minutes is None:
        return '—'
    h24 = (minutes // 60) % 24
    mm = minutes % 60
    return f'{h24 % 12 or 12:02d}:{mm:02d} {"AM" if h24 < 12 else "PM"}'


def _sales_num(sales: dict, *keys: str) -> float:
    total = 0.0
    for k in keys:
        total += _f(sales.get(k))
    return total


def _ba_target_vs_achievement(
    *,
    month: str,
    town: str | None,
    store_name: str | None,
    store_ids: list[int] | None,
) -> dict:
    """Per-BA target (Ambassadors BaTarget) vs checkout sales for one YYYY-MM."""
    from .incentives import ba_month_achievement

    ba_ids = list(
        BaTarget.objects.filter(month=month, target_kg__gt=0)
        .values_list('ambassador_id', flat=True)
        .distinct()
    )
    # Also include BAs who only have checkout sales that month (no target yet).
    try:
        y, m = map(int, month.split('-')[:2])
        m_from = date(y, m, 1)
        if m == 12:
            m_to = date(y, 12, 31)
        else:
            m_to = date(y, m + 1, 1) - timedelta(days=1)
    except ValueError:
        m_from = timezone.localdate().replace(day=1)
        m_to = timezone.localdate()

    sales_ba_ids = list(
        BaDailyReport.objects.filter(date__gte=m_from, date__lte=m_to)
        .values_list('ambassador_id', flat=True)
        .distinct()
    )
    all_ids = set(ba_ids) | {i for i in sales_ba_ids if i}

    ambassadors = (
        Ambassador.objects.filter(id__in=all_ids)
        .select_related('store')
        .order_by('name')
    )
    if store_ids is not None:
        ambassadors = ambassadors.filter(Q(store_id__in=store_ids) | Q(store_id__isnull=True))
    elif town:
        ambassadors = ambassadors.filter(store__city__iexact=town)
    if store_name:
        ambassadors = ambassadors.filter(store__name__iexact=store_name)

    rows = []
    for ba in ambassadors:
        # Skip town filter miss for null-store BAs when town filter is on
        if town and ba.store_id and (ba.store.city or '').lower() != town.lower():
            continue
        if store_name and ba.store_id and (ba.store.name or '').lower() != store_name.lower():
            continue
        if store_ids is not None and ba.store_id and ba.store_id not in store_ids:
            continue

        target, sales, pct = ba_month_achievement(ba.id, month)
        if target <= 0 and sales <= 0:
            continue
        rows.append(
            {
                'ambassadorId': str(ba.id),
                'ambassador': ba.name,
                'store': ba.store.name if ba.store_id else '—',
                'city': ba.store.city if ba.store_id else '',
                'target': round(target, 1),
                'sales': round(sales, 1),
                'achievement': round(pct, 1) if target > 0 else None,
            }
        )

    rows.sort(
        key=lambda r: (
            -(r['achievement'] if r['achievement'] is not None else -1),
            r['ambassador'].lower(),
        )
    )
    return {
        'month': month,
        'monthLabel': _month_label(month),
        'rows': rows,
    }


def build_ba_performance_dashboard(
    *,
    town: str | None = None,
    store_name: str | None = None,
    month: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    category: str | None = None,
    sku: str | None = None,
    sales_period: str = 'mom',
    target_month: str | None = None,
) -> dict:
    today = timezone.localdate()

    # Resolve date range
    if date_from and date_to and date_from > date_to:
        date_from, date_to = date_to, date_from
    if month and not (date_from and date_to):
        # month as YYYY-MM or English month name (current year)
        ym = month
        if '-' not in month:
            try:
                mi = MONTH_NAMES.index(month)
                ym = f'{today.year}-{mi:02d}'
            except ValueError:
                ym = today.strftime('%Y-%m')
        try:
            y, m = map(int, ym.split('-')[:2])
            date_from = date(y, m, 1)
            if m == 12:
                date_to = date(y, 12, 31)
            else:
                date_to = date(y, m + 1, 1) - timedelta(days=1)
            if date_to > today:
                date_to = today
        except ValueError:
            date_from = today.replace(day=1)
            date_to = today
    if not date_from:
        date_from = today.replace(day=1)
    if not date_to:
        date_to = today

    stores_qs = Store.objects.exclude(status=Store.Status.INACTIVE).order_by('city', 'name')
    if town:
        stores_qs = stores_qs.filter(city__iexact=town)
    if store_name:
        stores_qs = stores_qs.filter(name__iexact=store_name)
    stores = list(stores_qs)
    store_ids = [s.id for s in stores]
    store_by_id = {s.id: s for s in stores}

    # Filter option lists (unfiltered by store selection for cascading UI)
    all_stores = list(
        Store.objects.exclude(status=Store.Status.INACTIVE).order_by('city', 'name')
    )
    towns = sorted({s.city for s in all_stores if s.city})
    stores_by_town: dict[str, list[str]] = defaultdict(list)
    for s in all_stores:
        if s.city and s.name not in stores_by_town[s.city]:
            stores_by_town[s.city].append(s.name)
    for city in stores_by_town:
        stores_by_town[city].sort()

    # Months that have targets or reports
    target_months = set(BaTarget.objects.values_list('month', flat=True).distinct())
    report_months = {
        _month_key(d)
        for d in BaDailyReport.objects.values_list('date', flat=True).distinct()
        if d
    }
    months = sorted(target_months | report_months, reverse=True)
    if not months:
        months = [_month_key(today)]

    # ── Daily reports in range ─────────────────────────────────────────────
    reports_qs = BaDailyReport.objects.select_related('store', 'ambassador').filter(
        date__gte=date_from,
        date__lte=date_to,
    )
    if store_ids:
        reports_qs = reports_qs.filter(Q(store_id__in=store_ids) | Q(store__isnull=True, ambassador__store_id__in=store_ids))
    elif town or store_name:
        reports_qs = reports_qs.none()
    reports = list(reports_qs)

    customers_intercepted = 0.0
    productive_calls = 0.0
    oil_sales = 0.0
    ghee_sales = 0.0
    waadi_sales = 0.0
    uncategorized_sales = 0.0
    sales_by_store: dict[str, float] = defaultdict(float)
    sales_by_sku: dict[str, float] = defaultdict(float)
    sales_by_day: dict[str, float] = defaultdict(float)
    sales_by_month: dict[str, float] = defaultdict(float)
    sales_by_week: dict[int, float] = defaultdict(float)  # ISO week

    for r in reports:
        sales = r.sales_json if isinstance(r.sales_json, dict) else {}
        store_obj = r.store or (store_by_id.get(r.ambassador.store_id) if r.ambassador_id else None)
        if town and store_obj and store_obj.city.lower() != town.lower():
            continue
        if store_name and store_obj and store_obj.name.lower() != store_name.lower():
            continue

        intercepted = _sales_num(sales, 'totalInterceptions')
        productive = _sales_num(sales, 'productiveCalls')
        cats = category_sales_from_json(sales)
        oil = cats['Kashmir Cooking Oil']
        ghee = cats['Kashmir Banaspati']
        waadi = cats['Waadi Banaspati']
        total_line = _sales_num(sales, 'totalSalesLtrKg')
        sku_sum = oil + ghee + waadi

        # Product filter — Total Sales only counts when no category/SKU split
        if category == 'Kashmir Cooking Oil':
            row_sales = oil
        elif category == 'Kashmir Banaspati':
            row_sales = ghee
        elif category == 'Waadi Banaspati':
            row_sales = waadi
        else:
            row_sales = sku_sum if sku_sum > 0 else total_line

        if sku:
            # Match by label or key — convert pack units to kg
            matched = 0.0
            for key, label in SKU_LABELS.items():
                if key in ('salesOil', 'salesGhee', 'salesWaadi'):
                    continue
                if sku.lower() in (key.lower(), label.lower()) or label.lower() == sku.lower():
                    matched += kg_for_pack_units(key, sales.get(key))
            if matched <= 0 and sku in sales:
                matched = kg_for_pack_units(sku, sales.get(sku))
            # Allow filtering "Total Sales (uncategorized)"
            if matched <= 0 and 'total' in sku.lower() and 'uncategor' in sku.lower():
                matched = total_line if sku_sum <= 0 else 0.0
            row_sales = matched

        customers_intercepted += intercepted
        productive_calls += productive
        if sku_sum > 0:
            oil_sales += oil
            ghee_sales += ghee
            waadi_sales += waadi
        elif total_line > 0 and not category:
            uncategorized_sales += total_line

        sname = store_obj.name if store_obj else 'Unknown store'
        sales_by_store[sname] += row_sales
        sales_by_day[r.date.isoformat()] += row_sales
        sales_by_month[_month_key(r.date)] += row_sales
        sales_by_week[r.date.isocalendar()[1]] += row_sales

        sku_vals_added = False
        for key, label in SKU_LABELS.items():
            if key in ('salesOil', 'salesGhee', 'salesWaadi'):
                continue
            val = kg_for_pack_units(key, sales.get(key))
            if val <= 0:
                continue
            if category == 'Kashmir Cooking Oil' and key not in OIL_SKU_KEYS:
                continue
            if category == 'Kashmir Banaspati' and key not in GHEE_SKU_KEYS:
                continue
            if category == 'Waadi Banaspati' and key not in WAADI_SKU_KEYS:
                continue
            if sku and sku.lower() not in (key.lower(), label.lower()):
                continue
            sales_by_sku[label] += val
            sku_vals_added = True

        # Only Total Sales filled → still show on Top SKUs as uncategorized
        if not sku_vals_added and total_line > 0 and row_sales > 0:
            if not sku or 'uncategor' in sku.lower() or 'total sales' in sku.lower():
                sales_by_sku['Total Sales (uncategorized)'] += row_sales

    total_sales = oil_sales + ghee_sales + waadi_sales + uncategorized_sales
    if category == 'Kashmir Cooking Oil':
        scoped_sales = oil_sales
    elif category == 'Kashmir Banaspati':
        scoped_sales = ghee_sales
    elif category == 'Waadi Banaspati':
        scoped_sales = waadi_sales
    else:
        scoped_sales = sum(sales_by_store.values()) if sales_by_store else total_sales

    # ── Targets ────────────────────────────────────────────────────────────
    month_keys = set()
    d = date_from
    while d <= date_to:
        month_keys.add(_month_key(d))
        if d.month == 12:
            d = date(d.year + 1, 1, 1)
        else:
            d = date(d.year, d.month + 1, 1)

    targets_qs = BaTarget.objects.select_related('ambassador', 'ambassador__store').filter(
        month__in=month_keys
    )
    if town:
        targets_qs = targets_qs.filter(ambassador__store__city__iexact=town)
    if store_name:
        targets_qs = targets_qs.filter(ambassador__store__name__iexact=store_name)
    if sku:
        targets_qs = targets_qs.filter(sku__icontains=sku)

    target_total = 0.0
    target_sales_total = 0.0  # from BaTarget.sales_kg (HO-entered)
    for t in targets_qs:
        if category == 'Kashmir Cooking Oil' and t.sku and ('kbp' in t.sku.lower() or 'wbp' in t.sku.lower() or 'ghee' in t.sku.lower()):
            continue
        if category == 'Kashmir Banaspati' and t.sku and ('kpgo' in t.sku.lower() or 'wbp' in t.sku.lower() or 'oil' in t.sku.lower()):
            continue
        target_total += float(t.target_kg or 0)
        target_sales_total += float(t.sales_kg or 0)

    # Prefer field-report sales; fall back to target sales_kg when no reports
    sales_ltr_kg = round(scoped_sales, 1) if scoped_sales > 0 else round(target_sales_total, 1)
    target_ltr_kg = round(target_total, 1)
    achievement = round((sales_ltr_kg / target_ltr_kg) * 100, 1) if target_ltr_kg > 0 else 0.0
    productive_pct = (
        round((productive_calls / customers_intercepted) * 100, 1) if customers_intercepted > 0 else 0.0
    )

    category_sales = [
        {'name': 'Kashmir Cooking Oil', 'value': round(oil_sales, 1)},
        {'name': 'Kashmir Banaspati', 'value': round(ghee_sales, 1)},
        {'name': 'Waadi Banaspati', 'value': round(waadi_sales, 1)},
    ]
    if uncategorized_sales > 0:
        category_sales.append(
            {'name': 'Total Sales (uncategorized)', 'value': round(uncategorized_sales, 1)}
        )

    top_stores = sorted(
        ({'store': k, 'sales': round(v, 1)} for k, v in sales_by_store.items()),
        key=lambda x: x['sales'],
        reverse=True,
    )[:10]
    top_skus = sorted(
        ({'sku': k, 'sales': round(v, 1)} for k, v in sales_by_sku.items()),
        key=lambda x: x['sales'],
        reverse=True,
    )[:10]

    # Period sales series (for line chart)
    period_sales = _period_sales_series(
        sales_period,
        sales_by_day,
        sales_by_month,
        sales_by_week,
        date_from,
        date_to,
        targets_qs,
    )

    # ── Attendance / BA status ─────────────────────────────────────────────
    ba_status, attendance, working_hours = _attendance_block(
        date_from=date_from,
        date_to=date_to,
        town=town,
        store_name=store_name,
        store_ids=store_ids if (town or store_name) else None,
        today=today,
    )

    return {
        'filters': {
            'towns': towns,
            'storesByTown': dict(stores_by_town),
            'months': months,
            'monthLabels': {m: _month_label(m) for m in months},
            'categories': ['Kashmir Cooking Oil', 'Kashmir Banaspati', 'Waadi Banaspati'],
            'brands': ['Kashmir', 'Waadi'],
            'skus': sorted(set(SKU_LABELS.values())),
        },
        'range': {
            'from': date_from.isoformat(),
            'to': date_to.isoformat(),
            'days': (date_to - date_from).days + 1,
        },
        'kpis': {
            'customersIntercepted': int(round(customers_intercepted)),
            'productiveCalls': int(round(productive_calls)),
            'productivePct': productive_pct,
            'targetLtrKg': target_ltr_kg,
            'salesLtrKg': sales_ltr_kg,
            'achievementPct': achievement,
        },
        'categorySales': category_sales,
        'townTargetVsSales': {
            'town': town or 'All towns',
            'target': target_ltr_kg,
            'sales': sales_ltr_kg,
        },
        'topStores': top_stores,
        'topSkus': top_skus,
        'periodSales': period_sales,
        'baStatus': ba_status,
        'attendance': attendance,
        'workingHours': working_hours,
        'targetVsAchievement': _ba_target_vs_achievement(
            month=(target_month or _month_key(date_to)),
            town=town,
            store_name=store_name,
            store_ids=store_ids if (town or store_name) else None,
        ),
    }


def _period_sales_series(
    mode: str,
    by_day: dict[str, float],
    by_month: dict[str, float],
    by_week: dict[int, float],
    date_from: date,
    date_to: date,
    targets_qs,
) -> list[dict]:
    target_by_month: dict[str, float] = defaultdict(float)
    for t in targets_qs:
        target_by_month[t.month] += float(t.target_kg or 0)

    if mode == 'wow':
        from calendar import monthrange

        # Prorate monthly targets onto ISO weeks by calendar day in the range.
        week_targets: dict[int, float] = defaultdict(float)
        d = date_from
        while d <= date_to:
            week = d.isocalendar()[1]
            ym = _month_key(d)
            dim = monthrange(d.year, d.month)[1]
            week_targets[week] += target_by_month.get(ym, 0) / dim if dim else 0.0
            d += timedelta(days=1)

        weeks = sorted(set(by_week.keys()) | set(week_targets.keys()))
        rows = []
        for week in weeks:
            rows.append(
                {
                    'label': f'W{week}',
                    'sales': round(by_week.get(week, 0), 1),
                    'target': round(week_targets.get(week, 0), 1),
                }
            )
        return rows

    if mode == 'ytd':
        year = date_to.year
        rows = []
        for m in range(1, 13):
            ym = f'{year}-{m:02d}'
            if date(year, m, 1) > date_to:
                break
            rows.append(
                {
                    'label': MONTH_NAMES[m][:3],
                    'sales': round(by_month.get(ym, 0), 1),
                    'target': round(target_by_month.get(ym, 0), 1),
                }
            )
        return rows

    # mom default — months in range
    rows = []
    for ym in sorted(set(list(by_month.keys()) + list(target_by_month.keys()))):
        try:
            y, m = map(int, ym.split('-'))
            cursor = date(y, m, 1)
        except ValueError:
            continue
        if cursor < date(date_from.year, date_from.month, 1) or cursor > date_to:
            continue
        rows.append(
            {
                'label': _month_label(ym),
                'sales': round(by_month.get(ym, 0), 1),
                'target': round(target_by_month.get(ym, 0), 1),
            }
        )
    if not rows:
        # still show empty months in range
        d = date(date_from.year, date_from.month, 1)
        end = date(date_to.year, date_to.month, 1)
        while d <= end:
            ym = _month_key(d)
            rows.append(
                {
                    'label': _month_label(ym),
                    'sales': round(by_month.get(ym, 0), 1),
                    'target': round(target_by_month.get(ym, 0), 1),
                }
            )
            if d.month == 12:
                d = date(d.year + 1, 1, 1)
            else:
                d = date(d.year, d.month + 1, 1)
    return rows


def _attendance_block(
    *,
    date_from: date,
    date_to: date,
    town: str | None,
    store_name: str | None,
    store_ids: list[int] | None,
    today: date,
) -> tuple[dict, list[dict], dict]:
    shifts = (
        ShiftAssignment.objects.filter(
            date__gte=date_from,
            date__lte=date_to,
            ambassador__isnull=False,
            status__in=(ShiftAssignment.Status.SCHEDULED, ShiftAssignment.Status.CONFLICT),
        )
        .select_related('store', 'ambassador')
        .order_by('date', 'id')
    )
    if store_ids is not None:
        shifts = shifts.filter(store_id__in=store_ids)
    elif town:
        shifts = shifts.filter(store__city__iexact=town)
    if store_name:
        shifts = shifts.filter(store__name__iexact=store_name)

    shifts = list(shifts)
    days = (date_to - date_from).days + 1
    single_day = days == 1

    # ── Live "right now" city snapshot (title: Active BAs by city) ─────────
    # Prefer today's open sessions; include Deployed BAs by home store so
    # cities aren't empty when nobody has a shift clock yet.
    today_shifts = (
        ShiftAssignment.objects.filter(
            date=today,
            ambassador__isnull=False,
            status__in=(ShiftAssignment.Status.SCHEDULED, ShiftAssignment.Status.CONFLICT),
        )
        .select_related('store', 'ambassador')
    )
    if store_ids is not None:
        today_shifts = today_shifts.filter(store_id__in=store_ids)
    elif town:
        today_shifts = today_shifts.filter(store__city__iexact=town)
    if store_name:
        today_shifts = today_shifts.filter(store__name__iexact=store_name)
    today_shifts = list(today_shifts)

    active_ba_ids: set[int] = set()
    ba_city: dict[int, str] = {}
    ba_stores: dict[int, set[int]] = defaultdict(set)
    ba_names: dict[int, str] = {}
    ba_store_label: dict[int, str] = {}

    def _mark_active(ba_id: int, *, name: str, store: str, city: str, store_id: int | None):
        active_ba_ids.add(ba_id)
        if name:
            ba_names[ba_id] = name
        if city:
            ba_city[ba_id] = city
        if store:
            ba_store_label[ba_id] = store
        if store_id:
            ba_stores[ba_id].add(store_id)

    for s in today_shifts:
        if not s.ambassador_id or not s.store_id:
            continue
        ba_city[s.ambassador_id] = s.store.city or '—'
        ba_stores[s.ambassador_id].add(s.store_id)
        if s.checked_in_at and not s.checked_out_at:
            _mark_active(
                s.ambassador_id,
                name=(s.ambassador.name if s.ambassador else '') or '',
                store=s.store.name or '—',
                city=s.store.city or '—',
                store_id=s.store_id,
            )

    # Month-level deployments: live check-in may sit on the 1st-of-month row.
    for s in (
        ShiftAssignment.objects.filter(
            date__year=today.year,
            date__month=today.month,
            ambassador__isnull=False,
            checked_in_at__isnull=False,
            checked_out_at__isnull=True,
            status__in=(ShiftAssignment.Status.SCHEDULED, ShiftAssignment.Status.CONFLICT),
        )
        .select_related('store', 'ambassador')
    ):
        if not s.ambassador_id or not s.store_id:
            continue
        if timezone.localtime(s.checked_in_at).date() != today:
            continue
        if store_ids is not None and s.store_id not in store_ids:
            continue
        if town and (s.store.city or '').lower() != town.lower():
            continue
        if store_name and (s.store.name or '').lower() != store_name.lower():
            continue
        _mark_active(
            s.ambassador_id,
            name=(s.ambassador.name if s.ambassador else '') or '',
            store=s.store.name or '—',
            city=s.store.city or '—',
            store_id=s.store_id,
        )

    from .models import BaAttendanceDay

    for row in BaAttendanceDay.objects.filter(
        date=today,
        checked_in_at__isnull=False,
        checked_out_at__isnull=True,
    ).select_related('store', 'ambassador', 'ambassador__store'):
        if not row.ambassador_id:
            continue
        sid = row.store_id or (row.ambassador.store_id if row.ambassador_id else None)
        if store_ids is not None and sid not in store_ids:
            continue
        city = (row.store.city if row.store_id else None) or (
            row.ambassador.store.city if row.ambassador and row.ambassador.store_id else None
        )
        store_label = (row.store.name if row.store_id else None) or (
            row.ambassador.store.name if row.ambassador and row.ambassador.store_id else None
        )
        if town and (city or '').lower() != town.lower():
            continue
        if store_name and row.store and row.store.name.lower() != store_name.lower():
            continue
        if city:
            ba_city[row.ambassador_id] = city
        if sid:
            ba_stores[row.ambassador_id].add(sid)
        _mark_active(
            row.ambassador_id,
            name=(row.ambassador.name if row.ambassador else '') or '',
            store=store_label or '—',
            city=city or '—',
            store_id=sid,
        )

    deployed = Ambassador.objects.filter(
        status__in=(Ambassador.Status.DEPLOYED, Ambassador.Status.CERTIFIED),
        store__isnull=False,
    ).select_related('store')
    if store_ids is not None:
        deployed = deployed.filter(store_id__in=store_ids)
    elif town:
        deployed = deployed.filter(store__city__iexact=town)
    if store_name:
        deployed = deployed.filter(store__name__iexact=store_name)

    for ba in deployed:
        if ba.id not in ba_city and ba.store_id:
            ba_city[ba.id] = ba.store.city or '—'
            ba_stores[ba.id].add(ba.store_id)

    city_live: dict[str, dict] = defaultdict(
        lambda: {'active': 0, 'break': 0, 'offline': 0, 'stores': set()}
    )
    for ba_id, city in ba_city.items():
        city_live[city]['stores'] |= ba_stores.get(ba_id, set())
        if ba_id in active_ba_ids:
            city_live[city]['active'] += 1
        else:
            city_live[city]['offline'] += 1

    # Prefer full store network counts per city when available
    store_qs = Store.objects.exclude(status=Store.Status.INACTIVE)
    if store_ids is not None:
        store_qs = store_qs.filter(id__in=store_ids)
    elif town:
        store_qs = store_qs.filter(city__iexact=town)
    if store_name:
        store_qs = store_qs.filter(name__iexact=store_name)
    stores_by_city: dict[str, set[int]] = defaultdict(set)
    for s in store_qs.only('id', 'city'):
        if s.city:
            stores_by_city[s.city].add(s.id)
            if s.city not in city_live:
                city_live[s.city]  # ensure city row even with zero BAs

    city_rows = []
    for city, vals in sorted(city_live.items()):
        store_count = len(stores_by_city.get(city) or vals['stores'])
        city_rows.append(
            {
                'city': city,
                'stores': store_count,
                'active': vals['active'],
                'break': vals['break'],
                'offline': vals['offline'],
                'total': vals['active'] + vals['break'] + vals['offline'],
            }
        )

    active_n = sum(c['active'] for c in city_rows)
    break_n = sum(c['break'] for c in city_rows)
    offline_n = sum(c['offline'] for c in city_rows)

    missing_names = [ba_id for ba_id in active_ba_ids if not ba_names.get(ba_id)]
    if missing_names:
        for ba in Ambassador.objects.filter(id__in=missing_names).only('id', 'name'):
            ba_names[ba.id] = ba.name or ''

    active_bas = [
        {
            'id': ba_id,
            'name': ba_names.get(ba_id) or f'BA #{ba_id}',
            'store': ba_store_label.get(ba_id) or '—',
            'city': ba_city.get(ba_id) or '—',
        }
        for ba_id in active_ba_ids
    ]
    active_bas.sort(key=lambda r: ((r['city'] or '').lower(), (r['name'] or '').lower()))

    ba_status = {
        'days': 1,  # live snapshot (not averaged over the filter range)
        'total': active_n + break_n + offline_n,
        'active': active_n,
        'break': break_n,
        'offline': offline_n,
        'cities': city_rows,
        'activeBas': active_bas,
        'asOf': 'live',
    }

    # Attendance rows — prefer BaAttendanceDay (persists after month-shift clock roll).
    from .models import BaAttendanceDay

    now = timezone.localtime()
    now_min = now.hour * 60 + now.minute
    records = []

    att_qs = (
        BaAttendanceDay.objects.filter(
            date__gte=date_from,
            date__lte=date_to,
            ambassador_id__isnull=False,
        )
        .select_related('store', 'ambassador')
        .order_by('date', 'id')
    )
    if store_ids is not None:
        att_qs = att_qs.filter(store_id__in=store_ids)
    elif town:
        att_qs = att_qs.filter(store__city__iexact=town)
    if store_name:
        att_qs = att_qs.filter(store__name__iexact=store_name)

    seen_keys: set[tuple] = set()
    for row in att_qs:
        if not row.checked_in_at:
            continue
        store_obj = row.store or (row.ambassador.store if row.ambassador_id else None)
        cin = _minutes_of_day(row.checked_in_at)
        cout = _minutes_of_day(row.checked_out_at) if row.checked_out_at else None
        end_min = cout if cout is not None else (now_min if row.date == today else 20 * 60)
        hours = max(0.0, ((end_min or 0) - (cin or 0)) / 60.0)
        key = (row.ambassador_id, row.date.isoformat())
        seen_keys.add(key)
        records.append(
            {
                'ba': row.ambassador.name if row.ambassador_id else '—',
                'baId': row.ambassador_id,
                'store': store_obj.name if store_obj else '—',
                'city': store_obj.city if store_obj else '—',
                'date': row.date.isoformat(),
                'checkInMin': cin,
                'checkOutMin': cout,
                'hours': round(hours, 2),
                'status': (
                    'Active'
                    if cout is None and row.date == today
                    else 'Checked Out'
                    if cout is not None
                    else 'Offline'
                ),
            }
        )

    # Also fold in live ShiftAssignment clocks (exact-date + month-level for today).
    for s in shifts:
        if not s.ambassador_id:
            continue
        if s.checked_in_at:
            cin_day = timezone.localtime(s.checked_in_at).date()
            if cin_day < date_from or cin_day > date_to:
                continue
            key = (s.ambassador_id, cin_day.isoformat())
            if key in seen_keys:
                continue
            seen_keys.add(key)
            cin = _minutes_of_day(s.checked_in_at)
            cout = _minutes_of_day(s.checked_out_at) if s.checked_out_at else None
            end_min = cout if cout is not None else (now_min if cin_day == today else 20 * 60)
            hours = max(0.0, ((end_min or 0) - (cin or 0)) / 60.0)
            records.append(
                {
                    'ba': s.ambassador.name if s.ambassador else '—',
                    'baId': s.ambassador_id,
                    'store': s.store.name if s.store_id else '—',
                    'city': s.store.city if s.store_id else '—',
                    'date': cin_day.isoformat(),
                    'checkInMin': cin,
                    'checkOutMin': cout,
                    'hours': round(hours, 2),
                    'status': (
                        'Active'
                        if cout is None and cin_day == today
                        else 'Checked Out'
                        if cout is not None
                        else 'Offline'
                    ),
                }
            )
        elif single_day and s.date == date_from:
            # Scheduled but no check-in yet
            key = (s.ambassador_id, s.date.isoformat())
            if key in seen_keys:
                continue
            seen_keys.add(key)
            records.append(
                {
                    'ba': s.ambassador.name if s.ambassador else '—',
                    'baId': s.ambassador_id,
                    'store': s.store.name if s.store_id else '—',
                    'city': s.store.city if s.store_id else '—',
                    'date': s.date.isoformat(),
                    'checkInMin': None,
                    'checkOutMin': None,
                    'hours': 0.0,
                    'status': 'Offline',
                }
            )

    # Month-level rows (usually dated the 1st) may fall outside a mid-month day filter.
    if date_from <= today <= date_to:
        month_level = (
            ShiftAssignment.objects.filter(
                ambassador_id__isnull=False,
                date__year=today.year,
                date__month=today.month,
                checked_in_at__isnull=False,
                status__in=(ShiftAssignment.Status.SCHEDULED, ShiftAssignment.Status.CONFLICT),
            )
            .select_related('store', 'ambassador')
            .order_by('-checked_in_at', '-id')
        )
        if store_ids is not None:
            month_level = month_level.filter(store_id__in=store_ids)
        elif town:
            month_level = month_level.filter(store__city__iexact=town)
        if store_name:
            month_level = month_level.filter(store__name__iexact=store_name)
        for s in month_level:
            cin_day = timezone.localtime(s.checked_in_at).date()
            if cin_day != today:
                continue
            key = (s.ambassador_id, cin_day.isoformat())
            if key in seen_keys:
                continue
            seen_keys.add(key)
            cin = _minutes_of_day(s.checked_in_at)
            cout = _minutes_of_day(s.checked_out_at) if s.checked_out_at else None
            end_min = cout if cout is not None else now_min
            hours = max(0.0, ((end_min or 0) - (cin or 0)) / 60.0)
            records.append(
                {
                    'ba': s.ambassador.name if s.ambassador else '—',
                    'baId': s.ambassador_id,
                    'store': s.store.name if s.store_id else '—',
                    'city': s.store.city if s.store_id else '—',
                    'date': cin_day.isoformat(),
                    'checkInMin': cin,
                    'checkOutMin': cout,
                    'hours': round(hours, 2),
                    'status': 'Active' if cout is None else 'Checked Out',
                }
            )

    # Single-day: include deployed BAs with no row yet so the roster is complete.
    if single_day:
        for ba in deployed:
            key = (ba.id, date_from.isoformat())
            if key in seen_keys:
                continue
            if not ba.store_id:
                continue
            seen_keys.add(key)
            records.append(
                {
                    'ba': ba.name,
                    'baId': ba.id,
                    'store': ba.store.name if ba.store else '—',
                    'city': ba.store.city if ba.store else '—',
                    'date': date_from.isoformat(),
                    'checkInMin': None,
                    'checkOutMin': None,
                    'hours': 0.0,
                    'status': 'Offline',
                }
            )

    if single_day:
        attendance = [
            {
                'ba': r['ba'],
                'store': r['store'],
                'city': r['city'],
                'days': 1,
                'checkIn': _format_clock(r['checkInMin']),
                'checkOut': _format_clock(r['checkOutMin']),
                'hours': r['hours'],
                'status': r['status']
                if r['status']
                else (
                    'Active'
                    if r['checkOutMin'] is None and r['checkInMin'] is not None
                    else 'Offline'
                ),
            }
            for r in records
        ]
        attendance.sort(key=lambda r: (r['city'], r['ba']))
    else:
        groups: dict[str, list] = defaultdict(list)
        for r in records:
            if r['checkInMin'] is None:
                continue
            groups[f"{r['ba']}|{r['store']}"].append(r)
        attendance = []
        for rs in groups.values():
            cins = [r['checkInMin'] for r in rs if r['checkInMin'] is not None]
            couts = [r['checkOutMin'] for r in rs if r['checkOutMin'] is not None]
            hrs = [r['hours'] for r in rs]
            avg = (lambda xs: sum(xs) / len(xs) if xs else None)
            attendance.append(
                {
                    'ba': rs[0]['ba'],
                    'store': rs[0]['store'],
                    'city': rs[0]['city'],
                    'days': len(rs),
                    'checkIn': _format_clock(int(avg(cins)) if avg(cins) is not None else None),
                    'checkOut': _format_clock(int(avg(couts)) if avg(couts) is not None else None),
                    'hours': round(avg(hrs) or 0, 2),
                    'status': None,
                }
            )
        attendance.sort(key=lambda r: (r['city'], r['ba']))

    # Working hours series
    months_short = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    def bucket(r):
        d = date.fromisoformat(r['date'])
        if days == 1:
            return r['store']
        if days <= 31:
            return f"{d.day} {months_short[d.month - 1]}"
        return f"{months_short[d.month - 1]} {str(d.year)[2:]}"

    buckets: dict[str, list[float]] = defaultdict(list)
    bucket_order: list[str] = []
    for r in records:
        if r['checkInMin'] is None:
            continue
        key = bucket(r)
        if key not in buckets:
            bucket_order.append(key)
        buckets[key].append(r['hours'])
    points = [
        {
            'label': label,
            'hours': round(sum(hs) / len(hs), 2),
            'count': len(hs),
        }
        for label, hs in ((k, buckets[k]) for k in bucket_order)
    ]
    all_hrs = [r['hours'] for r in records if r['checkInMin'] is not None]
    working_hours = {
        'avgHours': round(sum(all_hrs) / len(all_hrs), 2) if all_hrs else None,
        'points': points,
    }

    return ba_status, attendance, working_hours
