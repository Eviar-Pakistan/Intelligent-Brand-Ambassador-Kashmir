import io
import secrets

import qrcode
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import models

from .codes import normalize_code, normalize_store_code, save_with_code, uniquify_store_code


class Store(models.Model):
    class Footfall(models.TextChoices):
        HIGH = 'High', 'High'
        MEDIUM = 'Medium', 'Medium'
        LOW = 'Low', 'Low'

    class Status(models.TextChoices):
        LIVE = 'LIVE', 'Live'
        PARTIAL = 'PARTIAL', 'Partial'
        PENDING = 'Pending', 'Pending'
        INACTIVE = 'INACTIVE', 'Inactive'

    code = models.CharField(
        max_length=32,
        unique=True,
        blank=False,
        db_index=True,
        help_text='Business store code (required). Duplicates get -1, -2, …',
    )
    name = models.CharField(max_length=200)
    city = models.CharField(max_length=100)
    address = models.TextField()
    footfall = models.CharField(
        max_length=20,
        choices=Footfall.choices,
        default=Footfall.MEDIUM,
    )
    peak_hours = models.CharField(max_length=200, blank=True)
    contact_name = models.CharField(max_length=120, blank=True)
    contact_phone = models.CharField(max_length=30, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    coverage = models.PositiveSmallIntegerField(default=0)
    bas = models.PositiveSmallIntegerField(default=0)
    today_footfall = models.PositiveIntegerField(default=0)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    qr_slug = models.SlugField(max_length=64, unique=True, blank=True)
    qr_image = models.ImageField(upload_to='store_qr/', blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stores',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        label = self.code or f'#{self.pk}'
        return f'{label} {self.name} ({self.city})'

    def ensure_code(self) -> None:
        raw = normalize_store_code(self.code)
        if not raw:
            return
        self.code = uniquify_store_code(Store, raw, exclude_pk=self.pk)

    @property
    def shopper_url(self) -> str:
        base = getattr(settings, 'SHOPPER_QR_BASE_URL', 'http://localhost:5173').rstrip('/')
        return f'{base}/shopper/{self.qr_slug}'

    def ensure_qr_slug(self) -> None:
        if self.qr_slug:
            return
        token = secrets.token_urlsafe(8).replace('_', '').replace('-', '').lower()[:12]
        if self.pk:
            self.qr_slug = f's{self.pk}-{token}'
        else:
            self.qr_slug = f'stmp-{token}'

    def generate_qr_image(self, force: bool = False) -> None:
        if not self.qr_slug:
            self.ensure_qr_slug()
        if self.qr_image and not force:
            return

        img = qrcode.make(self.shopper_url)
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        filename = f'store-{self.pk or "new"}-{self.qr_slug}.png'
        if self.qr_image:
            self.qr_image.delete(save=False)
        self.qr_image.save(filename, ContentFile(buffer.getvalue()), save=False)

    def ensure_coordinates(self, force: bool = False) -> bool:
        """Assign lat/lng from city centroid (+ stable offset) when missing."""
        if not force and self.latitude is not None and self.longitude is not None:
            return False
        from .geo import coordinates_for_store

        lat, lng = coordinates_for_store(self.city, self.pk or 0, self.address)
        self.latitude = lat
        self.longitude = lng
        return True

    def save(self, *args, **kwargs):
        from django.core.exceptions import ValidationError

        creating = self.pk is None
        raw = normalize_store_code(self.code)
        if not raw:
            raise ValidationError({'code': 'Store code is required.'})
        self.code = uniquify_store_code(Store, raw, exclude_pk=self.pk)

        self.ensure_qr_slug()
        # Only auto-fill coordinates when the user did not provide them.
        if self.latitude is None or self.longitude is None:
            self.ensure_coordinates(force=True)

        super().save(*args, **kwargs)

        update_fields: list[str] = []
        if creating and self.qr_slug.startswith('stmp-'):
            token = secrets.token_urlsafe(8).replace('_', '').replace('-', '').lower()[:12]
            self.qr_slug = f's{self.pk}-{token}'
            self.generate_qr_image(force=True)
            update_fields.extend(['qr_slug', 'qr_image'])

        if self.latitude is None or self.longitude is None:
            self.ensure_coordinates(force=True)
            update_fields.extend(['latitude', 'longitude'])

        if not self.qr_image and 'qr_image' not in update_fields:
            self.generate_qr_image(force=True)
            update_fields.append('qr_image')

        if update_fields:
            update_fields.append('updated_at')
            super().save(update_fields=list(dict.fromkeys(update_fields)))


class StoreReward(models.Model):
    """Shopper spin / claim reward configured by Admin for a specific store."""

    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='rewards')
    label = models.CharField(max_length=120, help_text='Wheel / prize label')
    win_amount = models.CharField(max_length=80, help_text='e.g. Rs. 100 OFF')
    win_detail = models.CharField(max_length=200, blank=True)
    promo_code = models.CharField(max_length=40, blank=True)
    is_active = models.BooleanField(default=True)
    is_featured = models.BooleanField(
        default=False,
        help_text='Featured reward is shown when the shopper wins / claims',
    )
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f'{self.label} @ store {self.store_id}'


class SurveyQuestion(models.Model):
    """Shopper survey questions published by Head Office for one store."""

    store = models.ForeignKey(
        Store,
        on_delete=models.CASCADE,
        related_name='survey_questions',
        null=True,
        blank=True,
        help_text='Leave empty only for legacy fallback questions.',
    )
    order = models.PositiveSmallIntegerField()
    text = models.CharField(max_length=300)
    options = models.JSONField(default=list, help_text='List of answer choice strings')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order']
        constraints = [
            models.UniqueConstraint(fields=['store', 'order'], name='unique_survey_question_order_per_store'),
        ]

    def __str__(self):
        return f'Q{self.order}: {self.text}'


class Consumer(models.Model):
    """Shopper / consumer captured at a store during the in-store journey."""

    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='consumers')
    name = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    consent = models.BooleanField(default=False)
    answers = models.JSONField(
        default=dict,
        help_text='Map of question id (str) -> selected answer text',
    )
    feedback_rating = models.PositiveSmallIntegerField(null=True, blank=True)
    feedback_comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        label = self.name or self.phone or f'Consumer #{self.pk}'
        return f'{label} @ {self.store_id}'


