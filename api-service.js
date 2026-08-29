/**
 * Namco Bank - REST API Service Layer & RBAC Governance
 * Handles robust asynchronous communication, Multi-Branch Role-Based Access Control (RBAC),
 * and centralized Audit Trail Logging for Super Admin.
 */

class BankApiService {
  constructor() {
    this.config = window.BANK_CONFIG || {
      API_BASE_URL: 'https://api.namcobank.com/api/v1',
      ENABLE_OFFLINE_STORAGE_FALLBACK: true,
      REQUEST_TIMEOUT_MS: 10000
    };
    this.tokenKey = 'namco_auth_token';
    this.currentUserKey = 'namco_current_user';
    this.adminUsersKey = 'namco_branch_admins';
    this.auditLogsKey = 'namco_audit_logs';

    this.initDefaultAdminUsers();
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
   * Current Logged In User
   */
  getCurrentUser() {
    try {
      return JSON.parse(sessionStorage.getItem(this.currentUserKey) || localStorage.getItem(this.currentUserKey) || 'null');
    } catch(e) {
      return null;
    }
  }

  setCurrentUser(user) {
    if (user) {
      const uJson = JSON.stringify(user);
      sessionStorage.setItem(this.currentUserKey, uJson);
      localStorage.setItem(this.currentUserKey, uJson);
    } else {
      sessionStorage.removeItem(this.currentUserKey);
      localStorage.removeItem(this.currentUserKey);
    }
  }

  /**
   * Initial default Branch Admins
   */
  initDefaultAdminUsers() {
    if (!localStorage.getItem(this.adminUsersKey)) {
      const defaults = [
        {
          id: 'adm_001',
          username: 'admin',
          password: 'admin',
          fullName: 'Suresh Patil (Lead Admin)',
          branch: 'CBS Head Office, Nashik',
          branchCode: 'HO-001',
          role: 'BRANCH_MANAGER',
          isActive: true,
          createdAt: new Date().toISOString()
        },
        {
          id: 'adm_002',
          username: 'officer',
          password: 'namco123',
          fullName: 'Ananya Deshmukh',
          branch: 'Canada Corner Branch',
          branchCode: 'NSK-002',
          role: 'BRANCH_OFFICER',
          isActive: true,
          createdAt: new Date().toISOString()
        },
        {
          id: 'adm_003',
          username: 'pune_officer',
          password: 'namco123',
          fullName: 'Rahul Kulkarni',
          branch: 'Pune Camp Branch',
          branchCode: 'PUN-010',
          role: 'BRANCH_OFFICER',
          isActive: true,
          createdAt: new Date().toISOString()
        }
      ];
      localStorage.setItem(this.adminUsersKey, JSON.stringify(defaults));
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
   */
  async submitConsent(consentData) {
    const response = await this.request(this.config.ENDPOINTS?.SUBMIT_CONSENT || '/consent/submit', {
      method: 'POST',
      body: JSON.stringify(consentData)
    });

    this.saveLocalRecord(consentData);

    // Audit Log customer submission
    this.logAuditAction({
      action: 'CUSTOMER_SUBMISSION',
      details: `Consent ${consentData.consent === 'agree' ? 'AGREED' : 'OPTED-OUT'} submitted for Acc: ${consentData.accNo} (Ref: ${consentData.refNo})`,
      branch: consentData.branch || 'Online Direct',
      username: `Customer: ${consentData.name}`,
      accountNo: consentData.accNo,
      refNo: consentData.refNo
    });

    if (response.success) {
      return {
        success: true,
        referenceNo: response.data?.referenceNo || consentData.refNo,
        message: response.data?.message || 'Consent successfully registered in Bank Database.',
        isLiveDb: true
      };
    }

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
   * Officer / Admin / Super Admin Login with RBAC
   */
  async login(username, password) {
    const cleanUser = (username || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();

    // 1. Try Live Server
    const response = await this.request(this.config.ENDPOINTS?.ADMIN_LOGIN || '/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: cleanUser, password: cleanPass })
    });

    if (response.success && response.data?.token) {
      this.setAuthToken(response.data.token);
      this.setCurrentUser(response.data.user);
      this.logAuditAction({
        action: 'ADMIN_LOGIN',
        details: `User ${cleanUser} successfully logged into Bank Portal via Server Auth`,
        branch: response.data.user?.branch || 'Head Office',
        username: cleanUser
      });
      return { success: true, user: response.data.user, token: response.data.token };
    }

    // 2. Superadmin Check
    if (cleanUser === 'superadmin' && (cleanPass === 'namco@2026' || cleanPass === 'superadmin123' || cleanPass === 'admin')) {
      const superUser = {
        username: 'superadmin',
        fullName: 'Chief Systems Administrator',
        role: 'SUPER_ADMIN',
        branch: 'Central Headquarters, Nashik',
        branchCode: 'HO-000'
      };
      const token = 'super_jwt_token_' + Date.now();
      this.setAuthToken(token);
      this.setCurrentUser(superUser);
      this.logAuditAction({
        action: 'SUPER_ADMIN_LOGIN',
        details: `Super Admin accessed central governance console`,
        branch: 'Central Headquarters',
        username: 'superadmin'
      });
      return { success: true, user: superUser, token, isMock: true };
    }

    // 3. Dynamic Branch Admin Check (RBAC)
    const adminUsers = this.getAdminUsers();
    const foundAdmin = adminUsers.find(a => a.username.toLowerCase() === cleanUser && a.password === cleanPass);

    if (foundAdmin) {
      if (!foundAdmin.isActive) {
        return { success: false, error: 'This branch admin account has been disabled by the Super Admin.' };
      }

      const userSession = {
        id: foundAdmin.id,
        username: foundAdmin.username,
        fullName: foundAdmin.fullName,
        branch: foundAdmin.branch,
        branchCode: foundAdmin.branchCode || 'BR-001',
        role: foundAdmin.role || 'BRANCH_OFFICER'
      };

      const token = 'token_admin_' + foundAdmin.username + '_' + Date.now();
      this.setAuthToken(token);
      this.setCurrentUser(userSession);

      // Log Login Event
      this.logAuditAction({
        action: 'ADMIN_LOGIN',
        details: `Branch Admin ${foundAdmin.fullName} logged in for branch: ${foundAdmin.branch}`,
        branch: foundAdmin.branch,
        username: foundAdmin.username
      });

      return { success: true, user: userSession, token, isMock: true };
    }

    return { success: false, error: 'Invalid Username or Password. Check your credentials.' };
  }

  // =========================================================================
  // 👥 RBAC: BRANCH ADMIN MANAGEMENT (Super Admin Only)
  // =========================================================================

  getAdminUsers() {
    try {
      return JSON.parse(localStorage.getItem(this.adminUsersKey) || '[]');
    } catch(e) {
      return [];
    }
  }

  createAdminUser({ username, password, fullName, branch, branchCode, role }) {
    const cleanUser = username.trim().toLowerCase();
    const admins = this.getAdminUsers();

    if (admins.some(a => a.username.toLowerCase() === cleanUser)) {
      return { success: false, error: `An admin with username "${cleanUser}" already exists.` };
    }

    const newAdmin = {
      id: 'adm_' + Math.floor(1000 + Math.random() * 9000),
      username: cleanUser,
      password: password.trim(),
      fullName: fullName.trim(),
      branch: branch.trim(),
      branchCode: branchCode ? branchCode.trim().toUpperCase() : 'BR-' + Math.floor(100 + Math.random() * 900),
      role: role || 'BRANCH_OFFICER',
      isActive: true,
      createdAt: new Date().toISOString()
    };

    admins.unshift(newAdmin);
    localStorage.setItem(this.adminUsersKey, JSON.stringify(admins));

    // Audit Log creation
    this.logAuditAction({
      action: 'ADMIN_CREATED',
      details: `Created new Branch Admin "${newAdmin.fullName}" (${newAdmin.username}) for branch "${newAdmin.branch}" [Role: ${newAdmin.role}]`,
      branch: 'Central Headquarters',
      username: this.getCurrentUser()?.username || 'superadmin'
    });

    return { success: true, admin: newAdmin };
  }

  deleteAdminUser(adminIdOrUsername) {
    let admins = this.getAdminUsers();
    const target = admins.find(a => a.id === adminIdOrUsername || a.username.toLowerCase() === adminIdOrUsername.toLowerCase());

    if (!target) {
      return { success: false, error: 'Admin user not found.' };
    }

    admins = admins.filter(a => a.id !== target.id && a.username.toLowerCase() !== target.username.toLowerCase());
    localStorage.setItem(this.adminUsersKey, JSON.stringify(admins));

    this.logAuditAction({
      action: 'ADMIN_DELETED',
      details: `Removed Branch Admin "${target.fullName}" (${target.username}) from branch "${target.branch}"`,
      branch: 'Central Headquarters',
      username: this.getCurrentUser()?.username || 'superadmin'
    });

    return { success: true, message: 'Admin deleted successfully.' };
  }

  toggleAdminStatus(adminIdOrUsername) {
    const admins = this.getAdminUsers();
    const target = admins.find(a => a.id === adminIdOrUsername || a.username.toLowerCase() === adminIdOrUsername.toLowerCase());

    if (!target) return { success: false, error: 'Admin not found' };

    target.isActive = !target.isActive;
    localStorage.setItem(this.adminUsersKey, JSON.stringify(admins));

    this.logAuditAction({
      action: 'ADMIN_STATUS_CHANGED',
      details: `Changed status of Admin "${target.username}" to ${target.isActive ? 'ACTIVE' : 'SUSPENDED'}`,
      branch: 'Central Headquarters',
      username: this.getCurrentUser()?.username || 'superadmin'
    });

    return { success: true, admin: target };
  }

  // =========================================================================
  // 📝 AUDIT TRAIL LOGGING (Super Admin Governance)
  // =========================================================================

  /**
   * Record an action in the Central Audit Trail
   */
  logAuditAction({ action, details, branch, username, accountNo, refNo }) {
    const currentUser = this.getCurrentUser();
    const logEntry = {
      id: 'log_' + Date.now() + '_' + Math.floor(100 + Math.random() * 900),
      timestamp: new Date().toISOString(),
      action: action || 'GENERAL_ACTION',
      details: details || '',
      branch: branch || currentUser?.branch || 'Head Office',
      username: username || currentUser?.username || 'System',
      role: currentUser?.role || 'SYSTEM',
      accountNo: accountNo || null,
      refNo: refNo || null,
      ip: '127.0.0.1'
    };

    try {
      const logs = this.getAuditLogs();
      logs.unshift(logEntry);
      // Keep last 1,000 logs locally
      if (logs.length > 1000) logs.length = 1000;
      localStorage.setItem(this.auditLogsKey, JSON.stringify(logs));
    } catch(e) {
      console.error('Audit Log write error:', e);
    }
  }

  getAuditLogs(filters = {}) {
    try {
      let logs = JSON.parse(localStorage.getItem(this.auditLogsKey) || '[]');
      if (logs.length === 0) {
        // Sample baseline audit logs
        logs = [
          {
            id: 'log_001',
            timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
            action: 'ADMIN_LOGIN',
            details: 'Branch Admin Suresh Patil logged in for CBS Head Office, Nashik',
            branch: 'CBS Head Office, Nashik',
            username: 'admin',
            role: 'BRANCH_MANAGER'
          },
          {
            id: 'log_002',
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            action: 'CBS_STATUS_UPDATED',
            details: 'Marked CBS Update = Yes for Ref: NAMCO-SMS-2026-84920 (Account: 00120100049281)',
            branch: 'CBS Head Office, Nashik',
            username: 'admin',
            role: 'BRANCH_MANAGER',
            refNo: 'NAMCO-SMS-2026-84920'
          },
          {
            id: 'log_003',
            timestamp: new Date(Date.now() - 1800000).toISOString(),
            action: 'CSV_EXPORTED',
            details: 'Exported batch CSV consent report (3 records)',
            branch: 'Canada Corner Branch',
            username: 'officer',
            role: 'BRANCH_OFFICER'
          }
        ];
        localStorage.setItem(this.auditLogsKey, JSON.stringify(logs));
      }

      if (filters.search) {
        const q = filters.search.toLowerCase();
        logs = logs.filter(l => 
          (l.details && l.details.toLowerCase().includes(q)) ||
          (l.username && l.username.toLowerCase().includes(q)) ||
          (l.branch && l.branch.toLowerCase().includes(q)) ||
          (l.action && l.action.toLowerCase().includes(q))
        );
      }

      if (filters.action && filters.action !== 'ALL') {
        logs = logs.filter(l => l.action === filters.action);
      }

      if (filters.branch && filters.branch !== 'ALL') {
        logs = logs.filter(l => l.branch === filters.branch);
      }

      return logs;
    } catch(e) {
      return [];
    }
  }

  clearAuditLogs() {
    localStorage.removeItem(this.auditLogsKey);
  }

  // =========================================================================
  // 📋 CONSENT DATA METHODS
  // =========================================================================

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
        (r.refNo && r.refNo.toLowerCase().includes(q)) ||
        (r.branch && r.branch.toLowerCase().includes(q))
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

    if (queryParams.branch && queryParams.branch !== 'ALL') {
      filtered = filtered.filter(r => r.branch === queryParams.branch);
    }

    return {
      success: true,
      records: filtered,
      total: filtered.length,
      isLiveDb: false
    };
  }

  async updateCbsStatus(refNo, cbsUpdatedStatus) {
    const endpoint = (this.config.ENDPOINTS?.UPDATE_CBS_STATUS || '/admin/consents/:id/status').replace(':id', refNo);
    const response = await this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify({ cbsUpdated: cbsUpdatedStatus })
    });

    this.updateLocalRecordStatus(refNo, cbsUpdatedStatus);

    const currentUser = this.getCurrentUser();
    this.logAuditAction({
      action: 'CBS_STATUS_UPDATED',
      details: `Updated CBS Sync status to "${cbsUpdatedStatus}" for Ref: ${refNo}`,
      branch: currentUser?.branch || 'Branch Desk',
      username: currentUser?.username || 'officer',
      refNo: refNo
    });

    return response.success ? response : { success: true, isLocalUpdate: true };
  }

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
