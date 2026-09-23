from django.db import models
from django.utils import timezone
from django.contrib.auth.hashers import make_password, check_password as django_check_password
import datetime

class BankBranch(models.Model):
    branch_code = models.CharField(max_length=20, unique=True, db_index=True)
    branch_name = models.CharField(max_length=150, db_index=True)
    city = models.CharField(max_length=100, default='Nashik')
    address = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tbl_bank_branches'
        verbose_name = 'Bank Branch'
        verbose_name_plural = 'Bank Branches'
        ordering = ['branch_code']

    def __str__(self):
        return f"{self.branch_name} ({self.branch_code})"


class BankOfficer(models.Model):
    ROLE_CHOICES = [
        ('SUPER_ADMIN', 'Central Super Administrator'),
        ('BRANCH_ADMIN', 'Branch Administrative Officer'),
        ('AUDITOR', 'Compliance Auditor'),
        ('DLT_PARTNER', 'DLT SMS Gateway Partner'),
    ]

    username = models.CharField(max_length=50, unique=True, db_index=True)
    full_name = models.CharField(max_length=150)
    employee_id = models.CharField(max_length=50, blank=True, null=True)
    account_number = models.CharField(max_length=30, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    mobile = models.CharField(max_length=15, blank=True, null=True)
    password_hash = models.CharField(max_length=255)
    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default='BRANCH_ADMIN', db_index=True)
    branch = models.ForeignKey(BankBranch, on_delete=models.SET_NULL, null=True, blank=True, related_name='officers')
    branch_name = models.CharField(max_length=150, default='Head Office (HO)')
    branch_code = models.CharField(max_length=30, default='HO-001')
    is_active = models.BooleanField(default=True)
    activation_status = models.CharField(max_length=30, default='ACTIVE') # ACTIVE, PENDING_ACTIVATION, SUSPENDED, DEACTIVATED
    two_factor_enabled = models.BooleanField(default=True)
    last_2fa_success = models.DateTimeField(blank=True, null=True)
    failed_login_attempts = models.IntegerField(default=0)
    locked_until = models.DateTimeField(blank=True, null=True)
    last_login = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tbl_bank_officers'
        verbose_name = 'Bank Officer'
        verbose_name_plural = 'Bank Officers'

    def set_password(self, raw_password):
        # Uses standard secure Django PBKDF2 hashing
        self.password_hash = make_password(raw_password)

    def check_password(self, raw_password):
        if not self.password_hash:
            return False
        # Supports standard Django hashing and legacy salted/plain formats
        if self.password_hash.startswith('pbkdf2_') or self.password_hash.startswith('argon2'):
            return django_check_password(raw_password, self.password_hash)
        if '$' in self.password_hash:
            import hashlib
            import secrets
            salt, hashed = self.password_hash.split('$', 1)
            expected = hashlib.sha256((salt + raw_password).encode('utf-8')).hexdigest()
            if secrets.compare_digest(hashed, expected):
                # Automatically upgrade to Django make_password
                self.set_password(raw_password)
                self.save(update_fields=['password_hash'])
                return True
        # No plaintext fallback — reject unrecognized hash formats
        return False

    def is_locked(self):
        if self.locked_until and self.locked_until > timezone.now():
            return True
        return False

    def register_failed_login(self):
        self.failed_login_attempts += 1
        if self.failed_login_attempts >= 5:
            self.locked_until = timezone.now() + datetime.timedelta(minutes=15)
        self.save(update_fields=['failed_login_attempts', 'locked_until'])

    def reset_failed_logins(self):
        if self.failed_login_attempts > 0 or self.locked_until:
            self.failed_login_attempts = 0
            self.locked_until = None
            self.save(update_fields=['failed_login_attempts', 'locked_until'])

    def __str__(self):
        return f"{self.full_name} ({self.username}) - {self.get_role_display()} [{self.branch_name}]"


class Customer(models.Model):
    name = models.CharField(max_length=150)
    account_number = models.CharField(max_length=25, unique=True, db_index=True)
    cif_number = models.CharField(max_length=25, db_index=True)
    pan_number = models.CharField(max_length=20, blank=True, null=True, db_index=True)
    aadhaar_number = models.CharField(max_length=20, blank=True, null=True, db_index=True)
    mobile_number = models.CharField(max_length=15, db_index=True)
    branch = models.ForeignKey(BankBranch, on_delete=models.SET_NULL, null=True, blank=True, related_name='customers')
    branch_name = models.CharField(max_length=150, default='Head Office, Nashik')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tbl_customers'
        verbose_name = 'Bank Customer'
        verbose_name_plural = 'Bank Customers'

    def __str__(self):
        return f"{self.name} | Acc: {self.account_number} | CIF: {self.cif_number}"


