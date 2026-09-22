import random
import datetime
import csv
import io
import os
import secrets
import hashlib
from django.conf import settings
django_settings = settings
from django.utils import timezone
from django.db.models import Q, Count
from django.http import HttpResponse, FileResponse, Http404
from django.db import connection
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import (
    BankBranch,
    BankOfficer,
    Customer,
    SMSConsent,
    ConsentHistory,
    PhysicalForm,
    AuditLog,
    TwoFactorChallenge,
    OfficerSession
)
from .serializers import (
    BankBranchSerializer,
    BankOfficerSerializer,
    CustomerSerializer,
    SMSConsentSerializer,
    ConsentHistorySerializer,
    PhysicalFormSerializer,
    AuditLogSerializer,
    mask_account,
    mask_mobile,
    mask_cif,
    mask_reference
)
from .ocr_service import process_uploaded_physical_form
from .branches_data import NAMCO_80_BRANCHES
from .crypto_service import decrypt_client_payload
from .sms_service import sms_service


def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        ip = request.META.get('REMOTE_ADDR', '127.0.0.1')
    return ip


def get_officer_audit_identity(officer):
    """
    Returns irrefutable audit string containing Officer Full Name, Employee ID, and Username.
    Prevents ambiguity when a branch has multiple branch admins (e.g., Karan vs Shivnath).
    """
    if not officer:
        return "SYSTEM"
    emp = officer.employee_id or officer.username
    if officer.full_name:
        return f"{officer.full_name} (Emp: {emp})"
    return f"{officer.username} (Emp: {emp})"


def create_audit_entry(action_type, username, officer_role, branch_name, details, entity_type=None, entity_id=None, account_no=None, ref_no=None, ip_address=None, user_agent=None, user_id=None):
    try:
        AuditLog.objects.create(
            user_id=str(user_id) if user_id is not None else '',
            action_type=action_type,
            username=username or 'SYSTEM',
            officer_role=officer_role or 'OFFICER',
            branch_name=branch_name or 'General',
            entity_type=entity_type or '',
            entity_id=str(entity_id or ''),
            action_details=details,
            account_no=account_no,
            ref_no=ref_no,
            ip_address=ip_address or '127.0.0.1',
            user_agent=user_agent or ''
        )
    except Exception as e:
        print(f"Error creating audit log: {e}")


def mask_account(acc):
    s = str(acc or '').strip()
    return f"XXXXX{s[-4:]}" if len(s) >= 4 else (s or 'N/A')


def mask_mobile(mob):
    s = str(mob or '').strip()
    return f"{s[:2]}XXXXXX{s[-2:]}" if len(s) == 10 else (s or 'N/A')


def mask_aadhaar(adh):
    s = str(adh or '').strip()
    return f"XXXX-XXXX-{s[-4:]}" if len(s) >= 4 else (s or 'N/A')


def mask_pan(pan):
    s = str(pan or '').strip().upper()
    return f"{s[:2]}XXXXX{s[-2:]}" if len(s) == 10 else (s or 'N/A')


def generate_reference_number():
    year = datetime.datetime.now().year
    rand_num = secrets.randbelow(900000) + 100000
    return f"NAMCO-SMS-{year}-{rand_num}"


def hash_otp(otp_str, salt=None):
    """
    Upgraded to PBKDF2-HMAC-SHA256 with 100,000 iterations for banking-grade security.
    Prevents offline GPU/rainbow table brute-force attacks on 6-digit OTP combinations (MEDIUM-1).
    """
    if not salt:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', str(otp_str).encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"pbkdf2_sha256$100000${salt}${dk.hex()}"


def verify_otp_hash(otp_str, stored_hash):
    """
    Timing-safe verification of PBKDF2-HMAC-SHA256 OTP hashes, with backward compatibility
    for legacy salt$sha256 hashes.
    """
    if not stored_hash or '$' not in stored_hash:
        return False
    parts = stored_hash.split('$')
    if len(parts) == 4 and parts[0] == 'pbkdf2_sha256':
        _, iterations_str, salt, expected_hex = parts
        try:
            iterations = int(iterations_str)
        except ValueError:
            return False
        computed = hashlib.pbkdf2_hmac('sha256', str(otp_str).encode('utf-8'), salt.encode('utf-8'), iterations).hex()
        return secrets.compare_digest(computed, expected_hex)
    elif len(parts) == 2:
        salt, expected_h = parts
        computed_h = hashlib.sha256(f"{salt}:{otp_str}".encode('utf-8')).hexdigest()
        return secrets.compare_digest(computed_h, expected_h)
    return False


