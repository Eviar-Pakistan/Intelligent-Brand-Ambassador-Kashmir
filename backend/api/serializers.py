from django.conf import settings
from rest_framework import serializers

from .models import (
    Ambassador,
    AmbassadorComplaint,
    AssessmentAnswer,
    AssessmentQuestion,
    AssessmentSession,
    BaTarget,
    Consumer,
    IncentiveKpiSettings,
    PlatformSettings,
    ShiftAssignment,
    Store,
    StoreReward,
    Supervisor,
    SurveyQuestion,
    TrainingVideo,
)
from .shifts import day_key_for, peak_matches
from .deployment import reconcile_ambassador_deployments


def _pct(n: int, d: int) -> float:
    if d <= 0:
        return 0.0
    return round(100.0 * n / d, 1)


class StoreSerializer(serializers.ModelSerializer):
    created_by_email = serializers.EmailField(source='created_by.email', read_only=True)
    shopper_url = serializers.SerializerMethodField()
    qr_image_url = serializers.SerializerMethodField()
    shopper_count = serializers.SerializerMethodField()
    engagement = serializers.SerializerMethodField()
    conversion = serializers.SerializerMethodField()
    assigned_bas = serializers.SerializerMethodField()
    assigned = serializers.SerializerMethodField()
    peak = serializers.SerializerMethodField()

    class Meta:
        model = Store
        fields = (
            'id',
            'code',
            'name',
            'city',
            'address',
            'footfall',
            'peak_hours',
            'peak',
            'contact_name',
            'contact_phone',
            'status',
            'coverage',
            'bas',
            'assigned_bas',
            'assigned',
            'today_footfall',
            'shopper_count',
            'engagement',
            'conversion',
            'latitude',
            'longitude',
            'qr_slug',
            'shopper_url',
            'qr_image_url',
            'created_by',
            'created_by_email',
            'created_at',
            'updated_at',
        )
        read_only_fields = (
            'id',
            'qr_slug',
            'shopper_url',
            'qr_image_url',
            'peak',
            'assigned_bas',
            'assigned',
            'shopper_count',
            'engagement',
            'conversion',
            'created_by',
            'created_by_email',
            'created_at',
            'updated_at',
        )

    def validate_code(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Store code is required.')
        if len(value) > 32:
            raise serializers.ValidationError('Store code must be at most 32 characters.')
        return value

    def create(self, validated_data):
        # Model.save uniquifies duplicates as code-1, code-2, …
        return super().create(validated_data)

    def get_shopper_url(self, obj):
        return obj.shopper_url

    def get_qr_image_url(self, obj):
        if not obj.qr_image:
            return None
        request = self.context.get('request')
        url = obj.qr_image.url
        if request:
            return request.build_absolute_uri(url)
        media_host = getattr(settings, 'SHOPPER_QR_BASE_URL', 'http://localhost:8000').rstrip('/')
        return f'{media_host}{url}'

    def get_peak(self, obj):
        raw = (obj.peak_hours or '').strip()
        if not raw:
            return []
        parts = [p.strip() for p in raw.replace(';', ',').split(',') if p.strip()]
        return parts or [raw]

    def get_shopper_count(self, obj):
        annotated = getattr(obj, 'shopper_count_ann', None)
        if annotated is not None:
            return int(annotated)
        return obj.consumers.count()

    def get_assigned_bas(self, obj):
        return len(self.get_assigned(obj))

    def get_assigned(self, obj):
        """
        BAs for this store: home-store FK (Certified/Deployed)
        plus anyone with a scheduled/conflict shift at this store.
        """
        from collections import defaultdict

        from django.utils import timezone

        today = timezone.localdate()
        state_cache = self.context.setdefault('_store_ba_state_cache', {})
        roster_cache = self.context.setdefault('_store_assigned_roster_cache', {})
        if obj.id in roster_cache:
            return roster_cache[obj.id]

        shift_map = self.context.get('_store_shift_ba_ids')
        if shift_map is None:
            shift_map = defaultdict(set)
            for ba_id, store_id in ShiftAssignment.objects.filter(
                ambassador_id__isnull=False,
                status__in=(
                    ShiftAssignment.Status.SCHEDULED,
                    ShiftAssignment.Status.CONFLICT,
                ),
            ).values_list('ambassador_id', 'store_id'):
                if ba_id and store_id:
                    shift_map[store_id].add(ba_id)
            self.context['_store_shift_ba_ids'] = shift_map

        by_id: dict[int, Ambassador] = {}
        for ba in obj.ambassadors.filter(
            status__in=(Ambassador.Status.CERTIFIED, Ambassador.Status.DEPLOYED)
        ).only('id', 'name'):
            by_id[ba.id] = ba

        missing = shift_map.get(obj.id, set()) - set(by_id)
        if missing:
            for ba in Ambassador.objects.filter(id__in=missing).only('id', 'name'):
                by_id[ba.id] = ba

        rows = []
        for ba in by_id.values():
            if ba.id not in state_cache:
                shift = (
                    ShiftAssignment.objects.filter(ambassador_id=ba.id, date=today)
                    .order_by('-checked_in_at', '-id')
                    .only('checked_in_at', 'checked_out_at')
                    .first()
                )
                if not shift or not shift.checked_in_at or shift.checked_out_at:
                    state_cache[ba.id] = 'Offline'
                else:
                    state_cache[ba.id] = 'Active'
            rows.append({'id': str(ba.id), 'name': ba.name, 'state': state_cache[ba.id]})

        roster_cache[obj.id] = rows
        return rows

    def get_engagement(self, obj):
        shoppers = self.get_shopper_count(obj)
        footfall = obj.today_footfall or 0
        if footfall > 0:
            return min(100.0, _pct(shoppers, footfall))
        return 100.0 if shoppers else 0.0

    def get_conversion(self, obj):
        cache = self.context.setdefault('_store_conversion_cache', {})
        if 'switch_id' not in cache:
            q = SurveyQuestion.objects.filter(is_active=True, order=5).first()
            cache['switch_id'] = str(q.id) if q else None
        switch_id = cache['switch_id']
        consumers = list(obj.consumers.only('answers', 'feedback_rating'))
        if not consumers:
            return 0.0
        if switch_id:
            answered = 0
            yes = 0
            for c in consumers:
                ans = c.answers if isinstance(c.answers, dict) else {}
                val = str(ans.get(switch_id, ''))
                if not val:
                    continue
                answered += 1
                if val.lower().startswith('yes'):
                    yes += 1
            if answered:
                return _pct(yes, answered)
        with_feedback = sum(1 for c in consumers if c.feedback_rating is not None)
        return _pct(with_feedback, len(consumers))

    def validate_latitude(self, value):
        if value is None:
            return value
        if value < -90 or value > 90:
            raise serializers.ValidationError('Latitude must be between -90 and 90.')
        return value

    def validate_longitude(self, value):
        if value is None:
            return value
        if value < -180 or value > 180:
            raise serializers.ValidationError('Longitude must be between -180 and 180.')
        return value


class StoreRewardSerializer(serializers.ModelSerializer):
    store_name = serializers.CharField(source='store.name', read_only=True)

    class Meta:
        model = StoreReward
        fields = (
            'id',
            'store',
            'store_name',
            'label',
            'win_amount',
            'win_detail',
            'promo_code',
            'is_active',
            'is_featured',
            'sort_order',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('id', 'store_name', 'created_at', 'updated_at')

    def validate_store(self, value):
        if value is None:
            raise serializers.ValidationError('Store is required.')
        return value

    def create(self, validated_data):
        reward = super().create(validated_data)
        if reward.is_featured:
            StoreReward.objects.filter(store=reward.store, is_featured=True).exclude(pk=reward.pk).update(
                is_featured=False
            )
        return reward

    def update(self, instance, validated_data):
        reward = super().update(instance, validated_data)
        if reward.is_featured:
            StoreReward.objects.filter(store=reward.store, is_featured=True).exclude(pk=reward.pk).update(
                is_featured=False
            )
        return reward


class SurveyQuestionSerializer(serializers.ModelSerializer):
    store_name = serializers.CharField(source='store.name', read_only=True)
    store_city = serializers.CharField(source='store.city', read_only=True)
    responses = serializers.SerializerMethodField()
    # Auto-assigned on create. Must stay read_only so DRF's UniqueTogetherValidator
    # on (store, order) does not force clients to send order.
    order = serializers.IntegerField(read_only=True)

    class Meta:
        model = SurveyQuestion
        fields = (
            'id',
            'store',
            'store_name',
            'store_city',
            'order',
            'text',
            'options',
            'is_active',
            'responses',
            'created_at',
        )
        read_only_fields = ('id', 'order', 'store_name', 'store_city', 'responses', 'created_at')
        # DB still enforces unique (store, order); skip serializer validator so create
        # can omit order and we assign the next value in create().
        validators = []

    def get_responses(self, obj):
        key = str(obj.pk)
        if not obj.store_id:
            return 0
        # answers is { "<question_id>": "<choice>" }
        count = 0
        for answers in Consumer.objects.filter(store_id=obj.store_id).values_list('answers', flat=True):
            if isinstance(answers, dict) and key in answers and answers.get(key) not in (None, ''):
                count += 1
        return count

    def validate_store(self, value):
        if value is None:
            raise serializers.ValidationError('Select a store for this question.')
        return value

    def validate_text(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Question text is required.')
        return value

    def validate_options(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Options must be a list.')
        options = [str(option).strip() for option in value if str(option).strip()]
        if len(options) < 2:
            raise serializers.ValidationError('Add at least two answer options.')
        if len(options) != len(set(options)):
            raise serializers.ValidationError('Answer options must be unique.')
        return options

    def create(self, validated_data):
        store = validated_data.get('store')
        if store is not None and validated_data.get('order') is None:
            last = (
                SurveyQuestion.objects.filter(store=store)
                .order_by('-order')
                .values_list('order', flat=True)
                .first()
            )
            validated_data['order'] = (last or 0) + 1
        elif validated_data.get('order') is None:
            validated_data['order'] = 1
        return super().create(validated_data)


class AmbassadorComplaintSerializer(serializers.ModelSerializer):
    """HO / BA complaint shape matching the frontend Complaint type."""

    id = serializers.SerializerMethodField()
    baId = serializers.SerializerMethodField()
    baName = serializers.CharField(source='ambassador.name', read_only=True)
    storeId = serializers.IntegerField(source='store_id', read_only=True)
    storeName = serializers.CharField(source='store.name', read_only=True)
    city = serializers.CharField(source='store.city', read_only=True)
    details = serializers.CharField(source='complaint')
    hoNote = serializers.CharField(source='ho_note', required=False, allow_blank=True)
    productCategory = serializers.CharField(
        source='product_category', required=False, allow_blank=True,
    )
    customerName = serializers.CharField(
        source='customer_name', required=False, allow_blank=True,
    )
    customerPhone = serializers.CharField(
        source='customer_phone', required=False, allow_blank=True,
    )
    imageName = serializers.SerializerMethodField()
    imageUrl = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    # Write helpers for HO PATCH / BA create via viewset
    store_id = serializers.PrimaryKeyRelatedField(
        queryset=Store.objects.all(),
        source='store',
        write_only=True,
        required=False,
    )
    ambassador_id = serializers.PrimaryKeyRelatedField(
        queryset=Ambassador.objects.all(),
        source='ambassador',
        write_only=True,
        required=False,
    )

    class Meta:
        model = AmbassadorComplaint
        fields = (
            'id',
            'kind',
            'baId',
            'baName',
            'storeId',
            'storeName',
            'city',
            'category',
            'subject',
            'details',
            'complaint',
            'status',
            'hoNote',
            'productCategory',
            'brand',
            'sku',
            'customerName',
            'customerPhone',
            'imageName',
            'imageUrl',
            'image',
            'createdAt',
            'updatedAt',
            'store_id',
            'ambassador_id',
            'ambassador',
            'store',
        )
        read_only_fields = (
            'id',
            'baId',
            'baName',
            'storeId',
            'storeName',
            'city',
            'imageName',
            'imageUrl',
            'createdAt',
            'updatedAt',
            'ambassador',
            'store',
        )
        extra_kwargs = {
            'complaint': {'write_only': True, 'required': False},
            'image': {'write_only': True, 'required': False},
            'category': {'required': False, 'allow_blank': True},
            'subject': {'required': False, 'allow_blank': True},
            'brand': {'required': False, 'allow_blank': True},
            'sku': {'required': False, 'allow_blank': True},
            'kind': {'required': False},
            'status': {'required': False},
        }

    def get_id(self, obj):
        return obj.display_id

    def get_baId(self, obj):
        return str(obj.ambassador_id) if obj.ambassador_id else None

    def get_imageName(self, obj):
        if not obj.image:
            return None
        name = getattr(obj.image, 'name', '') or ''
        return name.rsplit('/', 1)[-1] if name else None

    def get_imageUrl(self, obj):
        if not obj.image:
            return None
        request = self.context.get('request')
        try:
            url = obj.image.url
        except ValueError:
            return None
        if request:
            return request.build_absolute_uri(url)
        return url

    def validate_status(self, value):
        allowed = {c.value for c in AmbassadorComplaint.Status}
        if value not in allowed:
            raise serializers.ValidationError('Invalid status.')
        return value

    def create(self, validated_data):
        # Prefer `details` alias already mapped to complaint; ensure body exists.
        if not validated_data.get('complaint'):
            raise serializers.ValidationError({'details': 'Details are required.'})
        return super().create(validated_data)


class ConsumerCreateSerializer(serializers.Serializer):
    store_slug = serializers.SlugField()
    consent = serializers.BooleanField()
    name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=30)
    answers = serializers.DictField(
        child=serializers.CharField(allow_blank=False, max_length=300),
        allow_empty=False,
    )

    def validate_consent(self, value):
        if not value:
            raise serializers.ValidationError('Consent is required.')
        return value

    def validate(self, attrs):
        store = Store.objects.filter(qr_slug=attrs['store_slug']).first()
        if not store:
            raise serializers.ValidationError({'store_slug': 'Store not found.'})
        attrs['store'] = store

        store_questions = SurveyQuestion.objects.filter(is_active=True, store=store)
        # Stores with questions published by HO use only their own question set.
        # Legacy global questions preserve existing shopper journeys until a store is configured.
        active_questions = store_questions if store_questions.exists() else SurveyQuestion.objects.filter(
            is_active=True, store__isnull=True
        )
        questions = {
            str(q.id): q
            for q in active_questions
        }
        if not questions:
            raise serializers.ValidationError('No survey questions configured.')

        answers = attrs['answers']
        # Accept keys as question ids (str or int-like)
        normalized = {}
        for key, value in answers.items():
            qid = str(key)
            question = questions.get(qid)
            if not question:
                raise serializers.ValidationError({'answers': f'Unknown question id: {key}'})
            if value not in question.options:
                raise serializers.ValidationError(
                    {'answers': f'Invalid option for question {question.order}: {value}'}
                )
            normalized[qid] = value

        missing = [qid for qid in questions if qid not in normalized]
        if missing:
            raise serializers.ValidationError(
                {'answers': f'Please answer all questions. Missing: {", ".join(missing)}'}
            )

        attrs['answers'] = normalized
        return attrs

    def create(self, validated_data):
        return Consumer.objects.create(
            store=validated_data['store'],
            consent=validated_data['consent'],
            name=validated_data.get('name', ''),
            phone=validated_data.get('phone', ''),
            answers=validated_data['answers'],
        )


class ConsumerSerializer(serializers.ModelSerializer):
    store_name = serializers.CharField(source='store.name', read_only=True)
    store_slug = serializers.SlugField(source='store.qr_slug', read_only=True)

    class Meta:
        model = Consumer
        fields = (
            'id',
            'store',
            'store_name',
            'store_slug',
            'name',
            'phone',
            'consent',
            'answers',
            'feedback_rating',
            'feedback_comment',
            'created_at',
            'updated_at',
        )
        read_only_fields = fields


class TrainingVideoSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    uploaded_by_email = serializers.EmailField(source='uploaded_by.email', read_only=True)
    ready = serializers.SerializerMethodField()
    transcript_preview = serializers.SerializerMethodField()
    questions = serializers.SerializerMethodField()
    question_count = serializers.SerializerMethodField()

    class Meta:
        model = TrainingVideo
        fields = (
            'id',
            'file',
            'file_url',
            'original_name',
            'transcript',
            'transcript_preview',
            'questions',
            'question_count',
            'is_active',
            'ready',
            'uploaded_by',
            'uploaded_by_email',
            'created_at',
        )
        read_only_fields = (
            'id',
            'file_url',
            'transcript',
            'transcript_preview',
            'questions',
            'question_count',
            'is_active',
            'ready',
            'uploaded_by',
            'uploaded_by_email',
            'created_at',
        )
        extra_kwargs = {'file': {'write_only': True}}

    def get_file_url(self, obj):
        if not obj.file:
            return None
        request = self.context.get('request')
        url = obj.file.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_ready(self, obj):
        # Ready when video exists and HO has authored assessment questions.
        return bool(obj.file and obj.has_questions)

    def get_transcript_preview(self, obj):
        text = (obj.transcript or '').strip()
        return text[:280] if text else ''

    def get_questions(self, obj):
        return obj.normalized_questions()

    def get_question_count(self, obj):
        return len(obj.normalized_questions())


class AmbassadorSerializer(serializers.ModelSerializer):
    training_url = serializers.SerializerMethodField()
    created_by_email = serializers.EmailField(source='created_by.email', read_only=True)
    store_name = serializers.SerializerMethodField()
    store_city = serializers.SerializerMethodField()

    class Meta:
        model = Ambassador
        fields = (
            'id',
            'code',
            'name',
            'email',
            'city',
            'phone',
            'status',
            'invite_token',
            'training_url',
            'overall_score',
            'report_json',
            'certified_at',
            'store',
            'store_name',
            'store_city',
            'deployed_at',
            'created_by',
            'created_by_email',
            'created_at',
            'updated_at',
        )
        read_only_fields = (
            'id',
            'code',
            'invite_token',
            'training_url',
            'overall_score',
            'report_json',
            'certified_at',
            'store',
            'store_name',
            'store_city',
            'deployed_at',
            'created_by',
            'created_by_email',
            'created_at',
            'updated_at',
        )

    def get_training_url(self, obj):
        return obj.training_url

    def get_store_name(self, obj):
        return obj.store.name if obj.store_id else None

    def get_store_city(self, obj):
        return obj.store.city if obj.store_id else None


class PlatformSettingsSerializer(serializers.ModelSerializer):
    updated_by_email = serializers.EmailField(source='updated_by.email', read_only=True)

    class Meta:
        model = PlatformSettings
        fields = (
            'certification_threshold',
            'a_plus_threshold',
            'updated_at',
            'updated_by_email',
        )
        read_only_fields = ('updated_at', 'updated_by_email')


class IncentiveKpiSettingsSerializer(serializers.ModelSerializer):
    """CamelCase API matching frontend KpiConfig (BA + Supervisor packages)."""

    baSalary = serializers.IntegerField(source='ba_salary', min_value=0)
    baDiscipline = serializers.IntegerField(source='ba_discipline', min_value=0)
    baTravelPerDay = serializers.IntegerField(source='ba_travel_per_day', min_value=0)
    baTravelCap = serializers.IntegerField(source='ba_travel_cap', min_value=0)
    baGrooming = serializers.IntegerField(source='ba_grooming', min_value=0)
    baMobile = serializers.IntegerField(source='ba_mobile', min_value=0)
    baTargetSlab90 = serializers.IntegerField(source='ba_target_slab_90', min_value=0)
    baTargetSlab100 = serializers.IntegerField(source='ba_target_slab_100', min_value=0)
    baTargetSlab110 = serializers.IntegerField(source='ba_target_slab_110', min_value=0)
    baDisciplineMinDays = serializers.IntegerField(source='ba_discipline_min_days', min_value=0)
    supSalary = serializers.IntegerField(source='sup_salary', min_value=0)
    supFuelDa = serializers.IntegerField(source='sup_fuel_da', min_value=0)
    supDiscipline = serializers.IntegerField(source='sup_discipline', min_value=0)
    supMobile = serializers.IntegerField(source='sup_mobile', min_value=0)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    updatedByEmail = serializers.EmailField(source='updated_by.email', read_only=True)

    class Meta:
        model = IncentiveKpiSettings
        fields = (
            'baSalary',
            'baDiscipline',
            'baTravelPerDay',
            'baTravelCap',
            'baGrooming',
            'baMobile',
            'baTargetSlab90',
            'baTargetSlab100',
            'baTargetSlab110',
            'baDisciplineMinDays',
            'supSalary',
            'supFuelDa',
            'supDiscipline',
            'supMobile',
            'updatedAt',
            'updatedByEmail',
        )
        read_only_fields = ('updatedAt', 'updatedByEmail')


class SupervisorSerializer(serializers.ModelSerializer):
    id = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    email = serializers.EmailField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    storeIds = serializers.SerializerMethodField()
    storeCount = serializers.SerializerMethodField()
    hasPassword = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    # FE used passwordHash emptiness to show "no password"; always true for API users
    passwordHash = serializers.SerializerMethodField()

    class Meta:
        model = Supervisor
        fields = (
            'id',
            'name',
            'email',
            'phone',
            'city',
            'storeIds',
            'storeCount',
            'hasPassword',
            'passwordHash',
            'createdAt',
        )

    def get_id(self, obj):
        return str(obj.id)

    def get_name(self, obj):
        return obj.name

    def get_storeIds(self, obj):
        return list(obj.stores.values_list('id', flat=True))

    def get_storeCount(self, obj):
        return obj.stores.count()

    def get_hasPassword(self, obj):
        return obj.user.has_usable_password()

    def get_passwordHash(self, obj):
        return 'set' if obj.user.has_usable_password() else ''

    def validate_certification_threshold(self, value):
        if value < 1 or value > 100:
            raise serializers.ValidationError('Must be between 1 and 100.')
        return value

    def validate_a_plus_threshold(self, value):
        if value < 1 or value > 100:
            raise serializers.ValidationError('Must be between 1 and 100.')
        return value

    def validate(self, attrs):
        cert = attrs.get(
            'certification_threshold',
            getattr(self.instance, 'certification_threshold', 75),
        )
        a_plus = attrs.get(
            'a_plus_threshold',
            getattr(self.instance, 'a_plus_threshold', 90),
        )
        if a_plus < cert:
            raise serializers.ValidationError(
                {'a_plus_threshold': 'A+ threshold must be greater than or equal to pass threshold.'}
            )
        return attrs


class AmbassadorCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ambassador
        fields = ('name', 'email', 'city', 'phone')

    def validate_name(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Name is required.')
        return value


class AssessmentQuestionSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='question_id')
    type = serializers.CharField(source='question_type')
    question = serializers.CharField(source='title')

    class Meta:
        model = AssessmentQuestion
        fields = ('id', 'type', 'question', 'description')


class AssessmentAnswerSerializer(serializers.ModelSerializer):
    question_id = serializers.CharField(source='question.question_id', read_only=True)

    class Meta:
        model = AssessmentAnswer
        fields = (
            'question_id',
            'question_title',
            'transcript',
            'communication_quality',
            'speaking_speed_wpm',
            'filler_rate',
            'nervousness_pct',
            'dominant_mood',
            'affect_breakdown',
            'speech_metrics',
            'linguistic_metrics',
            'question_relevance',
            'video_relevance',
            'analyzed_at',
        )


class ShiftAssignmentSerializer(serializers.ModelSerializer):
    """Frontend ShiftSlot shape (camelCase field aliases)."""

    id = serializers.SerializerMethodField()
    day = serializers.CharField(source='day_key', read_only=True)
    date = serializers.SerializerMethodField()
    dateIso = serializers.SerializerMethodField()
    storeId = serializers.IntegerField(source='store_id', read_only=True)
    storeName = serializers.CharField(source='store.name', read_only=True)
    city = serializers.CharField(source='store.city', read_only=True)
    shift = serializers.CharField(source='shift_label')
    peakRecommended = serializers.BooleanField(source='peak_recommended', required=False)
    baId = serializers.SerializerMethodField()
    baName = serializers.SerializerMethodField()
    checkedIn = serializers.SerializerMethodField()
    checkedOut = serializers.SerializerMethodField()
    checkedInAt = serializers.DateTimeField(source='checked_in_at', read_only=True)
    checkedOutAt = serializers.DateTimeField(source='checked_out_at', read_only=True)
    checkInLat = serializers.FloatField(source='check_in_lat', read_only=True)
    checkInLng = serializers.FloatField(source='check_in_lng', read_only=True)
    checkInAccuracyM = serializers.FloatField(source='check_in_accuracy_m', read_only=True)
    store_id = serializers.PrimaryKeyRelatedField(
        queryset=Store.objects.all(),
        source='store',
        write_only=True,
    )
    ambassador_id = serializers.PrimaryKeyRelatedField(
        queryset=Ambassador.objects.all(),
        source='ambassador',
        write_only=True,
        required=False,
        allow_null=True,
    )
    date_iso = serializers.DateField(source='date', write_only=True)

    class Meta:
        model = ShiftAssignment
        fields = (
            'id',
            'day',
            'date',
            'dateIso',
            'date_iso',
            'storeId',
            'storeName',
            'city',
            'shift',
            'peakRecommended',
            'baId',
            'baName',
            'status',
            'checkedIn',
            'checkedOut',
            'checkedInAt',
            'checkedOutAt',
            'checkInLat',
            'checkInLng',
            'checkInAccuracyM',
            'store_id',
            'ambassador_id',
        )
        read_only_fields = ('status',)

    def get_id(self, obj):
        return str(obj.pk)

    def get_date(self, obj):
        # Month-level assignments are stored on the 1st — show "Sep 2026".
        if obj.date.day == 1:
            return obj.date.strftime('%b %Y')
        return obj.date.strftime('%d %b')

    def get_dateIso(self, obj):
        return obj.date.isoformat()

    def get_baId(self, obj):
        return str(obj.ambassador_id) if obj.ambassador_id else None

    def get_baName(self, obj):
        return obj.ambassador.name if obj.ambassador_id else None

    def get_checkedIn(self, obj):
        return bool(obj.checked_in_at)

    def get_checkedOut(self, obj):
        return bool(obj.checked_out_at)

    def validate_ambassador_id(self, ambassador):
        if ambassador is None:
            return None
        if ambassador.status == Ambassador.Status.REJECTED:
            raise serializers.ValidationError('Rejected ambassadors cannot be scheduled.')
        return ambassador

    def _apply_peak_and_day(self, validated):
        store = validated.get('store') or getattr(self.instance, 'store', None)
        shift_label = validated.get('shift_label') or getattr(self.instance, 'shift_label', '')
        date_val = validated.get('date') or getattr(self.instance, 'date', None)
        if date_val is not None:
            validated['day_key'] = day_key_for(date_val)
        if 'peak_recommended' not in validated and store is not None:
            validated['peak_recommended'] = peak_matches(shift_label, store.peak_hours or '')
        return validated

    def create(self, validated_data):
        validated_data = self._apply_peak_and_day(validated_data)
        ambassador = validated_data.get('ambassador')
        date_val = validated_data['date']
        shift_label = validated_data['shift_label']
        if ambassador is None:
            validated_data['status'] = ShiftAssignment.Status.OPEN
        else:
            conflict = ShiftAssignment.objects.filter(
                ambassador=ambassador,
                date=date_val,
                shift_label=shift_label,
            ).exists()
            validated_data['status'] = (
                ShiftAssignment.Status.CONFLICT
                if conflict
                else ShiftAssignment.Status.SCHEDULED
            )
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['created_by'] = request.user
        instance = super().create(validated_data)
        reconcile_ambassador_deployments()
        return instance

    def update(self, instance, validated_data):
        validated_data = self._apply_peak_and_day(validated_data)
        ambassador = validated_data.get('ambassador', instance.ambassador)
        date_val = validated_data.get('date', instance.date)
        shift_label = validated_data.get('shift_label', instance.shift_label)
        if ambassador is None:
            validated_data['status'] = ShiftAssignment.Status.OPEN
        else:
            conflict = (
                ShiftAssignment.objects.filter(
                    ambassador=ambassador,
                    date=date_val,
                    shift_label=shift_label,
                )
                .exclude(pk=instance.pk)
                .exists()
            )
            validated_data['status'] = (
                ShiftAssignment.Status.CONFLICT
                if conflict
                else ShiftAssignment.Status.SCHEDULED
            )
        instance = super().update(instance, validated_data)
        reconcile_ambassador_deployments()
        return instance


class BaTargetSerializer(serializers.ModelSerializer):
    baId = serializers.CharField(source='ambassador_id', read_only=True)
    baName = serializers.CharField(source='ambassador.name', read_only=True)
    baCode = serializers.CharField(source='ambassador.code', read_only=True)
    targetKg = serializers.FloatField(source='target_kg')
    salesKg = serializers.FloatField(source='sales_kg', allow_null=True, required=False)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = BaTarget
        fields = (
            'id',
            'ambassador',
            'baId',
            'baName',
            'baCode',
            'month',
            'sku',
            'targetKg',
            'salesKg',
            'updatedAt',
            'created_at',
        )
        read_only_fields = (
            'id',
            'baId',
            'baName',
            'baCode',
            'updatedAt',
            'created_at',
        )
