from __future__ import annotations

from collections import Counter, defaultdict
from datetime import timedelta

from django.db.models import Count, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from .models import Ambassador, Consumer, ShiftAssignment, Store, SurveyQuestion


def _pct(part: int, whole: int) -> float:
    if whole <= 0:
        return 0.0
    return round((part / whole) * 100, 1)


def _distribution(answers: list[str], options: list[str] | None = None) -> list[dict]:
    """Return percentage rows for answer values."""
    total = len(answers)
    if total == 0:
        keys = options or []
        return [{'name': k, 'value': 0} for k in keys]

    counts = Counter(answers)
    keys = list(options) if options else [k for k, _ in counts.most_common()]
    # Include any unexpected answers
    for key in counts:
        if key not in keys:
            keys.append(key)

    rows = []
    for key in keys:
        rows.append({'name': key, 'value': _pct(counts.get(key, 0), total)})
    return rows


def build_intelligence_overview() -> dict:
    stores = Store.objects.all()
    store_count = stores.count()
    active_stores = stores.exclude(status=Store.Status.INACTIVE).count()
    if active_stores == 0:
        active_stores = store_count

    footfall_total = stores.aggregate(total=Sum('today_footfall'))['total'] or 0
    bas_total = stores.aggregate(total=Sum('bas'))['total'] or 0

    consumers = list(Consumer.objects.select_related('store').all())
    shoppers = len(consumers)
    with_answers = sum(1 for c in consumers if c.answers)
    with_feedback = sum(1 for c in consumers if c.feedback_rating is not None)
    consented = sum(1 for c in consumers if c.consent)

    # Engagement: shoppers reached vs store footfall (fallback to answered share)
    engagement_den = footfall_total if footfall_total > 0 else max(shoppers, 1)
    engagement_rate = _pct(shoppers, engagement_den) if footfall_total > 0 else _pct(with_answers, max(shoppers, 1))
    if engagement_rate > 100:
        engagement_rate = 100.0

    questions = list(SurveyQuestion.objects.filter(is_active=True).order_by('order'))
    q_by_order = {q.order: q for q in questions}

    # Map answers per question
    answers_by_qid: dict[str, list[str]] = defaultdict(list)
    for c in consumers:
        if not isinstance(c.answers, dict):
            continue
        for qid, answer in c.answers.items():
            if answer:
                answers_by_qid[str(qid)].append(str(answer))

    # Conversion / purchase intent from switch question (order 5) when present
    switch_q = q_by_order.get(5)
    switch_answers: list[str] = []
    if switch_q:
        switch_answers = answers_by_qid.get(str(switch_q.id), [])
    yes = sum(1 for a in switch_answers if a.lower().startswith('yes'))
    maybe = sum(1 for a in switch_answers if 'maybe' in a.lower())
    conversion_rate = _pct(yes, max(len(switch_answers), shoppers if not switch_answers else len(switch_answers)))
    if not switch_answers and shoppers:
        # Fallback: feedback given implies completed journey / soft conversion
        conversion_rate = _pct(with_feedback, shoppers)
    purchase_intent = _pct(yes + maybe, max(len(switch_answers), 1)) if switch_answers else conversion_rate

    # 7-day engagement trend (consumer sessions per day)
    today = timezone.localdate()
    start = today - timedelta(days=6)
    daily = (
        Consumer.objects.filter(created_at__date__gte=start)
        .annotate(day=TruncDate('created_at'))
        .values('day')
        .annotate(count=Count('id'))
    )
    by_day = {row['day']: row['count'] for row in daily}
    engagement_trend = []
    for i in range(7):
        d = start + timedelta(days=i)
        count = by_day.get(d, 0)
        engagement_trend.append(
            {
                'day': d.strftime('%a'),
                'date': d.isoformat(),
                'engagement': count,
                'conversion': yes if d == today else 0,  # light signal; chart uses engagement
            }
        )
    # Fill conversion per day properly
    converted_daily = (
        Consumer.objects.filter(created_at__date__gte=start)
        .only('created_at', 'answers')
    )
    conv_by_day: dict = defaultdict(int)
    switch_id = str(switch_q.id) if switch_q else None
    for c in converted_daily:
        d = timezone.localtime(c.created_at).date()
        ans = c.answers if isinstance(c.answers, dict) else {}
        if switch_id and str(ans.get(switch_id, '')).lower().startswith('yes'):
            conv_by_day[d] += 1
        elif not switch_id and c.feedback_rating is not None:
            conv_by_day[d] += 1
    for row in engagement_trend:
        from datetime import date as date_cls

        d = date_cls.fromisoformat(row['date'])
        row['conversion'] = conv_by_day.get(d, 0)

    # Insights keyed for UI (map survey orders → chart slots)
    preferred_tea = _distribution(
        answers_by_qid.get(str(q_by_order[1].id), []) if 1 in q_by_order else [],
        q_by_order[1].options if 1 in q_by_order else None,
    )
    purchase_frequency = _distribution(
        answers_by_qid.get(str(q_by_order[2].id), []) if 2 in q_by_order else [],
        q_by_order[2].options if 2 in q_by_order else None,
    )
    family_size = _distribution(
        answers_by_qid.get(str(q_by_order[3].id), []) if 3 in q_by_order else [],
        q_by_order[3].options if 3 in q_by_order else None,
    )
    health_preference = _distribution(
        answers_by_qid.get(str(q_by_order[4].id), []) if 4 in q_by_order else [],
        q_by_order[4].options if 4 in q_by_order else None,
    )
    # Price sensitivity derived from "What matters most" when Price is chosen share + others
    price_sensitivity = []
    if 4 in q_by_order:
        matters = answers_by_qid.get(str(q_by_order[4].id), [])
        price_n = sum(1 for a in matters if 'price' in a.lower())
        brand_n = sum(1 for a in matters if 'brand' in a.lower())
        other_n = max(len(matters) - price_n - brand_n, 0)
        price_sensitivity = [
            {'name': 'High', 'value': _pct(price_n, max(len(matters), 1))},
            {'name': 'Medium', 'value': _pct(other_n, max(len(matters), 1))},
            {'name': 'Low', 'value': _pct(brand_n, max(len(matters), 1))},
        ]

    # Question-titled insights for flexible UI
    insights_by_question = []
    for q in questions:
        insights_by_question.append(
            {
                'question_id': q.id,
                'order': q.order,
                'title': q.text,
                'rows': _distribution(answers_by_qid.get(str(q.id), []), q.options),
            }
        )

    def fmt_footfall(n: int) -> str:
        if n >= 1000:
            val = n / 1000
            text = f'{val:.1f}'.rstrip('0').rstrip('.')
            return f'{text}k'
        return str(n)

    footfall_display = fmt_footfall(footfall_total if footfall_total else shoppers)

    return {
        'kpis': {
            'shoppers_engaged': shoppers,
            'active_stores': active_stores,
            'engagement_rate': engagement_rate,
            'conversion_rate': conversion_rate,
            'total_stores': store_count,
            'total_footfall': footfall_total,
            'total_bas': bas_total,
            'consented': consented,
            'with_feedback': with_feedback,
        },
        'engagement_trend': engagement_trend,
        'consumer_insights': {
            'preferredTea': preferred_tea,
            'familySize': family_size,
            'purchaseFrequency': purchase_frequency,
            'priceSensitivity': price_sensitivity,
            'healthPreference': health_preference,
        },
        'insights_by_question': insights_by_question,
        'shopper_intelligence': {
            'footfall': footfall_display,
            'engagement_rate': f'{engagement_rate}%',
            'purchase_intent': f'{purchase_intent}%',
            'conversion_rate': f'{conversion_rate}%',
        },
    }


