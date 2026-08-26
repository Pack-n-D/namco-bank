# Namco Bank - Bank SMS Alert Consent & Registration Form

Official SMS Alert Registration and Customer Authorization Form web application for **The Nasik Merchants Co-operative Bank Ltd., Nashik (Namco Bank)**, compliant with Reserve Bank of India (RBI) electronic banking security guidelines.

---

## 🌟 Key Features

1. **Official Bank Branding & Layout**:
   - High-resolution Namco Bank logo, Marathi motto (*॥ संहतिः कार्यसाधिकाः ॥*), Estd. 1959, and Multi-State Scheduled Bank banner.
   - Bank-grade corporate theme with rich navy blue, crimson red, gold highlights, and clean typography.
2. **RBI Guideline Compliant Form Sections**:
   - **Section 1: Customer Identification Details** (Full Name, 15-digit CBS Account Number, CIF / Customer ID, Branch selection, Account Type).
   - **Section 2: Mobile Registration** (10-digit primary mobile number with OTP verification simulation, alternate number, email).
   - **Section 3: RBI & Bank Terms Consent Declaration** (Transparent declaration text covering OTPs, transaction alerts, customer responsibility, and schedule of charges).
   - **Section 4: Customer Consent & Digital Signature** (Interactive Canvas touch/mouse signature pad with clear/undo, typed signature option, or photo upload).
   - **Section 5: Bank Officer Verification Module** (Branch code, Verified by, Mobile updated toggle, Application tracking ID).
3. **Instant Acknowledgment & Receipts**:
   - Auto-generates unique Reference Tracking Numbers (`NAMCO/SMS/2026/08/XXXXX`).
   - Downloadable & Printable Instant Customer Acknowledgment Slip.
4. **Official Physical A4 Form Printing**:
   - Dedicated `@media print` layout for printing an official bank-ready A4 document on physical paper or PDF.
5. **Branch Officer Desk (Local Persistence)**:
   - Dedicated Officer review view with live submission counters and Core Banking System (CBS) update status toggles.

---

## 🚀 How to Deploy on GitHub Pages (Step-by-Step)

This project consists of pure standard HTML5, CSS3, and Vanilla JavaScript with **zero build steps or dependencies required**.

### Step 1: Create a GitHub Repository
1. Go to [github.com](https://github.com) and click **New Repository**.
2. Name your repository (e.g. `namco-bank-sms-consent`).
3. Set the repository to **Public** and click **Create repository**.

### Step 2: Push Your Code
Repository is connected and pushed to:
`https://github.com/Pack-n-D/namco-bank.git`

### Step 3: Enable GitHub Pages
1. Open your repository at [https://github.com/Pack-n-D/namco-bank](https://github.com/Pack-n-D/namco-bank).
2. Click on **Settings** (tab at the top).
3. In the left sidebar, click on **Pages** (under the "Code and automation" section).
4. Under **Build and deployment** > **Source**, choose **Deploy from a branch**.
5. Under **Branch**, select `main` and keep the folder as `/ (root)`.
6. Click **Save**.
7. In about 1–2 minutes, your live site will be published at:
   👉 **`https://pack-n-d.github.io/namco-bank/`**

---

## 📂 Project Structure

```
Namco Bank/
├── index.html        # Main portal, modals & official A4 print template
├── style.css         # Modern styling, responsive design system & @media print rules
├── app.js            # Validation, canvas signature, OTP simulation & local storage
├── assets/
│   └── logo.png      # Official Namco Bank logo
└── README.md         # Deployment & documentation guide
```

---

## 🛠️ Testing Locally
Simply double-click `index.html` to open it in any web browser (Chrome, Edge, Firefox, Safari) or use VS Code Live Server.
