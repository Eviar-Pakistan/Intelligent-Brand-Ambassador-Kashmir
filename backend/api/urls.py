from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .ba_attendance_views import (
    ba_check_in,
    ba_check_out,
    ba_leaderboard,
    ba_submit_complaint,
    ba_submit_daily_report,
    ba_today_shift,
    daily_reports,
    early_checkout_reports,
)
from .ba_training_views import (
    AmbassadorViewSet,
    TrainingVideoViewSet,
    ba_complete_assessment,
    ba_create_session,
    ba_finish_session,
    ba_get_session,
    ba_invite_lookup,
    ba_session_report,
    ba_store_answer,
    ba_submit_answer,
    ba_training_video,
)
from .supervisor_views import (
    SupervisorViewSet,
    supervisor_login_directory,
    supervisor_me,
    supervisor_me_overview,
)
from .incentive_views import (
    ba_my_incentive,
    incentive_kpi_settings,
    incentives_approve,
    incentives_mark_paid,
    incentives_overview,
)
from .ba_targets_views import BaTargetViewSet, ba_my_targets, ba_targets_bulk
from .views import (
    ConsumerViewSet,
    AmbassadorComplaintViewSet,
    ShiftAssignmentViewSet,
    StoreRewardViewSet,
    StoreViewSet,
    SurveyQuestionViewSet,
    intelligence_ba_performance,
    intelligence_leaderboard,
    intelligence_overview,
    intelligence_question_insights,
    intelligence_store_map,
    manager_overview,
    platform_settings,
    shopper_create_consumer,
    shopper_store_lookup,
    shopper_store_rewards,
    shopper_survey_questions,
    shopper_update_consumer_feedback,
)

router = DefaultRouter()
router.register('stores', StoreViewSet, basename='store')
router.register('consumers', ConsumerViewSet, basename='consumer')
router.register('store-rewards', StoreRewardViewSet, basename='store-reward')
router.register('survey-questions', SurveyQuestionViewSet, basename='survey-question')
router.register('ambassador-complaints', AmbassadorComplaintViewSet, basename='ambassador-complaint')
router.register('training-videos', TrainingVideoViewSet, basename='training-video')
router.register('ambassadors', AmbassadorViewSet, basename='ambassador')
router.register('shifts', ShiftAssignmentViewSet, basename='shift')
router.register('ba-targets', BaTargetViewSet, basename='ba-target')
router.register('supervisors', SupervisorViewSet, basename='supervisor')

urlpatterns = [
    path('intelligence/overview/', intelligence_overview, name='intelligence-overview'),
    path('intelligence/ba-performance/', intelligence_ba_performance, name='intelligence-ba-performance'),
    path('intelligence/question-insights/', intelligence_question_insights, name='intelligence-question-insights'),
    path('intelligence/store-map/', intelligence_store_map, name='intelligence-store-map'),
    path('intelligence/leaderboard/', intelligence_leaderboard, name='intelligence-leaderboard'),
    path('manager/overview/', manager_overview, name='manager-overview'),
    path('platform-settings/', platform_settings, name='platform-settings'),
    path('incentive-kpi/', incentive_kpi_settings, name='incentive-kpi'),
    path('incentives/overview/', incentives_overview, name='incentives-overview'),
    path('incentives/approve/', incentives_approve, name='incentives-approve'),
    path('incentives/mark-paid/', incentives_mark_paid, name='incentives-mark-paid'),
    path('supervisor-logins/', supervisor_login_directory, name='supervisor-logins'),
    path('supervisor/me/', supervisor_me, name='supervisor-me'),
    path('supervisor/me/overview/', supervisor_me_overview, name='supervisor-me-overview'),
    path('shopper/store/<slug:slug>/', shopper_store_lookup, name='shopper-store-lookup'),
    path(
        'shopper/store/<slug:slug>/rewards/',
        shopper_store_rewards,
        name='shopper-store-rewards',
    ),
    path('shopper/questions/', shopper_survey_questions, name='shopper-survey-questions'),
    path('shopper/consumers/', shopper_create_consumer, name='shopper-create-consumer'),
    path(
        'shopper/consumers/<int:pk>/feedback/',
        shopper_update_consumer_feedback,
        name='shopper-consumer-feedback',
    ),
    path('ba/invite/<str:token>/', ba_invite_lookup, name='ba-invite-lookup'),
    path('ba/complete-assessment/', ba_complete_assessment, name='ba-complete-assessment'),
    path('ba/store-answer/', ba_store_answer, name='ba-store-answer'),
    path('ba/today-shift/', ba_today_shift, name='ba-today-shift'),
    path('ba/check-in/', ba_check_in, name='ba-check-in'),
    path('ba/check-out/', ba_check_out, name='ba-check-out'),
    path('ba/complaints/', ba_submit_complaint, name='ba-submit-complaint'),
    path('ba/daily-report/', ba_submit_daily_report, name='ba-daily-report'),
    path('ba/leaderboard/', ba_leaderboard, name='ba-leaderboard'),
    path('ba/targets/', ba_my_targets, name='ba-my-targets'),
    path('ba/incentives/', ba_my_incentive, name='ba-my-incentive'),
    path('ba-targets/bulk/', ba_targets_bulk, name='ba-targets-bulk'),
    path('early-checkouts/', early_checkout_reports, name='early-checkouts'),
    path('daily-reports/', daily_reports, name='daily-reports'),
    path('ba/training/video/', ba_training_video, name='ba-training-video'),
    path('ba/sessions/', ba_create_session, name='ba-create-session'),
    path('ba/sessions/<uuid:session_id>/', ba_get_session, name='ba-get-session'),
    path('ba/sessions/<uuid:session_id>/answers/', ba_submit_answer, name='ba-submit-answer'),
    path('ba/sessions/<uuid:session_id>/finish/', ba_finish_session, name='ba-finish-session'),
    path('ba/sessions/<uuid:session_id>/report/', ba_session_report, name='ba-session-report'),
    path('', include(router.urls)),
]
