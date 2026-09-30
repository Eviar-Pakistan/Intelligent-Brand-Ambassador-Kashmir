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

        obj, _created = BaTarget.objects.update_or_create(
            ambassador=ba,
            month=month,
            sku=sku,
            defaults={
                'target_kg': round(target_kg, 1),
                'sales_kg': round(sales_kg, 1) if sales_kg is not None else None,
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
    Body: { rows: [{ baId|ambassador|code, month, sku?, targetKg, salesKg }, ...] }
    """
    rows = request.data.get('rows') if isinstance(request.data, dict) else None
    if not isinstance(rows, list) or not rows:
        return Response({'detail': 'rows array is required.'}, status=status.HTTP_400_BAD_REQUEST)

    codes = {
        (a.code or '').upper(): a
        for a in Ambassador.objects.exclude(code='').only('id', 'code', 'name')
    }
    by_id = {a.id: a for a in Ambassador.objects.only('id', 'code', 'name')}

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
            if ambassador_id not in (None, ''):
                try:
                    ba = by_id.get(int(ambassador_id))
                except (TypeError, ValueError):
                    ba = None
            if ba is None and code:
                # Normalize BA-1 → BA-001 style
                m = re.match(r'^BA-?0*(\d+)$', code, re.I)
                if m:
                    code = f'BA-{int(m.group(1)):03d}'
                ba = codes.get(code)

            if ba is None:
                errors.append(f'Row {i}: unknown ambassador (id/code).')
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

            obj, _ = BaTarget.objects.update_or_create(
                ambassador=ba,
                month=month,
                sku=sku,
                defaults={
                    'target_kg': round(target_kg, 1),
                    'sales_kg': round(sales_kg, 1) if sales_kg is not None else None,
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
    target_sum = round(sum(r.target_kg for r in rows), 1)
    sales_sum = round(sum((r.sales_kg or 0) for r in rows), 1)
    return Response(
        {
            'ambassador_id': ambassador.id,
            'month': month,
            'target_kg': target_sum,
            'sales_kg': sales_sum,
            'skus': [r.sku for r in rows if r.sku],
            'results': BaTargetSerializer(rows, many=True).data,
        }
    )
