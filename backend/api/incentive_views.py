"""HO incentive KPI settings + BA incentive roster / payout status APIs."""

from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .ba_attendance_views import _ambassador_from_token
from .incentives import (
    build_incentive_roster,
    calculate_ba_incentive,
    incentive_for_ambassador,
    set_payout_statuses,
)
from .models import BaIncentivePayout, IncentiveKpiSettings
from .serializers import IncentiveKpiSettingsSerializer


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def incentive_kpi_settings(request):
    """
    GET/PATCH /api/incentive-kpi/
    Head Office singleton for incentive targets and amounts.
    """
    cfg = IncentiveKpiSettings.get_solo()
    if request.method == 'GET':
        return Response(IncentiveKpiSettingsSerializer(cfg).data)

    serializer = IncentiveKpiSettingsSerializer(cfg, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save(updated_by=request.user)
    return Response(IncentiveKpiSettingsSerializer(cfg).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def incentives_overview(request):
    """
    GET /api/incentives/overview/
    Live BA incentive roster from leaderboard metrics + saved KPIs + payout status.
    """
    return Response(build_incentive_roster())


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def incentives_approve(request):
    """
    POST /api/incentives/approve/
    Body: { baIds: [1,2] } or { allPending: true }
    Persists Approved for the current week.
    """
    data = request.data if isinstance(request.data, dict) else {}
    all_pending = bool(data.get('allPending') or data.get('all_pending'))
    raw_ids = data.get('baIds') or data.get('ba_ids') or []
    if not all_pending and not isinstance(raw_ids, list):
        return Response({'detail': 'baIds array or allPending is required.'}, status=status.HTTP_400_BAD_REQUEST)

    ba_ids: list[int] = []
    for x in raw_ids if isinstance(raw_ids, list) else []:
        try:
            ba_ids.append(int(x))
        except (TypeError, ValueError):
            continue

    if not all_pending and not ba_ids:
        return Response({'detail': 'No ambassadors to approve.'}, status=status.HTTP_400_BAD_REQUEST)

    result = set_payout_statuses(
        ba_ids=ba_ids or None,
        new_status=BaIncentivePayout.Status.APPROVED,
        all_pending=all_pending,
        user=request.user,
    )
    overview = build_incentive_roster()
    return Response({**result, 'overview': overview})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def incentives_mark_paid(request):
    """
    POST /api/incentives/mark-paid/
    Body: { baIds: [1,2] }
    Only moves Approved → Paid (persisted).
    """
    data = request.data if isinstance(request.data, dict) else {}
    raw_ids = data.get('baIds') or data.get('ba_ids') or []
    if not isinstance(raw_ids, list) or not raw_ids:
        return Response({'detail': 'baIds array is required.'}, status=status.HTTP_400_BAD_REQUEST)

    ba_ids: list[int] = []
    for x in raw_ids:
        try:
            ba_ids.append(int(x))
        except (TypeError, ValueError):
            continue

    if not ba_ids:
        return Response({'detail': 'No valid baIds.'}, status=status.HTTP_400_BAD_REQUEST)

    result = set_payout_statuses(
        ba_ids=ba_ids,
        new_status=BaIncentivePayout.Status.PAID,
        all_pending=False,
        user=request.user,
    )
    overview = build_incentive_roster()
    return Response({**result, 'overview': overview})


@api_view(['GET'])
@permission_classes([AllowAny])
def ba_my_incentive(request):
    """GET /api/ba/incentives/?token=… — BA view of own payout breakdown."""
    from datetime import date

    from .models import ShiftAssignment

    ambassador = _ambassador_from_token(request.query_params.get('token'))
    if not ambassador:
        return Response({'detail': 'Invalid or missing token.'}, status=status.HTTP_404_NOT_FOUND)

    today = date.today()
    month_start = today.replace(day=1)
    days_worked = (
        ShiftAssignment.objects.filter(
            ambassador=ambassador,
            date__gte=month_start,
            date__lte=today,
            checked_in_at__isnull=False,
        )
        .values('date')
        .distinct()
        .count()
    )
    rating = None
    if ambassador.overall_score is not None:
        try:
            rating = round(float(ambassador.overall_score) / 20.0, 1)  # 0–100 → ~0–5 scale
            rating = max(0.0, min(5.0, rating))
        except (TypeError, ValueError):
            rating = None
    report = ambassador.report_json if isinstance(ambassador.report_json, dict) else {}
    if rating is None and isinstance(report.get('quality'), (int, float)):
        rating = round(float(report['quality']) / 20.0, 1)
        rating = max(0.0, min(5.0, rating))

    row = incentive_for_ambassador(ambassador.id)
    if not row:
        row = calculate_ba_incentive(
            ba_id=ambassador.id,
            name=ambassador.name,
            city=ambassador.city or '',
            rank=0,
            days_worked=days_worked,
        )
        row['status'] = BaIncentivePayout.Status.PENDING
        row['week_label'] = None
    row['daysWorked'] = days_worked
    row['rating'] = rating
    row['overallScore'] = float(ambassador.overall_score) if ambassador.overall_score is not None else None
    return Response(row)
