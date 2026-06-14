from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from expenses.views import (
    RegisterView, VerifyOTPView, ResendOTPView, UserProfileView, check_user_exists,
    GroupViewSet, GroupMembershipViewSet, ExpenseViewSet, SettlementViewSet,
    get_group_balances_summary, get_ledger_explanation_view,
    CSVUploadView, ImportJobViewSet, AnomalyViewSet,
    commit_import_job_view, get_import_report, auto_resolve_import_anomalies_view
)

router = DefaultRouter()
router.register(r'groups', GroupViewSet, basename='group')
router.register(r'memberships', GroupMembershipViewSet, basename='membership')
router.register(r'expenses', ExpenseViewSet, basename='expense')
router.register(r'settlements', SettlementViewSet, basename='settlement')
router.register(r'import-jobs', ImportJobViewSet, basename='import-job')
router.register(r'anomalies', AnomalyViewSet, basename='anomaly')

urlpatterns = [
    # Auth
    path('register/', RegisterView.as_view(), name='register'),
    path('register/verify-otp/', VerifyOTPView.as_view(), name='verify_otp'),
    path('register/resend-otp/', ResendOTPView.as_view(), name='resend_otp'),
    path('login/', TokenObtainPairView.as_view(), name='login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('profile/', UserProfileView.as_view(), name='profile'),
    path('users/check/', check_user_exists, name='check_user_exists'),

    # Balances
    path('groups/<uuid:group_id>/balances/', get_group_balances_summary, name='group_balances_summary'),
    path('balances/explanation/', get_ledger_explanation_view, name='ledger_explanation'),

    # Imports & Reports
    path('imports/', CSVUploadView.as_view(), name='csv_upload'),
    path('imports/<uuid:job_id>/commit/', commit_import_job_view, name='commit_import_job'),
    path('imports/<uuid:job_id>/report/', get_import_report, name='import_report'),
    path('imports/<uuid:job_id>/auto-resolve/', auto_resolve_import_anomalies_view, name='auto_resolve_import_anomalies'),

    # Router URLs
    path('', include(router.urls)),
]
