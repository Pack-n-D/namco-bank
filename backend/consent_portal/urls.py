from django.urls import path
from .views import (
    ApiRootView,
    CustomerConsentSubmitView,
    CustomerConsentRevokeView,
    CustomerConsentStatusView,
    OfficerLoginView,
    OfficerVerify2FAView,
    OfficerResend2FAView,
    OfficerLogoutView,
    ConsentRecordsView,
    CBSStatusUpdateView,
    UploadPhysicalFormView,
    VerifyPhysicalFormView,
    BranchDataExportView,
    SuperAdminOfficersView,
    SuperAdminOfficerDetailView,
    SuperAdminAuditLogsView,
    DashboardMetricsView,
    BankBranchesListView,
)

urlpatterns = [
    # API Root
    path('', ApiRootView.as_view(), name='api-root'),

    # Customer Consent Submission, Status, & Revocation
    path('consent/submit', CustomerConsentSubmitView.as_view(), name='consent-submit-no-slash'),
    path('consent/submit/', CustomerConsentSubmitView.as_view(), name='consent-submit'),
    path('consent/revoke', CustomerConsentRevokeView.as_view(), name='consent-revoke-no-slash'),
    path('consent/revoke/', CustomerConsentRevokeView.as_view(), name='consent-revoke'),
    path('consent/status', CustomerConsentStatusView.as_view(), name='consent-status-no-slash'),
    path('consent/status/', CustomerConsentStatusView.as_view(), name='consent-status'),
    
    # Officer / SuperAdmin 2-Step Authentication & Session
    path('admin/login', OfficerLoginView.as_view(), name='officer-login-no-slash'),
    path('admin/login/', OfficerLoginView.as_view(), name='officer-login'),
    path('admin/verify-2fa', OfficerVerify2FAView.as_view(), name='officer-verify-2fa-no-slash'),
    path('admin/verify-2fa/', OfficerVerify2FAView.as_view(), name='officer-verify-2fa'),
    path('admin/resend-2fa', OfficerResend2FAView.as_view(), name='officer-resend-2fa-no-slash'),
    path('admin/resend-2fa/', OfficerResend2FAView.as_view(), name='officer-resend-2fa'),
    path('admin/logout', OfficerLogoutView.as_view(), name='officer-logout-no-slash'),
    path('admin/logout/', OfficerLogoutView.as_view(), name='officer-logout'),
    
    # Branch Consent Records Management
    path('admin/records', ConsentRecordsView.as_view(), name='consent-records-no-slash'),
    path('admin/records/', ConsentRecordsView.as_view(), name='consent-records'),
    path('admin/records/<str:ref_no>/cbs-status', CBSStatusUpdateView.as_view(), name='cbs-status-no-slash'),
    path('admin/records/<str:ref_no>/cbs-status/', CBSStatusUpdateView.as_view(), name='cbs-status'),
    
    # Physical Scanned Form OCR Upload & Verification
    path('admin/upload-physical-form', UploadPhysicalFormView.as_view(), name='upload-form-no-slash'),
    path('admin/upload-physical-form/', UploadPhysicalFormView.as_view(), name='upload-form'),
    path('admin/verify-physical-form', VerifyPhysicalFormView.as_view(), name='verify-form-no-slash'),
    path('admin/verify-physical-form/', VerifyPhysicalFormView.as_view(), name='verify-form'),
    
    # Branch & Super Admin CSV/Excel Data Export
    path('admin/export', BranchDataExportView.as_view(), name='branch-export-no-slash'),
    path('admin/export/', BranchDataExportView.as_view(), name='branch-export'),
    
    # Metrics
    path('admin/metrics', DashboardMetricsView.as_view(), name='dashboard-metrics-no-slash'),
    path('admin/metrics/', DashboardMetricsView.as_view(), name='dashboard-metrics'),
    
    # Branches
    path('branches', BankBranchesListView.as_view(), name='branches-list-no-slash'),
    path('branches/', BankBranchesListView.as_view(), name='branches-list'),
    
    # Super Admin Multi-Branch Admin & Governance
    path('superadmin/officers', SuperAdminOfficersView.as_view(), name='superadmin-officers-no-slash'),
    path('superadmin/officers/', SuperAdminOfficersView.as_view(), name='superadmin-officers'),
    path('superadmin/officers/<int:pk>', SuperAdminOfficerDetailView.as_view(), name='superadmin-officer-detail-no-slash'),
    path('superadmin/officers/<int:pk>/', SuperAdminOfficerDetailView.as_view(), name='superadmin-officer-detail'),
    
    # Audit Trail & Activity Logs (Branch isolated for Officers, bank-wide for Super Admin)
    path('admin/audit-logs', SuperAdminAuditLogsView.as_view(), name='admin-audit-logs-no-slash'),
    path('admin/audit-logs/', SuperAdminAuditLogsView.as_view(), name='admin-audit-logs'),
    path('superadmin/audit-logs', SuperAdminAuditLogsView.as_view(), name='superadmin-audit-logs-no-slash'),
    path('superadmin/audit-logs/', SuperAdminAuditLogsView.as_view(), name='superadmin-audit-logs'),
]