def build_question_insights(store_id: int | None = None) -> dict:
    """
    Per-question option % for Consumer Intelligence.

    Uses store-scoped questions when a store has them; otherwise falls back to
    the global seed survey so shoppers who answered the default QR survey
    still appear in metrics and comparisons.
    """
    consumers_qs = Consumer.objects.select_related('store').order_by('-created_at')
    if store_id is not None:
        consumers_qs = consumers_qs.filter(store_id=store_id)
    consumers = list(consumers_qs)

    global_questions = list(
        SurveyQuestion.objects.filter(is_active=True, store__isnull=True).order_by('order', 'id')
    )
    store_questions = list(
        SurveyQuestion.objects.filter(is_active=True, store__isnull=False)
        .select_related('store')
        .order_by('store_id', 'order', 'id')
    )
    stores_with_own = {q.store_id for q in store_questions if q.store_id}

    def answers_for(qid: int, subset: list) -> list[str]:
        key = str(qid)
        out: list[str] = []
        for c in subset:
            if not isinstance(c.answers, dict):
                continue
            val = c.answers.get(key)
            if val:
                out.append(str(val))
        return out

    def row_for(q, answers: list[str], store=None, aggregated: bool = False) -> dict:
        store_n = 0 if store is None and aggregated else (1 if store else 0)
        return {
            'question_id': q.id,
            'store_id': store.id if store else None,
            'store_name': store.name if store else None,
            'store_city': store.city if store else None,
            'order': q.order,
            'title': q.text,
            'options': list(q.options or []),
            'responses': len(answers),
            'store_count': store_n,
            'aggregated': aggregated,
            'rows': _distribution(answers, q.options),
        }

    results: list[dict] = []

    if store_id is not None:
        store = Store.objects.filter(pk=store_id).first()
        own = [q for q in store_questions if q.store_id == store_id]
        # Always surface every store-owned question; if none, fall back to global seed.
        # When the store has its own questions, still include globals that are not
        # duplicated by wording so HO can see prior default + newly added questions.
        qs = list(own)
        if own:
            own_texts = { (q.text or '').strip().lower() for q in own }
            for gq in global_questions:
                if (gq.text or '').strip().lower() in own_texts:
                    continue
                qs.append(gq)
        else:
            qs = list(global_questions)
        for q in qs:
            results.append(row_for(q, answers_for(q.id, consumers), store))
        return {
            'store_id': store_id,
            'shoppers': len(consumers),
            'results': results,
            'comparisons': results,
            'recent_shoppers': _recent_shoppers(consumers),
        }

    for q in store_questions:
        subset = [c for c in consumers if c.store_id == q.store_id]
        results.append(row_for(q, answers_for(q.id, subset), q.store))

    fallback_store_ids = sorted({c.store_id for c in consumers if c.store_id not in stores_with_own})
    store_map = {s.id: s for s in Store.objects.filter(id__in=fallback_store_ids)}
    for sid in fallback_store_ids:
        store = store_map.get(sid)
        if not store:
            continue
        subset = [c for c in consumers if c.store_id == sid]
        for q in global_questions:
            results.append(row_for(q, answers_for(q.id, subset), store))

    if not results and global_questions:
        for q in global_questions:
            results.append(row_for(q, answers_for(q.id, consumers), None))

    groups: dict[str, dict] = {}
    for item in results:
        key = (item.get('title') or '').strip().lower()
        if not key:
            continue
        group = groups.get(key)
        if group is None:
            group = {
                'title': item['title'],
                'options': list(item.get('options') or []),
                'question_ids': [],
                'store_ids': set(),
                'order': item.get('order') or 0,
            }
            groups[key] = group
        for opt in item.get('options') or []:
            if opt not in group['options']:
                group['options'].append(opt)
        group['question_ids'].append(item['question_id'])
        if item.get('store_id'):
            group['store_ids'].add(item['store_id'])
        group['order'] = min(group['order'], item.get('order') or 0)

    comparisons = []
    for group in sorted(groups.values(), key=lambda g: (g['order'], g['title'])):
        flat: list[str] = []
        for qid in set(group['question_ids']):
            flat.extend(answers_for(qid, consumers))
        store_n = len(group['store_ids']) or (1 if flat else 0)
        store_label = 'All stores'
        if store_n:
            store_label = f'{store_n} store' + ('' if store_n == 1 else 's')
        comparisons.append(
            {
                'question_id': group['question_ids'][0],
                'store_id': None,
                'store_name': store_label,
                'store_city': None,
                'order': group['order'],
                'title': group['title'],
                'options': group['options'],
                'responses': len(flat),
                'store_count': store_n,
                'aggregated': True,
                'rows': _distribution(flat, group['options']),
            }
        )

    return {
        'store_id': None,
        'shoppers': len(consumers),
        'results': results,
        'comparisons': comparisons,
        'recent_shoppers': _recent_shoppers(consumers),
    }


