from datetime import date, datetime, timedelta

from django.conf import settings
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404, redirect
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .manager_ops import build_manager_overview
from .intelligence import (
    build_ba_leaderboard,
    build_intelligence_overview,
    build_question_insights,
    build_store_map_pins,
)
from .ba_performance import build_ba_performance_dashboard
from .models import Ambassador, AmbassadorComplaint, Consumer, PlatformSettings, ShiftAssignment, Store, StoreReward, SurveyQuestion
from .serializers import (
    ConsumerCreateSerializer,
    ConsumerSerializer,
    AmbassadorComplaintSerializer,
    PlatformSettingsSerializer,
    ShiftAssignmentSerializer,
    StoreRewardSerializer,
    StoreSerializer,
    SurveyQuestionSerializer,
)
from .shifts import build_week_days, find_containing_shift, monday_of, peak_matches


class StoreViewSet(viewsets.ModelViewSet):
    """
    list / retrieve / create / update / partial_update / destroy stores.
    """

    serializer_class = StoreSerializer
    permission_classes = [IsAuthenticated]
    queryset = Store.objects.select_related('created_by').all()

    def get_queryset(self):
        return (
            Store.objects.select_related('created_by')
            .annotate(
                shopper_count_ann=Count('consumers', distinct=True),
                assigned_bas_ann=Count(
                    'ambassadors',
                    filter=Q(
                        ambassadors__status__in=(
                            Ambassador.Status.CERTIFIED,
                            Ambassador.Status.DEPLOYED,
                        )
                    ),
                    distinct=True,
                ),
            )
            .all()
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='regenerate-qr')
    def regenerate_qr(self, request, pk=None):
        store = self.get_object()
        store.generate_qr_image(force=True)
        store.save()
        refreshed = self.get_queryset().filter(pk=store.pk).first() or store
        return Response(StoreSerializer(refreshed, context=self.get_serializer_context()).data)


class SurveyQuestionViewSet(viewsets.ModelViewSet):
    """Head Office CRUD for store-targeted shopper survey questions."""

    serializer_class = SurveyQuestionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        questions = SurveyQuestion.objects.select_related('store').all()
        store_id = self.request.query_params.get('store')
        if store_id:
            questions = questions.filter(store_id=store_id)
        # Global seed questions (store=null) stay available but HO create UI is store-scoped.
        return questions.order_by('store_id', 'order', 'id')

    def perform_destroy(self, instance):
        # Soft-deactivate preferred for history; hard-delete for HO-created store questions.
        instance.delete()


class AmbassadorComplaintViewSet(viewsets.ModelViewSet):
    """Head Office complaint / insights inbox and status updates."""

    serializer_class = AmbassadorComplaintSerializer
    permission_classes = [IsAuthenticated]
    queryset = AmbassadorComplaint.objects.select_related('ambassador', 'store').all()
    http_method_names = ['get', 'patch', 'head', 'options']
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        qs = super().get_queryset()
        kind = self.request.query_params.get('kind')
        status_q = self.request.query_params.get('status')
        if kind in {c.value for c in AmbassadorComplaint.Kind}:
            qs = qs.filter(kind=kind)
        if status_q:
            qs = qs.filter(status=status_q)
        return qs

    def partial_update(self, request, *args, **kwargs):
        complaint = self.get_object()
        status_val = request.data.get('status')
        ho_note = request.data.get('hoNote', request.data.get('ho_note'))
        update_fields = ['updated_at']
        if status_val is not None:
            allowed = {c.value for c in AmbassadorComplaint.Status}
            if status_val not in allowed:
                return Response({'detail': 'Invalid status.'}, status=status.HTTP_400_BAD_REQUEST)
            complaint.status = status_val
            update_fields.append('status')
        if ho_note is not None:
            complaint.ho_note = str(ho_note)
            update_fields.append('ho_note')
        complaint.save(update_fields=update_fields)
        return Response(
            AmbassadorComplaintSerializer(complaint, context={'request': request}).data
        )

def _parse_week_start(raw: str | None) -> date:
    if not raw:
        return monday_of()
    try:
        return monday_of(datetime.strptime(raw, '%Y-%m-%d').date())
    except ValueError:
        return monday_of()


def _parse_month(raw: str | None) -> tuple[date, date] | None:
    """Parse YYYY-MM into inclusive month start/end dates."""
    if not raw:
        return None
    try:
        year_s, month_s = raw.strip().split('-', 1)
        year, month = int(year_s), int(month_s)
        if month < 1 or month > 12:
            return None
        start = date(year, month, 1)
        if month == 12:
            end = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(year, month + 1, 1) - timedelta(days=1)
        return start, end
    except (TypeError, ValueError):
        return None