class AmbassadorComplaint(models.Model):
    """
    Field report from a Brand Ambassador for Head Office review.
    Covers customer product complaints, BA store complaints, and insights.
    """

    class Kind(models.TextChoices):
        CUSTOMER = 'customer', 'Customer Complaint'
        BA = 'ba', 'BA Complaint'
        INSIGHTS = 'insights', 'Insights'

    class Status(models.TextChoices):
        OPEN = 'Open', 'Open'
        IN_REVIEW = 'In Review', 'In Review'
        RESOLVED = 'Resolved', 'Resolved'
        REJECTED = 'Rejected', 'Rejected'

    kind = models.CharField(
        max_length=20,
        choices=Kind.choices,
        default=Kind.BA,
        db_index=True,
    )
    ambassador = models.ForeignKey(
        'Ambassador',
        on_delete=models.CASCADE,
        related_name='complaints',
    )
    store = models.ForeignKey(
        Store,
        on_delete=models.CASCADE,
        related_name='ambassador_complaints',
    )
    category = models.CharField(max_length=80, blank=True, default='')
    subject = models.CharField(max_length=255, blank=True, default='')
    complaint = models.TextField(max_length=2000, help_text='Full details / complaint body.')
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True,
    )
    ho_note = models.TextField(blank=True, default='')

    # Customer product complaint extras
    product_category = models.CharField(max_length=80, blank=True, default='')
    brand = models.CharField(max_length=80, blank=True, default='')
    sku = models.CharField(max_length=80, blank=True, default='')
    customer_name = models.CharField(max_length=120, blank=True, default='')
    customer_phone = models.CharField(max_length=30, blank=True, default='')
    image = models.ImageField(upload_to='complaint_images/', blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.display_id} · {self.get_kind_display()} · {self.store.name}'

    @property
    def display_id(self) -> str:
        return f'cmp-{self.pk}'

    @property
    def details(self) -> str:
        return self.complaint



