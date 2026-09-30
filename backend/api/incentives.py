"""Incentive KPI settings + BA / Supervisor package payout calculations."""

from __future__ import annotations

from datetime import date, timedelta

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .intelligence import build_ba_leaderboard
from .models import BaIncentivePayout, BaTarget, IncentiveKpiSettings, ShiftAssignment


def get_kpi_config() -> dict:
    return IncentiveKpiSettings.get_solo().as_config_dict()


def current_week_bounds(today: date | None = None) -> tuple[date, date]:
    d = today or timezone.localdate()
    week_start = d - timedelta(days=d.weekday())  # Monday
    week_end = week_start + timedelta(days=6)
    return week_start, week_end


def _month_key(d: date) -> str:
    return d.strftime('%Y-%m')


def target_ach_incentive(achievement_pct: float, cfg: dict) -> int:
    """Slab payout for Target Ach from package KPIs."""
    if achievement_pct >= 110:
        return int(cfg.get('baTargetSlab110') or 0)
    if achievement_pct >= 100:
        return int(cfg.get('baTargetSlab100') or 0)
    if achievement_pct >= 90:
        return int(cfg.get('baTargetSlab90') or 0)
    return 0


def ba_month_achievement(ambassador_id: int, month: str | None = None) -> tuple[float, float, float]:
    """
    Return (target_kg, sales_kg, achievement_pct) for a BA in YYYY-MM.

    Target = sum of BaTarget.target_kg set in Head Office Ambassadors.
    Sales  = sum of checkout field-report sales (BaDailyReport.sales_json) for that month.
    """
    from calendar import monthrange

    from .models import BaDailyReport

    month = month or _month_key(timezone.localdate())
    agg = BaTarget.objects.filter(ambassador_id=ambassador_id, month=month).aggregate(
        t=Sum('target_kg'),
    )
    target = float(agg['t'] or 0)

    try:
        year, month_num = int(month[:4]), int(month[5:7])
        date_from = date(year, month_num, 1)
        date_to = date(year, month_num, monthrange(year, month_num)[1])
    except (TypeError, ValueError):
        date_from = timezone.localdate().replace(day=1)
        date_to = timezone.localdate()

    sales = 0.0
    for report in BaDailyReport.objects.filter(
        ambassador_id=ambassador_id,
        date__gte=date_from,
        date__lte=date_to,
    ).only('sales_json'):
        sales += _checkout_sales_total(report.sales_json)

    sales = round(sales, 1)
    pct = (sales / target * 100.0) if target > 0 else 0.0
    return target, sales, pct


def _checkout_sales_total(sales) -> float:
    """Total LTR/KG from a BA checkout daily-sales form payload."""
    if not isinstance(sales, dict):
        return 0.0

    def _f(val) -> float:
        try:
            if val is None or val == '':
                return 0.0
            return float(val)
        except (TypeError, ValueError):
            return 0.0

    oil_keys = (
        'kpgoCan10',
        'kpgoBtl3',
        'kpgoBtl45',
        'kpgoTin5',
        'kpgoPouch1x5',
        'kpgoSup1x5',
        'salesOil',
    )
    ghee_keys = (
        'kbpBkt10',
        'kbpBkt25',
        'kbpBkt5',
        'kbpTin5',
        'kbpPouch1x5',
        'salesGhee',
    )
    waadi_keys = (
        'wbpBkt5',
        'wbpPouch1x5',
        'wbpBkt25',
        'salesWaadi',
    )
    oil = sum(_f(sales.get(k)) for k in oil_keys)
    ghee = sum(_f(sales.get(k)) for k in ghee_keys)
    waadi = sum(_f(sales.get(k)) for k in waadi_keys)
    sku_sum = oil + ghee + waadi
    if sku_sum > 0:
        return sku_sum
    return _f(sales.get('totalSalesLtrKg'))


