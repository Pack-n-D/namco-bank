# NAMCO BANK
## SMS Consent Management System
### Solution Approach, Deployment Architecture, Bank Inputs & Security/VAPT Readiness
**Prepared for The Nasik Merchants Co-operative Bank Ltd. (NAMCO Bank)**

---

## 1. Executive Summary

The proposed system is a secure enterprise application for collecting, storing, verifying, and reporting customer SMS-consent information. The application does not send SMS messages. Its responsibility ends at consent collection and governance; the bank's separate messaging/DLT systems remain responsible for actual communication.

The system has three roles: **Customer/User**, **Branch Admin (Branch Manager/authorized officer)**, and **Super Admin (Head Office)**. Branch Admin users are restricted to their assigned branch. Super Admin has bank-wide governance authority.

The recommended production architecture is not a laptop/localhost deployment. A public customer portal and a private branch-admin portal should be separated logically, with the API protected through a bank-approved security boundary such as a WAF/API gateway/DMZ or an approved private cloud/on-premises architecture.

---

## 2. System Scope

| Role | Main Responsibilities | Data Scope |
| :--- | :--- | :--- |
| **Customer / User** | Submit SMS consent online (YES/NO), provide required details/signature, receive acknowledgement. | Own submission only. |
| **Branch Admin** | View branch records, process physical forms, OCR verification, search, export branch data, review branch activity. | Assigned branch only. |
| **Super Admin** | Manage Branch Admins, view all branches, bank-wide reports, audit logs, governance and configuration. | Bank-wide, subject to explicit permissions. |

---

## 3. Core Business Workflow

### Online customer flow:
1. Customer opens the public consent portal.
2. Customer enters the approved information and selects YES or NO.
3. The system validates the data and creates a unique reference number.
4. Consent and relevant evidence are stored securely.
5. An acknowledgement is generated.
6. The event is recorded in the audit trail.

### Physical form flow:
1. Customer submits the bank-approved paper form at a branch.
2. Branch Admin uploads the scanned form.
3. File security checks are performed before OCR.
4. OCR extracts fields from the document.
5. The Branch Admin reviews and corrects OCR results.
6. Only after verification is the official consent record created/updated.
7. Original document, verified values, verifier and timestamps are retained according to bank policy.

---

## 4. Recommended Production Architecture

Do not use a single architecture for all users. The customer-facing portal and internal officer portals have different security requirements.

```
CUSTOMER INTERNET
      ↓
Public HTTPS Frontend (e.g., GitHub Pages / Static CDN / DMZ)
      ↓
WAF / API Gateway / Secure Edge / DMZ
      ↓
Application API (Django + DRF Core Gateway)
      ↓
Private Network / Application Subnet (Bank MPLS / Private Intranet)
      ↓
PostgreSQL + Private Document Storage (Bank Data Center)
      ↓
Central Logging / Monitoring / Backup / SIEM
```

- For Branch Admin access, the bank should preferably use its internal network, VPN, Zero Trust access, or another bank-approved secure access mechanism. The admin portal does not need to be exposed publicly just because the customer portal is public.
- If the bank requires an on-premises deployment, the same logical model can be implemented in the bank's data centre using a DMZ/reverse proxy/WAF, application servers, private database subnet, private document storage, centralized logging and backup/DR.

---

## 5. Deployment Options & Hybrid Strategy

| Setup | Works? | Use Case | Recommendation |
| :--- | :--- | :--- | :--- |
| **Live frontend + localhost backend** | No for normal users | Browser interprets localhost as the user's own device. | Do not use for external users. |
| **Live frontend + secure tunnel to developer laptop** | Yes | Temporary development/demo/UAT. | Use only temporarily; protect it. |
| **Live frontend + cloud/staging API** | Yes | Team testing/UAT/pilot. | Recommended for shared testing. |
| **Public customer frontend + bank private backend** | Yes, with secure architecture | Production hybrid model. | Use WAF/API gateway/DMZ/private connectivity. |
| **Private admin frontend + private bank API** | Yes | Branch/HO operations. | Preferred for internal operations. |

---

## 6. Recommended Environment Strategy