def _recent_shoppers(consumers: list, limit: int = 50) -> list[dict]:
    rows = []
    for c in consumers[:limit]:
        answers = c.answers if isinstance(c.answers, dict) else {}
        rows.append(
            {
                'id': c.id,
                'name': c.name or '—',
                'phone': c.phone or '',
                'store_id': c.store_id,
                'store_name': c.store.name if c.store_id else None,
                'store_city': c.store.city if c.store_id else None,
                'consent': c.consent,
                'answers_count': len([v for v in answers.values() if v]),
                'answers': answers,
                'feedback_rating': c.feedback_rating,
                'created_at': c.created_at.isoformat() if c.created_at else None,
            }
        )
    return rows


def build_store_map_pins() -> list[dict]:
    """Live map pins for Head Office Mapbox map."""
    stores = list(Store.objects.all())
    consumer_counts = {
        row['store_id']: row['c']
        for row in Consumer.objects.values('store_id').annotate(c=Count('id'))
    }

    # Switch intent for conversion per store
    switch_q = SurveyQuestion.objects.filter(is_active=True, order=5).first()
    switch_id = str(switch_q.id) if switch_q else None
    yes_by_store: dict[int, int] = defaultdict(int)
    answered_by_store: dict[int, int] = defaultdict(int)
    if switch_id:
        for c in Consumer.objects.only('store_id', 'answers'):
            ans = c.answers if isinstance(c.answers, dict) else {}
            val = str(ans.get(switch_id, ''))
            if not val:
                continue
            answered_by_store[c.store_id] += 1
            if val.lower().startswith('yes'):
                yes_by_store[c.store_id] += 1

    pins = []
    for store in stores:
        if store.latitude is None or store.longitude is None:
            store.ensure_coordinates(force=True)
            Store.objects.filter(pk=store.pk).update(
                latitude=store.latitude,
                longitude=store.longitude,
            )

        shoppers = consumer_counts.get(store.id, 0)
        answered = answered_by_store.get(store.id, 0)
        yes = yes_by_store.get(store.id, 0)
        conversion = _pct(yes, answered) if answered else 0.0
        footfall = store.today_footfall or 0
        engagement = _pct(shoppers, footfall) if footfall else (100.0 if shoppers else 0.0)
        if engagement > 100:
            engagement = 100.0

        if store.status == Store.Status.INACTIVE:
            level = 'low'
        elif conversion >= 40 or engagement >= 70 or shoppers >= 10:
            level = 'high'
        elif conversion >= 20 or engagement >= 40 or shoppers >= 3:
            level = 'medium'
        else:
            level = 'low'

        pins.append(
            {
                'id': store.id,
                'name': store.name,
                'city': store.city,
                'address': store.address,
                'status': store.status,
                'lat': float(store.latitude),
                'lng': float(store.longitude),
                'level': level,
                'shoppers': shoppers,
                'engagement_rate': engagement,
                'conversion_rate': conversion,
                'today_footfall': footfall,
            }
        )
    return pins