def ba_days_worked(ambassador_id: int, month_start: date | None = None, today: date | None = None) -> int:
    today = today or timezone.localdate()
    month_start = month_start or today.replace(day=1)
    return (
        ShiftAssignment.objects.filter(
            ambassador_id=ambassador_id,
            date__gte=month_start,
            date__lte=today,
            checked_in_at__isnull=False,
        )
        .values('date')
        .distinct()
        .count()
    )


def calculate_ba_incentive(
    *,
    ba_id: int | str,
    name: str,
    city: str,
    rank: int = 0,
    conversion: float = 0,
    sessions: float = 0,
    achievement_pct: float | None = None,
    days_worked: int | None = None,
    config: dict | None = None,
    status: str = BaIncentivePayout.Status.PENDING,
) -> dict:
    """
    Monthly BA package line items from KPI settings (sheet amounts).
    Target Ach / Discipline / Travelling use the configured package values.
    """
    cfg = config or get_kpi_config()
    today = timezone.localdate()
    month_start = today.replace(day=1)

    if achievement_pct is None:
        _, _, achievement_pct = ba_month_achievement(int(ba_id), _month_key(today))
    if days_worked is None:
        days_worked = ba_days_worked(int(ba_id), month_start, today)

    salary = int(cfg.get('baSalary') or 0)
    # Package amounts from Set KPIs (BA Package/Month sheet)
    target_pay = int(cfg.get('baTargetSlab100') or 0)
    discipline = int(cfg.get('baDiscipline') or 0)
    travel = int(cfg.get('baTravelCap') or 0)
    grooming = int(cfg.get('baGrooming') or 0)
    mobile = int(cfg.get('baMobile') or 0)
    min_days = int(cfg.get('baDisciplineMinDays') or 20)
    per_day = int(cfg.get('baTravelPerDay') or 0)
    cap = int(cfg.get('baTravelCap') or 0)

    allowances = discipline + travel + grooming + mobile
    incentive = target_pay + allowances
    total = salary + incentive

    return {
        'baId': str(ba_id),
        'name': name,
        'city': city or '',
        'rank': rank,
        'conversion': conversion,
        'sessions': int(sessions),
        'achievementPct': round(float(achievement_pct or 0), 1),
        'daysWorked': days_worked,
        'base': salary,
        'salary': salary,
        'targetAchPay': target_pay,
        'disciplinePay': discipline,
        'travelPay': travel,
        'groomingPay': grooming,
        'mobilePay': mobile,
        # legacy keys used by older UI breakdowns
        'conversionPay': target_pay,
        'sessionPay': travel,
        'incentive': incentive,
        'totalPkr': total,
        'status': status,
        'baTargetSlab90': int(cfg.get('baTargetSlab90') or 0),
        'baTargetSlab100': int(cfg.get('baTargetSlab100') or 0),
        'baTargetSlab110': int(cfg.get('baTargetSlab110') or 0),
        'baDisciplineMinDays': min_days,
        'baTravelPerDay': per_day,
        'baTravelCap': cap,
    }


def calculate_supervisor_package(config: dict | None = None) -> dict:
    cfg = config or get_kpi_config()
    salary = int(cfg.get('supSalary') or 0)
    fuel = int(cfg.get('supFuelDa') or 0)
    discipline = int(cfg.get('supDiscipline') or 0)
    mobile = int(cfg.get('supMobile') or 0)
    return {
        'salary': salary,
        'fuelDa': fuel,
        'discipline': discipline,
        'mobile': mobile,
        'incentive': fuel + discipline + mobile,
        'totalPkr': salary + fuel + discipline + mobile,
    }


