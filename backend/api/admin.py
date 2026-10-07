from django.contrib import admin

from .models import (
    Ambassador,
    AmbassadorComplaint,
    AssessmentAnswer,
    AssessmentQuestion,
    AssessmentSession,
    BaAttendanceDay,
    BaDailyReport,
    BaIncentivePayout,
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
    UserInterception,
)


@admin.register(Store)
class StoreAdmin(admin.ModelAdmin):
    list_display = (
        'code',
        'id',
        'name',
        'city',
        'footfall',
        'status',
        'qr_slug',
        'coverage',
        'created_by',
        'created_at',
    )
    list_filter = ('city', 'footfall', 'status')
    search_fields = ('code', 'name', 'city', 'address', 'contact_name', 'contact_phone', 'qr_slug')
    readonly_fields = ('qr_slug', 'qr_image', 'created_at', 'updated_at')


@admin.register(StoreReward)
class StoreRewardAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'store',
        'label',
        'win_amount',
        'promo_code',
        'is_active',
        'is_featured',
        'sort_order',
    )
    list_filter = ('is_active', 'is_featured', 'store')
    search_fields = ('label', 'promo_code', 'store__name')
    list_editable = ('is_active', 'is_featured', 'sort_order')
    raw_id_fields = ('store',)


@admin.register(SurveyQuestion)
class SurveyQuestionAdmin(admin.ModelAdmin):
    list_display = ('store', 'order', 'text', 'is_active', 'created_at')
    list_editable = ('is_active',)
    ordering = ('order',)
    list_filter = ('store', 'is_active')
    search_fields = ('text', 'store__name')


@admin.register(Consumer)
class ConsumerAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'store',
        'name',
        'phone',
        'consent',
        'feedback_rating',
        'created_at',
    )
    list_filter = ('consent', 'store', 'created_at')
    search_fields = ('name', 'phone', 'store__name', 'store__qr_slug')
    readonly_fields = ('created_at', 'updated_at')
    raw_id_fields = ('store',)


@admin.register(AmbassadorComplaint)
class AmbassadorComplaintAdmin(admin.ModelAdmin):
    list_display = ('id', 'kind', 'ambassador', 'store', 'subject', 'status', 'created_at')
    list_filter = ('kind', 'status', 'store', 'created_at')
    search_fields = ('complaint', 'subject', 'ambassador__name', 'store__name', 'sku', 'customer_name')
    list_editable = ('status',)
    readonly_fields = ('created_at', 'updated_at')


@admin.register(UserInterception)
class UserInterceptionAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'status',
        'name',
        'ba_name',
        'store_name',
        'contact',
        'current_sku',
        'created_at',
    )
    list_filter = ('status', 'created_at', 'store')
    search_fields = (
        'name',
        'contact',
        'ba_name',
        'store_name',
        'previous_brand',
        'previous_sku',
        'current_sku',
        'feedback',
    )
    readonly_fields = ('created_at', 'ba_name', 'store_name')
    raw_id_fields = ('ambassador', 'store')



@admin.register(PlatformSettings)
class PlatformSettingsAdmin(admin.ModelAdmin):
    list_display = ('id', 'certification_threshold', 'a_plus_threshold', 'updated_at', 'updated_by')
    readonly_fields = ('updated_at',)

    def has_add_permission(self, request):
        return not PlatformSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(IncentiveKpiSettings)
class IncentiveKpiSettingsAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'ba_salary',
        'ba_target_slab_100',
        'sup_salary',
        'sup_fuel_da',
        'updated_at',
        'updated_by',
    )
    readonly_fields = ('updated_at',)

    def has_add_permission(self, request):
        return not IncentiveKpiSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(BaIncentivePayout)
class BaIncentivePayoutAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'ambassador',
        'week_start',
        'status',
        'total_pkr',
        'approved_at',
        'paid_at',
        'updated_at',
    )
    list_filter = ('status', 'week_start')
    search_fields = ('ambassador__name', 'ambassador__code')
    raw_id_fields = ('ambassador', 'updated_by')
    readonly_fields = ('created_at', 'updated_at', 'approved_at', 'paid_at')


@admin.register(Supervisor)
class SupervisorAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'city', 'created_at')
    search_fields = ('user__email', 'user__first_name', 'user__last_name', 'city')
    raw_id_fields = ('user',)
    filter_horizontal = ('stores',)


@admin.register(TrainingVideo)
class TrainingVideoAdmin(admin.ModelAdmin):
    list_display = ('id', 'original_name', 'is_active', 'uploaded_by', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('original_name',)
    readonly_fields = ('created_at',)


@admin.register(Ambassador)
class AmbassadorAdmin(admin.ModelAdmin):
    list_display = (
        'code',
        'id',
        'name',
        'city',
        'status',
        'store',
        'overall_score',
        'invite_token',
        'created_at',
    )
    list_filter = ('status', 'city', 'store')
    search_fields = ('code', 'name', 'email', 'phone', 'invite_token')
    readonly_fields = ('code', 'invite_token', 'created_at', 'updated_at', 'certified_at', 'deployed_at')
    raw_id_fields = ('store', 'created_by')


@admin.register(AssessmentSession)
class AssessmentSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'ambassador', 'status', 'created_at', 'finished_at')
    list_filter = ('status',)
    raw_id_fields = ('ambassador',)


@admin.register(AssessmentQuestion)
class AssessmentQuestionAdmin(admin.ModelAdmin):
    list_display = ('id', 'session', 'question_id', 'title', 'sort_order')
    raw_id_fields = ('session',)


@admin.register(AssessmentAnswer)
class AssessmentAnswerAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'session',
        'question',
        'communication_quality',
        'dominant_mood',
        'analyzed_at',
    )
    raw_id_fields = ('session', 'question')


@admin.register(ShiftAssignment)
class ShiftAssignmentAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'date',
        'day_key',
        'store',
        'shift_label',
        'ambassador',
        'status',
        'peak_recommended',
    )
    list_filter = ('status', 'day_key', 'peak_recommended', 'date')
    search_fields = ('store__name', 'ambassador__name', 'shift_label', 'early_leave_reason')
    raw_id_fields = ('store', 'ambassador', 'created_by')
    readonly_fields = (
        'checked_in_at',
        'checked_out_at',
        'check_in_lat',
        'check_in_lng',
        'check_in_accuracy_m',
        'early_leave_reason',
    )


@admin.register(BaAttendanceDay)
class BaAttendanceDayAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'date',
        'day_key',
        'ambassador',
        'store',
        'shift_label',
        'checked_in_at',
        'checked_out_at',
    )
    list_filter = ('date', 'day_key')
    search_fields = ('ambassador__name', 'store__name', 'shift_label')
    raw_id_fields = ('ambassador', 'store', 'shift')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(BaDailyReport)
class BaDailyReportAdmin(admin.ModelAdmin):
    list_display = ('id', 'date', 'ambassador', 'store', 'source', 'file_name', 'created_at')
    list_filter = ('source', 'date')
    search_fields = ('ambassador__name', 'store__name', 'file_name')
    raw_id_fields = ('ambassador', 'store', 'shift')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(BaTarget)
class BaTargetAdmin(admin.ModelAdmin):
    list_display = ('id', 'ambassador', 'month', 'sku', 'target_kg', 'sales_kg', 'updated_at')
    list_filter = ('month',)
    search_fields = ('ambassador__name', 'ambassador__code', 'sku')
    raw_id_fields = ('ambassador', 'created_by')
    readonly_fields = ('created_at', 'updated_at')
