-- =====================================================================
-- 🏦 NAMCO BANK - SMS ALERT CONSENT DATABASE SCHEMA
-- Designed for High-Throughput (300,000+ Customer Volume)
-- Compatible with: PostgreSQL, MySQL 8.0+, Oracle, MS SQL Server
-- =====================================================================

-- 1. Main SMS Consent Records Table
CREATE TABLE IF NOT EXISTS tbl_sms_consent_records (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ref_no VARCHAR(64) NOT NULL UNIQUE,                -- e.g. NAMCO-SMS-2026-XXXXXX
    customer_name VARCHAR(150) NOT NULL,              -- Full Name of Customer
    account_no VARCHAR(20) NOT NULL,                  -- 15/16 digit CBS Account No
    cif_no VARCHAR(20) NOT NULL,                      -- Customer Identification File (CIF)
    branch_name VARCHAR(100) DEFAULT 'Main Branch',   -- Branch Name / Code
    mobile_no VARCHAR(15) NOT NULL,                   -- 10-digit Registered Mobile
    consent_choice VARCHAR(10) NOT NULL,              -- 'agree' OR 'disagree'
    cbs_updated VARCHAR(5) DEFAULT 'No',              -- 'Yes' OR 'No'
    verified_by VARCHAR(100) DEFAULT 'DLT SMS Online',
    form_date DATE NOT NULL,
    form_place VARCHAR(100) DEFAULT 'Nashik',
    digital_signature LONGTEXT NULL,                  -- Base64 Signature or Checksum
    ip_address VARCHAR(45) NULL,                      -- IPv4 / IPv6 for RBI Audit
    user_agent VARCHAR(255) NULL,                     -- Device / Browser Header
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =====================================================================
-- 🚀 HIGH PERFORMANCE INDEXES FOR 300,000+ USERS LOOKUPS
-- =====================================================================
CREATE INDEX idx_namco_account_no ON tbl_sms_consent_records(account_no);
CREATE INDEX idx_namco_mobile_no ON tbl_sms_consent_records(mobile_no);
CREATE INDEX idx_namco_cif_no ON tbl_sms_consent_records(cif_no);
CREATE INDEX idx_namco_consent ON tbl_sms_consent_records(consent_choice);
CREATE INDEX idx_namco_cbs_status ON tbl_sms_consent_records(cbs_updated);
CREATE INDEX idx_namco_created_at ON tbl_sms_consent_records(created_at DESC);

-- =====================================================================
-- 2. Bank Officer & Admin Users Table (Role-Based Access)
-- =====================================================================
CREATE TABLE IF NOT EXISTS tbl_bank_officers (
    officer_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    branch_code VARCHAR(20) NOT NULL,
    role VARCHAR(30) DEFAULT 'BRANCH_OFFICER',       -- 'BRANCH_OFFICER', 'AUDITOR', 'SUPER_ADMIN'
    is_active TINYINT(1) DEFAULT 1,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample default records for testing
INSERT INTO tbl_bank_officers (username, password_hash, full_name, branch_code, role) 
VALUES 
('admin', '$2b$12$e8YQd9...hashed...', 'Central Systems Admin', 'HO-001', 'SUPER_ADMIN'),
('officer', '$2b$12$e8YQd9...hashed...', 'Branch Verification Officer', 'NSK-002', 'BRANCH_OFFICER')
ON DUPLICATE KEY UPDATE full_name=full_name;

-- =====================================================================
-- 3. Central System Audit Trail & Officer Activity Logs Table
-- =====================================================================
CREATE TABLE IF NOT EXISTS tbl_admin_audit_logs (
    log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    action_type VARCHAR(50) NOT NULL,             -- 'ADMIN_LOGIN', 'CBS_STATUS_UPDATED', 'ADMIN_CREATED', etc.
    username VARCHAR(50) NOT NULL,                -- Performing Officer ID
    officer_role VARCHAR(30) NULL,
    branch_name VARCHAR(100) NOT NULL,
    action_details TEXT NOT NULL,                 -- Tamper-evident detail string
    account_no VARCHAR(20) NULL,
    ref_no VARCHAR(64) NULL,
    ip_address VARCHAR(45) NULL
);

CREATE INDEX idx_audit_timestamp ON tbl_admin_audit_logs(timestamp DESC);
CREATE INDEX idx_audit_username ON tbl_admin_audit_logs(username);
CREATE INDEX idx_audit_action ON tbl_admin_audit_logs(action_type);
CREATE INDEX idx_audit_branch ON tbl_admin_audit_logs(branch_name);

