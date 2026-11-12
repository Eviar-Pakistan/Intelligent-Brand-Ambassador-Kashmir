"""
Weekly AI Optimization — facts pack → GPT → persist one run per completed week.
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import date, timedelta

import httpx
from django.conf import settings
from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .mis_audit import require_ho_or_mis
from .models import (
    AiOptimizationRun,
    Ambassador,
    BaAttendanceDay,
    BaDailyReport,
    BaTarget,
    Consumer,
    ShiftAssignment,
    Store,
    SupervisorStoreVisit,
    UserInterception,
)
from .sales_report import category_sales_from_json

logger = logging.getLogger(__name__)

ALREADY_RUN_MESSAGE = 'Already run for this week. You can run again next Monday.'


def last_completed_week(today: date | None = None) -> tuple[date, date]:
    """Return Mon–Sun of the last fully completed week (Asia/Karachi local date)."""
    today = today or timezone.localdate()
    this_monday = today - timedelta(days=today.weekday())
    week_end = this_monday - timedelta(days=1)  # Sunday
    week_start = week_end - timedelta(days=6)  # Monday
    return week_start, week_end


def _num(val) -> float:
    try:
        if val is None or val == '':
            return 0.0
        return float(val)
    except (TypeError, ValueError):
        return 0.0


def _pct(part: float, whole: float) -> float:
    if whole <= 0:
        return 0.0
    return round((part / whole) * 100, 1)


def build_facts_pack(week_start: date, week_end: date) -> dict:
    """Compact numeric facts for GPT — no prose, week-scoped only."""
    stores = list(
        Store.objects.exclude(status=Store.Status.INACTIVE).only('id', 'name', 'city')
    )
    store_by_id = {s.id: s for s in stores}
    month = week_end.strftime('%Y-%m')
    month_start = week_end.replace(day=1)

    # Attendance (week)
    attendance = list(
        BaAttendanceDay.objects.filter(date__gte=week_start, date__lte=week_end).only(
            'store_id', 'ambassador_id', 'checked_in_at', 'checked_out_at'
        )
    )
    shifts = list(
        ShiftAssignment.objects.filter(date__gte=week_start, date__lte=week_end).only(
            'store_id', 'checked_in_at', 'checked_out_at'
        )
    )
    present_days = sum(1 for a in attendance if a.checked_in_at)
    missing_checkout = sum(1 for a in attendance if a.checked_in_at and not a.checked_out_at)
    scheduled = len(shifts) or len(attendance)
    attendance_rate = _pct(present_days, scheduled)

    scheduled_by_store: dict[int, int] = defaultdict(int)
    present_by_store: dict[int, int] = defaultdict(int)
    missing_co_by_store: dict[int, int] = defaultdict(int)
    for s in shifts:
        if s.store_id:
            scheduled_by_store[s.store_id] += 1
    use_attendance_as_schedule = not scheduled_by_store
    for a in attendance:
        sid = a.store_id
        if not sid:
            continue
        if use_attendance_as_schedule:
            scheduled_by_store[sid] += 1
        if a.checked_in_at:
            present_by_store[sid] += 1
            if not a.checked_out_at:
                missing_co_by_store[sid] += 1

    # Daily sales / interceptions from field reports (week)
    reports = list(
        BaDailyReport.objects.filter(date__gte=week_start, date__lte=week_end).select_related(
            'ambassador'
        )
    )
    sales_by_store: dict[int, float] = defaultdict(float)
    intercept_by_store: dict[int, float] = defaultdict(float)
    productive_by_store: dict[int, float] = defaultdict(float)
    category_by_store: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    category_totals: dict[str, float] = defaultdict(float)
    total_sales = 0.0
    total_intercepts = 0.0
    total_productive = 0.0

    for r in reports:
        sales = r.sales_json if isinstance(r.sales_json, dict) else {}
        sid = r.store_id or (r.ambassador.store_id if r.ambassador_id else None)
        if not sid:
            continue
        cats = category_sales_from_json(sales)
        row_sales = sum(cats.values()) or _num(sales.get('totalSalesLtrKg'))
        intercepted = _num(sales.get('totalInterceptions'))
        productive = _num(sales.get('productiveCalls'))
        sales_by_store[sid] += row_sales
        intercept_by_store[sid] += intercepted
        productive_by_store[sid] += productive
        total_sales += row_sales
        total_intercepts += intercepted
        total_productive += productive
        for k, v in cats.items():
            if v > 0:
                category_by_store[sid][k] += v
                category_totals[k] += v

    # Month MTD sales + targets → store achievement %
    month_sales_by_store: dict[int, float] = defaultdict(float)
    for r in BaDailyReport.objects.filter(date__gte=month_start, date__lte=week_end).select_related(
        'ambassador'
    ):
        sales = r.sales_json if isinstance(r.sales_json, dict) else {}
        sid = r.store_id or (r.ambassador.store_id if r.ambassador_id else None)
        if not sid:
            continue
        cats = category_sales_from_json(sales)
        month_sales_by_store[sid] += sum(cats.values()) or _num(sales.get('totalSalesLtrKg'))

    ba_store = {
        ba.id: ba.store_id
        for ba in Ambassador.objects.exclude(store_id__isnull=True).only('id', 'store_id')
    }
    target_by_store: dict[int, float] = defaultdict(float)
    for row in (
        BaTarget.objects.filter(month=month, target_kg__gt=0)
        .values('ambassador_id')
        .annotate(t=Sum('target_kg'))
    ):
        sid = ba_store.get(row['ambassador_id'])
        if sid:
            target_by_store[sid] += float(row['t'] or 0)

    # UserInterception status mix (week)
    ui_qs = UserInterception.objects.filter(
        created_at__date__gte=week_start,
        created_at__date__lte=week_end,
    )
    ui_by_status = {
        row['status']: row['c']
        for row in ui_qs.values('status').annotate(c=Count('id'))
    }
    ui_total = sum(ui_by_status.values())
    ui_by_store_status: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for row in ui_qs.values('store_id', 'status').annotate(c=Count('id')):
        if row['store_id']:
            ui_by_store_status[row['store_id']][row['status']] += row['c']

    # Shopper consumers
    consumers = Consumer.objects.filter(
        created_at__date__gte=week_start,
        created_at__date__lte=week_end,
    )
    consumer_count = consumers.count()

    # Supervisor visits
    visits_by_store: dict[int, int] = defaultdict(int)
    for row in (
        SupervisorStoreVisit.objects.filter(
            checked_in_at__date__gte=week_start,
            checked_in_at__date__lte=week_end,
        )
        .values('store_id')
        .annotate(c=Count('id'))
    ):
        if row['store_id']:
            visits_by_store[row['store_id']] = row['c']
    visit_count = sum(visits_by_store.values())

    store_ids = set(sales_by_store) | set(scheduled_by_store) | set(present_by_store) | set(visits_by_store)
    store_rows = []
    for sid in store_ids:
        store = store_by_id.get(sid)
        if not store:
            continue
        sales = sales_by_store.get(sid, 0.0)
        intercepts = intercept_by_store.get(sid, 0.0)
        productive = productive_by_store.get(sid, 0.0)
        sched = scheduled_by_store.get(sid, 0)
        present = present_by_store.get(sid, 0)
        missing_co = missing_co_by_store.get(sid, 0)
        target = target_by_store.get(sid, 0.0)
        mtd_sales = month_sales_by_store.get(sid, 0.0)
        cats = category_by_store.get(sid) or {}
        top_category = max(cats.items(), key=lambda kv: kv[1])[0] if cats else ''
        top_category_share = _pct(cats.get(top_category, 0.0), sum(cats.values())) if cats else 0.0
        ui_status = ui_by_store_status.get(sid) or {}
        store_rows.append(
            {
                'store_id': sid,
                'store': f'{store.name} — {store.city}' if store.city else store.name,
                'sales': round(sales, 1),
                'interceptions': round(intercepts, 1),
                'productive_calls': round(productive, 1),
                'productive_pct': _pct(productive, intercepts),
                'attendance_pct': _pct(present, sched),
                'missing_checkouts': missing_co,
                'achievement_pct': _pct(mtd_sales, target) if target > 0 else 0.0,
                'month_target': round(target, 1),
                'month_sales_mtd': round(mtd_sales, 1),
                'supervisor_visits': visits_by_store.get(sid, 0),
                'top_category': top_category,
                'top_category_share_pct': top_category_share,
                'trialist': int(ui_status.get(UserInterception.Status.TRIALIST, 0)),
                'non_productive': int(ui_status.get(UserInterception.Status.NON_PRODUCTIVE, 0)),
                'productive_ui': int(ui_status.get(UserInterception.Status.PRODUCTIVE, 0)),
            }
        )
    store_rows.sort(key=lambda r: -r['sales'])
    top_stores = store_rows[:8]
    bottom_stores = list(reversed(store_rows[-5:])) if len(store_rows) > 5 else list(reversed(store_rows))

    low_productive = [
        r for r in store_rows if r['interceptions'] >= 5 and r['productive_pct'] < 25
    ][:5]
    low_achievement = [
        r for r in store_rows if r['month_target'] > 0 and r['achievement_pct'] < 50 and r['sales'] > 0
    ][:5]
    attendance_risk = [
        r for r in store_rows if r['attendance_pct'] < 70 or r['missing_checkouts'] >= 2
    ][:5]

    return {
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
        'target_month': month,
        'summary': {
            'active_stores': len(stores),
            'scheduled_shift_days': scheduled,
            'present_days': present_days,
            'attendance_rate_pct': attendance_rate,
            'missing_checkouts': missing_checkout,
            'total_sales_ltr_kg': round(total_sales, 1),
            'total_interceptions': round(total_intercepts, 1),
            'total_productive_calls': round(total_productive, 1),
            'overall_productive_pct': _pct(total_productive, total_intercepts),
            'shopper_sessions': consumer_count,
            'user_interceptions_total': ui_total,
            'user_interceptions_by_status': ui_by_status,
            'supervisor_visits': visit_count,
            'category_sales': {k: round(v, 1) for k, v in category_totals.items() if v > 0},
        },
        'top_stores_by_sales': top_stores,
        'bottom_stores_by_sales': bottom_stores,
        'low_productive_stores': low_productive,
        'low_achievement_stores': low_achievement,
        'attendance_risk_stores': attendance_risk,
    }


def _round_metric(val, as_int: bool = False):
    try:
        n = float(val)
    except (TypeError, ValueError):
        return 0 if as_int else 0.0
    if as_int:
        return int(round(n))
    return round(n, 1)


def _normalize_recommendations(raw: list) -> list[dict]:
    out = []
    for i, item in enumerate(raw[:12]):
        if not isinstance(item, dict):
            continue
        pattern = str(item.get('pattern') or '').strip()
        action = str(item.get('action') or item.get('recommendation') or '').strip()
        if not pattern or not action:
            continue
        store = str(item.get('store') or 'Campaign-wide').strip()
        store_id = item.get('store_id')
        try:
            store_id = int(store_id) if store_id is not None and str(store_id).strip() != '' else None
        except (TypeError, ValueError):
            store_id = None
        severity = str(item.get('severity') or 'medium').lower().strip()
        if severity not in ('high', 'medium', 'low'):
            severity = 'medium'
        note = str(item.get('note') or item.get('context') or '').strip()[:240]
        out.append(
            {
                'id': i + 1,
                'pattern': pattern[:200],
                'store': store[:200],
                'store_id': store_id,
                'sales': _round_metric(item.get('sales')),
                'interceptions': _round_metric(item.get('interceptions'), as_int=True),
                'productive_calls': _round_metric(item.get('productive_calls'), as_int=True),
                'achievement_pct': max(0, min(999, _round_metric(item.get('achievement_pct')))),
                'attendance_pct': max(0, min(100, _round_metric(item.get('attendance_pct')))),
                'missing_checkouts': max(0, _round_metric(item.get('missing_checkouts'), as_int=True)),
                'supervisor_visits': max(0, _round_metric(item.get('supervisor_visits'), as_int=True)),
                'top_category': str(item.get('top_category') or '')[:80],
                'trialist': max(0, _round_metric(item.get('trialist'), as_int=True)),
                'non_productive': max(0, _round_metric(item.get('non_productive'), as_int=True)),
                'note': note,
                'action': action[:500],
                'severity': severity,
            }
        )
    return out


def _legacy_to_new_recommendation(item: dict, index: int) -> dict:
    """Map older engagement/conversion cards to the new metric shape for display."""
    if 'sales' in item or 'interceptions' in item or 'achievement_pct' in item:
        normalized = _normalize_recommendations([item])
        if normalized:
            normalized[0]['id'] = index
            return normalized[0]
    note_parts = []
    if item.get('engagement') is not None:
        note_parts.append(f"Legacy engagement {item.get('engagement')}%")
    if item.get('conversion') is not None:
        note_parts.append(f"Legacy conversion {item.get('conversion')}%")
    return {
        'id': index,
        'pattern': str(item.get('pattern') or '')[:200],
        'store': str(item.get('store') or 'Campaign-wide')[:200],
        'store_id': item.get('store_id'),
        'sales': 0.0,
        'interceptions': 0,
        'productive_calls': 0,
        'achievement_pct': 0.0,
        'attendance_pct': 0.0,
        'missing_checkouts': 0,
        'supervisor_visits': 0,
        'top_category': '',
        'trialist': 0,
        'non_productive': 0,
        'note': '; '.join(note_parts),
        'action': str(item.get('action') or '')[:500],
        'severity': str(item.get('severity') or 'medium'),
    }


def generate_recommendations_with_gpt(facts: dict) -> tuple[list[dict], str]:
    api_key = (getattr(settings, 'OPENAI_API_KEY', None) or '').strip()
    if not api_key or 'your_openai' in api_key:
        raise RuntimeError('OPENAI_API_KEY not configured. Add it to backend/.env and restart the server.')

    model = getattr(settings, 'OPENAI_MODEL', None) or 'gpt-4o-mini'
    system_prompt = (
        'You are an operations analyst for Kashmir Oil brand ambassadors in Pakistan retail stores. '
        'Given weekly numeric facts only, produce 3–6 actionable recommendations. '
        'Use only the facts provided — do not invent stores or numbers. '
        'Copy sales, interceptions, productive_calls, achievement_pct, attendance_pct, '
        'missing_checkouts, supervisor_visits, top_category, trialist, and non_productive '
        'from the matching store row when possible. '
        'Prefer concrete coaching, staffing, attendance, or SKU-mix actions. '
        'Optional short note may mention attendance, visits, category mix, or trialist vs non-productive. '
        'Respond with JSON only: {"recommendations":[{'
        '"pattern":"...","store":"...","store_id":null,'
        '"sales":0,"interceptions":0,"productive_calls":0,"achievement_pct":0,'
        '"attendance_pct":0,"missing_checkouts":0,"supervisor_visits":0,'
        '"top_category":"","trialist":0,"non_productive":0,'
        '"note":"","action":"...","severity":"high|medium|low"}]}'
    )
    user_prompt = (
        'Analyze this completed week and return recommendations JSON.\n\n'
        f'{json.dumps(facts, ensure_ascii=True)}'
    )

    with httpx.Client(timeout=90.0) as client:
        res = client.post(
            'https://api.openai.com/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            },
            json={
                'model': model,
                'temperature': 0.4,
                'response_format': {'type': 'json_object'},
                'messages': [
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_prompt},
                ],
            },
        )
    if res.status_code >= 400:
        raise RuntimeError(f'OpenAI error {res.status_code}: {res.text[:300]}')

    raw = res.json().get('choices', [{}])[0].get('message', {}).get('content') or '{}'
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f'OpenAI returned invalid JSON: {exc}') from exc

    items = parsed.get('recommendations') if isinstance(parsed, dict) else None
    if not isinstance(items, list):
        raise RuntimeError('OpenAI response missing recommendations list.')

    normalized = _normalize_recommendations(items)
    if not normalized:
        raise RuntimeError('OpenAI returned no usable recommendations.')
    return normalized, model


def serialize_run(run: AiOptimizationRun | None, *, week_start: date, week_end: date) -> dict:
    can_run = run is None
    recommendations = []
    if run and isinstance(run.recommendations, list):
        for i, item in enumerate(run.recommendations):
            if isinstance(item, dict):
                recommendations.append(_legacy_to_new_recommendation(item, i + 1))
    return {
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
        'week_label': f'{week_start.strftime("%b %d")} – {week_end.strftime("%b %d, %Y")}',
        'can_run': can_run,
        'message': None if can_run else ALREADY_RUN_MESSAGE,
        'recommendations': recommendations,
        'created_at': run.created_at.isoformat() if run else None,
        'model_name': run.model_name if run else '',
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ai_optimization_get(request):
    """
    GET /api/ho/ai-optimization/
    Load saved recommendations for the last completed week (no GPT call).
    """
    denied = require_ho_or_mis(request)
    if denied:
        return denied

    week_start, week_end = last_completed_week()
    run = AiOptimizationRun.objects.filter(week_start=week_start).first()
    return Response(serialize_run(run, week_start=week_start, week_end=week_end))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ai_optimization_run(request):
    """
    POST /api/ho/ai-optimization/run/
    Build facts → GPT → save. Rejects if already run for this week.
    """
    denied = require_ho_or_mis(request)
    if denied:
        return denied

    week_start, week_end = last_completed_week()
    existing = AiOptimizationRun.objects.filter(week_start=week_start).first()
    if existing:
        return Response(
            {
                **serialize_run(existing, week_start=week_start, week_end=week_end),
                'detail': ALREADY_RUN_MESSAGE,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    facts = build_facts_pack(week_start, week_end)
    try:
        recommendations, model_name = generate_recommendations_with_gpt(facts)
    except RuntimeError as exc:
        logger.warning('AI optimization failed: %s', exc)
        return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as exc:
        logger.exception('AI optimization unexpected error')
        return Response(
            {'detail': f'AI analysis failed: {exc}'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    run = AiOptimizationRun.objects.create(
        week_start=week_start,
        week_end=week_end,
        recommendations=recommendations,
        facts_snapshot=facts,
        model_name=model_name,
        created_by=request.user if request.user.is_authenticated else None,
    )
    return Response(
        serialize_run(run, week_start=week_start, week_end=week_end),
        status=status.HTTP_201_CREATED,
    )
