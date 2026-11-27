"""
HO/MIS Excel-style exports matching Tapal Region / Store Performance layouts.
Data sourced from UserInterception, BaTarget, BaDailyReport, Store, Supervisor.
"""

from __future__ import annotations

from calendar import month_name, monthrange
from collections import defaultdict
from datetime import date, timedelta

from django.db.models import Q
from django.utils import timezone

from .ba_performance import (
    CATEGORY_NAMES,
    SKU_LABELS,
    _category_for_target_sku,
    _month_key,
    _sales_num,
)
from .models import BaDailyReport, BaTarget, Store, Supervisor, UserInterception
from .sales_report import category_sales_from_json


def _parse_iso_date(raw: str | None) -> date | None:
    if not raw:
        return None
    try:
        return date.fromisoformat(str(raw).strip()[:10])
    except ValueError:
        return None


def _resolve_range(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    today = timezone.localdate()
    if date_from and date_to and date_from > date_to:
        date_from, date_to = date_to, date_from
    if not date_from:
        date_from = today.replace(day=1)
    if not date_to:
        date_to = today
    if date_to > today:
        date_to = today
    return date_from, date_to


def _month_keys_in_range(date_from: date, date_to: date) -> list[str]:
    keys: list[str] = []
    d = date(date_from.year, date_from.month, 1)
    end = date(date_to.year, date_to.month, 1)
    while d <= end:
        keys.append(_month_key(d))
        if d.month == 12:
            d = date(d.year + 1, 1, 1)
        else:
            d = date(d.year, d.month + 1, 1)
    return keys


def _month_label_short(d: date) -> str:
    return f"{month_name[d.month][:3]}'{str(d.year)[2:]}"


def _month_name_only(ym: str) -> str:
    try:
        _y, m = ym.split('-')[:2]
        return month_name[int(m)]
    except (ValueError, IndexError):
        return ym


def _year_of_ym(ym: str) -> int:
    try:
        return int(ym.split('-')[0])
    except (ValueError, IndexError):
        return timezone.localdate().year


def _weeks_in_month_overlap(ym: str, date_from: date, date_to: date) -> list[tuple[str, date, date]]:
    """
    Calendar weeks (Mon–Sun) that overlap both the month and [date_from, date_to].
    Returns list of (Week N, week_start, week_end) in order.
    """
    try:
        y, m = map(int, ym.split('-')[:2])
    except ValueError:
        return []
    month_start = date(y, m, 1)
    month_end = date(y, m, monthrange(y, m)[1])
    lo = max(month_start, date_from)
    hi = min(month_end, date_to)
    if lo > hi:
        return []

    # Monday on or before lo
    start = lo - timedelta(days=lo.weekday())
    weeks: list[tuple[str, date, date]] = []
    idx = 1
    cur = start
    while cur <= hi:
        w_end = cur + timedelta(days=6)
        if w_end >= lo and cur <= hi:
            weeks.append((f'Week {idx}', cur, w_end))
            idx += 1
        cur += timedelta(days=7)
    return weeks


def _week_label_for_day(d: date, date_from: date, date_to: date) -> str:
    ym = _month_key(d)
    for label, w_start, w_end in _weeks_in_month_overlap(ym, date_from, date_to):
        if w_start <= d <= w_end:
            return label
    return 'Week 1'


def _filtered_stores(town: str | None, store_name: str | None) -> list[Store]:
    qs = Store.objects.exclude(status=Store.Status.INACTIVE).order_by('city', 'name')
    if town:
        qs = qs.filter(city__iexact=town)
    if store_name:
        qs = qs.filter(name__iexact=store_name)
    return list(qs)


def _supervisor_by_store_id() -> dict[int, int]:
    mapping: dict[int, int] = {}
    for sup in Supervisor.objects.prefetch_related('stores').all():
        for store in sup.stores.all():
            mapping[store.id] = sup.id
    return mapping


def _sku_label(key_or_label: str) -> str:
    s = (key_or_label or '').strip()
    if not s:
        return ''
    return SKU_LABELS.get(s, s)


def _kg_achievement_pct(assigned: float, achieved: float) -> float | None:
    """Achieved / Assigned as percent (e.g. 74.0). Blank when no target."""
    if assigned is None or assigned <= 0:
        return None
    return round((achieved / assigned) * 100, 1)


def _scan_daily_reports(
    *,
    date_from: date,
    date_to: date,
    store_ids: set[int] | None,
    town: str | None,
    store_name: str | None,
) -> tuple[dict[int, float], dict[tuple[int, str], float], float, float, float]:
    """
    Returns:
      store_id -> total kg sales
      (store_id, category) -> kg sales
      grand total kg
      customers intercepted (from sales_json)
      productive calls (from sales_json)
    """
    reports = (
        BaDailyReport.objects.select_related('store', 'ambassador', 'ambassador__store')
        .filter(date__gte=date_from, date__lte=date_to)
    )
    if store_ids is not None:
        reports = reports.filter(
            Q(store_id__in=store_ids) | Q(store__isnull=True, ambassador__store_id__in=store_ids)
        )
    elif town or store_name:
        reports = reports.none()

    by_store: dict[int, float] = defaultdict(float)
    by_store_category: dict[tuple[int, str], float] = defaultdict(float)
    total = 0.0
    intercepted = 0.0
    productive = 0.0

    for r in reports:
        store_obj = r.store or (r.ambassador.store if r.ambassador_id else None)
        if not store_obj:
            continue
        if town and store_obj.city.lower() != town.lower():
            continue
        if store_name and store_obj.name.lower() != store_name.lower():
            continue
        sales = r.sales_json if isinstance(r.sales_json, dict) else {}
        intercepted += _sales_num(sales, 'totalInterceptions')
        productive += _sales_num(sales, 'productiveCalls')
        cats = category_sales_from_json(sales)
        sku_sum = sum(cats.values())
        total_line = _sales_num(sales, 'totalSalesLtrKg')
        row_total = sku_sum if sku_sum > 0 else total_line
        by_store[store_obj.id] += row_total
        total += row_total
        for cat, val in cats.items():
            if val > 0:
                by_store_category[(store_obj.id, cat)] += val

    return by_store, by_store_category, total, intercepted, productive


def build_region_wise_export(
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    town: str | None = None,
    store_name: str | None = None,
) -> dict:
    date_from, date_to = _resolve_range(date_from, date_to)
    stores = _filtered_stores(town, store_name)
    store_ids = {s.id for s in stores}
    store_by_id = {s.id: s for s in stores}
    supervisor_by_store = _supervisor_by_store_id()
    month_keys = _month_keys_in_range(date_from, date_to)

    # ── Interceptions ──────────────────────────────────────────────────────
    inter_qs = (
        UserInterception.objects.select_related('ambassador', 'store', 'ambassador__store')
        .filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
        .order_by('created_at', 'id')
    )
    if town or store_name:
        inter_qs = inter_qs.filter(
            Q(store_id__in=store_ids)
            | Q(store__isnull=True, ambassador__store_id__in=store_ids)
        )

    interception_rows: list[dict] = []
    retained = 0
    conversion = 0
    non_productive = 0

    for row in inter_qs:
        store_obj = row.store or (row.ambassador.store if row.ambassador_id else None)
        if store_obj and store_ids and store_obj.id not in store_ids and (town or store_name):
            continue

        status = row.status or ''
        if status == UserInterception.Status.TRIALIST:
            inter_label = 'Productive'
            conv_label = 'conversion'
            conversion += 1
        elif status == UserInterception.Status.NON_PRODUCTIVE:
            inter_label = 'Non Productive'
            conv_label = 'non-productive'
            non_productive += 1
        else:
            inter_label = 'Productive'
            conv_label = 'productive'
            retained += 1

        local_dt = timezone.localtime(row.created_at) if row.created_at else None
        day = local_dt.date() if local_dt else date_from
        store_name_val = (
            row.store_name
            or (store_obj.name if store_obj else '')
            or ''
        )
        city = (
            (store_obj.city if store_obj else '')
            or (row.ambassador.city if row.ambassador_id else '')
            or row.city_area
            or ''
        )
        supervisor_id = ''
        if store_obj and store_obj.id in supervisor_by_store:
            supervisor_id = supervisor_by_store[store_obj.id]

        sku_val = ''
        if status != UserInterception.Status.NON_PRODUCTIVE:
            sku_val = (row.current_sku or '').strip()

        interception_rows.append(
            {
                'Supervisor ID': supervisor_id if supervisor_id != '' else None,
                'BA': row.ba_name or (row.ambassador.name if row.ambassador_id else ''),
                'Customer': row.name or '',
                'Contact': row.contact or '',
                'City': city,
                'Region': city,
                'Store': store_name_val,
                'Date': local_dt.strftime('%Y-%m-%d %H:%M') if local_dt else '',
                'Interception': inter_label,
                'Conversion': conv_label,
                'CompanyName': (row.previous_brand or '').strip(),
                'Brand': '',
                'SKU': sku_val,
                'SKU Count': None,
                'Store 2': store_name_val,
                'Week': _week_label_for_day(day, date_from, date_to),
                'Month': month_name[day.month] if day else '',
            }
        )

    # ── Sales + dashboard-style interceptions (daily reports) ──────────────
    scoped_store_ids = store_ids if (town or store_name) else None
    _sales_by_store, _sales_by_cat, total_sale, _i, _p = _scan_daily_reports(
        date_from=date_from,
        date_to=date_to,
        store_ids=scoped_store_ids,
        town=town,
        store_name=store_name,
    )

    targets_qs = BaTarget.objects.select_related('ambassador', 'ambassador__store').filter(
        month__in=month_keys
    )
    if town:
        targets_qs = targets_qs.filter(ambassador__store__city__iexact=town)
    if store_name:
        targets_qs = targets_qs.filter(ambassador__store__name__iexact=store_name)

    target_total = 0.0
    for t in targets_qs:
        target_total += float(t.target_kg or 0)

    def _summary_interception_cols(intercepted: float, productive: float) -> dict:
        total_i = int(round(intercepted))
        retained_i = int(round(productive))
        non_i = max(0, total_i - retained_i)
        return {
            'Total Interception': total_i,
            'Retained': retained_i,
            # Daily reports have no Trialist split — leave blank.
            'Conversion': None,
            'Non-Productive': non_i,
        }

    # Summary: one row per month overlapping the range
    summary_rows: list[dict] = []
    for ym in month_keys:
        try:
            y, m = map(int, ym.split('-')[:2])
            m_from = max(date(y, m, 1), date_from)
            m_to = min(date(y, m, monthrange(y, m)[1]), date_to)
        except ValueError:
            continue

        m_target = sum(
            float(t.target_kg or 0) for t in targets_qs if t.month == ym
        )
        _, _, m_sale, m_intercepted, m_productive = _scan_daily_reports(
            date_from=m_from,
            date_to=m_to,
            store_ids=scoped_store_ids,
            town=town,
            store_name=store_name,
        )
        tar_vs = round((m_sale / m_target) * 100, 1) if m_target > 0 else None
        summary_rows.append(
            {
                'Month': _month_name_only(ym),
                'Target': round(m_target, 2),
                'Achievement': round(m_sale, 2),
                'Tar vs Ach': tar_vs,
                **_summary_interception_cols(m_intercepted, m_productive),
                'Total Sale': round(m_sale, 2),
            }
        )

    if not summary_rows:
        _, _, total_sale, intercepted, productive = _scan_daily_reports(
            date_from=date_from,
            date_to=date_to,
            store_ids=scoped_store_ids,
            town=town,
            store_name=store_name,
        )
        summary_rows.append(
            {
                'Month': month_name[date_to.month],
                'Target': round(target_total, 2),
                'Achievement': round(total_sale, 2),
                'Tar vs Ach': (
                    round((total_sale / target_total) * 100, 1) if target_total > 0 else None
                ),
                **_summary_interception_cols(intercepted, productive),
                'Total Sale': round(total_sale, 2),
            }
        )

    # ── Target vs Achievement Data (weekly split) ──────────────────────────
    tva_rows: list[dict] = []
    for t in targets_qs.order_by('ambassador__store__city', 'ambassador__store__name', 'sku'):
        store_obj = t.ambassador.store if t.ambassador_id else None
        if not store_obj:
            continue
        if store_ids and (town or store_name) and store_obj.id not in store_ids:
            continue
        weeks = _weeks_in_month_overlap(t.month, date_from, date_to)
        if not weeks:
            continue
        monthly = float(t.target_kg or 0)
        weekly = monthly / len(weeks) if weeks else monthly
        brand = _category_for_target_sku(t.sku) or ''
        sku_name = _sku_label(t.sku) or (t.sku or '')
        for week_label, _ws, _we in weeks:
            tva_rows.append(
                {
                    'CITY': store_obj.city or '',
                    'STORE': store_obj.name or '',
                    'MONTH': _month_name_only(t.month),
                    'YEAR': _year_of_ym(t.month),
                    'BRAND': brand,
                    'SKU': sku_name,
                    'Weeks': week_label,
                    'Weekly Target': round(weekly, 6),
                }
            )

    # Serialize Supervisor ID as blank string for JSON friendliness
    for r in interception_rows:
        if r.get('Supervisor ID') is None:
            r['Supervisor ID'] = ''

    return {
        'range': {'from': date_from.isoformat(), 'to': date_to.isoformat()},
        'summary': summary_rows,
        'targetVsAchievement': tva_rows,
        'interceptionAndSales': interception_rows,
    }


def build_store_performance_export(
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    town: str | None = None,
    store_name: str | None = None,
) -> dict:
    date_from, date_to = _resolve_range(date_from, date_to)
    stores = _filtered_stores(town, store_name)
    store_ids = {s.id for s in stores}
    month_keys = _month_keys_in_range(date_from, date_to)
    period_label = _month_label_short(date_to)

    sales_by_store, sales_by_store_cat, _total, _i, _p = _scan_daily_reports(
        date_from=date_from,
        date_to=date_to,
        store_ids=store_ids if (town or store_name) else None,
        town=town,
        store_name=store_name,
    )

    targets_qs = BaTarget.objects.select_related('ambassador', 'ambassador__store').filter(
        month__in=month_keys
    )
    if town:
        targets_qs = targets_qs.filter(ambassador__store__city__iexact=town)
    if store_name:
        targets_qs = targets_qs.filter(ambassador__store__name__iexact=store_name)

    target_by_store: dict[int, float] = defaultdict(float)
    target_by_store_cat: dict[tuple[int, str], float] = defaultdict(float)
    for t in targets_qs:
        store_obj = t.ambassador.store if t.ambassador_id else None
        if not store_obj:
            continue
        if store_ids and (town or store_name) and store_obj.id not in store_ids:
            continue
        kg = float(t.target_kg or 0)
        target_by_store[store_obj.id] += kg
        cat = _category_for_target_sku(t.sku) or (t.sku or '').strip() or 'Other'
        target_by_store_cat[(store_obj.id, cat)] += kg

    # Include stores that have sales or targets; fall back to filtered store list
    relevant_ids = set(sales_by_store.keys()) | set(target_by_store.keys())
    if town or store_name:
        relevant_ids &= store_ids
    elif not relevant_ids:
        relevant_ids = set(store_ids)

    store_by_id = {s.id: s for s in stores}
    missing = [i for i in relevant_ids if i not in store_by_id]
    if missing:
        for s in Store.objects.filter(pk__in=missing):
            store_by_id[s.id] = s

    store_rows: list[dict] = []
    for sid in sorted(
        relevant_ids,
        key=lambda i: (
            (store_by_id[i].city or '') if i in store_by_id else '',
            (store_by_id[i].name or '') if i in store_by_id else '',
        ),
    ):
        store_obj = store_by_id.get(sid)
        if not store_obj:
            continue
        kg_assigned = round(target_by_store.get(sid, 0.0), 2)
        kg_achieved = round(sales_by_store.get(sid, 0.0), 2)
        store_rows.append(
            {
                'City': store_obj.city or '',
                'Town': '',
                'Store': store_obj.name or '',
                'Unit Target Assigned': None,
                'Unit Target Achieved': None,
                '% Achievement in Units': None,
                'KG Targets Assigned': kg_assigned,
                'KG Target Achieved': kg_achieved,
                '% Achievement in KG': _kg_achievement_pct(kg_assigned, kg_achieved),
            }
        )

    # SKU Wise = category-wise (matches how Kashmir targets are stored)
    cat_keys = set(target_by_store_cat.keys()) | set(sales_by_store_cat.keys())
    if town or store_name:
        cat_keys = {(sid, cat) for sid, cat in cat_keys if sid in store_ids}

    cat_order = {name: i for i, name in enumerate(CATEGORY_NAMES)}

    sku_rows: list[dict] = []
    for sid, cat in sorted(
        cat_keys,
        key=lambda pair: (
            (store_by_id[pair[0]].city or '') if pair[0] in store_by_id else '',
            (store_by_id[pair[0]].name or '') if pair[0] in store_by_id else '',
            cat_order.get(pair[1], 99),
            pair[1],
        ),
    ):
        store_obj = store_by_id.get(sid)
        if not store_obj:
            continue
        kg_assigned = round(target_by_store_cat.get((sid, cat), 0.0), 2)
        kg_achieved = round(sales_by_store_cat.get((sid, cat), 0.0), 2)
        sku_rows.append(
            {
                'City': store_obj.city or '',
                'Town': '',
                'Store': store_obj.name or '',
                'SKU Name': cat,
                'Unit Target Assigned': None,
                'Unit Target Achieved': None,
                '% Achievement in Units': None,
                'KG Targets Assigned': kg_assigned,
                'KG Target Achieved': kg_achieved,
                '% Achievement in KG': _kg_achievement_pct(kg_assigned, kg_achieved),
            }
        )

    return {
        'range': {'from': date_from.isoformat(), 'to': date_to.isoformat()},
        'periodLabel': period_label,
        'storePerformance': store_rows,
        'skuWise': sku_rows,
    }