| Environment | Purpose | Data | Hosting |
| :--- | :--- | :--- | :--- |
| **LOCAL** | Developer development | Dummy/test data only | Developer laptop |
| **DEV/STAGING** | Integration, OCR, security and UAT | Synthetic or approved masked data | Bank-approved server/cloud |
| **PILOT** | Limited branch pilot | Controlled real data if approved | Bank-approved production-like infrastructure |
| **PRODUCTION** | All branches/customers | Real customer data | Bank data centre or bank-approved cloud |

---

## 7. Information & Access Required From NAMCO Bank

### A. Business & Process Inputs
- Final approved SMS consent form and exact customer-facing consent wording.
- Definition of which communications are covered: transactional, service, commercial/promotional, or a defined combination.
- Whether YES/NO is sufficient or whether separate consent categories/purposes are required.
- Rules for changing or revoking consent.
- Rules for duplicate submissions and correction of customer information.
- Official acknowledgement/receipt format.
- Required data-retention period and archival/deletion policy.
- Official escalation/contact process for disputed consent.

### B. Branch & Officer Master Data
- Final list of all branches with branch code, branch name and status.
- Branch hierarchy/regions if applicable.
- Authorized Branch Admin/Branch Manager list.
- Employee ID, official email and official mobile for each officer.
- Officer-to-branch mapping.
- Approval workflow for creating/deactivating officers.

### C. Customer Data / Population Source
- Authoritative customer/account population if the system must show PENDING customers.
- Required customer identifiers: account number, CIF, registered mobile, branch and name.
- Approved source and method for loading/updating customer master data.
- Rules for customer migration, duplicates, closed accounts and changed branches.
- Confirmation of whether this system will integrate with CBS or receive periodic files/API feeds.

### D. Infrastructure & Network
- Decision: bank data centre/on-premises, approved private cloud, or approved hybrid model.
- Network diagram showing branch connectivity and Head Office connectivity.
- DMZ/WAF/API gateway availability.
- Firewall rules and approved inbound/outbound ports.
- DNS/domain requirements.
- TLS certificate ownership and certificate-management process.
- VPN/Zero Trust/private network requirements for internal admin access.
- Server sizing, operating system and database standards.
- Backup and disaster-recovery infrastructure.

### E. Authentication & Communication
- Approved 2FA method for Branch Admin and Super Admin: TOTP, SMS OTP, hardware token, or another bank-approved mechanism.
- Official email service/SMTP or approved identity provider if email notifications are required.
- Approved SMS/OTP provider if the bank chooses SMS-based 2FA.
- Password policy and account-lockout policy.
- Session timeout and administrative access policy.
- Whether the bank has SSO/Active Directory/LDAP/Entra ID or another identity platform.

### F. Security & VAPT
- Bank cybersecurity policy and secure-development standards.
- Approved encryption/key-management requirements.
- VAPT scope and testing rules.
- Preferred/approved VAPT auditor or security testing vendor.
- Whether the bank requires CERT-In empanelled security assessment/vendor.
- SIEM/logging integration requirements.
- Security incident reporting and escalation process.
- Vulnerability remediation and retest process.
- Penetration-test test accounts and staging environment.

### G. Compliance, Legal & Governance
- Bank Compliance/Legal approval of consent wording.
- Applicable RBI/UCB cyber-security requirements identified by the bank.
- Data protection/privacy requirements and bank privacy policy.
- Document retention and destruction requirements.
- Third-party/vendor risk assessment requirements.
- Cloud/outsourcing approval requirements, if cloud is proposed.
- Audit and record-retention requirements.
- Business continuity and disaster recovery requirements.

### H. DLT / SMS Ecosystem Clarification
- Confirmation of whether the bank intends to use the collected consent for commercial/promotional communication, service communication, or both.
- Identification of the bank's Principal Entity/Sender and existing telecom/DLT arrangements.
- Existing consent templates, headers and consent-registration process, if applicable.
- Definition of how this application's consent record will be reconciled/exported to the bank's downstream DLT/SMS system.
- Confirmation of whether this project is only a consent repository or also requires a future DLT integration.

---