class ShiftAssignmentViewSet(viewsets.ModelViewSet):
    """CRUD + week/month board metadata + auto-fill for BA shift scheduling."""

    serializer_class = ShiftAssignmentSerializer
    permission_classes = [IsAuthenticated]
    queryset = ShiftAssignment.objects.select_related('store', 'ambassador').all()

    def get_queryset(self):
        qs = ShiftAssignment.objects.select_related('store', 'ambassador').all()
        if getattr(self, 'action', None) != 'list':
            return qs

        ambassador_id = self.request.query_params.get('ambassador')
        store_id = self.request.query_params.get('store')
        upcoming = str(self.request.query_params.get('upcoming', '')).lower() in (
            '1',
            'true',
            'yes',
        )

        if ambassador_id:
            qs = qs.filter(ambassador_id=ambassador_id)
        if store_id:
            qs = qs.filter(store_id=store_id)

        all_shifts = str(self.request.query_params.get('all', '')).lower() in (
            '1',
            'true',
            'yes',
        )
        if all_shifts and ambassador_id:
            return qs.order_by('-date', 'shift_label', 'id')

        if upcoming:
            # All assigned shifts from today forward (or last 7 days + future if history=1)
            history = str(self.request.query_params.get('history', '')).lower() in (
                '1',
                'true',
                'yes',
            )
            if history:
                qs = qs.filter(date__gte=date.today() - timedelta(days=7))
            else:
                qs = qs.filter(date__gte=date.today())
            return qs.order_by('date', 'shift_label', 'id')

        month_bounds = _parse_month(self.request.query_params.get('month'))
        if month_bounds:
            month_start, month_end = month_bounds
            return qs.filter(date__gte=month_start, date__lte=month_end).order_by(
                'date', 'shift_label', 'id'
            )

        week_start = _parse_week_start(self.request.query_params.get('week_start'))
        week_end = week_start + timedelta(days=6)
        return qs.filter(date__gte=week_start, date__lte=week_end)

    def list(self, request, *args, **kwargs):
        upcoming = str(request.query_params.get('upcoming', '')).lower() in (
            '1',
            'true',
            'yes',
        )
        all_shifts = str(request.query_params.get('all', '')).lower() in (
            '1',
            'true',
            'yes',
        )
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)

        if all_shifts and request.query_params.get('ambassador'):
            return Response(
                {
                    'scope': 'all',
                    'ambassador': request.query_params.get('ambassador'),
                    'results': serializer.data,
                }
            )

        if upcoming:
            return Response(
                {
                    'scope': 'upcoming',
                    'ambassador': request.query_params.get('ambassador'),
                    'results': serializer.data,
                }
            )

        month_bounds = _parse_month(request.query_params.get('month'))
        if month_bounds:
            month_start, month_end = month_bounds
            days = []
            cursor = month_start
            while cursor <= month_end:
                days.append(
                    {
                        'key': cursor.strftime('%a')[:3],
                        'label': cursor.strftime('%a')[:3],
                        'date': cursor.strftime('%d %b'),
                        'iso': cursor.isoformat(),
                    }
                )
                cursor += timedelta(days=1)
            label = month_start.strftime('%B %Y')
            return Response(
                {
                    'scope': 'month',
                    'month': month_start.strftime('%Y-%m'),
                    'week_start': month_start.isoformat(),
                    'week_end': month_end.isoformat(),
                    'week_label': label,
                    'days': days,
                    'results': serializer.data,
                }
            )

        week_start = _parse_week_start(request.query_params.get('week_start'))
        week_end = week_start + timedelta(days=6)
        days = build_week_days(week_start)
        label = f"{week_start.strftime('%d %b')} – {week_end.strftime('%d %b %Y')}"
        return Response(
            {
                'week_start': week_start.isoformat(),
                'week_end': week_end.isoformat(),
                'week_label': label,
                'days': days,
                'results': serializer.data,
            }
        )

    @action(detail=False, methods=['post'], url_path='auto-fill')
    def auto_fill(self, request):
        """Assign certified/deployed BAs round-robin to Open slots in the week."""
        week_start = _parse_week_start(request.data.get('week_start') or request.query_params.get('week_start'))
        week_end = week_start + timedelta(days=6)
        open_slots = list(
            ShiftAssignment.objects.filter(
                date__gte=week_start,
                date__lte=week_end,
                status=ShiftAssignment.Status.OPEN,
            )
            .select_related('store')
            .order_by('date', 'id')
        )
        pool = list(
            Ambassador.objects.filter(
                status__in=(Ambassador.Status.CERTIFIED, Ambassador.Status.DEPLOYED)
            ).order_by('name')
        )
        if not pool:
            return Response(
                {'detail': 'No certified or deployed ambassadors available.', 'assigned': 0},
                status=status.HTTP_400_BAD_REQUEST,
            )
        assigned = 0
        for i, slot in enumerate(open_slots):
            ba = pool[i % len(pool)]
            if find_containing_shift(
                ambassador=ba,
                store=slot.store,
                date_val=slot.date,
                shift_label=slot.shift_label,
                exclude_pk=slot.pk,
            ):
                continue
            slot.ambassador = ba
            slot.status = ShiftAssignment.Status.SCHEDULED
            if not slot.peak_recommended:
                slot.peak_recommended = peak_matches(slot.shift_label, slot.store.peak_hours or '')
            slot.save(
                update_fields=['ambassador', 'status', 'peak_recommended', 'updated_at']
            )
            assigned += 1

        qs = ShiftAssignment.objects.filter(
            date__gte=week_start, date__lte=week_end
        ).select_related('store', 'ambassador')
        return Response(
            {
                'assigned': assigned,
                'week_start': week_start.isoformat(),
                'results': ShiftAssignmentSerializer(qs, many=True).data,
            }
        )


