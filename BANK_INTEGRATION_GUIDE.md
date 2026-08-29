# 🏦 Namco Bank - SMS Alert Consent System
## Production REST API & Database Integration Guide

This document outlines how the **SMS Alert Consent Web Portal** integrates directly with **Namco Bank's Core Database and REST API** for handling 300,000+ customer submissions.

---

## 1. 🏗️ Architecture & High-Level Flow

```
[Namco Bank DLT SMS Gateway]
           │
           │  Sends DLT Approved SMS with Link:
           │  "Dear Customer, update your Namco Bank SMS Alert consent here: https://namcobank.com/sms"
           ▼
[Customer's Smartphone Browser]
           │
           │  Customer opens link, enters Account No, CIF, Mobile, signs digital consent
           ▼
[Bank REST API Endpoint] (e.g. POST /api/v1/consent/submit)
           │
           │  Validates, sanitizes & writes to Bank SQL Database (Indexed for 300k+ records)
           ▼
[Bank Database (PostgreSQL / MySQL / MS SQL)]
           │
           ▼
[Bank Admin / Branch Officer Portal]
           │  Real-time search, CBS verification status, CSV/Excel export for Core Banking System (CBS)
```

---

## 2. ⚙️ Connecting to Bank's Existing REST API (Option E)

To connect the frontend to the bank's live server, open [config.js](file:///c:/Users/DELL/Desktop/Namco%20Bank/config.js) and update the `API_BASE_URL`:

```javascript
const BANK_CONFIG = {
  // Replace with the bank's official production API URL:
  API_BASE_URL: "https://api.namcobank.in/api/v1",

  ENDPOINTS: {
    SUBMIT_CONSENT: "/consent/submit",
    GET_CONSENTS: "/admin/consents",
    GET_CONSENT_DETAIL: "/admin/consents/:id",
    UPDATE_CBS_STATUS: "/admin/consents/:id/status",
    EXPORT_CSV: "/admin/consents/export",
    ADMIN_LOGIN: "/admin/auth/login"
  }
};
```

---

## 3. 📡 REST API Specifications

### Endpoint 1: Submit Customer Consent
- **URL**: `/api/v1/consent/submit`
- **Method**: `POST`
- **Headers**: `Content-Type: application/json`
- **Request Body Payload**:
```json
{
  "refNo": "NAMCO-SMS-2026-849201",
  "name": "Sunil Ramesh Patil",
  "accNo": "00120100049281",
  "cif": "10049281",
  "branch": "CBS Head Office, Nashik",
  "mobile": "9822014589",
  "consent": "agree",
  "cbsUpdated": "No",
  "verifiedBy": "DLT SMS Online Consent",
  "date": "2026-08-29",
  "place": "Nashik",
  "signatureData": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
  "timestamp": "2026-08-29T14:20:00.000Z"
}
```
- **Success Response (HTTP 201)**:
```json
{
  "success": true,
  "referenceNo": "NAMCO-SMS-2026-849201",
  "message": "Customer consent successfully recorded in Bank Core Database.",
  "data": {
    "refNo": "NAMCO-SMS-2026-849201",
    "timestamp": "2026-08-29T14:20:00.000Z"
  }
}
```

---

### Endpoint 2: Officer & Admin Login
- **URL**: `/api/v1/admin/auth/login`
- **Method**: `POST`
- **Request Body**:
```json
{
  "username": "officer",
  "password": "your_secure_password"
}
```
- **Success Response (HTTP 200)**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "username": "officer",
    "role": "BRANCH_OFFICER",
    "branch": "Nashik Head Office"
  }
}
```

---

### Endpoint 3: Fetch Submissions (For Admin Dashboard)
- **URL**: `/api/v1/admin/consents?page=1&limit=50&search=9822014589&status=AGREED`
- **Method**: `GET`
- **Headers**: `Authorization: Bearer <token>`
- **Success Response (HTTP 200)**:
```json
{
  "success": true,
  "total": 304200,
  "page": 1,
  "totalPages": 6084,
  "stats": {
    "total": 304200,
    "agreed": 298400,
    "disagreed": 5800,
    "cbsPending": 12400
  },
  "records": [
    {
      "refNo": "NAMCO-SMS-2026-849201",
      "name": "Sunil Ramesh Patil",
      "accNo": "00120100049281",
      "cif": "10049281",
      "branch": "CBS Head Office, Nashik",
      "mobile": "9822014589",
      "consent": "agree",
      "cbsUpdated": "Yes",
      "timestamp": "2026-08-29T14:20:00.000Z"
    }
  ]
}
```

---

### Endpoint 4: Update CBS Synchronization Status
- **URL**: `/api/v1/admin/consents/:id/status`
- **Method**: `PATCH`
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
```json
{
  "cbsUpdated": "Yes"
}
```

---

### Endpoint 5: Download Batch CSV for Core Banking Import
- **URL**: `/api/v1/admin/consents/export`
- **Method**: `GET`
- **Headers**: `Authorization: Bearer <token>`
- **Response**: CSV file stream (`attachment; filename=Namco_SMS_Consents_2026-08-29.csv`)

---

## 4. 🗄️ Database Setup (SQL Schema)

The database schema is provided in [schema.sql](file:///c:/Users/DELL/Desktop/Namco%20Bank/schema.sql). 

### Key Performance Indexes:
```sql
CREATE INDEX idx_namco_account_no ON tbl_sms_consent_records(account_no);
CREATE INDEX idx_namco_mobile_no ON tbl_sms_consent_records(mobile_no);
CREATE INDEX idx_namco_cif_no ON tbl_sms_consent_records(cif_no);
CREATE INDEX idx_namco_consent ON tbl_sms_consent_records(consent_choice);
CREATE INDEX idx_namco_created_at ON tbl_sms_consent_records(created_at DESC);
```

---

## 5. 🚀 Running the Included Backend Server Locally

If the bank does not yet have the API live, you can launch the included Node.js server immediately:

```bash
# 1. Install express and cors
npm install express cors

# 2. Start the server
node server.js
```
The server will run on port `5000` (`http://localhost:5000`).

---

## 6. 🔒 Security & RBI Compliance Safeguards

1. **No Sensitive Banking Secrets Exposed**: All sensitive operations and credentials reside securely behind server-side authentication.
2. **Double-Submission Prevention**: Buttons disable during submission with visual loading feedback to avoid double records.
3. **Audit Trail**: Every consent entry captures Timestamp, Reference No, Form Place & Date, plus digital signature proof.
4. **Offline Resilience**: If connectivity drops, submission data is preserved on device and synchronizes when re-established.
