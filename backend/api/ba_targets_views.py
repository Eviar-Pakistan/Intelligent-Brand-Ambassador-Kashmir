"""Head Office + BA monthly target / sales APIs."""

from __future__ import annotations

import re

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Ambassador, BaTarget
from .serializers import BaTargetSerializer


MONTH_RE = re.compile(r'^\d{4}-(0[1-9]|1[0-2])$')


def _normalize_month(raw: str | None) -> str | None:
    if not raw:
        return None
    text = str(raw).strip()
    if MONTH_RE.match(text):
        return text
    # Try "September" / "September 2026" → current or parsed year
    from datetime import datetime

    for fmt in ('%B %Y', '%b %Y', '%B', '%b'):
        try:
            d = datetime.strptime(text, fmt)
            year = d.year if '%Y' in fmt else datetime.now().year
            return f'{year}-{d.month:02d}'
        except ValueError:
            continue
    return None


def _normalize_sku(raw) -> str:
    return str(raw or '').strip()


def _normalize_assigned_skus(raw) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        parts = [p.strip() for p in raw.split(',') if p.strip()]
        return parts
    if isinstance(raw, (list, tuple)):
        out = []
        for item in raw:
            s = str(item or '').strip()
            if s and s not in out:
                out.append(s)
        return out
    return []


CATEGORY_NAMES = (
    'Kashmir Cooking Oil',
    'Kashmir Banaspati',
    'Waadi Banaspati',
)

CATEGORY_SKU_KEYS = {
    'Kashmir Cooking Oil': (
        'kpgoCan10',
        'kpgoBtl3',
        'kpgoBtl45',
        'kpgoTin5',
        'kpgoPouch1x5',
        'kpgoSup1x5',
        'salesOil',
    ),
    'Kashmir Banaspati': (
        'kbpBkt10',
        'kbpBkt25',
        'kbpBkt5',
        'kbpTin5',
        'kbpPouch1x5',
        'salesGhee',
    ),
    'Waadi Banaspati': (
        'wbpBkt5',
        'wbpPouch1x5',
        'wbpBkt25',
        'salesWaadi',
    ),
}

# Catalog pack labels per category (for default assigned SKUs when HO sets category target).
CATEGORY_PACK_LABELS = {
    'Kashmir Cooking Oil': [
        'KPGO 10 LTR CAN Cons. RED',
        'KPGO 3.0 LTR BOTTLE (3LTR X 6) Cons. RED',
        'KPGO 4.5 LTR BOTTLE (4.5LTRX 4) Cons. RED',
        'KPGO 5 LTR TIN Cons. RED',
        'KPGO POUCH (1LTR x 5) Cons. RED',
        'KPGO Stand Up Pouch (1LTR x 5)',
    ],
    'Kashmir Banaspati': [
        'KBP GOLD 10 KG BKT',
        'KBP GOLD 2.5 KG BKT',
        'KBP GOLD 5 KG BKT',
        'KBP GOLD 5 KG TIN',
        'KBP GOLD POUCH (1KG X 5)',
    ],
    'Waadi Banaspati': [
        'WBP 5 KG BKT',
        'WBP POUCH (1KG X 5)',
        'WBP 2.5 KG BKT',
    ],
}


def _category_for_sku(sku: str) -> str | None:
    s = (sku or '').strip()
    if s in CATEGORY_NAMES:
        return s
    low = s.lower()
    if 'waadi' in low or low.startswith('wbp'):
        return 'Waadi Banaspati'
    if 'banaspati' in low or low.startswith('kbp'):
        return 'Kashmir Banaspati'
    if 'cooking oil' in low or low.startswith('kpgo') or 'oil' in low:
        return 'Kashmir Cooking Oil'
    return None


def _f(val) -> float:
    try:
        if val is None or val == '':
            return 0.0
        return float(val)
    except (TypeError, ValueError):
        return 0.0


def _category_sales_from_reports(ambassador_id: int, month: str) -> dict[str, float]:
    """Sum checkout form sales by category for a BA in YYYY-MM."""
    from calendar import monthrange
    from datetime import date

    from .models import BaDailyReport

    totals = {c: 0.0 for c in CATEGORY_NAMES}
    try:
        y, m = map(int, month.split('-')[:2])
        d_from = date(y, m, 1)
        d_to = date(y, m, monthrange(y, m)[1])
    except (TypeError, ValueError):
        return totals

    for report in BaDailyReport.objects.filter(
        ambassador_id=ambassador_id,
        date__gte=d_from,
        date__lte=d_to,
    ).only('sales_json'):
        sales = report.sales_json if isinstance(report.sales_json, dict) else {}
        for cat, keys in CATEGORY_SKU_KEYS.items():
            totals[cat] += sum(_f(sales.get(k)) for k in keys)
    return {c: round(v, 1) for c, v in totals.items()}