def build_incentive_roster(config: dict | None = None) -> dict:
    """
    Ranked BA package breakdown using live leaderboard + monthly target achievement
    + attendance days, merged with weekly payout status from BaIncentivePayout.
    """
    cfg = config or get_kpi_config()
    board = build_ba_leaderboard()
    week_start = date.fromisoformat(board['week_start']) if board.get('week_start') else current_week_bounds()[0]
    week_end = date.fromisoformat(board['week_end']) if board.get('week_end') else current_week_bounds()[1]
    today = timezone.localdate()
    month = _month_key(today)

    payouts = {
        p.ambassador_id: p
        for p in BaIncentivePayout.objects.filter(week_start=week_start).only(
            'ambassador_id', 'status', 'total_pkr'
        )
    }

    results = []
    for row in board.get('results') or []:
        payout = payouts.get(row['id'])
        status = payout.status if payout else BaIncentivePayout.Status.PENDING
        _, _, ach = ba_month_achievement(row['id'], month)
        days = ba_days_worked(row['id'])
        results.append(
            calculate_ba_incentive(
                ba_id=row['id'],
                name=row['name'],
                city=row.get('city') or '',
                rank=row.get('rank') or 0,
                conversion=float(row.get('conversion') or 0),
                sessions=float(row.get('interactions') or 0),
                achievement_pct=ach,
                days_worked=days,
                config=cfg,
                status=status,
            )
        )
    return {
        'config': {k: v for k, v in cfg.items() if k != 'updatedAt'},
        'week_label': board.get('week_label'),
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
        'month': month,
        'results': results,
        'pool': sum(r['totalPkr'] for r in results),
    }


def incentive_for_ambassador(ambassador_id: int, config: dict | None = None) -> dict | None:
    roster = build_incentive_roster(config)
    for row in roster['results']:
        if str(row['baId']) == str(ambassador_id):
            return {
                **row,
                'config': roster['config'],
                'week_label': roster['week_label'],
                'week_start': roster['week_start'],
                'week_end': roster['week_end'],
                'month': roster.get('month'),
            }
    return None


def _snapshot_fields(row: dict) -> dict:
    return {
        'base_pkr': int(row.get('base') or row.get('salary') or 0),
        'conversion_pay': int(row.get('targetAchPay') or row.get('conversionPay') or 0),
        'session_pay': int(row.get('travelPay') or row.get('sessionPay') or 0),
        'incentive_pkr': int(row.get('incentive') or 0),
        'total_pkr': int(row.get('totalPkr') or 0),
        'conversion_pct': float(row.get('achievementPct') or row.get('conversion') or 0),
        'sessions': int(row.get('daysWorked') or row.get('sessions') or 0),
        'rank': int(row.get('rank') or 0),
    }


def set_payout_statuses(
    *,
    ba_ids: list[int] | None,
    new_status: str,
    all_pending: bool = False,
    user=None,
) -> dict:
    """Approve / mark-paid for current week. Returns counts."""
    overview = build_incentive_roster()
    week_start = date.fromisoformat(overview['week_start'])
    week_end = date.fromisoformat(overview['week_end'])
    by_id = {int(r['baId']): r for r in overview['results'] if str(r['baId']).isdigit()}

    if all_pending:
        targets = [
            ba_id
            for ba_id, row in by_id.items()
            if row.get('status') == BaIncentivePayout.Status.PENDING
        ]
    else:
        targets = [i for i in (ba_ids or []) if i in by_id]

    updated = 0
    with transaction.atomic():
        for ba_id in targets:
            row = by_id[ba_id]
            current = row.get('status') or BaIncentivePayout.Status.PENDING
            if new_status == BaIncentivePayout.Status.PAID and current != BaIncentivePayout.Status.APPROVED:
                continue
            if new_status == BaIncentivePayout.Status.APPROVED and current not in (
                BaIncentivePayout.Status.PENDING,
                BaIncentivePayout.Status.APPROVED,
            ):
                continue
            BaIncentivePayout.objects.update_or_create(
                ambassador_id=ba_id,
                week_start=week_start,
                defaults={
                    'week_end': week_end,
                    'status': new_status,
                    'updated_by': user,
                    **_snapshot_fields(row),
                },
            )
            updated += 1

    return {'updated': updated, 'status': new_status}