class TrainingVideo(models.Model):
    """HO-uploaded BA training video. Only one is_active at a time (latest)."""

    file = models.FileField(upload_to='training_videos/')
    original_name = models.CharField(max_length=255, blank=True)
    transcript = models.TextField(blank=True)
    questions_json = models.JSONField(
        default=list,
        blank=True,
        help_text='HO-authored assessment questions: [{id, type, question, description}, …]',
    )
    is_active = models.BooleanField(default=False)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='training_videos',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        flag = 'active' if self.is_active else 'inactive'
        return f'{self.original_name or self.file.name} ({flag})'

    @property
    def has_questions(self) -> bool:
        return bool(self.normalized_questions())

    def normalized_questions(self) -> list[dict]:
        """Return cleaned question list for assessment sessions."""
        raw = self.questions_json or []
        if not isinstance(raw, list):
            return []
        out = []
        for i, item in enumerate(raw):
            if not isinstance(item, dict):
                continue
            title = str(item.get('question') or item.get('title') or '').strip()
            if not title:
                continue
            qid = str(item.get('id') or f'q{i + 1}').strip() or f'q{i + 1}'
            out.append(
                {
                    'id': qid,
                    'type': str(item.get('type') or 'verbal').strip() or 'verbal',
                    'question': title,
                    'description': str(item.get('description') or '').strip(),
                }
            )
        return out


class Ambassador(models.Model):
    class Status(models.TextChoices):
        PENDING = 'Pending', 'Pending'
        TRAINING = 'Training', 'Training'
        ASSESSED = 'Assessed', 'Assessed'
        CERTIFIED = 'Certified', 'Certified'
        REJECTED = 'Rejected', 'Rejected'
        DEPLOYED = 'Deployed', 'Deployed'

    code = models.CharField(
        max_length=16,
        unique=True,
        blank=True,
        db_index=True,
        help_text='Business id e.g. BA-001 (auto-assigned on create).',
    )
    name = models.CharField(max_length=120)
    email = models.EmailField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    invite_token = models.CharField(max_length=64, unique=True, blank=True)
    overall_score = models.FloatField(null=True, blank=True)
    report_json = models.JSONField(default=dict, blank=True)
    certified_at = models.DateTimeField(null=True, blank=True)
    store = models.ForeignKey(
        'Store',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ambassadors',
    )
    deployed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_ambassadors',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        label = self.code or f'#{self.pk}'
        return f'{label} {self.name} ({self.status})'

    def ensure_code(self) -> None:
        if self.code:
            self.code = normalize_code(self.code, 'BA') or self.code

    @property
    def training_url(self) -> str:
        """Kashmir BA personal link (frontend /ba/open/:token)."""
        base = getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:5173').rstrip('/')
        return f'{base}/ba/open/{self.invite_token}'

    @property
    def access_url(self) -> str:
        return self.training_url

    def ensure_invite_token(self) -> None:
        if self.invite_token:
            return
        self.invite_token = secrets.token_urlsafe(24)

    def save(self, *args, **kwargs):
        self.ensure_invite_token()

        def _persist():
            super(Ambassador, self).save(*args, **kwargs)

        save_with_code(self, 'BA', _persist)


class PlatformSettings(models.Model):
    """Singleton row for platform-wide BA / campaign settings."""

    certification_threshold = models.PositiveSmallIntegerField(
        default=75,
        help_text='Minimum communication_quality score (0–100) required to certify a BA.',
    )
    a_plus_threshold = models.PositiveSmallIntegerField(
        default=90,
        help_text='Optional higher band for A+ labelling (display / future use).',
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='platform_settings_updates',
    )

    class Meta:
        verbose_name = 'Platform settings'
        verbose_name_plural = 'Platform settings'

    def __str__(self):
        return f'Certification pass ≥ {self.certification_threshold}'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls) -> 'PlatformSettings':
        obj, _ = cls.objects.get_or_create(
            pk=1,
            defaults={
                'certification_threshold': int(
                    getattr(settings, 'BA_CERTIFICATION_THRESHOLD', 75) or 75
                ),
                'a_plus_threshold': 90,
            },
        )
        return obj


