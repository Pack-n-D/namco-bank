/**
 * Namco Bank - Central Application & API Configuration
 * 
 * Bank IT Team can configure their production REST API endpoint here.
 * If API_BASE_URL is set to an external endpoint, all submissions & admin operations 
 * will automatically route to the Bank's central server & database.
 */

const BANK_CONFIG = {
  // Application Details
  BANK_NAME: "The Nasik Merchants Co-operative Bank Ltd.",
  SHORT_NAME: "Namco Bank",
  PORTAL_VERSION: "2.1.0-PROD",

  // 🏦 REST API Configuration
  // Change API_BASE_URL to the bank's production API (e.g. "https://api.namcobank.in/api/v1")
  // Or leave as "/api/v1" if running on the same domain/server.
  API_BASE_URL: window.location.origin.includes('http') && !window.location.origin.includes('github.io') 
    ? `${window.location.origin}/api/v1` 
    : "https://api.namcobank.com/api/v1", // Replace with Bank's live API URL

  // API Endpoints
  ENDPOINTS: {
    SUBMIT_CONSENT: "/consent/submit",
    GET_CONSENTS: "/admin/consents",
    GET_CONSENT_DETAIL: "/admin/consents/:id",
    UPDATE_CBS_STATUS: "/admin/consents/:id/status",
    EXPORT_CSV: "/admin/consents/export",
    ADMIN_LOGIN: "/admin/auth/login",
    STATS: "/admin/stats"
  },

  // Fallback to local storage if API server is temporarily unreachable (offline resilience)
  ENABLE_OFFLINE_STORAGE_FALLBACK: true,

  // Request timeout in milliseconds (10 seconds)
  REQUEST_TIMEOUT_MS: 10000,

  // Max signature image resolution / quality
  MAX_SIGNATURE_WIDTH: 600,
  MAX_SIGNATURE_HEIGHT: 200
};

// Export to window for global access
if (typeof window !== 'undefined') {
  window.BANK_CONFIG = BANK_CONFIG;
}
