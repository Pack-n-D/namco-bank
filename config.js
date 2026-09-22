/**
 * Namco Bank - Central Application & API Configuration
 * Supports Django + PostgreSQL Backend & Multi-Branch Governance
 */

const BANK_CONFIG = {
  BANK_NAME: "The Nasik Merchants Co-operative Bank Ltd.",
  SHORT_NAME: "Namco Bank",
  PORTAL_VERSION: "3.0.0-ENTERPRISE",

  // REST API Configuration
  // Checks environment / local server ports (Django 3000 / 8000 / Node 5000 / production)
  API_BASE_URL: (() => {
    if (typeof window !== 'undefined') {
      const loc = window.location;
      if (loc.origin && loc.origin.startsWith('http') && !loc.origin.includes('github.io')) {
        return `${loc.origin}/api/v1`;
      }
    }
    return "http://127.0.0.1:3000/api/v1";
  })(),

  ENDPOINTS: {
    SUBMIT_CONSENT: "/consent/submit",
    ADMIN_LOGIN: "/admin/login",
    CHANGE_PASSWORD: "/admin/change-password",
    GET_RECORDS: "/admin/records",
    UPDATE_CBS_STATUS: "/admin/records/:refNo/cbs-status",
    UPLOAD_PHYSICAL_FORM: "/admin/upload-physical-form",
    METRICS: "/admin/metrics",
    BRANCHES: "/branches",
    SUPERADMIN_OFFICERS: "/superadmin/officers",
    SUPERADMIN_OFFICER_DETAIL: "/superadmin/officers/:id",
    SUPERADMIN_AUDIT_LOGS: "/superadmin/audit-logs"
  },

  ENABLE_OFFLINE_STORAGE_FALLBACK: true,
  REQUEST_TIMEOUT_MS: 12000,
  MAX_SIGNATURE_WIDTH: 600,
  MAX_SIGNATURE_HEIGHT: 200
};

if (typeof window !== 'undefined') {
  window.BANK_CONFIG = BANK_CONFIG;
}