class IncentiveKpiSettings(models.Model):
    """
    Singleton: Head Office BA + Supervisor monthly package KPIs (Kashmir).
    """

    # ── BA package / month ────────────────────────────────────────────────
    ba_salary = models.PositiveIntegerField(default=42_000)
    ba_discipline = models.PositiveIntegerField(default=1_500)
    ba_travel_per_day = models.PositiveIntegerField(
        default=300,
        help_text='Travelling allowance PKR per working day',
    )
    ba_travel_cap = models.PositiveIntegerField(
        default=7_800,
        help_text='Max travelling allowance per month',
    )
    ba_grooming = models.PositiveIntegerField(default=2_000)
    ba_mobile = models.PositiveIntegerField(default=1_000)
    ba_target_slab_90 = models.PositiveIntegerField(
        default=2_400,
        help_text='Target Ach incentive at ≥90%',
    )
    ba_target_slab_100 = models.PositiveIntegerField(
        default=3_000,
        help_text='Target Ach incentive at ≥100%',
    )
    ba_target_slab_110 = models.PositiveIntegerField(
        default=3_600,
        help_text='Target Ach incentive at ≥110%',
    )
    ba_discipline_min_days = models.PositiveIntegerField(
        default=20,
        help_text='Min check-in days in month to earn full discipline amount',
    )

    # ── Supervisor package / month ────────────────────────────────────────
    sup_salary = models.PositiveIntegerField(default=50_000)
    sup_fuel_da = models.PositiveIntegerField(default=30_000)
    sup_discipline = models.PositiveIntegerField(default=20_000)
    sup_mobile = models.PositiveIntegerField(default=1_000)

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='incentive_kpi_updates',
    )

    class Meta:
        verbose_name = 'Incentive KPI settings'
        verbose_name_plural = 'Incentive KPI settings'

    def __str__(self):
        return f'BA salary {self.ba_salary} · Sup salary {self.sup_salary}'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls) -> 'IncentiveKpiSettings':
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def as_config_dict(self) -> dict:
        """CamelCase keys matching the Kashmir frontend KpiConfig."""
        return {
            'baSalary': self.ba_salary,
            'baDiscipline': self.ba_discipline,
            'baTravelPerDay': self.ba_travel_per_day,
            'baTravelCap': self.ba_travel_cap,
            'baGrooming': self.ba_grooming,
            'baMobile': self.ba_mobile,
            'baTargetSlab90': self.ba_target_slab_90,
            'baTargetSlab100': self.ba_target_slab_100,
            'baTargetSlab110': self.ba_target_slab_110,
            'baDisciplineMinDays': self.ba_discipline_min_days,
            'supSalary': self.sup_salary,
            'supFuelDa': self.sup_fuel_da,
            'supDiscipline': self.sup_discipline,
            'supMobile': self.sup_mobile,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
        }

    @property
    def ba_package_total(self) -> int:
        """Full monthly package at 100% target + full discipline + travel cap."""
        return (
            self.ba_salary
            + self.ba_target_slab_100
            + self.ba_discipline
            + self.ba_travel_cap
            + self.ba_grooming
            + self.ba_mobile
        )

    @property
    def sup_package_total(self) -> int:
        return self.sup_salary + self.sup_fuel_da + self.sup_discipline + self.sup_mobile