class ConsumerViewSet(viewsets.ReadOnlyModelViewSet):
    """Authenticated list/retrieve of consumers (HO / Admin / Manager)."""

    serializer_class = ConsumerSerializer
    permission_classes = [IsAuthenticated]
    queryset = Consumer.objects.select_related('store').all()

    def get_queryset(self):
        qs = super().get_queryset()
        store_id = self.request.query_params.get('store')
        store_slug = self.request.query_params.get('store_slug')
        if store_id:
            qs = qs.filter(store_id=store_id)
        if store_slug:
            qs = qs.filter(store__qr_slug=store_slug)
        return qs


class StoreRewardViewSet(viewsets.ModelViewSet):
    """Authenticated CRUD for per-store shopper rewards (Admin)."""

    serializer_class = StoreRewardSerializer
    permission_classes = [IsAuthenticated]
    queryset = StoreReward.objects.select_related('store').all()

    def get_queryset(self):
        qs = super().get_queryset()
        store_id = self.request.query_params.get('store')
        if store_id:
            qs = qs.filter(store_id=store_id)
        return qs


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def intelligence_ba_performance(request):
    """
    GET /api/intelligence/ba-performance/
    Live HO Dashboard aggregates (targets, field reports, attendance).
    Query: town, store, month, from, to, category, sku, sales_period, target_month
    """
    q = request.query_params
    date_from = None
    date_to = None
    raw_from = q.get('from')
    raw_to = q.get('to')
    if raw_from:
        try:
            date_from = date.fromisoformat(str(raw_from)[:10])
        except ValueError:
            return Response({'detail': 'Invalid from date.'}, status=status.HTTP_400_BAD_REQUEST)
    if raw_to:
        try:
            date_to = date.fromisoformat(str(raw_to)[:10])
        except ValueError:
            return Response({'detail': 'Invalid to date.'}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        build_ba_performance_dashboard(
            town=(q.get('town') or None),
            store_name=(q.get('store') or None),
            month=(q.get('month') or None),
            date_from=date_from,
            date_to=date_to,
            category=(q.get('category') or None),
            sku=(q.get('sku') or None),
            sales_period=(q.get('sales_period') or 'mom'),
            target_month=(q.get('target_month') or None),
        )
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def intelligence_overview(request):
    """
    Head Office / Admin dashboard aggregates:
    shoppers, active stores, engagement/conversion rates,
    7-day trend, consumer insights, shopper intelligence.
    """
    return Response(build_intelligence_overview())


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def intelligence_question_insights(request):
    """
    GET /api/intelligence/question-insights/?store=<id>
    Live % breakdowns per store survey question from saved Consumer answers.
    """
    store_raw = request.query_params.get('store')
    store_id = None
    if store_raw not in (None, '', 'all'):
        try:
            store_id = int(store_raw)
        except (TypeError, ValueError):
            return Response({'detail': 'Invalid store id.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response(build_question_insights(store_id=store_id))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def intelligence_store_map(request):
    """Mapbox pins for Live Store Map on the Command Center."""
    return Response({'pins': build_store_map_pins()})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def intelligence_leaderboard(request):
    """Ranked BA leaderboard with points, conversion, and week activity."""
    return Response(build_ba_leaderboard())


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def manager_overview(request):
    """Store Manager dashboard: KPIs, live attendance, coverage stores."""
    return Response(build_manager_overview())


@api_view(['GET'])
@permission_classes([AllowAny])
def shopper_store_lookup(request, slug):
    """
    Public check: does this QR store slug exist?
    Used by the shopper frontend gate before allowing /shopper?store=…
    """
    store = Store.objects.filter(qr_slug=slug).only('id', 'name', 'city', 'qr_slug', 'status').first()
    if not store:
        return Response({'detail': 'Store not found.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(
        {
            'id': store.id,
            'name': store.name,
            'city': store.city,
            'qr_slug': store.qr_slug,
            'status': store.status,
        }
    )


@api_view(['GET'])
@permission_classes([AllowAny])
def shopper_survey_questions(request):
    """Public active survey questions for the store QR slug."""
    slug = (request.query_params.get('store') or '').strip()
    store = Store.objects.filter(qr_slug=slug).first() if slug else None
    if slug and not store:
        return Response({'detail': 'Store not found.'}, status=status.HTTP_404_NOT_FOUND)
    questions = SurveyQuestion.objects.none()
    if store:
        questions = SurveyQuestion.objects.filter(is_active=True, store=store)
    # Preserve old global questions for unconfigured stores and non-store legacy callers.
    if not questions.exists():
        questions = SurveyQuestion.objects.filter(is_active=True, store__isnull=True)
    questions = questions.order_by('order', 'id')
    return Response(SurveyQuestionSerializer(questions, many=True).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def shopper_store_rewards(request, slug):
    """Public active rewards for a store QR slug (used by spin / claim)."""
    store = Store.objects.filter(qr_slug=slug).first()
    if not store:
        return Response({'detail': 'Store not found.'}, status=status.HTTP_404_NOT_FOUND)
    rewards = StoreReward.objects.filter(store=store, is_active=True).order_by('sort_order', 'id')
    return Response(StoreRewardSerializer(rewards, many=True).data)


@api_view(['POST'])
@permission_classes([AllowAny])
def shopper_create_consumer(request):
    """
    Public: save consumer survey answers for a store.
    Body: { store_slug, consent, answers: { "<question_id>": "option text" }, name?, phone? }
    """
    serializer = ConsumerCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    consumer = serializer.save()
    return Response(ConsumerSerializer(consumer).data, status=status.HTTP_201_CREATED)


@api_view(['PATCH'])
@permission_classes([AllowAny])
def shopper_update_consumer_feedback(request, pk):
    """Public: attach feedback rating/comment to an existing consumer session."""
    consumer = get_object_or_404(Consumer, pk=pk)
    rating = request.data.get('feedback_rating')
    comment = request.data.get('feedback_comment', '')
    if rating is None:
        return Response({'detail': 'feedback_rating is required.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        rating = int(rating)
    except (TypeError, ValueError):
        return Response({'detail': 'Invalid feedback_rating.'}, status=status.HTTP_400_BAD_REQUEST)
    if rating < 1 or rating > 5:
        return Response({'detail': 'feedback_rating must be 1–5.'}, status=status.HTTP_400_BAD_REQUEST)

    consumer.feedback_rating = rating
    consumer.feedback_comment = str(comment)[:2000]
    consumer.save(update_fields=['feedback_rating', 'feedback_comment', 'updated_at'])
    return Response(ConsumerSerializer(consumer).data)


def shopper_qr_redirect(request, slug):
    """
    Public QR landing URL: http://localhost:8000/shopper/<slug>
    Redirects into the frontend shopper experience for that store.
    """
    store = get_object_or_404(Store, qr_slug=slug)
    frontend = getattr(settings, 'FRONTEND_SHOPPER_URL', 'http://localhost:5173/shopper').rstrip('/')
    return redirect(f'{frontend}?store={store.qr_slug}')


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def platform_settings(request):
    """
    Read / update platform-wide settings (certification thresholds).
    Admin / Head Office authenticated users.
    """
    cfg = PlatformSettings.get_solo()
    if request.method == 'GET':
        return Response(PlatformSettingsSerializer(cfg).data)

    serializer = PlatformSettingsSerializer(cfg, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save(updated_by=request.user)
    return Response(serializer.data)
