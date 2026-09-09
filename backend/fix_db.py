import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'db.sqlite3')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

def add_column_if_missing(table, column, col_type):
    cursor.execute(f"PRAGMA table_info({table})")
    cols = [row[1] for row in cursor.fetchall()]
    if column not in cols:
        print(f"Adding '{column}' to {table}...")
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")

# Add missing columns to tbl_bank_officers
add_column_if_missing('tbl_bank_officers', 'activation_status', 'VARCHAR(30) DEFAULT "ACTIVE"')
add_column_if_missing('tbl_bank_officers', 'two_factor_enabled', 'BOOLEAN DEFAULT 1')
add_column_if_missing('tbl_bank_officers', 'last_2fa_success', 'DATETIME NULL')

# Add missing columns to tbl_admin_audit_logs
cursor.execute("""
CREATE TABLE IF NOT EXISTS tbl_admin_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id VARCHAR(50) NULL,
    username VARCHAR(100) NOT NULL,
    officer_role VARCHAR(40) NULL,
    branch_name VARCHAR(150) NOT NULL,
    action_type VARCHAR(60) NOT NULL,
    entity_type VARCHAR(50) NULL,
    entity_id VARCHAR(100) NULL,
    action_details TEXT NOT NULL,
    account_no VARCHAR(25) NULL,
    ref_no VARCHAR(64) NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)
""")

add_column_if_missing('tbl_admin_audit_logs', 'user_id', 'VARCHAR(50) NULL')
add_column_if_missing('tbl_admin_audit_logs', 'entity_type', 'VARCHAR(50) NULL')
add_column_if_missing('tbl_admin_audit_logs', 'entity_id', 'VARCHAR(100) NULL')
add_column_if_missing('tbl_admin_audit_logs', 'user_agent', 'VARCHAR(255) NULL')

# Create Two-Factor Challenges Table
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

# Create Officer Sessions Table
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

conn.commit()
conn.close()
print("2FA, Session & Audit log tables/columns updated successfully!")