def serialize_target(obj: BaTarget) -> dict:
    return BaTargetSerializer(obj).data


class BaTargetViewSet(viewsets.ModelViewSet):
    """HO: list / create / update / delete BA monthly targets."""

    permission_classes = [IsAuthenticated]
    serializer_class = BaTargetSerializer
    http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = BaTarget.objects.select_related('ambassador').all()
        month = self.request.query_params.get('month')
        ambassador = self.request.query_params.get('ambassador')
        if month:
            norm = _normalize_month(month)
            if norm:
                qs = qs.filter(month=norm)
        if ambassador:
            qs = qs.filter(ambassador_id=ambassador)
        return qs

    def create(self, request, *args, **kwargs):
        data = request.data if isinstance(request.data, dict) else {}
        ambassador_id = data.get('ambassador') or data.get('baId') or data.get('ba_id')
        month = _normalize_month(data.get('month'))
        sku = _normalize_sku(data.get('sku'))
        if not ambassador_id:
            return Response({'detail': 'ambassador is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not month:
            return Response(
                {'detail': 'month must be YYYY-MM (or a month name).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            ba = Ambassador.objects.get(pk=int(ambassador_id))
        except (Ambassador.DoesNotExist, TypeError, ValueError):
            return Response({'detail': 'Ambassador not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            target_kg = float(data.get('targetKg', data.get('target_kg', 0)) or 0)
            raw_sales = data.get('salesKg', data.get('sales_kg', None))
            if raw_sales is None or raw_sales == '':
                sales_kg = None
            else:
                sales_kg = float(raw_sales)
        except (TypeError, ValueError):
            return Response({'detail': 'targetKg and salesKg must be numbers.'}, status=status.HTTP_400_BAD_REQUEST)
        if target_kg < 0 or (sales_kg is not None and sales_kg < 0):
            return Response({'detail': 'targetKg and salesKg must be ≥ 0.'}, status=status.HTTP_400_BAD_REQUEST)

        assigned_skus = _normalize_assigned_skus(data.get('assignedSkus') or data.get('assigned_skus'))

        obj, _created = BaTarget.objects.update_or_create(
            ambassador=ba,
            month=month,
            sku=sku,
            defaults={
                'target_kg': round(target_kg, 1),
                'sales_kg': round(sales_kg, 1) if sales_kg is not None else None,
                'assigned_skus': assigned_skus,
                'created_by': request.user if request.user.is_authenticated else None,
            },
        )
        return Response(serialize_target(obj), status=status.HTTP_200_OK)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        return Response({'results': BaTargetSerializer(qs, many=True).data})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ba_targets_bulk(request):
    """
    POST /api/ba-targets/bulk/
    Body: { rows: [{ baId|ambassador|baName|code, month, sku?, targetKg, salesKg }, ...] }
    BA code is optional — when omitted, ambassador is resolved by baName / name.
    """
    rows = request.data.get('rows') if isinstance(request.data, dict) else None
    if not isinstance(rows, list) or not rows:
        return Response({'detail': 'rows array is required.'}, status=status.HTTP_400_BAD_REQUEST)

    ambassadors = list(Ambassador.objects.only('id', 'code', 'name'))
    codes = {(a.code or '').upper(): a for a in ambassadors if a.code}
    by_id = {a.id: a for a in ambassadors}
    by_name: dict[str, Ambassador] = {}
    for a in ambassadors:
        key = re.sub(r'\s+', ' ', (a.name or '').strip().lower())
        if key and key not in by_name:
            by_name[key] = a

    saved = []
    errors: list[str] = []

    with transaction.atomic():
        for i, row in enumerate(rows, start=1):
            if not isinstance(row, dict):
                errors.append(f'Row {i}: invalid object.')
                continue

            ba = None
            ambassador_id = row.get('ambassador') or row.get('baId') or row.get('ba_id')
            code = str(row.get('code') or row.get('baCode') or '').strip().upper()
            ba_name = str(row.get('baName') or row.get('ba_name') or row.get('name') or '').strip()
            if ambassador_id not in (None, ''):
                try:
                    ba = by_id.get(int(ambassador_id))
                except (TypeError, ValueError):
                    ba = None
            if ba is None and ba_name:
                name_key = re.sub(r'\s+', ' ', ba_name.lower())
                ba = by_name.get(name_key)
                if ba is None and len(name_key) >= 4:
                    # Prefix / contains when unique (short Excel names).
                    prefix_hits = [
                        a
                        for a in ambassadors
                        if re.sub(r'\s+', ' ', (a.name or '').strip().lower()).startswith(name_key)
                    ]
                    if len(prefix_hits) == 1:
                        ba = prefix_hits[0]
                    elif not prefix_hits:
                        contains = [
                            a
                            for a in ambassadors
                            if name_key in re.sub(r'\s+', ' ', (a.name or '').strip().lower())
                        ]
                        if len(contains) == 1:
                            ba = contains[0]
            if ba is None and code:
                # Normalize BA-1 → BA-001 style
                m = re.match(r'^BA-?0*(\d+)$', code, re.I)
                if m:
                    code = f'BA-{int(m.group(1)):03d}'
                ba = codes.get(code)

            if ba is None:
                hint = ba_name or code or ambassador_id or '?'
                errors.append(f'Row {i}: unknown ambassador ({hint}).')
                continue
            month = _normalize_month(row.get('month'))
            if not month:
                errors.append(f'Row {i}: invalid month.')
                continue

            sku = _normalize_sku(row.get('sku'))
            try:
                target_kg = float(row.get('targetKg', row.get('target_kg', 0)) or 0)
                raw_sales = row.get('salesKg', row.get('sales_kg', None))
                if raw_sales is None or raw_sales == '':
                    sales_kg = None
                else:
                    sales_kg = float(raw_sales)
            except (TypeError, ValueError):
                errors.append(f'Row {i}: target/sales must be numbers.')
                continue
            if target_kg < 0 or (sales_kg is not None and sales_kg < 0):
                errors.append(f'Row {i}: target/sales must be ≥ 0.')
                continue

            assigned_skus = _normalize_assigned_skus(
                row.get('assignedSkus') or row.get('assigned_skus')
            )

            obj, _ = BaTarget.objects.update_or_create(
                ambassador=ba,
                month=month,
                sku=sku,
                defaults={
                    'target_kg': round(target_kg, 1),
                    'sales_kg': round(sales_kg, 1) if sales_kg is not None else None,
                    'assigned_skus': assigned_skus,
                    'created_by': request.user if request.user.is_authenticated else None,
                },
            )
            saved.append(obj)

    return Response(
        {
            'saved': len(saved),
            'errors': errors,
            'results': BaTargetSerializer(saved, many=True).data,
        }
    )


@api_view(['GET'])
@permission_classes([AllowAny])
def ba_my_targets(request):
    """GET /api/ba/targets/?token=…&month=YYYY-MM — BA invite-token view of own targets."""
    token = request.query_params.get('token')
    ambassador = Ambassador.objects.filter(invite_token=token).first() if token else None
    if not ambassador:
        return Response({'detail': 'Invalid or missing token.'}, status=status.HTTP_404_NOT_FOUND)

    qs = BaTarget.objects.filter(ambassador=ambassador).select_related('ambassador')
    month = _normalize_month(request.query_params.get('month'))
    if month:
        qs = qs.filter(month=month)

    rows = list(qs)
    # Prefer explicit month; else latest month with targets.
    if not month and rows:
        month = sorted({r.month for r in rows}, reverse=True)[0]
        rows = [r for r in rows if r.month == month]

    sales_by_cat = _category_sales_from_reports(ambassador.id, month) if month else {c: 0.0 for c in CATEGORY_NAMES}

    # Aggregate targets by category (sku may be category name or pack label).
    target_by_cat: dict[str, float] = {c: 0.0 for c in CATEGORY_NAMES}
    other_target = 0.0
    assigned: list[str] = []
    seen_sku: set[str] = set()

    for r in rows:
        cat = _category_for_sku(r.sku)
        if cat:
            target_by_cat[cat] += float(r.target_kg or 0)
        else:
            other_target += float(r.target_kg or 0)

        skus = list(r.assigned_skus) if isinstance(r.assigned_skus, list) else []
        if not skus:
            if r.sku in CATEGORY_NAMES:
                skus = list(CATEGORY_PACK_LABELS.get(r.sku, []))
            elif r.sku:
                skus = [r.sku]
        for s in skus:
            if s and s not in seen_sku:
                seen_sku.add(s)
                assigned.append(s)

    categories = []
    for cat in CATEGORY_NAMES:
        t = round(target_by_cat[cat], 1)
        s = sales_by_cat.get(cat, 0.0)
        if t <= 0 and s <= 0:
            continue
        categories.append(
            {
                'category': cat,
                'targetKg': t,
                'salesKg': s,
                'achievementPct': round((s / t) * 100, 1) if t > 0 else None,
            }
        )

    target_sum = round(sum(c['targetKg'] for c in categories) + other_target, 1)
    sales_sum = round(sum(c['salesKg'] for c in categories), 1)
    achievement = round((sales_sum / target_sum) * 100, 1) if target_sum > 0 else 0.0

    return Response(
        {
            'ambassador_id': ambassador.id,
            'month': month,
            'target_kg': target_sum,
            'sales_kg': sales_sum,
            'achievement_pct': achievement,
            'skus': assigned,
            'assignedSkus': assigned,
            'categories': categories,
            'results': BaTargetSerializer(rows, many=True).data,
        }
    )