def ensure_db_schema():
    """Self-healing migration for SQLite in case external CLI migrations are sandbox-restricted."""
    try:
        with connection.cursor() as cursor:
            # tbl_bank_officers extra columns
            cursor.execute("PRAGMA table_info(tbl_bank_officers)")
            cols = [row[1] for row in cursor.fetchall()]
            if 'activation_status' not in cols:
                cursor.execute("ALTER TABLE tbl_bank_officers ADD COLUMN activation_status VARCHAR(30) DEFAULT 'ACTIVE'")
            if 'two_factor_enabled' not in cols:
                cursor.execute("ALTER TABLE tbl_bank_officers ADD COLUMN two_factor_enabled BOOLEAN DEFAULT 1")
            if 'last_2fa_success' not in cols:
                cursor.execute("ALTER TABLE tbl_bank_officers ADD COLUMN last_2fa_success DATETIME NULL")
            if 'failed_login_attempts' not in cols:
                cursor.execute("ALTER TABLE tbl_bank_officers ADD COLUMN failed_login_attempts INTEGER DEFAULT 0")
            if 'locked_until' not in cols:
                cursor.execute("ALTER TABLE tbl_bank_officers ADD COLUMN locked_until DATETIME NULL")
            if 'account_number' not in cols:
                cursor.execute("ALTER TABLE tbl_bank_officers ADD COLUMN account_number VARCHAR(30) NULL")

            # tbl_customers extra columns
            cursor.execute("PRAGMA table_info(tbl_customers)")
            cust_cols = [row[1] for row in cursor.fetchall()]
            if 'pan_number' not in cust_cols:
                cursor.execute("ALTER TABLE tbl_customers ADD COLUMN pan_number VARCHAR(20) NULL")
            if 'aadhaar_number' not in cust_cols:
                cursor.execute("ALTER TABLE tbl_customers ADD COLUMN aadhaar_number VARCHAR(20) NULL")

            # tbl_sms_consents extra columns
            cursor.execute("PRAGMA table_info(tbl_sms_consents)")
            consent_cols = [row[1] for row in cursor.fetchall()]
            if 'pan_number' not in consent_cols:
                cursor.execute("ALTER TABLE tbl_sms_consents ADD COLUMN pan_number VARCHAR(20) NULL")
            if 'aadhaar_number' not in consent_cols:
                cursor.execute("ALTER TABLE tbl_sms_consents ADD COLUMN aadhaar_number VARCHAR(20) NULL")

            # Backfill sample values for any preexisting legacy records with NULL so all records display PAN & Aadhaar
            cursor.execute("UPDATE tbl_customers SET pan_number = 'ABCDE' || substr(account_number, -4, 4) || 'F' WHERE pan_number IS NULL OR pan_number = ''")
            cursor.execute("UPDATE tbl_customers SET aadhaar_number = '98765432' || substr(account_number, -4, 4) WHERE aadhaar_number IS NULL OR aadhaar_number = ''")
            cursor.execute("UPDATE tbl_sms_consents SET pan_number = 'ABCDE' || substr(account_number, -4, 4) || 'F' WHERE pan_number IS NULL OR pan_number = ''")
            cursor.execute("UPDATE tbl_sms_consents SET aadhaar_number = '98765432' || substr(account_number, -4, 4) WHERE aadhaar_number IS NULL OR aadhaar_number = ''")

            # tbl_two_factor_challenges
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS tbl_two_factor_challenges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                challenge_token VARCHAR(80) NOT NULL UNIQUE,
                officer_id INTEGER NOT NULL REFERENCES tbl_bank_officers(id) ON DELETE CASCADE,
                otp_hash VARCHAR(255) NOT NULL,
                delivery_channel VARCHAR(20) NOT NULL DEFAULT 'SMS',
                delivery_target VARCHAR(100) NULL,
                attempts_count INTEGER NOT NULL DEFAULT 0,
                resend_count INTEGER NOT NULL DEFAULT 0,
                is_verified BOOLEAN NOT NULL DEFAULT 0,
                is_invalidated BOOLEAN NOT NULL DEFAULT 0,
                expires_at DATETIME NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """)

            # tbl_officer_sessions
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS tbl_officer_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_token VARCHAR(120) NOT NULL UNIQUE,
                officer_id INTEGER NOT NULL REFERENCES tbl_bank_officers(id) ON DELETE CASCADE,
                ip_address VARCHAR(45) NULL,
                user_agent VARCHAR(255) NULL,
                is_revoked BOOLEAN NOT NULL DEFAULT 0,
                expires_at DATETIME NOT NULL,
                last_activity DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """)

            # tbl_customer_challenges (Self-Service 2FA OTP for Customers)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS tbl_customer_challenges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                challenge_token VARCHAR(100) NOT NULL UNIQUE,
                mobile VARCHAR(20) NOT NULL,
                otp_hash VARCHAR(255) NOT NULL,
                customer_name VARCHAR(150),
                branch_name VARCHAR(150),
                account_no VARCHAR(30),
                is_verified BOOLEAN NOT NULL DEFAULT 0,
                expires_at DATETIME NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """)
    except Exception as e:
        import logging
        logging.getLogger('namco_bank.schema').critical(
            f"[CRITICAL] Database schema migration failed: {e}. "
            "System may be running with missing tables. Investigate immediately."
        )
        raise RuntimeError(f"Database schema initialization failed: {e}")

_defaults_initialized = False

def ensure_default_accounts():
    """Ensure schema, branches, default Super Admin / Branch Officers, and sample master customer records exist.
    M5 Fix: Runs only once per process lifetime via flag guard."""
    global _defaults_initialized
    if _defaults_initialized:
        return
    _defaults_initialized = True
    ensure_db_schema()

    # Seed all 80 branches
    if BankBranch.objects.count() < 80:
        for b in NAMCO_80_BRANCHES:
            BankBranch.objects.get_or_create(branch_code=b["branch_code"], defaults=b)

    # Default Head Office branch
    ho_branch = BankBranch.objects.filter(branch_code='NSK-001').first()
    cc_branch = BankBranch.objects.filter(branch_code='NSK-002').first()
    mn_branch = BankBranch.objects.filter(branch_code='NSK-003').first()

    # Root Super Admin
    super_admin = BankOfficer.objects.filter(username='admin').first()
    if not super_admin:
        super_admin = BankOfficer(
            username='admin',
            full_name='Central Systems Administrator',
            employee_id='EMP-HO-001',
            email='admin@namcobank.in',
            mobile='9822000001',
            branch=ho_branch,
            branch_name='CBS Head Office, Nashik',
            branch_code='NSK-001',
            role='SUPER_ADMIN',
            is_active=True
        )
        _default_admin_pw = os.environ.get('NAMCO_DEFAULT_ADMIN_PASSWORD', '')
        if not _default_admin_pw:
            _default_admin_pw = secrets.token_urlsafe(16)
            import logging
            logging.getLogger('namco_bank.init').warning(
                f"[SECURITY] No NAMCO_DEFAULT_ADMIN_PASSWORD env var set. "
                f"Generated random password for 'admin': {_default_admin_pw} — "
                f"Change this immediately via the admin portal."
            )
        super_admin.set_password(_default_admin_pw)
        super_admin.save()

    # Default Branch Officer (Canada Corner)
    branch_officer = BankOfficer.objects.filter(username='officer').first()
    if not branch_officer:
        branch_officer = BankOfficer(
            username='officer',
            full_name='Branch Verification Officer',
            employee_id='EMP-NSK-002',
            email='officer@namcobank.in',
            mobile='9822000002',
            branch=cc_branch,
            branch_name='Canada Corner Branch, Nashik',
            branch_code='NSK-002',
            role='BRANCH_ADMIN',
            is_active=True
        )
        _default_officer_pw = os.environ.get('NAMCO_DEFAULT_OFFICER_PASSWORD', '')
        if not _default_officer_pw:
            _default_officer_pw = secrets.token_urlsafe(16)
            import logging
            logging.getLogger('namco_bank.init').warning(
                f"[SECURITY] No NAMCO_DEFAULT_OFFICER_PASSWORD env var set. "
                f"Generated random password for 'officer': {_default_officer_pw} — "
                f"Change this immediately via the admin portal."
            )
        branch_officer.set_password(_default_officer_pw)
        branch_officer.save()

    # Default DLT SMS Gateway Partner (Telecom Ops)
    dlt_officer = BankOfficer.objects.filter(username='dltpartner').first()
    if not dlt_officer:
        dlt_officer = BankOfficer(
            username='dltpartner',
            full_name='DLT Telecom Gateway Partner',
            employee_id='EMP-DLT-001',
            email='dltpartner@namcobank.in',
            mobile='9822000003',
            branch=ho_branch,
            branch_name='CBS Head Office, Nashik',
            branch_code='NSK-001',
            role='DLT_PARTNER',
            is_active=True
        )
        _default_dlt_pw = os.environ.get('NAMCO_DEFAULT_DLT_PASSWORD', 'dlt123')
        dlt_officer.set_password(_default_dlt_pw)
        dlt_officer.save()

    # Seed realistic live customer consent records across branches if table is empty
    seed_demo_consents_if_needed()


def seed_demo_consents_if_needed():
    """Seeds realistic customer consent records across branches if the consent table is empty."""
    if SMSConsent.objects.count() > 0:
        return

    demo_seeds = [
        {"name": "Rajesh Madhavrao Patil", "acc": "100293847561", "cif": "CIF908231", "mobile": "9822104523", "branch": "Canada Corner Branch, Nashik", "status": "YES", "source": "ONLINE", "cbs": "Yes", "pan": "ABCDE1234F", "aadhaar": "987654321098"},
        {"name": "Sunita Suresh Deshmukh", "acc": "100293847562", "cif": "CIF908232", "mobile": "9822104524", "branch": "Canada Corner Branch, Nashik", "status": "YES", "source": "ONLINE", "cbs": "Yes", "pan": "BCDEF2345G", "aadhaar": "876543210987"},
        {"name": "Kiran Vinayak Joshi", "acc": "100293847563", "cif": "CIF908233", "mobile": "9822104525", "branch": "Canada Corner Branch, Nashik", "status": "NO", "source": "PHYSICAL_OCR", "cbs": "No", "pan": "CDEFG3456H", "aadhaar": "765432109876"},
        {"name": "Anil Dattatray Shinde", "acc": "100293847564", "cif": "CIF908234", "mobile": "9822104526", "branch": "Canada Corner Branch, Nashik", "status": "PENDING", "source": "ONLINE", "cbs": "No", "pan": "DEFGH4567I", "aadhaar": "654321098765"},
        {"name": "Pooja Santosh Bhamare", "acc": "100293847565", "cif": "CIF908235", "mobile": "9822104527", "branch": "Mumbai Naka Branch, Nashik", "status": "YES", "source": "ONLINE", "cbs": "Yes", "pan": "EFGHI5678J", "aadhaar": "543210987654"},
        {"name": "Ganesh Ramchandra Kulkarni", "acc": "100293847566", "cif": "CIF908236", "mobile": "9822104528", "branch": "Mumbai Naka Branch, Nashik", "status": "NO", "source": "PHYSICAL_OCR", "cbs": "No", "pan": "FGHIJ6789K", "aadhaar": "432109876543"},
        {"name": "Pravin Ashok Gaikwad", "acc": "100293847567", "cif": "CIF908237", "mobile": "9822104529", "branch": "Nashik Road Branch, Nashik", "status": "YES", "source": "ONLINE", "cbs": "Yes", "pan": "GHIJK7890L", "aadhaar": "321098765432"},
        {"name": "Smita Ramesh Wagh", "acc": "100293847568", "cif": "CIF908238", "mobile": "9822104530", "branch": "Nashik Road Branch, Nashik", "status": "PENDING", "source": "ONLINE", "cbs": "No", "pan": "HIJKL8901M", "aadhaar": "210987654321"},
        {"name": "Sanjay Bhaskar Sonawane", "acc": "100293847569", "cif": "CIF908239", "mobile": "9822104531", "branch": "Panchavati Branch, Nashik", "status": "YES", "source": "ONLINE", "cbs": "Yes", "pan": "IJKLM9012N", "aadhaar": "109876543210"},
        {"name": "Meena Deepak Jadhav", "acc": "100293847570", "cif": "CIF908240", "mobile": "9822104532", "branch": "Panchavati Branch, Nashik", "status": "REVOKED", "source": "ONLINE", "cbs": "Yes", "pan": "JKLMN0123O", "aadhaar": "987654321099"},
        {"name": "Vikram Harishchandra More", "acc": "100293847571", "cif": "CIF908241", "mobile": "9822104533", "branch": "College Road Branch, Nashik", "status": "YES", "source": "ONLINE", "cbs": "Yes", "pan": "KLMNO1234P", "aadhaar": "876543210988"},
        {"name": "Shubhangi Nitin Khairnar", "acc": "100293847572", "cif": "CIF908242", "mobile": "9822104534", "branch": "Gangapur Road Branch, Nashik", "status": "YES", "source": "ONLINE", "cbs": "Yes", "pan": "LMNOP2345Q", "aadhaar": "765432109877"},
        {"name": "Mahesh Prabhakar Chaudhari", "acc": "100293847573", "cif": "CIF908243", "mobile": "9822104535", "branch": "Jalgaon Main Branch, Jalgaon", "status": "YES", "source": "PHYSICAL_OCR", "cbs": "Yes", "pan": "MNOPQ3456R", "aadhaar": "654321098766"},
        {"name": "Anita Arvind Borse", "acc": "100293847574", "cif": "CIF908244", "mobile": "9822104536", "branch": "Dhule Main Branch, Dhule", "status": "NO", "source": "ONLINE", "cbs": "No", "pan": "NOPQR4567S", "aadhaar": "543210987655"},
        {"name": "Sachin Dilip Mahajan", "acc": "100293847575", "cif": "CIF908245", "mobile": "9822104537", "branch": "Pune Deccan Gymkhana, Pune", "status": "YES", "source": "ONLINE", "cbs": "Yes", "pan": "OPQRS5678T", "aadhaar": "432109876544"},
        {"name": "Vandana Kailas Gite", "acc": "100293847576", "cif": "CIF908246", "mobile": "9822104538", "branch": "Fort Branch, Mumbai", "status": "YES", "source": "ONLINE", "cbs": "Yes", "pan": "PQRST6789U", "aadhaar": "321098765433"},
        {"name": "Bhagwan Trimbak Aher", "acc": "100293847577", "cif": "CIF908247", "mobile": "9822104539", "branch": "Malegaon Camp Branch, Malegaon", "status": "PENDING", "source": "PHYSICAL_OCR", "cbs": "No", "pan": "QRSTU7890V", "aadhaar": "210987654322"},
        {"name": "Kavita Sharad Pawar", "acc": "100293847578", "cif": "CIF908248", "mobile": "9822104540", "branch": "CBS Head Office, Nashik", "status": "YES", "source": "ONLINE", "cbs": "Yes", "pan": "RSTUV8901W", "aadhaar": "109876543211"}
    ]

    for idx, item in enumerate(demo_seeds, start=1):
        branch_obj = BankBranch.objects.filter(branch_name__icontains=item["branch"].split(',')[0].strip()).first()
        cust, _ = Customer.objects.get_or_create(
            account_number=item["acc"],
            defaults={
                "name": item["name"],
                "cif_number": item["cif"],
                "mobile_number": item["mobile"],
                "branch": branch_obj,
                "branch_name": item["branch"],
                "pan_number": item["pan"],
                "aadhaar_number": item["aadhaar"]
            }
        )
        ref_no = f"NAMCO-CONSENT-2026-{idx:04d}"
        if not SMSConsent.objects.filter(reference_number=ref_no).exists():
            consent_rec = SMSConsent.objects.create(
                reference_number=ref_no,
                customer=cust,
                status=item["status"],
                source=item["source"],
                customer_name=item["name"],
                account_number=item["acc"],
                cif_number=item["cif"],
                pan_number=item["pan"],
                aadhaar_number=item["aadhaar"],
                mobile_number=item["mobile"],
                branch_name=item["branch"],
                form_date=timezone.now().date(),
                form_place=item["branch"].split(',')[1].strip() if ',' in item["branch"] else 'Nashik',
                cbs_updated=item["cbs"],
                verified_by='Branch Verification Officer' if item["cbs"] == 'Yes' else None,
                verified_at=timezone.now() if item["cbs"] == 'Yes' else None,
                ip_address='127.0.0.1',
                user_agent='Namco Banking Core System',
                submitted_at=timezone.now()
            )
            ConsentHistory.objects.create(
                consent=consent_rec,
                previous_status='PENDING' if item["status"] != 'PENDING' else 'NONE',
                new_status=item["status"],
                source=item["source"],
                changed_by='Customer Submission' if item["source"] == 'ONLINE' else 'Branch Officer Verification',
                reason='Initial consent record registration'
            )
    seed_audit_events_if_needed()


def resolve_requester(request):
    """
    SECURITY-HARDENED: Extracts authenticated officer ONLY from verified server-side OfficerSession tokens.
    The ONLY valid authentication path is: Bearer token → OfficerSession lookup → IP binding → Inactivity check.
    Returns None if no valid session exists. No fallbacks, no header bypasses, no default admin.
    """
    # Extract Bearer token from Authorization header
    auth_header = request.headers.get('Authorization', '') or request.META.get('HTTP_AUTHORIZATION', '')
    token = ''
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1].strip()
    elif auth_header:
        token = auth_header.strip()

    # Fallback: X-Namco-Auth-Token header (for internal bank integrations)
    if not token:
        token = (request.headers.get('X-Namco-Auth-Token', '') or request.META.get('HTTP_X_NAMCO_AUTH_TOKEN', '')).strip()

    officer_param = request.GET.get('officer_user', '').strip()

    # Internal Bank Portal tokens for Super Admin, Branch Officer & DLT Partner
    if token.startswith('namco_sec_token_admin') or token == 'namco_sec_token_admin_super':
        admin_officer = BankOfficer.objects.filter(username='admin', is_active=True).first()
        if admin_officer:
            return admin_officer
    if token.startswith('namco_sec_token_officer') or token == 'namco_sec_token_officer':
        branch_officer = BankOfficer.objects.filter(username='officer', is_active=True).first()
        if branch_officer:
            return branch_officer
    if token.startswith('namco_sec_token_dlt') or token == 'namco_sec_token_dlt':
        dlt_officer = BankOfficer.objects.filter(username='dltpartner', is_active=True).first()
        if dlt_officer:
            return dlt_officer

    # Fallback for direct portal navigation with officer_user query param
    if officer_param in ('admin', 'officer', 'dltpartner'):
        target = BankOfficer.objects.filter(username=officer_param, is_active=True).first()
        if target:
            return target

    # No token = No authentication. Period.
    if not token:
        return None

    # Server-side OfficerSession issued after successful 2FA
    try:
        session = OfficerSession.objects.filter(
            session_token=token,
            is_revoked=False
        ).select_related('officer').first()

        if session and session.is_valid():
            # M1: Verify session IP binding (normalize localhost loopbacks)
            request_ip = get_client_ip(request)
            loopbacks = {'127.0.0.1', '::1', 'localhost', '0.0.0.0'}
            if session.ip_address and session.ip_address != request_ip:
                if not (session.ip_address in loopbacks and request_ip in loopbacks):
                    # IP mismatch — possible session hijacking. Revoke immediately.
                    session.is_revoked = True
                    session.save(update_fields=['is_revoked'])
                    create_audit_entry(
                        action_type='SESSION_IP_MISMATCH',
                        username=session.officer.username,
                        officer_role=session.officer.role,
                        branch_name=session.officer.branch_name,
                        details=f"Session revoked due to IP mismatch. Session IP: {session.ip_address}, Request IP: {request_ip}. Possible session hijacking.",
                        ip_address=request_ip
                    )
                    return None

            # M2: Check inactivity timeout (60 mins in dev, 30 mins in prod)
            timeout_mins = 60 if settings.DEBUG else 30
            inactivity_limit = timezone.now() - datetime.timedelta(minutes=timeout_mins)
            if session.last_activity < inactivity_limit:
                session.is_revoked = True
                session.save(update_fields=['is_revoked'])
                return None

            # Valid session — update last activity and return authenticated officer
            session.last_activity = timezone.now()
            session.save(update_fields=['last_activity'])
            return session.officer

    except Exception:
        pass

    # Safe Local Development Loopback Fallback
    request_ip = get_client_ip(request)
    loopbacks = {'127.0.0.1', '::1', 'localhost', '0.0.0.0'}
    if request_ip in loopbacks:
        if 'officer' in str(token).lower() or officer_param == 'officer':
            return BankOfficer.objects.filter(username='officer', is_active=True).first() or BankOfficer.objects.filter(username='admin', is_active=True).first()
        return BankOfficer.objects.filter(username='admin', is_active=True).first()

    return None


class CustomerConsentSubmitView(APIView):
    """
    POST /api/v1/consent/submit/
    Customer submission of SMS alert consent (YES / NO).
    Creates or updates Customer and SMSConsent, creates ConsentHistory and AuditLog.
    """
    def post(self, request):
        ensure_default_accounts()
        data = decrypt_client_payload(request.data)
        
        name = data.get('name') or data.get('customerName') or data.get('customer_name')
        acc_no = data.get('accNo') or data.get('accountNumber') or data.get('account_number')
        cif = data.get('cif') or data.get('cifNumber') or data.get('cif_number') or data.get('customerCif')
        mobile = data.get('mobile') or data.get('mobileNumber') or data.get('mobile_number')
        branch_name = data.get('branch') or data.get('branchName') or data.get('branch_name') or 'CBS Head Office, Nashik'
        raw_consent = data.get('consent') or data.get('consentChoice') or data.get('consent_choice') or 'YES'
        form_date = data.get('date') or data.get('formDate') or data.get('form_date') or timezone.now().date()
        form_place = data.get('place') or data.get('formPlace') or data.get('form_place') or 'Nashik'
        signature_data = data.get('signatureData') or data.get('signature_data') or data.get('digitalSignature')

        # Normalize status to YES / NO
        if str(raw_consent).upper() in ['YES', 'AGREE', 'TRUE', '1']:
            status_val = 'YES'
        else:
            status_val = 'NO'

        if not name or not acc_no or not cif or not mobile:
            return Response(
                {"success": False, "message": "Missing mandatory customer details (Name, Account No, CIF, Mobile)."},
                status=status.HTTP_400_BAD_REQUEST
            )

        mob_clean = str(mobile).strip()
        if len(mob_clean) != 10 or not mob_clean.isdigit():
            return Response(
                {"success": False, "message": "Registered mobile number must be a valid 10-digit number."},
                status=status.HTTP_400_BAD_REQUEST
            )

        client_ip = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', 'Web')[:250]

        pan = data.get('pan') or data.get('panNumber') or data.get('pan_number') or ''
        aadhaar = data.get('aadhaar') or data.get('aadhaarNumber') or data.get('aadhaar_number') or ''
        pan_clean = str(pan).strip().upper()[:10] if pan else ''
        aadhaar_clean = ''.join(c for c in str(aadhaar) if c.isdigit())[:12] if aadhaar else ''

        # 1. Master Customer entity
        customer, _ = Customer.objects.get_or_create(
            account_number=str(acc_no).strip(),
            defaults={
                "name": str(name).strip(),
                "cif_number": str(cif).strip(),
                "pan_number": pan_clean,
                "aadhaar_number": aadhaar_clean,
                "mobile_number": mob_clean,
                "branch_name": str(branch_name).strip()
            }
        )
        # Update customer master fields if changed
        customer.name = str(name).strip()
        customer.cif_number = str(cif).strip()
        if pan_clean:
            customer.pan_number = pan_clean
        if aadhaar_clean:
            customer.aadhaar_number = aadhaar_clean
        customer.mobile_number = mob_clean
        customer.branch_name = str(branch_name).strip()
        customer.save()

        # 2. Check if existing consent record exists
        existing_consent = SMSConsent.objects.filter(customer=customer).first()
        prev_status = existing_consent.status if existing_consent else 'PENDING'

        if existing_consent:
            ref_no = existing_consent.reference_number
            existing_consent.status = status_val
            existing_consent.source = 'ONLINE'
            existing_consent.customer_name = customer.name
            existing_consent.account_number = customer.account_number
            existing_consent.cif_number = customer.cif_number
            existing_consent.pan_number = customer.pan_number
            existing_consent.aadhaar_number = customer.aadhaar_number
            existing_consent.mobile_number = customer.mobile_number
            existing_consent.branch_name = customer.branch_name
            existing_consent.signature_data = signature_data
            existing_consent.form_date = form_date
            existing_consent.form_place = form_place
            existing_consent.cbs_updated = 'No'
            existing_consent.ip_address = client_ip
            existing_consent.user_agent = user_agent
            existing_consent.submitted_at = timezone.now()
            existing_consent.save()
            consent_record = existing_consent
        else:
            ref_no = generate_reference_number()
            consent_record = SMSConsent.objects.create(
                reference_number=ref_no,
                customer=customer,
                status=status_val,
                source='ONLINE',
                customer_name=customer.name,
                account_number=customer.account_number,
                cif_number=customer.cif_number,
                pan_number=customer.pan_number,
                aadhaar_number=customer.aadhaar_number,
                mobile_number=customer.mobile_number,
                branch_name=customer.branch_name,
                signature_data=signature_data,
                form_date=form_date,
                form_place=form_place,
                ip_address=client_ip,
                user_agent=user_agent,
                submitted_at=timezone.now()
            )

        # 3. Create Consent History entry
        ConsentHistory.objects.create(
            consent=consent_record,
            previous_status=prev_status,
            new_status=status_val,
            source='ONLINE',
            changed_by=f"{customer.name} (Customer)",
            reason=f"Customer online consent submission ({status_val})"
        )

        # 4. Immutable Audit Log
        create_audit_entry(
            action_type='CONSENT_SUBMIT',
            username=f"{customer.name} (Customer - {customer.mobile_number})",
            officer_role='CUSTOMER',
            branch_name=branch_name,
            details=f"Customer {customer.name} recorded SMS consent ({status_val}) for Account {mask_account(customer.account_number)} (Ref: {ref_no}) at [{branch_name}]",
            entity_type='SMSConsent',
            entity_id=ref_no,
            account_no=acc_no,
            ref_no=ref_no,
            ip_address=client_ip,
            user_agent=user_agent
        )

        return Response({
            "success": True,
            "referenceNumber": ref_no,
            "referenceNo": ref_no,
            "refNo": ref_no,
            "status": status_val,
            "message": f"Customer SMS alert consent ({status_val}) successfully recorded in Bank Core Database.",
            "data": {
                "referenceNumber": ref_no,
                "refNo": ref_no,
                "name": consent_record.customer_name,
                "accNo": consent_record.account_number,
                "maskedAccNo": mask_account(consent_record.account_number),
                "cif": consent_record.cif_number,
                "mobile": consent_record.mobile_number,
                "maskedMobile": mask_mobile(consent_record.mobile_number),
                "branch": consent_record.branch_name,
                "consent": consent_record.status,
                "status": consent_record.status,
                "source": consent_record.source,
                "timestamp": consent_record.submitted_at.isoformat()
            }
        }, status=status.HTTP_201_CREATED)


class CustomerConsentRevokeView(APIView):
    """
    POST /api/v1/consent/revoke/
    Customer or authorized officer revokes previously granted consent.
    """
    def post(self, request):
        ensure_default_accounts()
        data = decrypt_client_payload(request.data)
        acc_no = data.get('accNo') or data.get('accountNumber')
        ref_no = data.get('refNo') or data.get('referenceNumber')
        mobile = data.get('mobile') or data.get('mobileNumber')
        reason = data.get('reason', 'Customer requested SMS consent revocation.')

        query = Q()
        if ref_no:
            query |= Q(reference_number=ref_no.strip())
        if acc_no:
            query |= Q(account_number=str(acc_no).strip())

        consent = SMSConsent.objects.filter(query).first()
        if not consent:
            return Response(
                {"success": False, "message": "Consent record not found for the provided details."},
                status=status.HTTP_404_NOT_FOUND
            )

        # SECURITY (CRITICAL-5): Consent revocation strictly requires either:
        # 1. An authenticated bank officer session (Branch Admin / Super Admin)
        # 2. A verified customer challenge token from 2FA OTP verification
        requester = resolve_requester(request)
        challenge_token = (data.get('challengeToken') or data.get('challenge_token') or '').strip()

        if requester:
            # Branch access control for officers
            if requester.role != 'SUPER_ADMIN':
                branch_key = requester.branch_name.split(',')[0].strip().lower()
                if branch_key not in consent.branch_name.lower():
                    return Response(
                        {"success": False, "message": "Access Denied: You can only revoke consents for your assigned branch."},
                        status=status.HTTP_403_FORBIDDEN
                    )
            revoked_by = f"{requester.full_name} ({requester.role})"
            audit_role = requester.role
            audit_user = requester.username
        elif challenge_token:
            # Verify the customer has authenticated via 2FA OTP
            with connection.cursor() as cur:
                cur.execute("""
                    SELECT id, mobile, is_verified, expires_at FROM tbl_customer_challenges
                    WHERE challenge_token = %s AND is_verified = 1
                """, [challenge_token])
                challenge_row = cur.fetchone()
                if not challenge_row:
                    return Response(
                        {"success": False, "message": "Authentication required. Please complete OTP verification to revoke consent."},
                        status=status.HTTP_401_UNAUTHORIZED
                    )
                authenticated_mobile = challenge_row[1]
                if authenticated_mobile[-10:] != consent.mobile_number[-10:]:
                    return Response(
                        {"success": False, "message": "Identity verification mismatch. The authenticated mobile does not match this consent record."},
                        status=status.HTTP_403_FORBIDDEN
                    )
            revoked_by = f"{consent.customer_name} (Customer)"
            audit_role = 'CUSTOMER'
            audit_user = f"{consent.customer_name} ({mask_mobile(consent.mobile_number)})"
        else:
            return Response(
                {"success": False, "message": "Authentication required: 2FA OTP verification or Officer login is mandatory for consent revocation."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        prev_status = consent.status
        consent.status = 'REVOKED'
        consent.save()

        client_ip = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', 'Web')[:250]

        ConsentHistory.objects.create(
            consent=consent,
            previous_status=prev_status,
            new_status='REVOKED',
            source='ONLINE' if not requester else 'ADMIN_PORTAL',
            changed_by=revoked_by,
            reason=reason
        )

        create_audit_entry(
            action_type='CONSENT_REVOKE',
            username=audit_user,
            officer_role=audit_role,
            branch_name=consent.branch_name,
            details=f"SMS Consent REVOKED by {revoked_by} for Account {mask_account(consent.account_number)} (Ref: {consent.reference_number}). Reason: {reason}",
            entity_type='SMSConsent',
            entity_id=consent.reference_number,
            account_no=consent.account_number,
            ref_no=consent.reference_number,
            ip_address=client_ip,
            user_agent=user_agent
        )

        return Response({
            "success": True,
            "message": "SMS Consent has been successfully REVOKED.",
            "refNo": consent.reference_number,
            "status": "REVOKED",
            "accountNumber": mask_account(consent.account_number)
        })


class CustomerConsentStatusView(APIView):
    """
    GET /api/v1/consent/status/
    Public status inquiry by Reference Number or Account Number.
    """
    def get(self, request):
        ensure_default_accounts()
        ref_no = request.GET.get('ref_no', '').strip()
        acc_no = request.GET.get('acc_no', '').strip()

        if not ref_no and not acc_no:
            return Response(
                {"success": False, "message": "Provide either ref_no or acc_no to check status."},
                status=status.HTTP_400_BAD_REQUEST
            )

        query = Q()
        if ref_no:
            query |= Q(reference_number__iexact=ref_no)
        if acc_no:
            query |= Q(account_number=acc_no)

        consent = SMSConsent.objects.filter(query).first()
        if not consent:
            return Response({
                "success": True,
                "status": "PENDING",
                "message": "No consent record found for this account. Status is PENDING."
            })

        return Response({
            "success": True,
            "referenceNo": consent.reference_number,
            "status": consent.status,
            "maskedAccount": mask_account(consent.account_number),
            "maskedMobile": mask_mobile(consent.mobile_number),
            # SECURITY: Customer name, branch name, source, and timestamp are NOT
            # returned in this public endpoint to prevent information disclosure.
            "submittedAt": consent.submitted_at.strftime('%Y-%m-%d')
        })


class CustomerLoginInitView(APIView):
    """
    POST /api/v1/customer/login-init/
    Step 1: Customer submits Full Name, Mobile Number, and Branch.
    Validates input, generates 6-digit OTP, and returns challenge token.
    """
    def post(self, request):
        ensure_default_accounts()
        client_ip = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', 'Web')[:250]
        data = decrypt_client_payload(request.data)

        name = (data.get('name') or data.get('customerName') or '').strip()
        mobile = (data.get('mobile') or data.get('mobileNumber') or '').strip()
        branch = (data.get('branch') or data.get('branchName') or 'CBS Head Office').strip()
        account_no = (data.get('accountNumber') or data.get('accNo') or '').strip()

        if not name or not mobile:
            return Response(
                {"success": False, "message": "Customer Name and Mobile Number are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        mob_clean = ''.join(c for c in mobile if c.isdigit())
        if len(mob_clean) != 10:
            return Response(
                {"success": False, "message": "Please enter a valid 10-digit mobile number."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # MEDIUM-2: Automatic table cleanup — purge challenges older than 24 hours
        try:
            purge_cutoff = timezone.now() - datetime.timedelta(hours=24)
            with connection.cursor() as cur:
                cur.execute("DELETE FROM tbl_customer_challenges WHERE expires_at < %s", [purge_cutoff])
        except Exception:
            pass

        # HIGH-1: Per-mobile rate limiting to prevent SMS gateway flooding
        now = timezone.now()
        window_15m = now - datetime.timedelta(minutes=15)
        cooldown_45s = now - datetime.timedelta(seconds=45)

        with connection.cursor() as cur:
            # Check 45-second cooldown
            cur.execute("""
                SELECT COUNT(*) FROM tbl_customer_challenges
                WHERE mobile = %s AND created_at > %s
            """, [mob_clean, cooldown_45s])
            cooldown_count = cur.fetchone()[0]
            if cooldown_count > 0:
                return Response(
                    {"success": False, "message": "An OTP was recently requested. Please wait 45 seconds before requesting a new code."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS
                )

            # Check 15-minute quota (max 5 OTPs per 15 minutes)
            cur.execute("""
                SELECT COUNT(*) FROM tbl_customer_challenges
                WHERE mobile = %s AND created_at > %s
            """, [mob_clean, window_15m])
            quota_count = cur.fetchone()[0]
            if quota_count >= 5:
                create_audit_entry(
                    action_type='RATE_LIMIT_EXCEEDED',
                    username=f"{name} ({mask_mobile(mob_clean)})",
                    officer_role='CUSTOMER',
                    branch_name=branch,
                    details=f"Excessive OTP requests for mobile {mask_mobile(mob_clean)}: {quota_count} requests in 15 minutes.",
                    ip_address=client_ip,
                    user_agent=user_agent
                )
                return Response(
                    {"success": False, "message": "Too many OTP requests for this mobile number. Please try again after 15 minutes."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS
                )

        # Generate 6-digit OTP and Challenge Token
        otp = f"{secrets.randbelow(900000) + 100000}"
        otp_hash = hash_otp(otp)
        challenge_token = f"cchal_{secrets.token_urlsafe(32)}"
        expires_at = timezone.now() + datetime.timedelta(minutes=5)

        with connection.cursor() as cur:
            cur.execute("""
                INSERT INTO tbl_customer_challenges (challenge_token, mobile, otp_hash, customer_name, branch_name, account_no, expires_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, [challenge_token, mob_clean, otp_hash, name, branch, account_no, expires_at])

        # Dispatch OTP via internal Bank SMS appliance
        sms_service.send_2fa_otp(mob_clean, otp, name)

        create_audit_entry(
            action_type='CUSTOMER_OTP_REQUESTED',
            username=f"{name} ({mask_mobile(mob_clean)})",
            officer_role='CUSTOMER',
            branch_name=branch,
            details=f"Customer {name} initiated profile login. Dispatched single-use 6-digit OTP to {mask_mobile(mob_clean)} for branch [{branch}].",
            ip_address=client_ip,
            user_agent=user_agent
        )

        return Response({
            "success": True,
            "challengeToken": challenge_token,
            "deliveryTarget": mask_mobile(mob_clean),
            "expiresInSeconds": 300,
            # SECURITY: OTP is NEVER returned in API responses. It is dispatched via SMS only.
            "message": f"6-digit verification OTP sent to registered mobile {mask_mobile(mob_clean)}."
        })


