# 🏦 Namco Bank - On-Premise Datacenter Deployment & Compliance Blueprint

## 🏛️ Executive Architecture & Regulatory Overview
This document serves as the official technical specification for deploying the **Namco Bank SMS Alert Consent & Governance System** directly inside **The Nasik Merchants Co-operative Bank Ltd.’s Private Datacenter**.

> [!IMPORTANT]
> **RBI Cyber Security Framework for Urban Co-operative Banks (UCBs)**:
> In accordance with RBI guidelines, customer CIF data, account numbers, and mobile consent decisions are stored **exclusively within Namco Bank's internal datacenter perimeter**. No customer data or administrative traffic is hosted or processed on third-party public clouds.

---

## 🔒 1. Demarcation of Ownership & Security Liability

| Responsibility Area | Handled By | Scope & Guarantees |
| :--- | :---: | :--- |
| **Application Logic & Code Hardening** | Development Team | Zero cloud leaks, SQL parameterization, PBKDF2 SHA-256 hashing, 5-attempt brute-force lockout, immutable audit logging. |
| **Physical Server & Hardware Security** | Bank IT Team | Rack security, UPS, biometric datacenter access, server maintenance. |
| **Network Perimeter & Firewall** | Bank Network Team | DMZ configuration, WAF (Fortinet/F5), internal MPLS/VPN branch routing, DDoS mitigation. |
| **Database Encryption & Daily Backups** | Bank Core DBA | PostgreSQL Transparent Data Encryption (TDE), automated daily snapshots, disaster recovery (DR). |
| **DLT SMS Gateway Appliance** | Bank Telephony / IT | Physical internal DLT appliance connectivity, sender ID (`NAMCOB`), approved templates. |

---

## 🌐 2. Multi-Tier Zone Architecture & Network Topology

```
                         [ PUBLIC INTERNET (Customers) ]
                                        │
                                        │ HTTPS (Port 443 Only)
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ 🛡️ ZONE 1: PUBLIC DMZ (Demilitarized Zone)                                                │
│   • Nginx Reverse Proxy / SSL Termination (`consent.namcobank.in`)                        │
│   • Public Route ONLY: `index.html` and `/api/v1/consent/*`                               │
│   • RESTRICTED for Public: `admin.html`, `super-admin.html`, `login.html` (HTTP 403)      │
└───────────────────────────────────────┬───────────────────────────────────────────────────┘
                                        │
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ 🏢 ZONE 2: BANK INTRANET / BRANCH MPLS LAN (Officers & Super Admin)                       │
│   • 80 Branches connected via dedicated internal subnets (`10.0.0.0/8`, `172.16.0.0/12`)  │
│   • Access to `login.html`, `admin.html`, and `super-admin.html` allowed from branch IPs  │
└───────────────────────────────────────┬───────────────────────────────────────────────────┘
                                        │
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚙️ ZONE 3: APPLICATION SERVER (Internal Subnet: e.g. 10.10.20.15)                          │
│   • Python 3.12+ Django REST Framework / Gunicorn WSGI                                    │
│   • Local Tesseract OCR Engine (100% On-Premise OCR, zero cloud calls)                    │
│   • Internal SMS Service Connector ([sms_service.py](file:///c:/Users/DELL/Desktop/Namco%20Bank/backend/consent_portal/sms_service.py))     │
└──────────────────────────┬────────────────────────────────────────┬───────────────────────┘
                           │                                        │
                           ▼                                        ▼
┌──────────────────────────────────────────────────┐  ┌─────────────────────────────────────┐
│ 🗄️ ZONE 4: ISOLATED POSTGRESQL CLUSTER           │  │ 📱 BANK INTERNAL DLT SMS APPLIANCE  │
│   • IP: `10.10.20.20:5432`                       │  │   • IP: `http://10.10.5.40:8080/`   │
│   • Port 5432 bound exclusively to App Server IP │  │   • Internal HTTP/SMPP Route        │
│   • AES-256 Column Encryption                    │  │   • Delivers 2FA OTPs inside bank   │
└──────────────────────────────────────────────────┘  └─────────────────────────────────────┘
```

---

## 📱 3. Internal DLT SMS Gateway Configuration

The system uses [backend/consent_portal/sms_service.py](file:///c:/Users/DELL/Desktop/Namco%20Bank/backend/consent_portal/sms_service.py) to route 2FA OTPs through the bank's internal on-premise SMS appliance.

In `backend/.env`, set:
```bash
# Set to False in production datacenter
BANK_SMS_MOCK_MODE=False

# Bank's Internal SMS Gateway Appliance IP & Port
BANK_SMS_GATEWAY_URL=http://10.10.5.40:8080/api/v1/sms/send
BANK_SMS_API_KEY=NAMCO_INTERNAL_GATEWAY_AUTH_KEY_2026
BANK_SMS_SENDER_ID=NAMCOB
BANK_SMS_DLT_ENTITY_ID=1401157291823901234
BANK_SMS_DLT_TEMPLATE_2FA=1407168291029384756
BANK_SMS_DLT_TEMPLATE_ACK=1407168291029384757
```

---

## 📦 4. 100% Air-Gapped Asset Independence

To guarantee zero dependency on external public CDNs:
- **Bootstrap Icons**: Bundled locally in [assets/vendor/bootstrap-icons.min.css](file:///c:/Users/DELL/Desktop/Namco%20Bank/assets/vendor/bootstrap-icons.min.css).
- **Chart.js**: Bundled locally in [assets/vendor/chart.umd.min.js](file:///c:/Users/DELL/Desktop/Namco%20Bank/assets/vendor/chart.umd.min.js).
- **Web Fonts**: Inter and JetBrains Mono fonts fallback gracefully to system sans-serif and monospace fonts if internet is blocked.

---

## 🚀 5. Step-by-Step Installation for Bank IT Team

### Step 1: Copy Application to Web Root
```bash
mkdir -p /var/www/namco-bank
cp -r /path/to/extracted/namco-bank/* /var/www/namco-bank/
cd /var/www/namco-bank
```

### Step 2: Configure Environment Variables
Copy and edit the production configuration:
```bash
cp backend/.env.example backend/.env
nano backend/.env
```
*(Configure `DB_HOST`, `DB_PASSWORD`, `BANK_SMS_GATEWAY_URL`, and `ALLOWED_HOSTS`)*

### Step 3: Run the Automated Deployment Script
```bash
chmod +x deploy/deploy.sh
sudo ./deploy/deploy.sh
```

---

## 🛡️ 6. Pre-Go-Live VAPT & Security Checklist

Before issuing production sign-off, verify:

- [x] **Zero Cloud Leakage**: Verify with `tcpdump` or Wireshark that zero outbound packets leave for AWS/GCP/Twilio.
- [x] **Subnet Restriction**: Confirm that accessing `/admin.html` from a public IP returns **HTTP 403 Forbidden**.
- [x] **Brute-Force Shield**: Confirm that entering 5 incorrect passwords locks the officer account for 15 minutes.
- [x] **Two-Factor Authentication**: Confirm 2FA SMS code arrives on the registered officer phone via internal DLT gateway.
- [x] **Audit Trail Verification**: Confirm every login, consent submission, revocation, and password update appears in `tbl_admin_audit_logs`.