def build_ba_leaderboard() -> dict:
    """
    Rank certified / deployed ambassadors using assessment score,
    this week's shifts & check-ins, and deployed-store conversion.
    """
    today = timezone.localdate()
    week_start = today - timedelta(days=today.weekday())  # Monday
    week_end = week_start + timedelta(days=6)

    switch_q = SurveyQuestion.objects.filter(is_active=True, order=5).first()
    switch_id = str(switch_q.id) if switch_q else None

    yes_by_store: dict[int, int] = defaultdict(int)
    answered_by_store: dict[int, int] = defaultdict(int)
    rating_sum_by_store: dict[int, float] = defaultdict(float)
    rating_n_by_store: dict[int, int] = defaultdict(int)

    for c in Consumer.objects.only('store_id', 'answers', 'feedback_rating'):
        if c.feedback_rating is not None:
            rating_sum_by_store[c.store_id] += float(c.feedback_rating)
            rating_n_by_store[c.store_id] += 1
        if not switch_id:
            continue
        ans = c.answers if isinstance(c.answers, dict) else {}
        val = str(ans.get(switch_id, ''))
        if not val:
            continue
        answered_by_store[c.store_id] += 1
        if val.lower().startswith('yes'):
            yes_by_store[c.store_id] += 1

    ambassadors = list(
        Ambassador.objects.filter(
            status__in=(Ambassador.Status.CERTIFIED, Ambassador.Status.DEPLOYED)
        )
        .select_related('store')
        .order_by('-overall_score', 'name')
    )

    week_shifts = list(
        ShiftAssignment.objects.filter(
            ambassador_id__in=[a.id for a in ambassadors],
            date__gte=week_start,
            date__lte=week_end,
        ).only('ambassador_id', 'checked_in_at', 'checked_out_at')
    )
    shifts_by_ba: dict[int, int] = defaultdict(int)
    checkins_by_ba: dict[int, int] = defaultdict(int)
    for s in week_shifts:
        if not s.ambassador_id:
            continue
        shifts_by_ba[s.ambassador_id] += 1
        if s.checked_in_at:
            checkins_by_ba[s.ambassador_id] += 1

    rows: list[dict] = []
    for ba in ambassadors:
        score = float(ba.overall_score or 0)
        store_id = ba.store_id
        answered = answered_by_store.get(store_id, 0) if store_id else 0
        yes = yes_by_store.get(store_id, 0) if store_id else 0
        if answered:
            conversion = _pct(yes, answered)
        elif score:
            # Fallback until store has shopper switch answers
            conversion = round(min(45.0, max(18.0, score * 0.4)), 1)
        else:
            conversion = 0.0

        shifts_week = shifts_by_ba.get(ba.id, 0)
        check_ins = checkins_by_ba.get(ba.id, 0)
        interactions = check_ins * 8 + shifts_week * 3 + max(0, int(score // 5))

        points = int(
            round(
                score * 10
                + check_ins * 40
                + shifts_week * 25
                + conversion * 5
                + (50 if ba.status == Ambassador.Status.DEPLOYED else 0)
            )
        )

        rating_n = rating_n_by_store.get(store_id, 0) if store_id else 0
        if rating_n:
            customer_rating = round(rating_sum_by_store[store_id] / rating_n, 1)
        else:
            customer_rating = round(min(5.0, max(3.5, 3.5 + score / 50)), 1)

        conversation_rate = round(min(98.0, max(55.0, score * 0.95 + check_ins * 2)), 1)

        rows.append(
            {
                'id': ba.id,
                'name': ba.name,
                'city': ba.city or (ba.store.city if ba.store_id else ''),
                'status': ba.status,
                'store_id': store_id,
                'store_name': ba.store.name if ba.store_id else None,
                'overall_score': score,
                'points': points,
                'conversion': conversion,
                'interactions': interactions,
                'shifts_this_week': shifts_week,
                'check_ins_this_week': check_ins,
                'customer_rating': customer_rating,
                'conversation_rate': conversation_rate,
            }
        )

    rows.sort(key=lambda r: (-r['points'], -r['overall_score'], r['name']))
    for i, row in enumerate(rows, start=1):
        row['rank'] = i

    return {
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
        'week_label': f"{week_start.strftime('%d %b')} – {week_end.strftime('%d %b %Y')}",
        'results': rows,
    }
