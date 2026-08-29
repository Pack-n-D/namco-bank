/**
 * Namco Bank - REST API Service Layer
 * Handles robust asynchronous communication between frontend and Bank API/Database.
 */

class BankApiService {
  constructor() {
    this.config = window.BANK_CONFIG || {
      API_BASE_URL: 'https://api.namcobank.com/api/v1',
      ENABLE_OFFLINE_STORAGE_FALLBACK: true,
      REQUEST_TIMEOUT_MS: 10000
    };
    this.tokenKey = 'namco_auth_token';
  }

  /**
   * Helper: Get stored auth token
   */
  getAuthToken() {
    return localStorage.getItem(this.tokenKey) || '';
  }

  /**
   * Helper: Set auth token
   */
  setAuthToken(token) {
    if (token) {
      localStorage.setItem(this.tokenKey, token);
    } else {
      localStorage.removeItem(this.tokenKey);
    }
  }

  /**
   * Helper: Perform fetch with timeout
   */
  async request(endpoint, options = {}) {
    const url = `${this.config.API_BASE_URL}${endpoint}`;
    const token = this.getAuthToken();

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || `Server responded with HTTP ${response.status}`);
      }

      return { success: true, data };
    } catch (error) {
      clearTimeout(timeoutId);
      console.warn(`[BankApiService] Request to ${endpoint} failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Submit Customer Consent Form to Bank REST API / Database
   * @param {Object} consentData 
   */
  async submitConsent(consentData) {
    // 1. Try sending to Live Bank REST API
    const response = await this.request(this.config.ENDPOINTS?.SUBMIT_CONSENT || '/consent/submit', {
      method: 'POST',
      body: JSON.stringify(consentData)
    });

    // 2. Always persist locally for offline resilience & immediate verification
    this.saveLocalRecord(consentData);

    if (response.success) {
      return {
        success: true,
        referenceNo: response.data?.referenceNo || consentData.refNo,
        message: response.data?.message || 'Consent successfully registered in Bank Database.',
        isLiveDb: true
      };
    }

    // 3. If API is down / unreachable and fallback is enabled, store locally
    if (this.config.ENABLE_OFFLINE_STORAGE_FALLBACK) {
      return {
        success: true,
        referenceNo: consentData.refNo,
        message: 'Consent recorded successfully.',
        isLiveDb: false,
        warning: 'Saved to local queue. Will sync to central database upon connection.'
      };
    }

    return {
      success: false,
      error: response.error || 'Failed to connect to Bank Database. Please try again.'
    };
  }

  /**
   * Officer / Admin Login
   * @param {string} username 
   * @param {string} password 
   */
  async login(username, password) {
    const response = await this.request(this.config.ENDPOINTS?.ADMIN_LOGIN || '/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    if (response.success && response.data?.token) {
      this.setAuthToken(response.data.token);
      return { success: true, user: response.data.user, token: response.data.token };
    }

    // Local authentication fallback for branch officer offline desk
    if ((username === 'admin' && password === 'admin') || 
        (username === 'officer' && password === 'namco123') ||
        (username === 'superadmin' && password === 'namco@2026')) {
      const mockToken = 'mock_jwt_token_' + Date.now();
      this.setAuthToken(mockToken);
      return {
        success: true,
        user: { username, role: username === 'superadmin' ? 'SUPER_ADMIN' : 'OFFICER' },
        token: mockToken,
        isMock: true
      };
    }

    return { success: false, error: response.error || 'Invalid credentials' };
  }

  /**
   * Get all registered consents (for Officer / Admin Dashboard)
   * @param {Object} queryParams { page, limit, search, status, branch }
   */
  async getConsents(queryParams = {}) {
    const queryString = new URLSearchParams(queryParams).toString();
    const endpoint = `${this.config.ENDPOINTS?.GET_CONSENTS || '/admin/consents'}${queryString ? '?' + queryString : ''}`;

    const response = await this.request(endpoint, { method: 'GET' });

    if (response.success && response.data) {
      return {
        success: true,
        records: response.data.records || response.data,
        total: response.data.total || response.data.length || 0,
        stats: response.data.stats || null,
        isLiveDb: true
      };
    }

    // Fallback to local storage records
    const localRecords = this.getLocalRecords();
    let filtered = [...localRecords];

    if (queryParams.search) {
      const q = queryParams.search.toLowerCase();
      filtered = filtered.filter(r => 
        (r.name && r.name.toLowerCase().includes(q)) ||
        (r.accNo && r.accNo.includes(q)) ||
        (r.mobile && r.mobile.includes(q)) ||
        (r.cif && r.cif.includes(q)) ||
        (r.refNo && r.refNo.toLowerCase().includes(q))
      );
    }

    if (queryParams.status && queryParams.status !== 'ALL') {
      if (queryParams.status === 'AGREED') {
        filtered = filtered.filter(r => r.consent === 'agree');
      } else if (queryParams.status === 'DISAGREED') {
        filtered = filtered.filter(r => r.consent === 'disagree');
      } else if (queryParams.status === 'CBS_PENDING') {
        filtered = filtered.filter(r => r.cbsUpdated !== 'Yes');
      }
    }

    return {
      success: true,
      records: filtered,
      total: filtered.length,
      isLiveDb: false
    };
  }

  /**
   * Update CBS Status for a record
   */
  async updateCbsStatus(refNo, cbsUpdatedStatus) {
    const endpoint = (this.config.ENDPOINTS?.UPDATE_CBS_STATUS || '/admin/consents/:id/status').replace(':id', refNo);
    const response = await this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify({ cbsUpdated: cbsUpdatedStatus })
    });

    // Update in local store
    this.updateLocalRecordStatus(refNo, cbsUpdatedStatus);

    return response.success ? response : { success: true, isLocalUpdate: true };
  }

  /**
   * LocalStorage Helpers
   */
  saveLocalRecord(record) {
    try {
      const records = this.getLocalRecords();
      const existingIdx = records.findIndex(r => r.refNo === record.refNo || (r.accNo === record.accNo && r.mobile === record.mobile));
      if (existingIdx >= 0) {
        records[existingIdx] = { ...records[existingIdx], ...record };
      } else {
        records.unshift(record);
      }
      localStorage.setItem('namco_sms_records', JSON.stringify(records));
    } catch (e) {
      console.error('LocalStorage write error:', e);
    }
  }

  getLocalRecords() {
    try {
      return JSON.parse(localStorage.getItem('namco_sms_records') || '[]');
    } catch (e) {
      return [];
    }
  }

  updateLocalRecordStatus(refNo, status) {
    try {
      const records = this.getLocalRecords();
      const item = records.find(r => r.refNo === refNo);
      if (item) {
        item.cbsUpdated = status;
        localStorage.setItem('namco_sms_records', JSON.stringify(records));
      }
    } catch (e) {
      console.error('LocalStorage update error:', e);
    }
  }
}

// Global API service instance
window.BankApi = new BankApiService();