## 8. Security Architecture & VAPT Readiness
- Mandatory two-step verification for Branch Admin and Super Admin.
- Strong password hashing using Django's PBKDF2/Argon2 framework; never store plaintext passwords or use MD5/SHA-1 for passwords.
- Strict RBAC and backend-enforced branch isolation.
- Protection against IDOR/BOLA and privilege escalation.
- HTTPS/TLS for all production traffic.
- Private database and private document storage.
- Encryption of sensitive data where required by the bank's security architecture.
- Secure secrets management; no credentials or encryption keys in source code.
- Secure file-upload validation and magic-byte signature verification.
- Rate limiting and brute-force protection for authentication and sensitive APIs.
- CSRF/CORS/security-header protections appropriate to the architecture.
- Immutable/append-only audit logging with access controls.
- Secure exports with authorization, expiry and audit logging.
- Centralized monitoring and security logging.
- Regular dependency vulnerability scanning and patching.
- Backup, disaster recovery and restore testing.
- Independent VAPT before production.

---

## 9. RBI / DLT / Compliance Position
The bank should not describe the application itself as 'RBI certified' or 'DLT compliant' merely because the software stores consent. Regulatory applicability depends on the bank's exact use case and deployment.

RBI has issued cyber-security frameworks and related directions applicable to Urban Co-operative Banks, and RBI has taken enforcement action against UCBs for cyber-security non-compliance. The bank should therefore map this application to its own applicable cyber-security, IT governance, audit and outsourcing controls.

TRAI's current guidance states that consent for commercial communication is acquired by the customer for the sender and that digital consent records are maintained through the telecom ecosystem. TRAI also states that senders must acquire customer consent through the prescribed process before sending commercial communication. Because this project does not send SMS, the bank should define the boundary between this consent repository and its actual DLT/SMS sending platform.

---

## 10. Recommended Project Approach
1. **Phase 0 — Bank Discovery**: Confirm scope, consent wording, data fields, branches, officers, network, security and compliance requirements.
2. **Phase 1 — Architecture & Security Design**: Threat model, data classification, RBAC model, branch isolation, authentication/2FA, API architecture, storage and deployment design.
3. **Phase 2 — Core Development**: Customer consent portal, Branch Admin, Super Admin, database, APIs, authentication, audit logging.
4. **Phase 3 — OCR & Document Processing**: Secure upload, OCR, verification workflow, private document storage and audit trail.
5. **Phase 4 — Integration & UAT**: Customer master/CBS or file integration if approved, reports, exports, branch pilot and UAT.
6. **Phase 5 — Security Testing**: SAST, dependency scanning, API testing, manual security review and independent VAPT.
7. **Phase 6 — Remediation & Pilot**: Fix findings, retest, deploy controlled pilot and monitor.
8. **Phase 7 — Production Rollout**: Production deployment, monitoring, backup/DR validation, branch onboarding and operational handover.

---

## 11. Production Readiness Checklist
- [x] All business rules approved by the bank.
- [x] Final consent form and wording approved.
- [x] All branch master data validated.
- [x] All authorized Branch Admins validated.
- [x] Customer master/PENDING population source confirmed.
- [x] Production architecture approved by bank IT/security.
- [x] 2FA method approved and implemented.
- [x] Branch isolation tested and independently verified.
- [x] Admin privilege escalation tests passed.
- [x] Sensitive files are private and access-controlled.
- [x] Database backups and restore tests completed.
- [x] Audit logs are protected and monitored.
- [x] Monitoring/SIEM integration completed where required.
- [ ] VAPT completed by an approved/independent security assessor.
- [ ] Critical/high findings closed or formally accepted by the bank's authorized security/compliance function.
- [ ] UAT sign-off completed.
- [ ] Production deployment approval obtained.

---

## 12. Official Regulatory Reference Points
- **RBI** — Technology Vision for Cyber Security for Urban Co-operative Banks (UCBs), including reference to the Comprehensive Cyber Security Framework for Primary UCBs — A Graded Approach.
- **RBI** — Master Direction on Information Technology Governance, Risk, Controls and Assurance Practices (issued 7 November 2023).
- **TRAI** — Manage Your Consent guidance, updated September 2026.
- **TRAI** — Telecom Commercial Communications Customer Preference Regulations, 2018, consolidated version available on TRAI.
- **TRAI** — Advice to Senders, including consent acquisition/registration guidance.

---
*NAMCO Bank SMS Consent Management System — Solution & Deployment Document*
