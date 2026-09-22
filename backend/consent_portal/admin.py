# pyrefly: ignore-file
# type: ignore
from django.contrib import admin
from .models import SMSConsent, BankOfficer, AuditLog, BankBranch, Customer, ConsentHistory, PhysicalForm

@admin.register(BankBranch)
class BankBranchAdmin(admin.ModelAdmin):
    list_display = ('branch_code', 'branch_name', 'city', 'is_active', 'created_at')
    search_fields = ('branch_code', 'branch_name', 'city')
    list_filter = ('is_active', 'city')


@admin.register(BankOfficer)
class BankOfficerAdmin(admin.ModelAdmin):
    list_display = ('username', 'full_name', 'branch_name', 'role', 'is_active', 'last_login')
    search_fields = ('username', 'full_name', 'branch_name')
    list_filter = ('role', 'is_active', 'branch_name')


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ('name', 'account_number', 'cif_number', 'mobile_number', 'branch_name', 'created_at')
    search_fields = ('name', 'account_number', 'cif_number', 'mobile_number')
    list_filter = ('branch_name',)


@admin.register(SMSConsent)
class SMSConsentAdmin(admin.ModelAdmin):
    list_display = ('reference_number', 'customer_name', 'account_number', 'cif_number', 'mobile_number', 'branch_name', 'status', 'source', 'cbs_updated', 'created_at')
    search_fields = ('reference_number', 'customer_name', 'account_number', 'cif_number', 'mobile_number')
    list_filter = ('status', 'cbs_updated', 'branch_name', 'source')
    readonly_fields = ('reference_number', 'created_at', 'updated_at')


@admin.register(ConsentHistory)
class ConsentHistoryAdmin(admin.ModelAdmin):
    list_display = ('consent', 'previous_status', 'new_status', 'source', 'changed_by', 'timestamp')
    search_fields = ('consent__reference_number', 'consent__account_number', 'changed_by')
    list_filter = ('new_status', 'source')
    readonly_fields = ('timestamp',)


@admin.register(PhysicalForm)
class PhysicalFormAdmin(admin.ModelAdmin):
    list_display = ('filename', 'uploaded_by', 'uploaded_at', 'verified_by', 'verified_at')
    search_fields = ('filename', 'uploaded_by', 'verified_by')
    list_filter = ('uploaded_by',)
    readonly_fields = ('uploaded_at',)


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'action_type', 'username', 'officer_role', 'branch_name', 'account_no', 'ref_no')
    search_fields = ('username', 'action_type', 'action_details', 'account_no', 'ref_no')
    list_filter = ('action_type', 'officer_role', 'branch_name')
    readonly_fields = ('timestamp',)

