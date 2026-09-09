# 🏦 Namco Bank - SMS Alert Consent Management & Governance System

Enterprise Banking SMS Alert Consent, Physical Form OCR Auto-Fill Ingestion, and Central Multi-Branch Administrative Governance System for **The Nasik Merchants Co-operative Bank Ltd. (Namco Bank)**.

> [!IMPORTANT]
> **Purpose Limitation**: This system is strictly designed to **COLLECT, STORE, VERIFY, MANAGE, and REPORT** customer SMS alert consent. It **does NOT send SMS messages** and contains no SMS gateways or messaging dispatch engines.

---

## 🌟 Key Functional Roles & Capabilities

### 1. 👤 Role 1 — Customer Portal (`index.html`)
- **Online Consent Submission**: Customers choose **YES** (Consented to SMS alerts) or **NO** (Declined optional alerts; statutory only).
- **Mandatory Banking Fields**: Customer Name, Account Number, CIF Number, Mobile Number, Branch (all 80 branches), Form Date, Form Place.
- **Digital E-Signature**: HTML5 interactive canvas for capturing digital signatures securely.
- **Unique Tracking Reference**: Real-time generation of immutable reference numbers (e.g., `NAMCO-SMS-2026-000001`).
- **Status Inquiry & Revocation**: Customers can check their status anytime or revoke previously granted consent online with mobile verification.
- **Download Blank Physical Form (PDF)**: Clean ruled A4 pen-and-paper form generator for offline branch submissions.

### 2. 🏢 Role 2 — Branch Admin Portal (`admin.html`)
- **Strict Multi-Tenant Branch Isolation**: Branch Admins are locked strictly to their assigned branch. Backend authorization enforces that officers cannot access or modify records from any other branch.
- **Branch Dashboard KPIs**: Real-time counters for **TOTAL**, **YES**, **NO**, **PENDING**, **REVOKED**, and **Online vs. Physical/OCR** submissions.
- **Customer Search with Data Masking**: Search by Name, Account No, CIF, Mobile, Ref No, Status, and Source with automatic masking of sensitive numbers (`XXXXX1234`, `98XXXXXX83`).
- **📄 AI / OCR Physical Form Ingestion & Verification**:
  1. Branch Admin uploads scanned document (JPG, JPEG, PNG, PDF).
  2. OCR engine automatically extracts Name, Account No, CIF, Branch, Mobile, and Consent.
  3. Displays **Verification Screen** (`[Confirm & Save]` vs `[Edit]`) allowing the officer to verify against the paper copy and make corrections before saving.
- **Filtered Branch Data Export**: 1-click export of `YES`, `NO`, `PENDING`, `REVOKED`, or `ALL` branch records in CSV format with automated audit logging.

### 3. 🛡️ Role 3 — Super Admin Central Governance (`super-admin.html`)
- **Bank-Wide Analytics**: Aggregated KPIs across all 80 branches.
- **Branch-Wise Performance Table**: Full breakdown by branch showing Total, YES, NO, PENDING, REVOKED, and Compliance Percentage.
- **Multi-Branch Admin Manager**: Create, edit, assign branch, activate/deactivate, and reset passwords for Branch Admins across all 80 branches.
- **📜 Central Tamper-Evident Audit Trail**: Real-time immutable audit logs capturing all authentications, consent submissions, revocations, OCR uploads, OCR verifications, admin modifications, and report exports.
- **Bank-Wide Reports Export**: Export bank-wide datasets with audit logging.

---

## 🗄️ Database Architecture (PostgreSQL & Django ORM)

- `tbl_bank_branches`: All 80 official Namco Bank branches with branch codes and cities.
- `tbl_bank_officers`: RBAC (`SUPER_ADMIN`, `BRANCH_ADMIN`), PBKDF2 password hashing, and brute-force account lockout (5 failed attempts $\rightarrow$ 15-minute lockout).
- `tbl_customers`: Master bank customer population supporting accurate `PENDING` vs `YES`/`NO` consent states.
- `tbl_sms_consents`: Consent records with status (`YES`, `NO`, `PENDING`, `REVOKED`), source (`ONLINE`, `PHYSICAL_OCR`, `ADMIN_ENTRY`), and references.
- `tbl_consent_history`: Immutable chronological audit log of consent status transitions over time.
- `tbl_physical_forms`: Original uploaded scans, raw OCR texts, extracted JSON, and verifying officer timestamps.
- `tbl_admin_audit_logs`: Bank-wide immutable audit trail.

---

## 🚀 Quick Start Guide

### 1. Opening the Web Portals Directly in Any Browser
- **Public Customer Form & Status**: [index.html](file:///c:/Users/DELL/Desktop/Namco%20Bank/index.html)
- **Branch Admin Portal**: [admin.html](file:///c:/Users/DELL/Desktop/Namco%20Bank/admin.html)
- **Super Admin Governance**: [super-admin.html](file:///c:/Users/DELL/Desktop/Namco%20Bank/super-admin.html)

### 2. Running Django + PostgreSQL Backend (Optional)
```bash
cd backend
pip install -r requirements.txt
python manage.py makemigrations consent_portal
python manage.py migrate
python manage.py runserver 8000
```

*Default credentials:*
- **Super Admin**: `admin` / `admin123`
- **Branch Officer (Canada Corner)**: `officer` / `officer123`