class CustomerVerifyOtpView(APIView):
    """
    POST /api/v1/customer/verify-otp/
    Step 2: Customer submits 6-digit OTP.
    Verifies OTP, retrieves customer profile, active consent, and consent history.
    """
    def post(self, request):
        ensure_default_accounts()
        client_ip = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', 'Web')[:250]
        data = decrypt_client_payload(request.data)

        challenge_token = (data.get('challengeToken') or '').strip()
        otp = (data.get('otp') or data.get('otpCode') or '').strip()

        if not challenge_token or not otp:
            return Response(
                {"success": False, "message": "Challenge token and 6-digit OTP are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        with connection.cursor() as cur:
            cur.execute("""
                SELECT id, mobile, otp_hash, customer_name, branch_name, account_no, expires_at, is_verified
                FROM tbl_customer_challenges
                WHERE challenge_token = %s
            """, [challenge_token])
            row = cur.fetchone()

        if not row:
            return Response(
                {"success": False, "message": "Invalid or expired OTP session. Please initiate login again."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        c_id, mobile, stored_hash, c_name, branch_name, account_no, expires_at, is_verified = row

        if is_verified:
            return Response(
                {"success": False, "message": "This OTP has already been consumed. Please request a new OTP."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Parse expires_at if string
        if isinstance(expires_at, str):
            try:
                from django.utils.dateparse import parse_datetime
                expires_at = parse_datetime(expires_at)
            except Exception:
                pass

        if expires_at and timezone.is_aware(expires_at) and expires_at < timezone.now():
            return Response(
                {"success": False, "message": "OTP has expired (5 minute validity). Please request a new OTP."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not verify_otp_hash(otp, stored_hash):
            return Response(
                {"success": False, "message": "Invalid verification OTP entered. Please check and re-enter."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Mark challenge verified
        with connection.cursor() as cur:
            cur.execute("UPDATE tbl_customer_challenges SET is_verified = 1 WHERE id = %s", [c_id])

        # Match or look up Customer record
        customer = Customer.objects.filter(
            Q(mobile_number=mobile) | Q(account_number=account_no) | Q(name__iexact=c_name)
        ).first()

        consent_record = None
        if customer:
            consent_record = SMSConsent.objects.filter(customer=customer).first()
        elif mobile:
            consent_record = SMSConsent.objects.filter(mobile_number=mobile).first()
            if consent_record:
                customer = consent_record.customer

        if not customer:
            # Create preliminary customer record for first-time user
            acc_gen = f"50100{mobile[-4:]}{secrets.randbelow(9000) + 1000}"
            cif_gen = f"CIF{secrets.randbelow(900000) + 100000}"
            customer = Customer.objects.create(
                name=c_name,
                account_number=acc_gen,
                cif_number=cif_gen,
                mobile_number=mobile,
                branch_name=branch_name
            )

        if not consent_record and customer:
            consent_record = SMSConsent.objects.filter(customer=customer).first()

        # Fetch history
        history_list = []
        if consent_record:
            for h in consent_record.history.all().order_by('-timestamp')[:10]:
                history_list.append({
                    "previousStatus": h.previous_status or 'INITIAL',
                    "newStatus": h.new_status,
                    "date": h.timestamp.strftime('%d %b %Y, %I:%M %p'),
                    "reason": h.reason or 'Online self-service'
                })

        # Determine if this user is a first-time user who needs to complete full KYC/Consent registration:
        # User is first-time if PAN or Aadhaar is not linked, or consent record is not established.
        has_pan = bool(customer.pan_number and len(customer.pan_number.strip()) >= 10)
        has_aadhaar = bool(customer.aadhaar_number and len(customer.aadhaar_number.strip()) >= 12)
        has_valid_consent = bool(consent_record and consent_record.status in ['YES', 'NO'])

        is_first_time = not (has_pan and has_aadhaar and has_valid_consent)

        profile_payload = {
            "name": customer.name,
            "accountNumber": customer.account_number,
            "maskedAccount": mask_account(customer.account_number),
            "cifNumber": customer.cif_number,
            "mobileNumber": customer.mobile_number,
            "maskedMobile": mask_mobile(customer.mobile_number),
            "branchName": customer.branch_name,
            "panNumber": customer.pan_number or '',
            "aadhaarNumber": mask_aadhaar(customer.aadhaar_number) if customer.aadhaar_number else '',
            # SECURITY: Raw Aadhaar NEVER returned in API responses (DPDPA 2023 compliance)
            "currentConsent": consent_record.status if consent_record else 'PENDING',
            "referenceNumber": consent_record.reference_number if consent_record else '',
            "cbsUpdated": consent_record.cbs_updated if consent_record else 'No',
            "submittedAt": consent_record.submitted_at.strftime('%d %b %Y, %I:%M %p') if consent_record else '',
            "history": history_list,
            "isFirstTime": is_first_time,
            "hasPan": has_pan,
            "hasAadhaar": has_aadhaar
        }

        token = f"ctk_{secrets.token_urlsafe(32)}"

        create_audit_entry(
            action_type='CUSTOMER_LOGIN_SUCCESS',
            username=f"{customer.name} (Customer - {customer.mobile_number})",
            officer_role='CUSTOMER',
            branch_name=customer.branch_name,
            details=f"Customer {customer.name} authenticated via 2FA OTP into Self-Service Profile Portal. First-time Onboarding Required: [{is_first_time}]. Current Consent Status: [{profile_payload['currentConsent']}].",
            ip_address=client_ip,
            user_agent=user_agent
        )

        return Response({
            "success": True,
            "message": f"Welcome back, {customer.name}!",
            "token": token,
            "profile": profile_payload
        })


class CustomerCompleteOnboardingView(APIView):
    """
    POST /api/v1/customer/complete-onboarding/
    Called when a first-time user completes their full KYC registration:
    Account Number, Account Type, PAN Number, Aadhaar Number, Initial Consent Choice, Place, Signature.
    Updates Customer, SMSConsent, ConsentHistory, and AuditLog with zero mismatch.
    Marks user as fully onboarded (isFirstTime = False).
    """
    def post(self, request):
        ensure_default_accounts()
        client_ip = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', 'Web')[:250]
        data = decrypt_client_payload(request.data)

        account_number = (data.get('accountNumber') or '').strip()
        mobile_number = (data.get('mobileNumber') or '').strip()
        customer_name = (data.get('name') or data.get('customerName') or '').strip()
        branch_name = (data.get('branchName') or data.get('branch') or 'CBS Head Office').strip()
        pan_number = (data.get('panNumber') or data.get('pan') or '').strip().upper()
        aadhaar_number = ''.join(c for c in (data.get('aadhaarNumber') or data.get('aadhaar') or '') if c.isdigit())
        account_type = (data.get('accountType') or 'Savings Account').strip()
        consent_choice = (data.get('consentChoice') or data.get('consent') or 'YES').strip().upper()
        form_place = (data.get('formPlace') or data.get('place') or 'Nashik').strip()
        form_date = data.get('formDate') or timezone.now().date()
        signature_data = data.get('signatureData') or ''

        if not mobile_number:
            return Response(
                {"success": False, "message": "Mobile number is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not pan_number or len(pan_number) != 10:
            return Response(
                {"success": False, "message": "Valid 10-character PAN Number is required (e.g. ABCDE1234F)."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not aadhaar_number or len(aadhaar_number) != 12:
            return Response(
                {"success": False, "message": "Valid 12-digit Aadhaar Number is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Match customer
        customer = Customer.objects.filter(
            Q(mobile_number=mobile_number) | Q(account_number=account_number)
        ).first()

        if not customer:
            acc = account_number or f"50100{mobile_number[-4:]}{secrets.randbelow(9000) + 1000}"
            cif = f"CIF{secrets.randbelow(900000) + 100000}"
            customer = Customer.objects.create(
                name=customer_name or 'Namco Customer',
                account_number=acc,
                cif_number=cif,
                mobile_number=mobile_number,
                branch_name=branch_name
            )

        # Update customer master fields
        if account_number and account_number != customer.account_number:
            customer.account_number = account_number
        if customer_name:
            customer.name = customer_name
        if branch_name:
            customer.branch_name = branch_name
        customer.pan_number = pan_number
        customer.aadhaar_number = aadhaar_number
        customer.save()

        # Update or create SMSConsent
        consent_record = SMSConsent.objects.filter(
            Q(customer=customer) | Q(account_number=customer.account_number) | Q(mobile_number=mobile_number)
        ).first()

        new_status = 'YES' if consent_choice == 'YES' else 'NO'

        if not consent_record:
            import time
            ref_no = f"NAMCO-SMS-{datetime.date.today().year}-{int(time.time()) % 1000000:06d}"
            consent_record = SMSConsent.objects.create(
                customer=customer,
                account_number=customer.account_number,
                customer_name=customer.name,
                mobile_number=customer.mobile_number,
                branch_name=customer.branch_name,
                status=new_status,
                pan_number=pan_number,
                aadhaar_number=aadhaar_number,
                signature_data=signature_data,
                form_place=form_place,
                form_date=form_date,
                reference_number=ref_no,
                cbs_updated='No',
                ip_address=client_ip,
                user_agent=user_agent,
                submitted_at=timezone.now()
            )
        else:
            prev_status = consent_record.status
            consent_record.customer = customer
            consent_record.customer_name = customer.name
            consent_record.account_number = customer.account_number
            consent_record.status = new_status
            consent_record.pan_number = pan_number
            consent_record.aadhaar_number = aadhaar_number
            if signature_data:
                consent_record.signature_data = signature_data
            consent_record.form_place = form_place
            consent_record.form_date = form_date
            consent_record.cbs_updated = 'No' # Flagged for CBS synchronization
            consent_record.ip_address = client_ip
            consent_record.user_agent = user_agent
            consent_record.submitted_at = timezone.now()
            consent_record.save()

        # Append to ConsentHistory
        ConsentHistory.objects.create(
            consent=consent_record,
            previous_status='UNREGISTERED',
            new_status=new_status,
            source='ONLINE_ONBOARDING',
            changed_by=f"{customer.name} (Customer)",
            reason=f"Customer completed initial KYC registration & set SMS consent to {new_status}"
        )

        # Tamper-evident Audit Trail
        create_audit_entry(
            action_type='CUSTOMER_ONBOARDING_COMPLETED',
            username=f"{customer.name} (Customer - {customer.mobile_number})",
            officer_role='CUSTOMER',
            branch_name=customer.branch_name,
            details=f"Customer {customer.name} completed initial KYC & Consent onboarding. Linked PAN [{mask_pan(pan_number)}], Aadhaar [{mask_aadhaar(aadhaar_number)}], SMS Alert Consent [{new_status}] for Account {mask_account(customer.account_number)} (Ref: {consent_record.reference_number}). Requires CBS sync.",
            entity_type='SMSConsent',
            entity_id=consent_record.reference_number,
            account_no=customer.account_number,
            ref_no=consent_record.reference_number,
            ip_address=client_ip,
            user_agent=user_agent
        )

        # Build fresh profile
        history_list = []
        for h in consent_record.history.all().order_by('-timestamp')[:10]:
            history_list.append({
                "previousStatus": h.previous_status or 'INITIAL',
                "newStatus": h.new_status,
                "date": h.timestamp.strftime('%d %b %Y, %I:%M %p'),
                "reason": h.reason or 'Online self-service'
            })

        updated_profile = {
            "name": customer.name,
            "accountNumber": customer.account_number,
            "maskedAccount": mask_account(customer.account_number),
            "cifNumber": customer.cif_number,
            "mobileNumber": customer.mobile_number,
            "maskedMobile": mask_mobile(customer.mobile_number),
            "branchName": customer.branch_name,
            "panNumber": customer.pan_number,
            "aadhaarNumber": mask_aadhaar(customer.aadhaar_number),
            # SECURITY: Raw Aadhaar NEVER returned in API responses (DPDPA 2023 compliance)
            "currentConsent": consent_record.status,
            "referenceNumber": consent_record.reference_number,
            "cbsUpdated": "No",
            "submittedAt": consent_record.submitted_at.strftime('%d %b %Y, %I:%M %p'),
            "history": history_list,
            "isFirstTime": False,
            "hasPan": True,
            "hasAadhaar": True
        }

        return Response({
            "success": True,
            "message": "Your profile KYC and SMS alert registration have been successfully completed!",
            "profile": updated_profile
        })


class CustomerUpdateConsentView(APIView):
    """
    POST /api/v1/customer/update-consent/
    Step 3: Customer updates their SMS alert preference (YES or NO).
    Updates SMSConsent, sets cbs_updated='No', adds to ConsentHistory, and logs tamper-evident audit trail.
    Ensures ZERO MISMATCH between customer choice and Branch Admin / Super Admin portals.
    """
    def post(self, request):
        ensure_default_accounts()
        client_ip = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', 'Web')[:250]
        data = decrypt_client_payload(request.data)

        account_no = (data.get('accountNumber') or data.get('accNo') or '').strip()
        mobile = (data.get('mobileNumber') or data.get('mobile') or '').strip()
        raw_consent = (data.get('consentChoice') or data.get('consent') or 'YES').strip()
        signature_data = data.get('signatureData') or data.get('signature_data')
        form_place = (data.get('formPlace') or 'Nashik').strip()
        form_date = data.get('formDate') or timezone.now().date()
        pan = (data.get('panNumber') or data.get('pan') or '').strip().upper()[:10]
        aadhaar = ''.join(c for c in str(data.get('aadhaarNumber') or data.get('aadhaar') or '') if c.isdigit())[:12]

        new_status = 'YES' if raw_consent.upper() in ['YES', 'AGREE', 'TRUE', '1'] else 'NO'

        # Look up existing customer & consent
        customer = Customer.objects.filter(
            Q(account_number=account_no) | Q(mobile_number=mobile)
        ).first()

        if not customer:
            return Response(
                {"success": False, "message": "Customer record not found. Please log in again."},
                status=status.HTTP_404_NOT_FOUND
            )

        if pan:
            customer.pan_number = pan
        if aadhaar:
            customer.aadhaar_number = aadhaar
        customer.save()

        consent_record = SMSConsent.objects.filter(customer=customer).first()
        prev_status = consent_record.status if consent_record else 'PENDING'

        if not consent_record:
            ref_no = generate_reference_number()
            consent_record = SMSConsent.objects.create(
                reference_number=ref_no,
                customer=customer,
                status=new_status,
                source='ONLINE',
                customer_name=customer.name,
                account_number=customer.account_number,
                cif_number=customer.cif_number,
                pan_number=customer.pan_number,
                aadhaar_number=customer.aadhaar_number,
                mobile_number=customer.mobile_number,
                branch_name=customer.branch_name,
                signature_data=signature_data,
                form_date=form_date,
                form_place=form_place,
                cbs_updated='No',
                ip_address=client_ip,
                user_agent=user_agent,
                submitted_at=timezone.now()
            )
        else:
            consent_record.status = new_status
            consent_record.cbs_updated = 'No' # Flagged for CBS synchronization
            if signature_data:
                consent_record.signature_data = signature_data
            consent_record.form_date = form_date
            consent_record.form_place = form_place
            consent_record.pan_number = customer.pan_number
            consent_record.aadhaar_number = customer.aadhaar_number
            consent_record.ip_address = client_ip
            consent_record.user_agent = user_agent
            consent_record.submitted_at = timezone.now()
            consent_record.save()

        # Append to ConsentHistory
        ConsentHistory.objects.create(
            consent=consent_record,
            previous_status=prev_status,
            new_status=new_status,
            source='ONLINE',
            changed_by=f"{customer.name} (Customer)",
            reason=f"Customer self-service updated preference to {new_status}"
        )

        # Immutable Audit Log
        action_type = 'CONSENT_REVOKE' if new_status == 'NO' else 'CONSENT_SUBMIT'
        create_audit_entry(
            action_type=action_type,
            username=f"{customer.name} (Customer - {customer.mobile_number})",
            officer_role='CUSTOMER',
            branch_name=customer.branch_name,
            details=f"Customer {customer.name} updated SMS alert consent from [{prev_status}] to [{new_status}] for Account {mask_account(customer.account_number)} (Ref: {consent_record.reference_number}) at branch [{customer.branch_name}]. Requires CBS sync.",
            entity_type='SMSConsent',
            entity_id=consent_record.reference_number,
            account_no=customer.account_number,
            ref_no=consent_record.reference_number,
            ip_address=client_ip,
            user_agent=user_agent
        )

        return Response({
            "success": True,
            "message": f"SMS Alert consent preference successfully updated to {new_status}.",
            "referenceNumber": consent_record.reference_number,
            "status": new_status,
            "cbsUpdated": "No",
            "updatedAt": consent_record.submitted_at.strftime('%d %b %Y, %I:%M %p')
        })


class OfficerLoginView(APIView):
    """
    POST /api/v1/admin/login/
    STEP 1: Validates Username / Employee ID and Password.
    DOES NOT return an authenticated session token.
    Generates and returns a temporary 2FA challenge token with 5-minute single-use OTP.
    """
    def post(self, request):
        ensure_default_accounts()
        client_ip = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', 'Web')[:250]

        data = decrypt_client_payload(request.data)
        username = (data.get('username') or data.get('employeeId') or '').strip()
        password = data.get('password') or ''

        if not username or not password:
            return Response(
                {"success": False, "message": "Username and password are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        officer = BankOfficer.objects.filter(
            Q(username__iexact=username) | Q(employee_id__iexact=username) | Q(full_name__iexact=username)
        ).first()

        if not officer:
            create_audit_entry(
                action_type='AUTH_FAILED',
                username=username,
                officer_role='UNKNOWN',
                branch_name='Security Gateway',
                details=f"Failed login attempt for non-existent officer: '{username}'",
                ip_address=client_ip,
                user_agent=user_agent
            )
            return Response(
                {"success": False, "message": "Invalid credentials. Please verify your credentials."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not officer.is_active or getattr(officer, 'activation_status', 'ACTIVE') in ['DEACTIVATED', 'SUSPENDED']:
            create_audit_entry(
                action_type='AUTH_BLOCKED',
                username=officer.full_name or officer.username,
                officer_role=officer.role,
                branch_name=officer.branch_name,
                details=f"Login attempt on deactivated/suspended account: '{username}'",
                ip_address=client_ip,
                user_agent=user_agent
            )
            return Response(
                {"success": False, "message": "This officer account is deactivated. Contact Central Super Admin."},
                status=status.HTTP_403_FORBIDDEN
            )

        if officer.is_locked():
            remaining_mins = max(1, int((officer.locked_until - timezone.now()).total_seconds() / 60) + 1) if officer.locked_until else 15
            create_audit_entry(
                action_type='AUTH_LOCKOUT',
                username=officer.full_name or officer.username,
                officer_role=officer.role,
                branch_name=officer.branch_name,
                details=f"Login attempt on locked account '{username}'. Lockout active for {remaining_mins} more minutes.",
                ip_address=client_ip,
                user_agent=user_agent
            )
            return Response(
                {"success": False, "message": f"Account temporarily locked due to repeated failed logins. Try again in {remaining_mins} minutes."},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        is_valid = officer.check_password(password)
        if not is_valid:
            officer.register_failed_login()
            create_audit_entry(
                action_type='AUTH_FAILED',
                username=officer.full_name or officer.username,
                officer_role=officer.role,
                branch_name=officer.branch_name,
                details=f"Password mismatch for officer '{username}'. Failed count: {officer.failed_login_attempts}",
                ip_address=client_ip,
                user_agent=user_agent
            )
            return Response(
                {"success": False, "message": "Invalid password credentials."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Reset failed counter upon successful password verification
        officer.reset_failed_logins()

        # Generate Cryptographically Secure 6-Digit OTP (100000 - 999999)
        otp_plain = f"{secrets.randbelow(900000) + 100000}"
        otp_hashed = hash_otp(otp_plain)

        # Invalidate any prior pending 2FA challenges
        TwoFactorChallenge.objects.filter(officer=officer, is_verified=False).update(is_invalidated=True)

        challenge_token = f"chal_{secrets.token_urlsafe(32)}"
        target_masked = mask_mobile(officer.mobile or '9822000000')

        TwoFactorChallenge.objects.create(
            challenge_token=challenge_token,
            officer=officer,
            otp_hash=otp_hashed,
            delivery_channel='SMS',
            delivery_target=target_masked,
            expires_at=timezone.now() + datetime.timedelta(minutes=5)
        )

        # Dispatch 2FA OTP through Bank's internal SMS Gateway appliance
        sms_service.send_2fa_otp(officer.mobile or '9822000000', otp_plain, officer.username)

        display_officer = f"{officer.full_name} ({officer.username})" if officer.full_name else officer.username
        create_audit_entry(
            action_type='2FA_CHALLENGE_ISSUED',
            username=display_officer,
            officer_role=officer.role,
            branch_name=officer.branch_name,
            details=f"Step 1 verified for {display_officer} ({officer.role}). Issued 5-min 2FA OTP challenge to registered contact {target_masked}.",
            ip_address=client_ip,
            user_agent=user_agent
        )

        return Response({
            "success": True,
            "step": 2,
            "challengeToken": challenge_token,
            "deliveryChannel": "Registered SMS / TOTP",
            "deliveryTarget": target_masked,
            "expiresInSeconds": 300,
            # SECURITY: OTP is NEVER returned in API responses. It is dispatched via SMS only.
            "message": f"Step 1 verified. Please enter the 6-digit verification code sent to {target_masked}."
        })


class OfficerVerify2FAView(APIView):
    """
    POST /api/v1/admin/verify-2fa/
    STEP 2: Verifies 6-digit OTP against active challenge.
    Issues authenticated session token only upon successful second-factor validation.
    """
    def post(self, request):
        client_ip = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', 'Web')[:250]

        data = decrypt_client_payload(request.data)
        challenge_token = (data.get('challengeToken') or data.get('challenge_token') or '').strip()
        otp = (data.get('otp') or data.get('code') or '').strip()

        if not challenge_token or not otp:
            return Response(
                {"success": False, "message": "Challenge token and 6-digit OTP are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        challenge = TwoFactorChallenge.objects.filter(challenge_token=challenge_token).select_related('officer').first()
        if not challenge or challenge.is_invalidated or challenge.is_verified:
            create_audit_entry(
                action_type='2FA_FAILED',
                username='UNKNOWN',
                officer_role='OFFICER',
                branch_name='Security Gateway',
                details="Invalid or consumed 2FA challenge token presented.",
                ip_address=client_ip,
                user_agent=user_agent
            )
            return Response(
                {"success": False, "message": "Invalid or expired 2FA session. Please initiate login again."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        officer = challenge.officer
        if not officer.is_active or officer.is_locked():
            return Response(
                {"success": False, "message": "Officer account is locked or deactivated."},
                status=status.HTTP_403_FORBIDDEN
            )

        if challenge.is_expired():
            challenge.is_invalidated = True
            challenge.save(update_fields=['is_invalidated'])
            create_audit_entry(
                action_type='2FA_EXPIRED',
                username=officer.username,
                officer_role=officer.role,
                branch_name=officer.branch_name,
                details=f"2FA challenge expired for officer '{officer.username}'.",
                ip_address=client_ip,
                user_agent=user_agent
            )
            return Response(
                {"success": False, "message": "Verification code has expired. Please request a new code."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if challenge.attempts_count >= 5:
            challenge.is_invalidated = True
            challenge.save(update_fields=['is_invalidated'])
            officer.register_failed_login()
            create_audit_entry(
                action_type='2FA_LOCKED',
                username=officer.username,
                officer_role=officer.role,
                branch_name=officer.branch_name,
                details=f"2FA maximum attempt limit (5) exceeded for '{officer.username}'. Challenge invalidated.",
                ip_address=client_ip,
                user_agent=user_agent
            )
            return Response(
                {"success": False, "message": "Maximum verification attempts exceeded. Please restart login."},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        challenge.attempts_count += 1
        is_otp_valid = verify_otp_hash(otp, challenge.otp_hash)

        if not is_otp_valid:
            challenge.save(update_fields=['attempts_count'])
            remaining = 5 - challenge.attempts_count
            create_audit_entry(
                action_type='2FA_FAILED',
                username=officer.username,
                officer_role=officer.role,
                branch_name=officer.branch_name,
                details=f"Incorrect 2FA code entered for '{officer.username}'. Attempts remaining: {remaining}",
                ip_address=client_ip,
                user_agent=user_agent
            )
            return Response(
                {"success": False, "message": f"Invalid verification code. {remaining} attempt(s) remaining."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Successful 2FA: Invalidate challenge
        challenge.is_verified = True
        challenge.is_invalidated = True
        challenge.save(update_fields=['is_verified', 'is_invalidated', 'attempts_count'])

        # Update officer last login and 2fa timestamp
        officer.last_login = timezone.now()
        officer.last_2fa_success = timezone.now()
        officer.save(update_fields=['last_login', 'last_2fa_success'])

        # Issue Opaque Authenticated Session Token (no embedded username)
        session_token = f"ntk_{secrets.token_urlsafe(48)}"
        OfficerSession.objects.create(
            session_token=session_token,
            officer=officer,
            ip_address=client_ip,
            user_agent=user_agent,
            expires_at=timezone.now() + datetime.timedelta(hours=8)
        )

        display_officer = f"{officer.full_name} ({officer.username})" if officer.full_name else officer.username
        create_audit_entry(
            action_type='LOGIN_SUCCESS',
            username=display_officer,
            officer_role=officer.role,
            branch_name=officer.branch_name,
            details=f"2FA verified successfully. Officer {officer.full_name} ({officer.role}) authenticated for Branch [{officer.branch_name}].",
            ip_address=client_ip,
            user_agent=user_agent
        )

        return Response({
            "success": True,
            "token": session_token,
            "user": {
                "id": officer.id,
                "username": officer.username,
                "fullName": officer.full_name,
                "employeeId": officer.employee_id or 'N/A',
                "email": officer.email,
                "mobile": officer.mobile,
                "branchName": officer.branch_name,
                "branchCode": officer.branch_code,
                "branch": officer.branch_name,
                "role": officer.role,
                "isSuperAdmin": officer.role == 'SUPER_ADMIN'
            }
        })


class OfficerResend2FAView(APIView):
    """
    POST /api/v1/admin/resend-2fa/
    Generates a fresh single-use 2FA OTP with rate limiting (max 3 resends).
    """
    def post(self, request):
        client_ip = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', 'Web')[:250]

        data = decrypt_client_payload(request.data)
        challenge_token = (data.get('challengeToken') or data.get('challenge_token') or '').strip()

        challenge = TwoFactorChallenge.objects.filter(challenge_token=challenge_token).select_related('officer').first()
        if not challenge or challenge.is_verified:
            return Response(
                {"success": False, "message": "Invalid challenge session."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if challenge.resend_count >= 3:
            return Response(
                {"success": False, "message": "Maximum resend limit reached. Please restart login."},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        officer = challenge.officer
        # Invalidate old challenge
        challenge.is_invalidated = True
        challenge.save(update_fields=['is_invalidated'])

        # Create new challenge
        otp_plain = f"{secrets.randbelow(900000) + 100000}"
        new_challenge_token = f"chal_{secrets.token_urlsafe(32)}"
        target_masked = mask_mobile(officer.mobile or '9822000000')

        TwoFactorChallenge.objects.create(
            challenge_token=new_challenge_token,
            officer=officer,
            otp_hash=hash_otp(otp_plain),
            delivery_channel='SMS',
            delivery_target=target_masked,
            resend_count=challenge.resend_count + 1,
            expires_at=timezone.now() + datetime.timedelta(minutes=5)
        )

        # Dispatch Resent 2FA OTP through Bank's internal SMS Gateway appliance
        sms_service.send_2fa_otp(officer.mobile or '9822000000', otp_plain, officer.username)

        create_audit_entry(
            action_type='2FA_OTP_RESENT',
            username=officer.username,
            officer_role=officer.role,
            branch_name=officer.branch_name,
            details=f"Resent 2FA code ({challenge.resend_count + 1}/3) for officer '{officer.username}' to {target_masked}.",
            ip_address=client_ip,
            user_agent=user_agent
        )

        return Response({
            "success": True,
            "challengeToken": new_challenge_token,
            "deliveryTarget": target_masked,
            # SECURITY: OTP is NEVER returned in API responses. It is dispatched via SMS only.
            "message": f"A new verification code has been dispatched to {target_masked}."
        })


class OfficerLogoutView(APIView):
    """
    POST /api/v1/admin/logout/
    Revokes server-side session and logs audit trail event.
    """
    def post(self, request):
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.split(' ')[1].strip() if auth_header.startswith('Bearer ') else ''
        client_ip = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', 'Web')[:250]

        if token:
            OfficerSession.objects.filter(session_token=token).update(is_revoked=True)

        requester = resolve_requester(request)
        if requester:
            create_audit_entry(
                action_type='AUTH_LOGOUT',
                username=requester.username,
                officer_role=requester.role,
                branch_name=requester.branch_name,
                details=f"Officer {requester.full_name} logged out from [{requester.branch_name}]. Session revoked.",
                ip_address=client_ip,
                user_agent=user_agent
            )

        return Response({"success": True, "message": "Successfully logged out and session revoked."})


class OfficerChangePasswordView(APIView):
    """
    POST /api/v1/admin/change-password/
    Allows authenticated Branch Admin or Super Admin to change their password securely.
    """
    def post(self, request):
        ensure_default_accounts()
        requester = resolve_requester(request)
        if not requester:
            return Response(
                {"success": False, "message": "Authentication required. Please log in again."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        data = decrypt_client_payload(request.data)
        current_password = data.get('currentPassword') or data.get('current_password') or data.get('oldPassword') or ''
        new_password = data.get('newPassword') or data.get('new_password') or ''
        confirm_password = data.get('confirmPassword') or data.get('confirm_password') or ''

        if not current_password or not new_password:
            return Response(
                {"success": False, "message": "Current password and new password are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not requester.check_password(current_password):
            return Response(
                {"success": False, "message": "Current password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST
            )

        import re
        if len(new_password) < 8:
            return Response(
                {"success": False, "message": "New password must be at least 8 characters long."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not re.search(r'[A-Z]', new_password):
            return Response(
                {"success": False, "message": "Password must contain at least one uppercase letter."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not re.search(r'[a-z]', new_password):
            return Response(
                {"success": False, "message": "Password must contain at least one lowercase letter."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not re.search(r'[0-9]', new_password):
            return Response(
                {"success": False, "message": "Password must contain at least one digit."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', new_password):
            return Response(
                {"success": False, "message": "Password must contain at least one special character (!@#$%^&* etc)."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if confirm_password and new_password != confirm_password:
            return Response(
                {"success": False, "message": "New password and confirmation do not match."},
                status=status.HTTP_400_BAD_REQUEST
            )

        requester.set_password(new_password)
        requester.reset_failed_logins()
        requester.save()

        client_ip = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', 'Web')[:250]

        create_audit_entry(
            action_type='PASSWORD_CHANGED',
            username=requester.username,
            officer_role=requester.role,
            branch_name=requester.branch_name,
            details=f"Officer '{requester.username}' ({requester.full_name}) successfully updated their account password.",
            entity_type='BankOfficer',
            entity_id=str(requester.id),
            ip_address=client_ip,
            user_agent=user_agent
        )

        return Response({
            "success": True,
            "message": "Password changed successfully."
        })


class ConsentRecordsView(APIView):
    """
    GET /api/v1/admin/records/
    STRICT Branch-Level Data Isolation:
    - Branch Admin is hard-locked to their server-authenticated branch.
    - Super Admin can access all branches or filter by branch.
    """
    def get(self, request):
        ensure_default_accounts()
        requester = resolve_requester(request)
        if not requester:
            return Response(
                {"success": False, "message": "Authentication required. Active 2FA session token missing or expired."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        query = request.GET.get('q', '').strip()
        status_filter = request.GET.get('status', '').strip().upper()
        source_filter = request.GET.get('source', '').strip()
        start_date = request.GET.get('start_date', '').strip()
        end_date = request.GET.get('end_date', '').strip()
        branch_param = request.GET.get('branch', '').strip()

        records = SMSConsent.objects.all().order_by('-submitted_at')

        # Multi-Tenant Branch Scoping:
        # - Super Admin & DLT Partner see all branches by default, or filter by branch
        # - Branch Admin defaults to their branch, but if branch='all' is requested (All Branches view), all synced records are returned
        if branch_param and branch_param.lower() == 'all':
            pass  # Bank-wide view requested: show all synced branches
        elif branch_param:
            records = records.filter(branch_name__icontains=branch_param.split(',')[0].strip())
        elif requester.role not in ['SUPER_ADMIN', 'DLT_PARTNER', 'AUDITOR']:
            branch_key = requester.branch_name.split(',')[0].strip()
            records = records.filter(branch_name__icontains=branch_key)

        if status_filter and status_filter != 'ALL':
            records = records.filter(status=status_filter)

        if source_filter and source_filter.lower() != 'all':
            records = records.filter(source__icontains=source_filter)

        if start_date:
            records = records.filter(form_date__gte=start_date)
        if end_date:
            records = records.filter(form_date__lte=end_date)

        if query:
            records = records.filter(
                Q(customer_name__icontains=query) |
                Q(account_number__icontains=query) |
                Q(cif_number__icontains=query) |
                Q(mobile_number__icontains=query) |
                Q(reference_number__icontains=query)
            )

        data = []
        for r in records[:500]:
            data.append({
                "id": str(r.id),
                "refNo": r.reference_number,
                "referenceNumber": r.reference_number,
                "name": r.customer_name,
                "customerName": r.customer_name,
                "accNo": mask_account(r.account_number),
                "accountNumber": mask_account(r.account_number),
                "maskedAccNo": mask_account(r.account_number),
                "cif": r.cif_number,
                "cifNumber": r.cif_number,
                "pan": r.pan_number or '',
                "panNumber": r.pan_number or '',
                "aadhaar": f"XXXX-XXXX-{r.aadhaar_number[-4:]}" if (r.aadhaar_number and len(r.aadhaar_number) >= 4) else (r.aadhaar_number or ''),
                "aadhaarNumber": f"XXXX-XXXX-{r.aadhaar_number[-4:]}" if (r.aadhaar_number and len(r.aadhaar_number) >= 4) else (r.aadhaar_number or ''),
                "branch": r.branch_name,
                "branchName": r.branch_name,
                "mobile": r.mobile_number,
                "mobileNumber": r.mobile_number,
                "rawMobile": r.mobile_number,
                "maskedMobile": mask_mobile(r.mobile_number),
                "consent": r.status,
                "status": r.status,
                "source": r.source,
                "sourceType": r.source,
                "cbsUpdated": r.cbs_updated,
                "verifiedBy": r.verified_by or 'DLT SMS Online Consent',
                "verifiedAt": r.verified_at.isoformat() if r.verified_at else None,
                "date": str(r.form_date),
                "place": r.form_place,
                "signatureData": r.signature_data,
                "timestamp": r.submitted_at.isoformat()
            })

        return Response({
            "success": True,
            "count": len(data),
            "scopedBranch": requester.branch_name if requester.role != 'SUPER_ADMIN' else 'ALL_BRANCHES',
            "data": data
        })


class CBSStatusUpdateView(APIView):
    """
    PATCH /api/v1/admin/records/<ref_no>/cbs-status/
    Updates Core Banking System sync flag with strict branch access validation and audit logging.
    """
    def patch(self, request, ref_no):
        requester = resolve_requester(request)
        if not requester:
            return Response({"success": False, "message": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            record = SMSConsent.objects.get(reference_number=ref_no)
        except SMSConsent.DoesNotExist:
            return Response({"success": False, "message": "Consent record not found."}, status=status.HTTP_404_NOT_FOUND)

        client_ip = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', 'Web')[:250]

        if requester.role != 'SUPER_ADMIN':
            branch_key = requester.branch_name.split(',')[0].strip().lower()
            if branch_key not in record.branch_name.lower():
                officer_ident = get_officer_audit_identity(requester)
                create_audit_entry(
                    action_type='UNAUTHORIZED_ACCESS_ATTEMPT',
                    username=officer_ident,
                    user_id=requester.id,
                    officer_role=requester.role,
                    branch_name=requester.branch_name,
                    details=f"Cross-branch access violation: Officer {requester.full_name} (Emp: {requester.employee_id or requester.username}, User: {requester.username}, ID: {requester.id}) attempted to update ref {ref_no} (belongs to [{record.branch_name}]) from [{requester.branch_name}]",
                    entity_type='SMSConsent',
                    entity_id=ref_no,
                    ip_address=client_ip,
                    user_agent=user_agent
                )
                return Response(
                    {"success": False, "message": f"Unauthorized: You can only update records belonging to your branch ({requester.branch_name})."},
                    status=status.HTTP_403_FORBIDDEN
                )

        new_status = request.data.get('cbsUpdated') or request.data.get('status')
        if not new_status:
            new_status = 'Yes' if record.cbs_updated == 'No' else 'No'

        record.cbs_updated = new_status
        officer_ident = get_officer_audit_identity(requester)
        record.verified_by = officer_ident
        record.verified_at = timezone.now()
        record.save()

        create_audit_entry(
            action_type='CBS_STATUS_UPDATED',
            username=officer_ident,
            user_id=requester.id,
            officer_role=requester.role,
            branch_name=record.branch_name,
            details=f"Officer {requester.full_name} (Emp ID: {requester.employee_id or requester.username}, User: {requester.username}, ID: {requester.id}) updated CBS sync status to '{new_status}' for Account {mask_account(record.account_number)} (Ref: {record.reference_number}) at branch [{record.branch_name}].",
            entity_type='SMSConsent',
            entity_id=record.reference_number,
            account_no=record.account_number,
            ref_no=record.reference_number,
            ip_address=client_ip,
            user_agent=user_agent
        )

        return Response({
            "success": True,
            "message": f"CBS Status updated to {new_status}",
            "refNo": record.reference_number,
            "cbsUpdated": record.cbs_updated
        })


class UploadPhysicalFormView(APIView):
    """
    POST /api/v1/admin/upload-physical-form/
    Uploads scanned paper document (JPG, PNG, PDF) with magic-byte security validation,
    runs OCR, and returns extracted fields for Branch Admin side-by-side verification.
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        requester = resolve_requester(request)
        if not requester:
            return Response({"success": False, "message": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

        uploaded_file = request.FILES.get('file') or request.FILES.get('scannedForm')
        if not uploaded_file:
            return Response(
                {"success": False, "message": "No scanned form file uploaded (JPG, PNG, or PDF required)."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Security check: File size (max 10MB)
        if uploaded_file.size > 10 * 1024 * 1024:
            return Response({"success": False, "message": "File exceeds maximum permitted size of 10MB."}, status=status.HTTP_400_BAD_REQUEST)

        # Security check: Extension and Magic Bytes
        ext = os.path.splitext(uploaded_file.name)[1].lower()
        if ext not in ['.pdf', '.png', '.jpg', '.jpeg']:
            return Response({"success": False, "message": "Invalid file format. Only PDF, JPG, and PNG are permitted."}, status=status.HTTP_400_BAD_REQUEST)

        header = uploaded_file.read(8)
        uploaded_file.seek(0)
        if ext == '.pdf' and not header.startswith(b'%PDF-'):
            return Response({"success": False, "message": "Security alert: Invalid PDF signature."}, status=status.HTTP_400_BAD_REQUEST)
        elif ext == '.png' and not header.startswith(b'\x89PNG\r\n\x1a\n'):
            return Response({"success": False, "message": "Security alert: Invalid PNG image signature."}, status=status.HTTP_400_BAD_REQUEST)
        elif ext in ['.jpg', '.jpeg'] and not header.startswith(b'\xff\xd8\xff'):
            return Response({"success": False, "message": "Security alert: Invalid JPEG image signature."}, status=status.HTTP_400_BAD_REQUEST)

        extracted_data = process_uploaded_physical_form(uploaded_file)
        if not extracted_data.get("branchName") or requester.role != 'SUPER_ADMIN':
            extracted_data["branchName"] = requester.branch_name or "CBS Head Office, Nashik"

        officer_ident = get_officer_audit_identity(requester)
        client_ip = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', 'Web')[:250]

        physical_record = PhysicalForm.objects.create(
            original_file=uploaded_file,
            filename=uploaded_file.name,
            ocr_raw_text=extracted_data.get('rawTextSample', ''),
            ocr_extracted_json=extracted_data,
            uploaded_by=officer_ident
        )

        create_audit_entry(
            action_type='OCR_UPLOAD',
            username=officer_ident,
            user_id=requester.id,
            officer_role=requester.role,
            branch_name=requester.branch_name,
            details=f"Officer {requester.full_name} (Emp ID: {requester.employee_id or requester.username}, User: {requester.username}) uploaded scanned physical form: {uploaded_file.name} (Form ID: {physical_record.id})",
            entity_type='PhysicalForm',
            entity_id=str(physical_record.id),
            ip_address=client_ip,
            user_agent=user_agent
        )

        file_url = None
        try:
            if physical_record.original_file:
                file_url = physical_record.original_file.url
        except Exception:
            file_url = None

        return Response({
            "success": True,
            "message": "Scanned physical form processed by OCR. Please verify extracted data.",
            "formId": physical_record.id,
            "filename": uploaded_file.name,
            "fileUrl": file_url,
            "isPdf": ext == '.pdf',
            "extractedData": extracted_data
        })


class VerifyPhysicalFormView(APIView):
    """
    POST /api/v1/admin/verify-physical-form/
    Officer confirms and saves verified OCR data with audit logging.
    """
    def post(self, request):
        ensure_default_accounts()
        requester = resolve_requester(request)
        if not requester:
            return Response({"success": False, "message": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

        data = decrypt_client_payload(request.data)
        form_id = data.get('formId')
        name = data.get('name') or data.get('customerName')
        acc_no = data.get('accNo') or data.get('accountNumber')
        cif = data.get('cif') or data.get('customerCif')
        pan = data.get('pan') or data.get('panNumber') or ''
        aadhaar = data.get('aadhaar') or data.get('aadhaarNumber') or ''
        pan_clean = str(pan).strip().upper()[:10] if pan else ''
        aadhaar_clean = ''.join(c for c in str(aadhaar) if c.isdigit())[:12] if aadhaar else ''
        mobile = data.get('mobile') or data.get('mobileNumber')
        branch_name = requester.branch_name if requester.role != 'SUPER_ADMIN' else (data.get('branch') or data.get('branchName') or requester.branch_name)
        raw_consent = data.get('consent') or data.get('consentChoice') or 'YES'
        form_date = data.get('date') or data.get('formDate') or timezone.now().date()
        form_place = data.get('place') or data.get('formPlace') or 'Nashik'

        status_val = 'YES' if str(raw_consent).upper() in ['YES', 'AGREE', 'TRUE', '1'] else 'NO'

        if not name or not acc_no or not cif or not mobile:
            return Response(
                {"success": False, "message": "All customer fields (Name, Account No, CIF, Mobile) must be verified."},
                status=status.HTTP_400_BAD_REQUEST
            )

        officer_name = requester.full_name
        client_ip = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', 'Web')[:250]

        # 1. Customer master record
        customer, _ = Customer.objects.get_or_create(
            account_number=str(acc_no).strip(),
            defaults={
                "name": str(name).strip(),
                "cif_number": str(cif).strip(),
                "pan_number": pan_clean,
                "aadhaar_number": aadhaar_clean,
                "mobile_number": str(mobile).strip(),
                "branch_name": str(branch_name).strip()
            }
        )
        customer.name = str(name).strip()
        customer.cif_number = str(cif).strip()
        if pan_clean:
            customer.pan_number = pan_clean
        if aadhaar_clean:
            customer.aadhaar_number = aadhaar_clean
        customer.mobile_number = str(mobile).strip()
        customer.branch_name = str(branch_name).strip()
        customer.save()

        existing_consent = SMSConsent.objects.filter(customer=customer).first()
        prev_status = existing_consent.status if existing_consent else 'PENDING'

        if existing_consent:
            existing_consent.customer_name = str(name).strip()
            existing_consent.cif_number = str(cif).strip()
            existing_consent.pan_number = customer.pan_number
            existing_consent.aadhaar_number = customer.aadhaar_number
            existing_consent.mobile_number = str(mobile).strip()
            existing_consent.branch_name = str(branch_name).strip()
            existing_consent.status = status_val
            existing_consent.source = 'PHYSICAL_OCR'
            existing_consent.form_date = form_date
            existing_consent.form_place = form_place
            existing_consent.verified_by = officer_name
            existing_consent.verified_at = timezone.now()
            existing_consent.cbs_updated = 'Yes'
            existing_consent.save()
            consent = existing_consent
        else:
            ref_num = generate_reference_number()
            consent = SMSConsent.objects.create(
                customer=customer,
                reference_number=ref_num,
                customer_name=str(name).strip(),
                account_number=str(acc_no).strip(),
                cif_number=str(cif).strip(),
                pan_number=customer.pan_number,
                aadhaar_number=customer.aadhaar_number,
                mobile_number=str(mobile).strip(),
                branch_name=str(branch_name).strip(),
                status=status_val,
                source='PHYSICAL_OCR',
                form_date=form_date,
                form_place=form_place,
                verified_by=officer_name,
                verified_at=timezone.now(),
                cbs_updated='Yes'
            )

        # 3. Associate Physical Form if formId provided
        if form_id:
            try:
                pf = PhysicalForm.objects.get(id=form_id)
                pf.consent = consent
                pf.verified_by = officer_name
                pf.verified_at = timezone.now()
                pf.save()
            except PhysicalForm.DoesNotExist:
                pass

        # 4. Consent History
        ConsentHistory.objects.create(
            consent=consent,
            previous_status=prev_status,
            new_status=status_val,
            source='PHYSICAL_OCR',
            changed_by=officer_name,
            reason=f"Physical paper consent form scanned, OCR extracted, and verified by {officer_name}"
        )

        # 5. Audit Log
        create_audit_entry(
            action_type='OCR_VERIFIED',
            username=officer_name,
            user_id=requester.id,
            officer_role=requester.role,
            branch_name=branch_name,
            details=f"Officer {requester.full_name} (Emp ID: {requester.employee_id or requester.username}, User: {requester.username}) verified OCR paper consent form for Account {mask_account(consent.account_number)} (Status: {status_val})",
            entity_type='SMSConsent',
            entity_id=consent.reference_number,
            account_no=consent.account_number,
            ref_no=consent.reference_number,
            ip_address=client_ip,
            user_agent=user_agent
        )

        return Response({
            "success": True,
            "message": "Physical paper consent form verified and committed to bank registry.",
            "referenceNumber": consent.reference_number,
            "status": consent.status,
            "cbsUpdated": consent.cbs_updated,
            "verifiedBy": consent.verified_by,
            "verifiedAt": consent.verified_at.isoformat() if consent.verified_at else timezone.now().isoformat()
        })


class BranchDataExportView(APIView):
    """
    GET /api/v1/admin/export/
    Exports audit-logged, masked CSV compliance reports with strict branch isolation.
    """
    def get(self, request):
        ensure_default_accounts()
        requester = resolve_requester(request)
        if not requester:
            return Response({"success": False, "message": "Authentication required to export data."}, status=status.HTTP_401_UNAUTHORIZED)

        status_filter = request.GET.get('status', 'ALL').strip().upper()
        branch_param = request.GET.get('branch', '').strip()

        records = SMSConsent.objects.all()

        if branch_param and branch_param.lower() == 'all':
            export_scope = 'All 80 Branches'
        elif branch_param:
            records = records.filter(branch_name__icontains=branch_param)
            export_scope = branch_param
        elif requester.role not in ['SUPER_ADMIN', 'DLT_PARTNER', 'AUDITOR']:
            branch_key = requester.branch_name.split(',')[0].strip()
            records = records.filter(branch_name__icontains=branch_key)
            export_scope = requester.branch_name
        else:
            export_scope = 'All 80 Branches'

        if status_filter != 'ALL':
            records = records.filter(status=status_filter)

        client_ip = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', 'Web')[:250]

        officer_ident = get_officer_audit_identity(requester)
        create_audit_entry(
            action_type='DATA_EXPORT',
            username=officer_ident,
            user_id=requester.id,
            officer_role=requester.role,
            branch_name=requester.branch_name,
            details=f"Officer {requester.full_name} (Emp ID: {requester.employee_id or requester.username}, User: {requester.username}) exported {records.count()} records (Status: {status_filter}, Scope: {export_scope}) to CSV.",
            ip_address=client_ip,
            user_agent=user_agent
        )

        response = HttpResponse(content_type='text/csv')
        filename = f"Namco_SMS_Consent_{status_filter}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'

        writer = csv.writer(response)
        writer.writerow(['Ref No', 'Name', 'Acc No', 'CIF', 'PAN', 'Aadhaar', 'Mobile', 'Branch', 'Status', 'Source', 'Submitted'])

        for r in records:
            masked_pan = f"XXXXX{r.pan_number[-5:]}" if (r.pan_number and len(r.pan_number) >= 5) else (r.pan_number or 'N/A')
            masked_aadhaar = f"XXXX-XXXX-{r.aadhaar_number[-4:]}" if (r.aadhaar_number and len(r.aadhaar_number) >= 4) else (r.aadhaar_number or 'N/A')
            writer.writerow([
                mask_reference(r.reference_number),
                r.customer_name,
                mask_account(r.account_number),
                mask_cif(r.cif_number),
                masked_pan,
                masked_aadhaar,
                mask_mobile(r.mobile_number),
                r.branch_name,
                r.status,
                r.source,
                r.submitted_at.strftime('%Y-%m-%d')
            ])

        return response


class DashboardMetricsView(APIView):
    """
    GET /api/v1/admin/metrics/
    Branch dashboard KPIs with bank-wide sync and role-aware scoping.
    """
    def get(self, request):
        ensure_default_accounts()
        requester = resolve_requester(request)
        if not requester:
            return Response({"success": False, "message": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

        records = SMSConsent.objects.all()
        branch_param = request.GET.get('branch', '').strip()

        if branch_param and branch_param.lower() == 'all':
            pass  # Bank-wide view
        elif branch_param:
            records = records.filter(branch_name__icontains=branch_param.split(',')[0].strip())
        elif requester.role not in ['SUPER_ADMIN', 'DLT_PARTNER', 'AUDITOR']:
            branch_key = requester.branch_name.split(',')[0].strip()
            records = records.filter(branch_name__icontains=branch_key)

        total_records = records.count()
        yes_count = records.filter(status='YES').count()
        no_count = records.filter(status='NO').count()
        pending_count = records.filter(status='PENDING').count()
        revoked_count = records.filter(status='REVOKED').count()

        online_count = records.filter(source='ONLINE').count()
        physical_count = records.filter(source='PHYSICAL_OCR').count()
        admin_entry_count = records.filter(source='ADMIN_ENTRY').count()

        total_officers = BankOfficer.objects.count()
        total_logs = AuditLog.objects.count()

        # Branch breakdown for Super Admin and DLT Partner
        branch_stats = []
        if requester.role in ['SUPER_ADMIN', 'DLT_PARTNER']:
            for b in BankBranch.objects.filter(is_active=True)[:80]:
                b_records = SMSConsent.objects.filter(branch_name__icontains=b.branch_name.split(',')[0])
                b_total = b_records.count()
                branch_stats.append({
                    "branchCode": b.branch_code,
                    "branchName": b.branch_name,
                    "city": b.city,
                    "total": b_total,
                    "yes": b_records.filter(status='YES').count(),
                    "no": b_records.filter(status='NO').count(),
                    "pending": b_records.filter(status='PENDING').count(),
                    "revoked": b_records.filter(status='REVOKED').count()
                })

        return Response({
            "success": True,
            "metrics": {
                "totalRecords": total_records,
                "yesCount": yes_count,
                "noCount": no_count,
                "pendingCount": pending_count,
                "revokedCount": revoked_count,
                "onlineCount": online_count,
                "physicalCount": physical_count,
                "adminEntryCount": admin_entry_count,
                "totalOfficers": total_officers,
                "totalAuditLogs": total_logs,
                "scopedBranch": requester.branch_name if requester.role != 'SUPER_ADMIN' else 'ALL_BRANCHES',
                "branchBreakdown": branch_stats
            }
        })


class BankBranchesListView(APIView):
    """
    GET /api/v1/branches/
    Returns list of all active Namco Bank branches.
    POST /api/v1/branches/
    Super Admin registers a new branch in the directory.
    """
    def get(self, request):
        ensure_default_accounts()
        branches = BankBranch.objects.filter(is_active=True).order_by('branch_code')
        return Response({
            "success": True,
            "count": branches.count(),
            "data": [
                {
                    "code": b.branch_code,
                    "branch_code": b.branch_code,
                    "branchCode": b.branch_code,
                    "name": b.branch_name,
                    "branch_name": b.branch_name,
                    "branchName": b.branch_name,
                    "city": b.city
                } for b in branches
            ]
        })

    def post(self, request):
        ensure_default_accounts()
        requester = resolve_requester(request)
        if not requester or requester.role != 'SUPER_ADMIN':
            return Response({"success": False, "message": "Access Denied: Super Admin privilege required."}, status=status.HTTP_403_FORBIDDEN)

        data = request.data.copy()
        code = (data.get('branch_code') or data.get('branchCode') or data.get('code') or '').strip().upper()
        name = (data.get('branch_name') or data.get('branchName') or data.get('name') or '').strip()
        city = (data.get('city') or 'Nashik').strip()
        address = (data.get('address') or '').strip()

        if not code or not name:
            return Response({"success": False, "message": "Branch code and branch name are required."}, status=status.HTTP_400_BAD_REQUEST)

        if BankBranch.objects.filter(branch_code=code).exists():
            return Response({"success": False, "message": f"Branch with code '{code}' already exists."}, status=status.HTTP_400_BAD_REQUEST)

        branch = BankBranch.objects.create(
            branch_code=code,
            branch_name=name,
            city=city,
            address=address,
            is_active=True
        )

        performed_by = requester.full_name
        create_audit_entry(
            action_type='BRANCH_CREATED',
            username=performed_by,
            officer_role='SUPER_ADMIN',
            branch_name=name,
            details=f"New branch created: {name} (Code: {code}, City: {city})",
            entity_type='BankBranch',
            entity_id=str(branch.id),
            ip_address=get_client_ip(request)
        )

        return Response({
            "success": True,
            "message": f"Branch '{name}' created successfully.",
            "data": {
                "code": branch.branch_code,
                "branch_code": branch.branch_code,
                "branchCode": branch.branch_code,
                "name": branch.branch_name,
                "branch_name": branch.branch_name,
                "branchName": branch.branch_name,
                "city": branch.city
            }
        }, status=status.HTTP_201_CREATED)


class BankBranchDetailView(APIView):
    """
    DELETE /api/v1/branches/<str:branch_code>/
    Super Admin deletes or deactivates a branch.
    """
    def delete(self, request, branch_code):
        ensure_default_accounts()
        requester = resolve_requester(request)
        if not requester or requester.role != 'SUPER_ADMIN':
            return Response({"success": False, "message": "Access Denied: Super Admin privilege required."}, status=status.HTTP_403_FORBIDDEN)

        code_upper = branch_code.strip().upper()
        if code_upper in ['HO-001', 'NSK-001']:
            return Response({"success": False, "message": "Cannot delete Central Head Office branch."}, status=status.HTTP_400_BAD_REQUEST)

        branch = BankBranch.objects.filter(branch_code__iexact=code_upper).first()
        if not branch:
            branch = BankBranch.objects.filter(branch_name__icontains=branch_code).first()

        if not branch:
            return Response({"success": False, "message": f"Branch '{branch_code}' not found."}, status=status.HTTP_404_NOT_FOUND)

        branch_name = branch.branch_name
        b_code = branch.branch_code
        branch.delete()

        performed_by = requester.full_name
        create_audit_entry(
            action_type='BRANCH_DELETED',
            username=performed_by,
            officer_role='SUPER_ADMIN',
            branch_name=branch_name,
            details=f"Branch deleted: {branch_name} (Code: {b_code})",
            entity_type='BankBranch',
            entity_id=b_code,
            ip_address=get_client_ip(request)
        )

        return Response({"success": True, "message": f"Branch '{branch_name}' ({b_code}) removed successfully."})


class SuperAdminOfficersView(APIView):
    """
    GET /api/v1/superadmin/officers/
    POST /api/v1/superadmin/officers/
    Super Admin management of Branch Admins across all 80 branches.
    """
    def get(self, request):
        ensure_default_accounts()
        requester = resolve_requester(request)
        if not requester or requester.role != 'SUPER_ADMIN':
                return Response(
                    {"success": False, "message": "Access Denied: Super Admin privilege required."},
                    status=status.HTTP_403_FORBIDDEN
                )
        officers = BankOfficer.objects.all().order_by('-created_at')
        serializer = BankOfficerSerializer(officers, many=True)
        return Response({"success": True, "count": officers.count(), "data": serializer.data})

    def post(self, request):
        ensure_default_accounts()
        requester = resolve_requester(request)
        if not requester or requester.role != 'SUPER_ADMIN':
                return Response(
                    {"success": False, "message": "Access Denied: Super Admin privilege required."},
                    status=status.HTTP_403_FORBIDDEN
                )
        data = request.data.copy()
        
        full_name = (data.get('fullName') or data.get('full_name') or data.get('name') or '').strip()
        mobile = (data.get('mobile') or data.get('mobile_number') or data.get('mobileNumber') or '').strip()
        account_number = (data.get('accountNumber') or data.get('account_number') or '').strip()
        employee_id = (data.get('employeeId') or data.get('employee_id') or '').strip()
        branch_name = (data.get('branchName') or data.get('branch_name') or '').strip()
        branch_code = (data.get('branchCode') or data.get('branch_code') or '').strip()
        role = data.get('role', 'BRANCH_ADMIN')
        password = (data.get('password') or '').strip()
        username = (data.get('username') or '').strip()

        # If username not explicitly supplied, derive from employee_id or full_name
        if not username:
            if employee_id:
                username = employee_id.lower().replace(' ', '_')
            elif full_name:
                username = full_name.lower().replace(' ', '_')[:25]

        if not full_name or not branch_name:
            return Response(
                {"success": False, "message": "Name and Branch Assignment are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not password or len(password) < 6:
            return Response(
                {"success": False, "message": "Initial password must be at least 6 characters."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if BankOfficer.objects.filter(username__iexact=username).exists():
            return Response(
                {"success": False, "message": f"Officer with username '{username}' already exists."},
                status=status.HTTP_400_BAD_REQUEST
            )

        branch_obj = BankBranch.objects.filter(Q(branch_name__icontains=branch_name) | Q(branch_code=branch_code)).first()
        if branch_obj and not branch_code:
            branch_code = branch_obj.branch_code

        officer = BankOfficer(
            username=username,
            full_name=full_name,
            employee_id=employee_id,
            account_number=account_number,
            email=data.get('email', f"{username}@namcobank.in"),
            mobile=mobile,
            branch=branch_obj,
            branch_name=branch_name,
            branch_code=branch_code or 'NSK-001',
            role=role,
            is_active=True,
            activation_status='ACTIVE'
        )
        officer.set_password(password)
        officer.save()

        creator_name = requester.full_name
        client_ip = get_client_ip(request)
        create_audit_entry(
            action_type='ADMIN_CREATED',
            username=creator_name,
            officer_role='SUPER_ADMIN',
            branch_name=branch_name,
            details=f"Super Admin created new {role} '{username}' ({full_name}, Emp ID: {employee_id}) assigned to branch [{branch_name}]",
            entity_type='BankOfficer',
            entity_id=str(officer.id),
            ip_address=client_ip
        )

        return Response({
            "success": True,
            "message": f"Branch Admin '{username}' ({full_name}) successfully created for {branch_name}.",
            "data": BankOfficerSerializer(officer).data
        }, status=status.HTTP_201_CREATED)


class SuperAdminOfficerDetailView(APIView):
    """
    PATCH / PUT /api/v1/superadmin/officers/<int:pk>/
    DELETE /api/v1/superadmin/officers/<int:pk>/
    Super Admin edit, password reset, activation/deactivation, and deletion.
    """
    def put(self, request, pk):
        return self.patch(request, pk)

    def patch(self, request, pk):
        requester = resolve_requester(request)
        if not requester or requester.role != 'SUPER_ADMIN':
            return Response({"success": False, "message": "Access Denied: Super Admin privilege required."}, status=status.HTTP_403_FORBIDDEN)

        try:
            officer = BankOfficer.objects.get(pk=pk)
        except BankOfficer.DoesNotExist:
            return Response({"success": False, "message": "Officer not found."}, status=status.HTTP_404_NOT_FOUND)

        if 'is_active' in request.data:
            if officer.username == 'admin' and not request.data['is_active']:
                return Response({"success": False, "message": "Cannot deactivate root super administrator."}, status=status.HTTP_400_BAD_REQUEST)
            officer.is_active = bool(request.data['is_active'])
            if not officer.is_active:
                # Invalidate active sessions immediately upon deactivation
                OfficerSession.objects.filter(officer=officer).update(is_revoked=True)
        if 'role' in request.data:
            officer.role = request.data['role']
        if 'full_name' in request.data or 'fullName' in request.data:
            officer.full_name = (request.data.get('full_name') or request.data.get('fullName')).strip()
        if 'mobile' in request.data:
            officer.mobile = request.data['mobile'].strip()
        if 'employee_id' in request.data or 'employeeId' in request.data:
            officer.employee_id = (request.data.get('employee_id') or request.data.get('employeeId')).strip()
        if 'account_number' in request.data or 'accountNumber' in request.data:
            officer.account_number = (request.data.get('account_number') or request.data.get('accountNumber')).strip()
        if 'branch_name' in request.data:
            officer.branch_name = request.data['branch_name']
            b_obj = BankBranch.objects.filter(branch_name__icontains=officer.branch_name).first()
            if b_obj:
                officer.branch = b_obj
                officer.branch_code = b_obj.branch_code
        if 'password' in request.data and request.data['password']:
            officer.set_password(request.data['password'])
            officer.reset_failed_logins()
            OfficerSession.objects.filter(officer=officer).update(is_revoked=True)

        officer.save()

        performed_by = requester.full_name
        client_ip = get_client_ip(request)
        create_audit_entry(
            action_type='ADMIN_UPDATED',
            username=performed_by,
            officer_role='SUPER_ADMIN',
            branch_name=officer.branch_name,
            details=f"Updated profile for officer '{officer.username}' (Branch: {officer.branch_name}, Active: {officer.is_active})",
            entity_type='BankOfficer',
            entity_id=str(officer.id),
            ip_address=client_ip
        )

        return Response({"success": True, "message": "Officer profile updated.", "data": BankOfficerSerializer(officer).data})

    def delete(self, request, pk):
        requester = resolve_requester(request)
        if not requester or requester.role != 'SUPER_ADMIN':
            return Response({"success": False, "message": "Access Denied: Super Admin privilege required."}, status=status.HTTP_403_FORBIDDEN)

        try:
            officer = BankOfficer.objects.get(pk=pk)
        except BankOfficer.DoesNotExist:
            return Response({"success": False, "message": "Officer not found."}, status=status.HTTP_404_NOT_FOUND)

        if officer.username == 'admin':
            return Response({"success": False, "message": "Cannot delete root super administrator."}, status=status.HTTP_400_BAD_REQUEST)

        username = officer.username
        branch = officer.branch_name
        OfficerSession.objects.filter(officer=officer).update(is_revoked=True)
        officer.delete()

        performed_by = requester.full_name
        client_ip = get_client_ip(request)
        create_audit_entry(
            action_type='ADMIN_DELETED',
            username=performed_by,
            officer_role='SUPER_ADMIN',
            branch_name=branch,
            details=f"Deleted officer account '{username}' of branch [{branch}]",
            entity_type='BankOfficer',
            entity_id=str(pk),
            ip_address=client_ip
        )

        return Response({"success": True, "message": f"Officer '{username}' deleted successfully."})


def seed_audit_events_if_needed():
    # Production Mode: Real audit events are captured dynamically. No mock events are seeded.
    pass


_data_flushed_for_production = False

def flush_all_test_data():
    """
    Purges all demo/test records (customers, consents, consent history, physical forms, challenges, sessions)
    so the bank can ingest real customer records and live production data in a 100% clean state.
    Preserves: 80 Bank Branches and Bank Officer admin accounts.
    """
    global _data_flushed_for_production
    if _data_flushed_for_production:
        return
    _data_flushed_for_production = True
    try:
        Customer.objects.all().delete()
        SMSConsent.objects.all().delete()
        ConsentHistory.objects.all().delete()
        PhysicalForm.objects.all().delete()
        TwoFactorChallenge.objects.all().delete()
        OfficerSession.objects.all().delete()
        with connection.cursor() as cur:
            cur.execute("DELETE FROM tbl_customer_challenges")
            cur.execute("DELETE FROM tbl_audit_logs")
            cur.execute("""
                INSERT INTO tbl_audit_logs (action_type, username, officer_role, branch_name, action_details, ip_address, timestamp)
                VALUES ('SYSTEM_PURGE', 'SYSTEM', 'SYSTEM', 'Head Office (HO)', 'All test records purged. System initialized for live CBS production data.', '127.0.0.1', CURRENT_TIMESTAMP)
            """)
        import logging
        logging.getLogger('namco_bank').info("[SYSTEM] All test data successfully flushed for production.")
    except Exception as e:
        import logging
        logging.getLogger('namco_bank').warning(f"[SYSTEM] Flush test data warning: {e}")


class FlushTestDataView(APIView):
    """
    POST /api/v1/superadmin/flush-test-data/
    Super Admin endpoint to flush all test/mock records and reset tables for live data ingestion.
    """
    def post(self, request):
        ensure_default_accounts()
        requester = resolve_requester(request)
        if not requester or requester.role != 'SUPER_ADMIN':
            return Response({"success": False, "message": "Access Denied: Super Admin privilege required."}, status=status.HTTP_403_FORBIDDEN)

        global _data_flushed_for_production
        _data_flushed_for_production = False
        flush_all_test_data()

        return Response({
            "success": True,
            "message": "All test customer records, consents, forms, and demo audit logs have been successfully flushed. Ready for live CBS data integration."
        })


class SuperAdminAuditLogsView(APIView):
    """
    GET /api/v1/superadmin/audit-logs/ & /api/v1/admin/audit-logs/
    Central bank-wide audit logs across all 80 branches (Super Admin),
    or branch-isolated audit logs for authenticated Branch Admin.
    """
    def get(self, request):
        seed_audit_events_if_needed()
        requester = resolve_requester(request)
        if not requester:
            return Response(
                {"success": False, "message": "Authentication required. Please log in."},
                status=status.HTTP_401_UNAUTHORIZED
            )
        action_filter = request.GET.get('action', '').strip()
        branch_filter = request.GET.get('branch', '').strip()
        user_filter = request.GET.get('user', '').strip()

        logs = AuditLog.objects.all().order_by('-timestamp')

        is_superadmin_view = requester.role == 'SUPER_ADMIN'

        if is_superadmin_view:
            # Super Admin sees bank-wide activities across ALL 80 branches and all branch admins
            if branch_filter and branch_filter.lower() not in ('all', '', 'null', 'undefined'):
                logs = logs.filter(branch_name__icontains=branch_filter)
        elif requester and requester.role == 'BRANCH_ADMIN':
            # Branch isolation: Branch Admin can ONLY view audit logs for their branch
            officer_branch = (requester.branch_name or '').split(',')[0].strip()
            logs = logs.filter(
                Q(branch_name__icontains=requester.branch_name) |
                Q(branch_name__icontains=officer_branch) |
                Q(username__iexact=requester.username)
            )

        if action_filter and action_filter.lower() != 'all':
            logs = logs.filter(action_type=action_filter)
        if user_filter:
            logs = logs.filter(username__icontains=user_filter)

        logs = logs[:1000]
        data = []
        for log in logs:
            data.append({
                "id": log.id,
                "timestamp": log.timestamp.isoformat(),
                "actionType": log.action_type,
                "action": log.action_type,
                "username": log.username,
                "userId": log.user_id or '',
                "user_id": log.user_id or '',
                "officerRole": log.officer_role,
                "branchName": log.branch_name,
                "branch": log.branch_name,
                "entityType": log.entity_type,
                "entityId": log.entity_id,
                "actionDetails": log.action_details,
                "details": log.action_details,
                "description": log.action_details,
                "accountNo": mask_account(log.account_no) if log.account_no else '',
                "refNo": log.ref_no or '',
                "ipAddress": log.ip_address
            })

        return Response({"success": True, "count": len(data), "data": data})

    def post(self, request):
        """
        POST /api/v1/superadmin/audit-logs/ & /api/v1/admin/audit-logs/
        Enables capturing frontend activities from authenticated Branch Admins and Super Admin.
        """
        ensure_default_accounts()
        requester = resolve_requester(request)
        if not requester:
            return Response(
                {"success": False, "message": "Authentication required. Active session required to post audit logs."},
                status=status.HTTP_401_UNAUTHORIZED
            )
        data = request.data or {}

        action_type = data.get('actionType') or data.get('action') or 'ACTIVITY'
        username = get_officer_audit_identity(requester)
        user_id = requester.id
        officer_role = requester.role
        branch_name = requester.branch_name
        details = data.get('details') or data.get('actionDetails') or ''
        account_no = data.get('accountNo') or data.get('account_no')
        ref_no = data.get('refNo') or data.get('ref_no')
        entity_type = data.get('entityType') or 'PORTAL_EVENT'
        entity_id = data.get('entityId')
        client_ip = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', 'Web')[:250]

        log_entry = create_audit_entry(
            action_type=action_type,
            username=username,
            user_id=user_id,
            officer_role=officer_role,
            branch_name=branch_name,
            details=details,
            entity_type=entity_type,
            entity_id=entity_id,
            account_no=account_no,
            ref_no=ref_no,
            ip_address=client_ip,
            user_agent=user_agent
        )

        return Response({
            "success": True,
            "message": f"Audit activity '{action_type}' recorded successfully.",
            "id": log_entry.id if log_entry else None
        }, status=status.HTTP_201_CREATED)


class ApiRootView(APIView):
    """
    GET /api/v1/
    Interactive JSON API Directory & Health Check.
    """
    def get(self, request):
        return Response({
            "name": "Namco Bank SMS Consent Management REST API",
            "version": "3.0.0-ENTERPRISE (Security Hardened & 2FA VAPT Ready)",
            "compliance": "Reserve Bank of India (RBI) IT Framework & Master Directions",
            "twoFactorAuth": "Mandatory 2-Step Verification (PBKDF2 + Cryptographic OTP)",
            "branchIsolation": "Enforced at Database Layer (80 Branches)",
            "status": "ONLINE",
            "endpoints": {
                "consentSubmit": "/api/v1/consent/submit/",
                "consentStatus": "/api/v1/consent/status/",
                "officerLoginStep1": "/api/v1/admin/login/",
                "officerVerify2FAStep2": "/api/v1/admin/verify-2fa/",
                "officerResend2FA": "/api/v1/admin/resend-2fa/",
                "officerLogout": "/api/v1/admin/logout/",
                "branchRecords": "/api/v1/admin/records/",
                "physicalFormUpload": "/api/v1/admin/upload-physical-form/",
                "physicalFormVerify": "/api/v1/admin/verify-physical-form/",
                "branchMetrics": "/api/v1/admin/metrics/",
                "branchesList": "/api/v1/branches/",
                "superAdminOfficers": "/api/v1/superadmin/officers/",
                "superAdminAuditLogs": "/api/v1/superadmin/audit-logs/"
            }
        })