class Supervisor(models.Model):
    """
    Field supervisor: Django user (user_type=Supervisor) overseeing assigned stores
    and the BAs deployed to those stores.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='supervisor_profile',
    )
    city = models.CharField(max_length=100, blank=True, default='')
    stores = models.ManyToManyField(
        Store,
        blank=True,
        related_name='field_supervisors',
    )
    # Last password set by HO — auth uses the hashed User.password; this copy is for HO Login view only.
    login_password = models.CharField(max_length=128, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.email})'

    @property
    def name(self) -> str:
        full = (self.user.get_full_name() or '').strip()
        return full or self.user.email

    @property
    def email(self) -> str:
        return self.user.email

    @property
    def phone(self) -> str:
        return self.user.phone or ''

    def set_stores(self, store_ids: list[int]) -> None:
        """Assign stores exclusively to this supervisor (removes them from others)."""
        ids = [int(x) for x in store_ids]
        if ids:
            for other in Supervisor.objects.exclude(pk=self.pk).filter(stores__id__in=ids).distinct():
                other.stores.remove(*ids)
        self.stores.set(ids)


class BaIncentivePayout(models.Model):
    """
    Permanent HO payout status for a BA for a given week (Mon–Sun).
    Amounts are snapshotted when status changes so history stays stable.
    """

    class Status(models.TextChoices):
        PENDING = 'Pending', 'Pending'
        APPROVED = 'Approved', 'Approved'
        PAID = 'Paid', 'Paid'

    ambassador = models.ForeignKey(
        Ambassador,
        on_delete=models.CASCADE,
        related_name='incentive_payouts',
    )
    week_start = models.DateField(db_index=True, help_text='Monday of the incentive week')
    week_end = models.DateField(help_text='Sunday of the incentive week')
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    base_pkr = models.PositiveIntegerField(default=0)
    conversion_pay = models.PositiveIntegerField(default=0)
    session_pay = models.PositiveIntegerField(default=0)
    incentive_pkr = models.PositiveIntegerField(default=0)
    total_pkr = models.PositiveIntegerField(default=0)
    conversion_pct = models.FloatField(default=0)
    sessions = models.PositiveIntegerField(default=0)
    rank = models.PositiveIntegerField(default=0)
    approved_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='incentive_payout_updates',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-week_start', 'ambassador_id']
        constraints = [
            models.UniqueConstraint(
                fields=['ambassador', 'week_start'],
                name='uniq_ba_incentive_payout_week',
            ),
        ]

    def __str__(self):
        return f'{self.ambassador_id} · {self.week_start} · {self.status}'


class AssessmentSession(models.Model):
    class Status(models.TextChoices):
        IN_PROGRESS = 'in_progress', 'In progress'
        COMPLETED = 'completed', 'Completed'

    id = models.UUIDField(primary_key=True, editable=False)
    ambassador = models.ForeignKey(
        Ambassador,
        on_delete=models.CASCADE,
        related_name='sessions',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.IN_PROGRESS,
    )
    report_json = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.id:
            import uuid

            self.id = uuid.uuid4()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'Session {self.id} · {self.ambassador_id}'


class AssessmentQuestion(models.Model):
    session = models.ForeignKey(
        AssessmentSession,
        on_delete=models.CASCADE,
        related_name='questions',
    )
    question_id = models.CharField(max_length=40)
    question_type = models.CharField(max_length=20, default='verbal')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'id']
        unique_together = [('session', 'question_id')]

    def __str__(self):
        return f'{self.question_id}: {self.title}'


class AssessmentAnswer(models.Model):
    session = models.ForeignKey(
        AssessmentSession,
        on_delete=models.CASCADE,
        related_name='answers',
    )
    question = models.ForeignKey(
        AssessmentQuestion,
        on_delete=models.CASCADE,
        related_name='answers',
    )
    question_title = models.CharField(max_length=200, blank=True)
    audio_file = models.FileField(upload_to='assessment_audio/', blank=True)
    transcript = models.TextField(blank=True)
    communication_quality = models.FloatField(null=True, blank=True)
    speaking_speed_wpm = models.FloatField(null=True, blank=True)
    filler_rate = models.FloatField(null=True, blank=True)
    nervousness_pct = models.FloatField(null=True, blank=True)
    dominant_mood = models.CharField(max_length=40, blank=True)
    affect_breakdown = models.JSONField(default=dict, blank=True)
    speech_metrics = models.JSONField(default=dict, blank=True)
    linguistic_metrics = models.JSONField(default=dict, blank=True)
    question_relevance = models.JSONField(default=dict, blank=True)
    video_relevance = models.JSONField(default=dict, blank=True)
    analyzed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [('session', 'question')]

    def __str__(self):
        return f'Answer {self.question.question_id} @ {self.session_id}'


class ShiftAssignment(models.Model):
    """HO weekly BA shift schedule for a store."""

    class Status(models.TextChoices):
        OPEN = 'Open', 'Open'
        SCHEDULED = 'Scheduled', 'Scheduled'
        CONFLICT = 'Conflict', 'Conflict'

    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='shifts')
    ambassador = models.ForeignKey(
        Ambassador,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shifts',
    )
    date = models.DateField(help_text='Calendar date of the shift')
    day_key = models.CharField(max_length=3, help_text='Mon…Sun for UI week board')
    shift_label = models.CharField(max_length=64)
    peak_recommended = models.BooleanField(default=False)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
    )
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_out_at = models.DateTimeField(null=True, blank=True)
    check_in_lat = models.FloatField(null=True, blank=True)
    check_in_lng = models.FloatField(null=True, blank=True)
    check_in_accuracy_m = models.FloatField(null=True, blank=True)
    early_leave_reason = models.TextField(
        blank=True,
        default='',
        help_text='Filled when BA checks out before shift end time.',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_shifts',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['date', 'shift_label', 'id']

    def __str__(self):
        who = self.ambassador.name if self.ambassador_id else 'Open'
        return f'{self.date} {self.shift_label} · {self.store_id} · {who}'

    @property
    def is_checked_in(self) -> bool:
        return bool(self.checked_in_at) and not self.checked_out_at

    @property
    def is_checked_out(self) -> bool:
        return bool(self.checked_out_at)

    def sync_status(self) -> None:
        if self.ambassador_id:
            self.status = self.Status.SCHEDULED
        elif self.status != self.Status.CONFLICT:
            self.status = self.Status.OPEN


class BaTarget(models.Model):
    """
    Monthly target vs sales (kg) for a Brand Ambassador, optionally per SKU.
    Set by Head Office individually or via Excel bulk upload.
    """

    ambassador = models.ForeignKey(
        Ambassador,
        on_delete=models.CASCADE,
        related_name='targets',
    )
    month = models.CharField(
        max_length=7,
        db_index=True,
        help_text='Calendar month as YYYY-MM',
    )
    sku = models.CharField(max_length=80, blank=True, default='')
    target_kg = models.FloatField(default=0)
    sales_kg = models.FloatField(null=True, blank=True, default=None)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_ba_targets',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-month', 'ambassador_id', 'sku']
        constraints = [
            models.UniqueConstraint(
                fields=['ambassador', 'month', 'sku'],
                name='uniq_ba_target_month_sku',
            ),
        ]
        indexes = [
            models.Index(fields=['ambassador', 'month']),
        ]

    def __str__(self):
        sku = self.sku or '—'
        return f'{self.ambassador_id} · {self.month} · {sku}'


class BaDailyReport(models.Model):
    """
    End-of-shift field report from a BA (stock / sales / other brands),
    submitted via Excel upload or the manual checkout forms.
    """

    class Source(models.TextChoices):
        EXCEL = 'excel', 'Excel upload'
        MANUAL = 'manual', 'Manual forms'

    ambassador = models.ForeignKey(
        Ambassador,
        on_delete=models.CASCADE,
        related_name='daily_reports',
    )
    store = models.ForeignKey(
        Store,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ba_daily_reports',
    )
    shift = models.ForeignKey(
        ShiftAssignment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='daily_reports',
    )
    date = models.DateField(db_index=True)
    stock_json = models.JSONField(default=dict, blank=True)
    sales_json = models.JSONField(default=dict, blank=True)
    other_brands_json = models.JSONField(default=list, blank=True)
    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.MANUAL,
    )
    file_name = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['ambassador', '-date']),
        ]

    def __str__(self):
        return f'Daily report {self.date} · {self.ambassador_id} · {self.source}'