class SMSConsent(models.Model):
    STATUS_CHOICES = [
        ('YES', 'YES (Consented to SMS alerts)'),
        ('NO', 'NO (Explicitly declined SMS alerts)'),
        ('PENDING', 'PENDING (Consent not yet submitted)'),
        ('REVOKED', 'REVOKED (Previously agreed, subsequently revoked)'),
    ]

    SOURCE_CHOICES = [
        ('ONLINE', 'Customer Online Self-Service'),
        ('PHYSICAL_OCR', 'Physical Scanned Paper Form (OCR Extraction)'),
        ('ADMIN_ENTRY', 'Branch Officer Manual Entry'),
    ]

    reference_number = models.CharField(max_length=64, unique=True, db_index=True)
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='consents')
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='PENDING', db_index=True)
    source = models.CharField(max_length=30, choices=SOURCE_CHOICES, default='ONLINE', db_index=True)
    
    # Customer and Branch snapshot for high performance search & reporting
    customer_name = models.CharField(max_length=150)
    account_number = models.CharField(max_length=25, db_index=True)
    cif_number = models.CharField(max_length=25, db_index=True)
    pan_number = models.CharField(max_length=20, blank=True, null=True, db_index=True)
    aadhaar_number = models.CharField(max_length=20, blank=True, null=True, db_index=True)
    mobile_number = models.CharField(max_length=15, db_index=True)
    branch_name = models.CharField(max_length=150, default='CBS Head Office, Nashik', db_index=True)
    
    signature_data = models.TextField(blank=True, null=True) # HTML5 Canvas Base64 or digital token
    form_date = models.DateField(default=timezone.now)
    form_place = models.CharField(max_length=100, default='Nashik')
    
    verified_by = models.CharField(max_length=150, blank=True, null=True)
    verified_at = models.DateTimeField(blank=True, null=True)
    
    cbs_updated = models.CharField(max_length=5, default='No', db_index=True)
    
    # Granular Processing Purpose Consents (RBI & DPDPA 2023)
    purpose_core = models.BooleanField(default=True)
    purpose_servicing = models.BooleanField(default=True)
    purpose_fraud = models.BooleanField(default=True)
    purpose_promotional = models.BooleanField(default=False)
    
    # Granular Delivery Channel Consents (TRAI DLT)
    channel_sms = models.BooleanField(default=True)
    channel_email = models.BooleanField(default=True)
    channel_voice = models.BooleanField(default=False)
    channel_whatsapp = models.BooleanField(default=False)
    
    # Third-Party Telecom DLT Vendor Data Processor Agreement (DPDPA Sec 6 & Rule 6(1)(i))
    share_dlt_partner = models.BooleanField(default=True)
    
    preferences_json = models.TextField(blank=True, null=True)

    ip_address = models.CharField(max_length=45, blank=True, null=True)
    user_agent = models.CharField(max_length=255, blank=True, null=True)
    
    submitted_at = models.DateTimeField(default=timezone.now, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tbl_sms_consents'
        verbose_name = 'SMS Consent'
        verbose_name_plural = 'SMS Consents'
        ordering = ['-submitted_at']

    # Backward compatibility properties
    @property
    def ref_no(self):
        return self.reference_number

    @property
    def consent_choice(self):
        if self.status == 'YES':
            return 'agree'
        elif self.status == 'NO':
            return 'disagree'
        return self.status.lower()

    @property
    def digital_signature(self):
        return self.signature_data

    @property
    def source_type(self):
        if self.source == 'ONLINE':
            return 'ONLINE_PORTAL'
        elif self.source == 'PHYSICAL_OCR':
            return 'PHYSICAL_SCAN_OCR'
        return self.source

    def __str__(self):
        return f"{self.reference_number} | {self.customer_name} | {self.status} ({self.source})"


# Alias for legacy compatibility
SMSConsentRecord = SMSConsent


class ConsentHistory(models.Model):
    consent = models.ForeignKey(SMSConsent, on_delete=models.CASCADE, related_name='history')
    previous_status = models.CharField(max_length=15, blank=True, null=True)
    new_status = models.CharField(max_length=15)
    source = models.CharField(max_length=30, default='ONLINE')
    changed_by = models.CharField(max_length=150, default='CUSTOMER')
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    reason = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'tbl_consent_history'
        verbose_name = 'Consent History Entry'
        verbose_name_plural = 'Consent History Entries'
        ordering = ['-timestamp']

    def __str__(self):
        return f"[{self.timestamp.strftime('%Y-%m-%d %H:%M')}] {self.consent.reference_number}: {self.previous_status} -> {self.new_status} by {self.changed_by}"


class PhysicalForm(models.Model):
    consent = models.ForeignKey(SMSConsent, on_delete=models.SET_NULL, null=True, blank=True, related_name='physical_forms')
    original_file = models.FileField(upload_to='physical_forms/%Y/%m/')
    filename = models.CharField(max_length=255)
    ocr_raw_text = models.TextField(blank=True, null=True)
    ocr_extracted_json = models.JSONField(blank=True, null=True)
    uploaded_by = models.CharField(max_length=150, default='BRANCH_OFFICER')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    verified_by = models.CharField(max_length=150, blank=True, null=True)
    verified_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'tbl_physical_forms'
        verbose_name = 'Physical Form'
        verbose_name_plural = 'Physical Forms'
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"Form: {self.filename} (Uploaded: {self.uploaded_at.strftime('%Y-%m-%d %H:%M')})"


class AuditLog(models.Model):
    user_id = models.CharField(max_length=50, blank=True, null=True)
    username = models.CharField(max_length=100, db_index=True)
    officer_role = models.CharField(max_length=40, blank=True, null=True)
    branch_name = models.CharField(max_length=150, db_index=True)
    action_type = models.CharField(max_length=60, db_index=True)
    entity_type = models.CharField(max_length=50, blank=True, null=True)
    entity_id = models.CharField(max_length=100, blank=True, null=True)
    action_details = models.TextField()
    account_no = models.CharField(max_length=25, blank=True, null=True)
    ref_no = models.CharField(max_length=64, blank=True, null=True)
    ip_address = models.CharField(max_length=45, blank=True, null=True)
    user_agent = models.CharField(max_length=255, blank=True, null=True)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'tbl_admin_audit_logs'
        verbose_name = 'Audit Log'
        verbose_name_plural = 'Audit Logs'
        ordering = ['-timestamp']

    def __str__(self):
        return f"[{self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}] {self.username} ({self.officer_role}) - {self.action_type}"


class TwoFactorChallenge(models.Model):
    """
    Temporary authentication challenge for mandatory 2-Step verification.
    Stores cryptographically salted hash of 6-digit OTP (never plaintext).
    """
    challenge_token = models.CharField(max_length=80, unique=True, db_index=True)
    officer = models.ForeignKey(BankOfficer, on_delete=models.CASCADE, related_name='two_factor_challenges')
    otp_hash = models.CharField(max_length=255) # PBKDF2/SHA256 salted hash of OTP
    delivery_channel = models.CharField(max_length=20, default='SMS') # SMS, TOTP, APP
    delivery_target = models.CharField(max_length=100, blank=True, null=True) # Masked phone or email
    attempts_count = models.IntegerField(default=0)
    resend_count = models.IntegerField(default=0)
    is_verified = models.BooleanField(default=False)
    is_invalidated = models.BooleanField(default=False)
    expires_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tbl_two_factor_challenges'
        verbose_name = '2FA Challenge'
        verbose_name_plural = '2FA Challenges'
        ordering = ['-created_at']

    def is_expired(self):
        return timezone.now() > self.expires_at

    def __str__(self):
        return f"2FA Challenge for {self.officer.username} (Expires: {self.expires_at.strftime('%H:%M:%S')})"


class OfficerSession(models.Model):
    """
    Authenticated cryptographic session token issued ONLY after successful 2FA.
    Enforces server-side session invalidation on logout and timeout.
    """
    session_token = models.CharField(max_length=120, unique=True, db_index=True)
    officer = models.ForeignKey(BankOfficer, on_delete=models.CASCADE, related_name='active_sessions')
    ip_address = models.CharField(max_length=45, blank=True, null=True)
    user_agent = models.CharField(max_length=255, blank=True, null=True)
    is_revoked = models.BooleanField(default=False, db_index=True)
    expires_at = models.DateTimeField(db_index=True)
    last_activity = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tbl_officer_sessions'
        verbose_name = 'Officer Session'
        verbose_name_plural = 'Officer Sessions'
        ordering = ['-created_at']

    def is_valid(self):
        return not self.is_revoked and timezone.now() < self.expires_at and self.officer.is_active and not self.officer.is_locked()

    def __str__(self):
        return f"Session: {self.officer.username} (Revoked: {self.is_revoked})"


# Alias for legacy compatibility
AdminAuditLog = AuditLog
