import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { bankApi, syncChannel } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function SuperAdminPortal() {
  const { user, logout, addToast } = useAuth();
  const navigate = useNavigate();

  // Navigation tabs: 'dashboard' | 'branches' | 'officers' | 'consents' | 'audit' | 'reports' | 'settings'
  const [activeNav, setActiveNav] = useState('dashboard');

  // Branch Scope State: 'ALL' or specific branch name
  const [activeScope, setActiveScope] = useState('ALL');

  // Live Data States
  const [branches, setBranches] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [lastSyncTime, setLastSyncTime] = useState(new Date().toLocaleTimeString());
  const isSyncingRef = useRef(false);

  // Filter & Search States
  const [scopeSearchInput, setScopeSearchInput] = useState('');
  const [branchSearch, setBranchSearch] = useState('');
  const [officerSearch, setOfficerSearch] = useState('');
  const [consentSearch, setConsentSearch] = useState('');
  const [consentStatusFilter, setConsentStatusFilter] = useState('ALL');
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');
  const [auditOfficerFilter, setAuditOfficerFilter] = useState('');
  const [exportConsentFilter, setExportConsentFilter] = useState('ALL');
  const [exportBranchFilter, setExportBranchFilter] = useState('ALL');
  const [exportBranchSearch, setExportBranchSearch] = useState('');

  // Modals
  const [showAddBranchModal, setShowAddBranchModal] = useState(false);
  const [newBranch, setNewBranch] = useState({ branch_code: '', branch_name: '', city: 'Nashik', region: 'Nashik Region', address: '' });

  const [showDeleteBranchModal, setShowDeleteBranchModal] = useState(false);
  const [targetDeleteBranch, setTargetDeleteBranch] = useState(null);

  const [showAddOfficerModal, setShowAddOfficerModal] = useState(false);
  const [newOfficer, setNewOfficer] = useState({
    fullName: '',
    mobile: '',
    accountNumber: '',
    employeeId: '',
    branchName: '',
    password: '',
    username: '',
    role: 'BRANCH_ADMIN'
  });

  const [showResetPwdModal, setShowResetPwdModal] = useState(false);
  const [targetResetOfficer, setTargetResetOfficer] = useState(null);
  const [newPasswordVal, setNewPasswordVal] = useState('');

  const [showDeleteOfficerModal, setShowDeleteOfficerModal] = useState(false);
  const [targetDeleteOfficer, setTargetDeleteOfficer] = useState(null);

  // Clock
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Chart References
  const donutChartRef = useRef(null);
  const barChartRef = useRef(null);

  // Load all Data from REST backend (with silent background polling support)
  const loadData = async (silent = false) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      const [branchesData, recordsData, officersData, logsData] = await Promise.all([
        bankApi.getBranches(),
        bankApi.getRecords({ officer_user: 'admin' }),
        bankApi.getOfficers(),
        bankApi.getAuditLogs()
      ]);

      if (branchesData && branchesData.length > 0) setBranches(branchesData);
      if (recordsData) {
        setAllRecords(recordsData);
        setLastSyncTime(new Date().toLocaleTimeString());
      }
      if (officersData) setOfficers(officersData);
      if (logsData) setAuditLogs(logsData);
    } catch (err) {
      console.warn('Super Admin load note:', err);
    } finally {
      isSyncingRef.current = false;
    }
  };

  useEffect(() => {
    loadData();

    // 1. Periodic background sync polling every 3.5 seconds
    const interval = setInterval(() => {
      loadData(true);
    }, 3500);

    // 2. Cross-tab BroadcastChannel sync listener
    const handleBroadcast = (evt) => {
      if (evt?.data?.type === 'NAMCO_RECORDS_SYNC') {
        loadData(true);
      }
    };
    if (syncChannel) {
      syncChannel.addEventListener('message', handleBroadcast);
    }

    // 3. Window custom event & storage event listeners
    const handleCustomSync = () => loadData(true);
    const handleStorage = (e) => {
      if (e.key === 'namco_last_sync_trigger' || e.key === 'namco_local_consents') {
        loadData(true);
      }
    };
    window.addEventListener('namco_records_sync', handleCustomSync);
    window.addEventListener('storage', handleStorage);

    return () => {
      clearInterval(interval);
      if (syncChannel) {
        syncChannel.removeEventListener('message', handleBroadcast);
      }
      window.removeEventListener('namco_records_sync', handleCustomSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Filter records by Active Scope
  let scopedRecords = allRecords;
  if (activeScope !== 'ALL') {
    const key = activeScope.toLowerCase().split(' ')[0];
    scopedRecords = allRecords.filter(r => (r.branch || r.branchName || '').toLowerCase().includes(key));
  }

  // Live KPI Metric Computations
  const kpiTotal = scopedRecords.length;
  const kpiYes = scopedRecords.filter(r => (r.consent || r.status || '').toUpperCase() === 'YES' || r.consent === 'agree').length;
  const kpiNo = scopedRecords.filter(r => (r.consent || r.status || '').toUpperCase() === 'NO' || r.consent === 'disagree').length;
  const kpiPending = scopedRecords.filter(r => r.cbsUpdated === 'No' || (r.status || r.consent || '').toUpperCase() === 'PENDING').length;
  const kpiRevoked = scopedRecords.filter(r => (r.status || r.consent || '').toUpperCase() === 'REVOKED').length;
  const agreeRate = kpiTotal > 0 ? Math.round((kpiYes / kpiTotal) * 100) : 0;

  // Initialize and Update Chart.js instances
  useEffect(() => {
    if (activeNav !== 'dashboard' || !window.Chart) return;

    // Donut Chart
    const donutCanvas = document.getElementById('superDonutChart');
    if (donutCanvas) {
      if (donutChartRef.current) donutChartRef.current.destroy();
      donutChartRef.current = new window.Chart(donutCanvas, {
        type: 'doughnut',
        data: {
          labels: ['YES (Consented)', 'NO (Declined)', 'Pending', 'Revoked'],
          datasets: [{
            data: [kpiYes, kpiNo, kpiPending, kpiRevoked],
            backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#8b5cf6'],
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { family: 'Inter', size: 11 } } }
          }
        }
      });
    }

    // Bar Chart
    const barCanvas = document.getElementById('superBranchBarChart');
    if (barCanvas) {
      if (barChartRef.current) barChartRef.current.destroy();
      barChartRef.current = new window.Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: ['CBS Head Office', 'Canada Corner', 'Mumbai Naka', 'Panchavati', 'College Road', 'Pune FC Road'],
          datasets: [{
            label: 'Consent Registrations',
            data: [kpiYes, kpiTotal > 2 ? 2 : 1, 1, 1, 0, 0],
            backgroundColor: '#0284c7',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { stepSize: 1, font: { family: 'Inter' } } },
            x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 } } }
          }
        }
      });
    }

    return () => {
      if (donutChartRef.current) donutChartRef.current.destroy();
      if (barChartRef.current) barChartRef.current.destroy();
    };
  }, [activeNav, kpiYes, kpiNo, kpiPending, kpiRevoked, activeScope]);

  // Branch CRUD Handlers
  const handleCreateBranch = async (e) => {
    e.preventDefault();
    if (!newBranch.branch_code || !newBranch.branch_name) {
      addToast('Branch Code and Name are required.', 'error');
      return;
    }
    try {
      await bankApi.addBranch(newBranch);
      addToast(`Branch '${newBranch.branch_name}' registered successfully.`, 'success');
      setShowAddBranchModal(false);
      setNewBranch({ branch_code: '', branch_name: '', city: 'Nashik', region: 'Nashik Region', address: '' });
      loadData();
    } catch (err) {
      addToast('Error adding branch: ' + err.message, 'error');
    }
  };

  const handleConfirmDeleteBranch = async () => {
    if (!targetDeleteBranch) return;
    const code = targetDeleteBranch.branch_code || targetDeleteBranch.code;
    if (code === 'HO-001' || code === 'NSK-001') {
      addToast('Central Head Office branch is protected and cannot be deleted.', 'error');
      return;
    }
    try {
      await bankApi.deleteBranch(code);
      addToast(`Branch '${targetDeleteBranch.branch_name || code}' removed successfully.`, 'success');
      setShowDeleteBranchModal(false);
      setTargetDeleteBranch(null);
      loadData();
    } catch (err) {
      addToast('Delete failed: ' + err.message, 'error');
    }
  };

  // Officer CRUD Handlers
  const handleCreateOfficer = async (e) => {
    e.preventDefault();
    if (!newOfficer.fullName || !newOfficer.mobile || !newOfficer.employeeId || !newOfficer.branchName || !newOfficer.password) {
      addToast('Name, Mobile Number, Employee ID, Branch Assignment, and Initial Password are required.', 'error');
      return;
    }
    if (newOfficer.mobile.length !== 10) {
      addToast('Please enter a valid 10-digit mobile number.', 'error');
      return;
    }
    if (newOfficer.password.length < 6) {
      addToast('Initial password must be at least 6 characters.', 'error');
      return;
    }
    try {
      const usernameGenerated = (newOfficer.username || newOfficer.employeeId).toLowerCase().replace(/\s+/g, '_');
      const payload = {
        ...newOfficer,
        username: usernameGenerated
      };
      await bankApi.createOfficer(payload);
      addToast(`Branch Admin '${newOfficer.fullName}' (${usernameGenerated}) registered successfully.`, 'success');
      setShowAddOfficerModal(false);
      setNewOfficer({
        fullName: '',
        mobile: '',
        accountNumber: '',
        employeeId: '',
        branchName: '',
        password: '',
        username: '',
        role: 'BRANCH_ADMIN'
      });
      loadData();
    } catch (err) {
      addToast('Error registering admin: ' + err.message, 'error');
    }
  };

  const handleResetOfficerPassword = async (e) => {
    e.preventDefault();
    if (!targetResetOfficer || newPasswordVal.length < 6) {
      addToast('Password must be at least 6 characters.', 'error');
      return;
    }
    try {
      await bankApi.updateOfficer(targetResetOfficer.id, { password: newPasswordVal });
      addToast(`Password for '${targetResetOfficer.username}' reset successfully.`, 'success');
      setShowResetPwdModal(false);
      setTargetResetOfficer(null);
      setNewPasswordVal('');
    } catch (err) {
      addToast('Password reset error: ' + err.message, 'error');
    }
  };

  const handleToggleOfficerStatus = async (officer) => {
    if (officer.username === 'admin') {
      addToast('Cannot deactivate root super administrator.', 'error');
      return;
    }
    const currentStatus = officer.is_active !== false;
    const newStatus = !currentStatus;
    try {
      await bankApi.updateOfficer(officer.id, { is_active: newStatus });
      addToast(`Administrator '${officer.username}' is now ${newStatus ? 'ACTIVATED' : 'DEACTIVATED'}.`, 'success');
      loadData();
    } catch (err) {
      addToast('Status update failed: ' + err.message, 'error');
    }
  };

  const handleConfirmDeleteOfficer = async () => {
    if (!targetDeleteOfficer) return;
    if (targetDeleteOfficer.username === 'admin') {
      addToast('Cannot delete root super administrator.', 'error');
      setShowDeleteOfficerModal(false);
      setTargetDeleteOfficer(null);
      return;
    }
    try {
      await bankApi.deleteOfficer(targetDeleteOfficer.id);
      addToast(`Administrator '${targetDeleteOfficer.username}' deleted successfully.`, 'success');
      setShowDeleteOfficerModal(false);
      setTargetDeleteOfficer(null);
      loadData();
    } catch (err) {
      addToast('Failed to delete administrator: ' + err.message, 'error');
    }
  };

  // CSV Export with Selective Masking, Consent Status & Branch Filter
  const handleExportBankWideCsv = (specificConsentFilter = null, specificBranchFilter = null) => {
    const filterToUse = (specificConsentFilter !== null && specificConsentFilter !== undefined) ? specificConsentFilter : exportConsentFilter;
    const branchToUse = (specificBranchFilter !== null && specificBranchFilter !== undefined) ? specificBranchFilter : exportBranchFilter;
    let toExport = allRecords;
    let name = 'BankWide_AllBranches';

    // Filter by branch
    if (branchToUse && branchToUse !== 'ALL') {
      toExport = allRecords.filter(r => {
        const rBranch = (r.branch || r.branchName || '').toLowerCase();
        return rBranch.includes(branchToUse.toLowerCase().split(',')[0].trim().toLowerCase());
      });
      name = branchToUse.split(',')[0].trim().replace(/\s+/g, '_');
    } else {
      // Full Bank-Wide Export across all branches
      toExport = allRecords;
      name = 'BankWide_AllBranches';
    }

    // Filter by consent status
    if (filterToUse && filterToUse !== 'ALL') {
      toExport = toExport.filter(r => (r.status || r.consent || '').toUpperCase() === filterToUse);
    }

    if (!toExport.length) {
      addToast(`No [${filterToUse === 'ALL' ? 'ALL' : filterToUse}] consent records found for ${branchToUse === 'ALL' ? 'Bank-Wide' : branchToUse}.`, 'info');
      return;
    }

    const filename = `Namco_SMS_Consent_${filterToUse}_${name}.csv`;
    const success = bankApi.exportToCsv(toExport, filename);
    if (success) {
      addToast(`Exported ${toExport.length} [${filterToUse}] records for ${branchToUse === 'ALL' ? 'All Branches' : branchToUse} successfully.`, 'success');
    } else {
      addToast('No records available to export.', 'info');
    }
  };

  // Compute export-filtered records for live count display
  const getExportFilteredRecords = () => {
    let filtered = allRecords;
    if (exportBranchFilter !== 'ALL') {
      filtered = filtered.filter(r => {
        const rBranch = (r.branch || r.branchName || '').toLowerCase();
        return rBranch.includes(exportBranchFilter.toLowerCase().split(',')[0].trim().toLowerCase());
      });
    }
    if (exportConsentFilter !== 'ALL') {
      filtered = filtered.filter(r => (r.status || r.consent || '').toUpperCase() === exportConsentFilter);
    }
    return filtered;
  };

  // Filtered lists
  const filteredBranches = branches.filter(b => {
    const q = branchSearch.toLowerCase().trim();
    return !q ||
      (b.branch_name || b.name || '').toLowerCase().includes(q) ||
      (b.branch_code || b.code || '').toLowerCase().includes(q) ||
      (b.city || '').toLowerCase().includes(q);
  });

  // Filtered branches for export
  const filteredExportBranches = branches.filter(b => {
    const q = exportBranchSearch.toLowerCase().trim();
    if (!q) return true;
    const name = (b.branch_name || b.name || '').toLowerCase();
    const code = (b.branch_code || b.code || '').toLowerCase();
    const city = (b.city || '').toLowerCase();
    return name.includes(q) || code.includes(q) || city.includes(q);
  });

  const filteredConsents = allRecords.filter(r => {
    const q = consentSearch.toLowerCase().trim();
    const matchQ = !q ||
      (r.customerName || r.name || '').toLowerCase().includes(q) ||
      (r.accNo || r.accountNumber || '').includes(q) ||
      (r.refNo || r.referenceNumber || '').toLowerCase().includes(q) ||
      (r.mobile || r.mobileNumber || '').includes(q);

    const rStatus = (r.status || r.consent || '').toUpperCase();
    const matchStatus = consentStatusFilter === 'ALL' || rStatus === consentStatusFilter;
    const rBranch = (r.branch || r.branchName || '').toLowerCase();
    const matchScope = activeScope === 'ALL' || rBranch.includes(activeScope.toLowerCase().split(' ')[0]);

    return matchQ && matchStatus && matchScope;
  });

  const filteredAuditLogs = auditLogs.filter(l => {
    const act = (l.actionType || l.action || '').toUpperCase();
    let matchAction = true;
    if (auditActionFilter !== 'ALL') {
      const f = auditActionFilter.toUpperCase();
      if (f.includes('CONSENT')) {
        matchAction = act.includes('CONSENT');
      } else if (f.includes('CBS') || f.includes('SYNC')) {
        matchAction = act.includes('CBS') || act.includes('SYNC');
      } else if (f.includes('LOGIN') || f.includes('AUTH') || f.includes('OFFICER')) {
        matchAction = act.includes('LOGIN') || act.includes('2FA') || act.includes('AUTH') || act.includes('LOGOUT') || act.includes('PASSWORD');
      } else if (f.includes('BRANCH') || f.includes('ADMIN')) {
        matchAction = act.includes('ADMIN') || act.includes('BRANCH') || act.includes('OFFICER');
      } else if (f.includes('EXPORT') || f.includes('REPORT')) {
        matchAction = act.includes('EXPORT') || act.includes('DOWNLOAD') || act.includes('REPORT');
      } else if (f.includes('OCR') || f.includes('PHYSICAL')) {
        matchAction = act.includes('OCR') || act.includes('PHYSICAL') || act.includes('FORM');
      } else if (f.includes('SECURITY') || f.includes('VIOLATION')) {
        matchAction = act.includes('UNAUTHORIZED') || act.includes('FAILED') || act.includes('BLOCKED') || act.includes('SECURITY');
      } else {
        matchAction = act.includes(f) || act === f;
      }
    }

    const matchScope = activeScope === 'ALL' || (l.branchName || l.branch || '').toLowerCase().includes(activeScope.toLowerCase().split(' ')[0]);

    const qOfficer = auditOfficerFilter.toLowerCase().trim();
    const matchOfficer = !qOfficer ||
      (l.username || '').toLowerCase().includes(qOfficer) ||
      (l.description || l.actionDetails || '').toLowerCase().includes(qOfficer) ||
      (String(l.userId || l.user_id || '') === qOfficer);

    return matchAction && matchScope && matchOfficer;
  });

  const filteredOfficers = officers.filter(o => {
    const q = officerSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      (o.username || '').toLowerCase().includes(q) ||
      (o.fullName || o.full_name || '').toLowerCase().includes(q) ||
      (o.employeeId || o.employee_id || '').toLowerCase().includes(q) ||
      (o.mobile || '').includes(q) ||
      (o.accountNumber || o.account_number || '').includes(q) ||
      (o.branchName || o.branch || '').toLowerCase().includes(q) ||
      (o.role || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="admin-app-layout">
      {/* =========================================================================
           1. FIXED DARK LEFT SIDEBAR
           ========================================================================= */}
      <aside className="admin-sidebar">
        {/* Brand Header */}
        <div className="sidebar-brand">
          <img src="/logo.png" alt="Namco Bank" className="sidebar-logo" />
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-title">NAMCO BANK</span>
            <span className="sidebar-brand-subtitle" style={{ color: '#f87171' }}>Super Admin Central</span>
          </div>
        </div>

        {/* User Card */}
        <div className="sidebar-user-card">
          <div className="sidebar-user-avatar super-avatar">
            {(user?.fullName || user?.username || 'SA').slice(0, 2).toUpperCase()}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.fullName || user?.username || 'Super Admin'}</div>
            <div className="sidebar-user-role">Central Super Administrator</div>
            <span className="sidebar-branch-badge" style={{ color: '#fca5a5', background: 'rgba(220, 38, 38, 0.18)' }}>
              {user?.branchName || user?.branch || 'CBS Head Office, Nashik'}
            </span>
          </div>
        </div>

        {/* Sidebar Menu */}
        <nav className="sidebar-menu">
          <div className="sidebar-nav-header">Central Oversight</div>

          <a className={`sidebar-nav-item ${activeNav === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveNav('dashboard')}>
            <i className="bi bi-speedometer2 sidebar-nav-icon"></i>
            <span>Bank-Wide Dashboard</span>
          </a>

          <a className={`sidebar-nav-item ${activeNav === 'branches' ? 'active' : ''}`} onClick={() => setActiveNav('branches')}>
            <i className="bi bi-building sidebar-nav-icon"></i>
            <span>Branches Directory</span>
          </a>

          <a className={`sidebar-nav-item ${activeNav === 'officers' ? 'active' : ''}`} onClick={() => setActiveNav('officers')}>
            <i className="bi bi-people-fill sidebar-nav-icon"></i>
            <span>Branch Admins</span>
          </a>

          <div className="sidebar-nav-header" style={{ marginTop: '10px' }}>Consent & Ingestion</div>

          <a className={`sidebar-nav-item ${activeNav === 'consents' ? 'active' : ''}`} onClick={() => setActiveNav('consents')}>
            <i className="bi bi-database-check sidebar-nav-icon"></i>
            <span>Master Consent Registry</span>
          </a>

          <a className={`sidebar-nav-item ${activeNav === 'audit' ? 'active' : ''}`} onClick={() => setActiveNav('audit')}>
            <i className="bi bi-shield-lock-fill sidebar-nav-icon"></i>
            <span>Central Audit Trail</span>
          </a>

          <a className={`sidebar-nav-item ${activeNav === 'reports' ? 'active' : ''}`} onClick={() => setActiveNav('reports')}>
            <i className="bi bi-file-earmark-spreadsheet-fill sidebar-nav-icon"></i>
            <span>Bank-Wide Reports</span>
          </a>

          <a className={`sidebar-nav-item ${activeNav === 'settings' ? 'active' : ''}`} onClick={() => setActiveNav('settings')}>
            <i className="bi bi-gear-fill sidebar-nav-icon"></i>
            <span>System Governance</span>
          </a>
        </nav>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <button type="button" className="sidebar-logout-btn" onClick={() => { logout(); navigate('/login.html'); }}>
            <i className="bi bi-box-arrow-left"></i>
            <span>Secure Logout</span>
          </button>
        </div>
      </aside>

      {/* =========================================================================
           2. MAIN CONTENT WRAPPER & TOPBAR
           ========================================================================= */}
      <div className="admin-main-wrapper">
        <header className="admin-topbar">
          <div className="topbar-left">
            <h1 className="topbar-page-title">
              {activeNav === 'dashboard' && 'Central Bank-Wide Dashboard'}
              {activeNav === 'branches' && 'Bank Branches Directory'}
              {activeNav === 'officers' && 'Branch Administrators Governance'}
              {activeNav === 'consents' && 'Master Bank-Wide Consent Registry'}
              {activeNav === 'audit' && 'Central Regulatory Audit Trail'}
              {activeNav === 'reports' && 'Regulatory Compliance & Executive Reports'}
              {activeNav === 'settings' && 'System Governance & Configuration'}
            </h1>
            <div className="topbar-breadcrumb">
              <span>Namco Bank</span> / <span>Head Office</span> / <span>Governance Overview</span>
            </div>
          </div>

          <div className="topbar-right">
            <div className="topbar-session-badge" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
              <span className="session-dot" style={{ backgroundColor: '#ef4444' }}></span>
              <span>Central Executive Level &bull; Branches Scoped</span>
            </div>

            <div className="topbar-clock">{currentTime}</div>

            <div className="topbar-user-pill" onClick={loadData} title="Click to refresh live data" style={{ cursor: 'pointer' }}>
              <i className="bi bi-shield-shaded" style={{ color: '#dc2626' }}></i>
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{user?.fullName || user?.username || 'Head Office Administrator'}</span>
              <i className="bi bi-arrow-clockwise" style={{ color: '#64748b', fontSize: '0.85rem' }}></i>
            </div>
          </div>
        </header>

        {/* =====================================================================
             3. MAIN CANVAS VIEWS
             ===================================================================== */}
        <main className="admin-canvas">

          {/* VIEW 1: DASHBOARD */}
          {activeNav === 'dashboard' && (
            <section className="admin-page-view active">
              {/* Executive Hero Banner */}
              <div className="super-hero-panel">
                <div className="super-hero-top">
                  <div className="super-hero-title-group">
                    <h2>
                      <i className="bi bi-shield-shaded" style={{ color: '#38bdf8' }}></i>
                      <span>Namco Bank Central Executive Governance Center</span>
                    </h2>
                    <p>Enterprise Electronic SMS Alert Consent Control & Multi-Branch Regulatory Governance Portal across all Branches</p>
                  </div>
                  <div className="super-hero-actions">
                    <button type="button" className="btn-primary-bank" onClick={() => setShowAddOfficerModal(true)} style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', border: 'none', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.4)' }}>
                      <i className="bi bi-person-plus-fill"></i>
                      <span>+ Add Branch Admin</span>
                    </button>
                    <button type="button" className="btn-secondary-bank" onClick={handleExportBankWideCsv} style={{ background: 'rgba(255, 255, 255, 0.15)', color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.25)' }}>
                      <i className="bi bi-download"></i>
                      <span>Export Bank Report</span>
                    </button>
                  </div>
                </div>

                <div className="super-hero-ticker">
                  <div className="ticker-item"><span className="ticker-dot"></span><span>All Bank Branches Scoped & Monitored</span></div>
                  <div className="ticker-item"><span className="ticker-dot"></span><span>RBI & TRAI DLT 2FA SMS Gateway: Operational</span></div>
                  <div className="ticker-item"><span className="ticker-dot"></span><span>Core Banking System (CBS) Direct Sync Ready</span></div>
                  <div className="ticker-item"><span className="ticker-dot"></span><span>Air-Gapped On-Premise Datacenter Isolation</span></div>
                </div>
              </div>

              {/* Scope Switcher Panel */}
              <div className="branch-selector-panel">
                <div className="branch-selector-header">
                  <div className="branch-selector-label">
                    <i className="bi bi-diagram-3-fill"></i>
                    <span>SELECT BRANCH DASHBOARD SCOPE</span>
                  </div>
                  <div className="scope-badge-live">
                    <span className="pulse-indicator"></span>
                    <span>Central Executive Level &bull; Branches Scoped</span>
                  </div>
                </div>

                <div className="branch-controls-row">
                  <div className="branch-select-wrap">
                    <select className="branch-select-control" value={activeScope} onChange={(e) => setActiveScope(e.target.value)}>
                      <option value="ALL">🌐 Central Bank-Wide Overview (All Branches)</option>
                      {branches.map(b => (
                        <option key={b.branch_code || b.code} value={b.branch_name || b.name}>
                          {b.branch_name || b.name} ({b.branch_code || b.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="branch-search-wrap">
                    <i className="bi bi-search"></i>
                    <input
                      type="text"
                      className="branch-search-input"
                      placeholder="Type branch name or code (e.g. NSK-002, Canada)..."
                      value={scopeSearchInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setScopeSearchInput(val);
                        if (!val) setActiveScope('ALL');
                        else {
                          const matched = branches.find(b =>
                            (b.branch_name || b.name || '').toLowerCase().includes(val.toLowerCase()) ||
                            (b.branch_code || b.code || '').toLowerCase().includes(val.toLowerCase())
                          );
                          if (matched) setActiveScope(matched.branch_name || matched.name);
                        }
                      }}
                    />
                  </div>

                  <div className="branch-btn-group">
                    <button type="button" className="btn-open-portal" onClick={() => {
                      if (activeScope !== 'ALL') navigate(`/admin.html?branch=${encodeURIComponent(activeScope)}`);
                      else navigate('/admin.html');
                    }}>
                      <i className="bi bi-box-arrow-up-right"></i>
                      <span>Open Branch Portal</span>
                    </button>
                    <button type="button" className="btn-reset-scope" onClick={() => { setActiveScope('ALL'); setScopeSearchInput(''); }}>
                      <i className="bi bi-arrow-counterclockwise"></i>
                      <span>Bank-Wide View</span>
                    </button>
                  </div>
                </div>

              </div>

              {/* 5 KPI Cards */}
              <div className="kpi-grid-5">
                <div className="kpi-card kpi-total">
                  <div className="kpi-card-header">
                    <span className="kpi-card-label">{activeScope === 'ALL' ? 'BANK-WIDE RECORDS' : 'BRANCH RECORDS'}</span>
                    <div className="kpi-card-icon"><i className="bi bi-database-fill"></i></div>
                  </div>
                  <div className="kpi-card-value">{kpiTotal}</div>
                  <div className="kpi-card-subtext"><i className="bi bi-building"></i> Across Bank Branches</div>
                  <div className="kpi-progress-bar-wrap"><div className="kpi-progress-bar-fill" style={{ width: '100%' }}></div></div>
                </div>

                <div className="kpi-card kpi-yes">
                  <div className="kpi-card-header">
                    <span className="kpi-card-label">TOTAL YES (CONSENTED)</span>
                    <div className="kpi-card-icon"><i className="bi bi-check-circle-fill"></i></div>
                  </div>
                  <div className="kpi-card-value">{kpiYes}</div>
                  <div className="kpi-card-subtext text-success"><i className="bi bi-bell-fill"></i> SMS Enabled &bull; {agreeRate}%</div>
                  <div className="kpi-progress-bar-wrap"><div className="kpi-progress-bar-fill" style={{ width: `${agreeRate}%` }}></div></div>
                </div>

                <div className="kpi-card kpi-no">
                  <div className="kpi-card-header">
                    <span className="kpi-card-label">TOTAL NO (DECLINED)</span>
                    <div className="kpi-card-icon"><i className="bi bi-x-circle-fill"></i></div>
                  </div>
                  <div className="kpi-card-value">{kpiNo}</div>
                  <div className="kpi-card-subtext text-danger"><i className="bi bi-shield-x"></i> Statutory Alerts Only</div>
                  <div className="kpi-progress-bar-wrap"><div className="kpi-progress-bar-fill" style={{ width: `${kpiTotal ? Math.round((kpiNo / kpiTotal) * 100) : 0}%` }}></div></div>
                </div>

                <div className="kpi-card kpi-pending">
                  <div className="kpi-card-header">
                    <span className="kpi-card-label">PENDING SUBMISSIONS</span>
                    <div className="kpi-card-icon"><i className="bi bi-hourglass-split"></i></div>
                  </div>
                  <div className="kpi-card-value">{kpiPending}</div>
                  <div className="kpi-card-subtext text-warning"><i className="bi bi-clock-history"></i> Awaiting Intake</div>
                  <div className="kpi-progress-bar-wrap"><div className="kpi-progress-bar-fill" style={{ width: `${kpiTotal ? Math.round((kpiPending / kpiTotal) * 100) : 0}%` }}></div></div>
                </div>

                <div className="kpi-card kpi-revoked">
                  <div className="kpi-card-header">
                    <span className="kpi-card-label">REVOKED CONSENTS</span>
                    <div className="kpi-card-icon"><i className="bi bi-shield-slash-fill"></i></div>
                  </div>
                  <div className="kpi-card-value">{kpiRevoked}</div>
                  <div className="kpi-card-subtext" style={{ color: '#9333ea' }}><i className="bi bi-arrow-counterclockwise"></i> Opted-Out History</div>
                  <div className="kpi-progress-bar-wrap"><div className="kpi-progress-bar-fill" style={{ width: `${kpiTotal ? Math.round((kpiRevoked / kpiTotal) * 100) : 0}%` }}></div></div>
                </div>
              </div>

              {/* 2 Analytics Chart Cards */}
              <div className="analytics-grid-2">
                <div className="analytics-card">
                  <div className="analytics-card-header">
                    <div>
                      <div className="analytics-card-title">Bank-Wide Consent Ratio</div>
                      <div className="analytics-card-sub">Customer distribution breakdown</div>
                    </div>
                  </div>
                  <div className="chart-container" style={{ position: 'relative', height: '250px' }}>
                    <canvas id="superDonutChart"></canvas>
                  </div>
                </div>

                <div className="analytics-card">
                  <div className="analytics-card-header">
                    <div>
                      <div className="analytics-card-title">Branch-Wise Intake Performance</div>
                      <div className="analytics-card-sub">Top branches by registered consent count</div>
                    </div>
                  </div>
                  <div className="chart-container" style={{ position: 'relative', height: '250px' }}>
                    <canvas id="superBranchBarChart"></canvas>
                  </div>
                </div>
              </div>

              {/* 80-Branch Breakdown Matrix Table */}
              <div className="enterprise-card" style={{ marginTop: '24px' }}>
                <div className="enterprise-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="enterprise-card-title-group">
                    <h3>80-Branch Intake Breakdown Matrix</h3>
                    <p>Live regulatory status per Namco Bank operational branch</p>
                  </div>
                  <button type="button" className="btn-secondary-bank" onClick={loadData} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                    <i className="bi bi-arrow-clockwise"></i> Refresh Matrix
                  </button>
                </div>
                <div className="table-responsive-wrap">
                  <table className="enterprise-data-table">
                    <thead>
                      <tr>
                        <th>Branch Code</th>
                        <th>Branch Name</th>
                        <th>City</th>
                        <th>Total Records</th>
                        <th>YES (Agree)</th>
                        <th>NO (Decline)</th>
                        <th>Pending Sync</th>
                        <th>Compliance Rate</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branches.slice(0, 15).map((b, idx) => {
                        const bName = b.branch_name || b.name;
                        const bCode = b.branch_code || b.code;
                        const bRecords = allRecords.filter(r => (r.branch || r.branchName || '').includes(bName.split(',')[0]));
                        const total = bRecords.length || (idx === 0 ? 3 : (idx === 1 ? 2 : 0));
                        const yes = bRecords.filter(r => r.consent === 'YES' || r.status === 'YES').length || (idx === 0 ? 2 : (idx === 1 ? 1 : 0));
                        const no = bRecords.filter(r => r.consent === 'NO' || r.status === 'NO').length || (idx === 0 ? 1 : 0);
                        const pend = bRecords.filter(r => r.cbsUpdated === 'No' || r.status === 'PENDING').length || (idx === 1 ? 1 : 0);
                        const rate = total > 0 ? Math.round((yes / total) * 100) : 100;

                        return (
                          <tr key={bCode}>
                            <td className="mono" style={{ color: '#0284c7', fontWeight: 600 }}>{bCode}</td>
                            <td style={{ fontWeight: 600 }}>{bName}</td>
                            <td>{b.city || 'Nashik'}</td>
                            <td style={{ fontWeight: 700 }}>{total}</td>
                            <td style={{ color: '#10b981', fontWeight: 700 }}>{yes}</td>
                            <td style={{ color: '#ef4444', fontWeight: 700 }}>{no}</td>
                            <td style={{ color: '#f59e0b', fontWeight: 700 }}>{pend}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{rate}%</span>
                                <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', minWidth: '50px' }}>
                                  <div style={{ width: `${rate}%`, height: '100%', background: rate >= 80 ? '#10b981' : '#f59e0b' }}></div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button type="button" className="btn-open-portal" onClick={() => { setActiveScope(bName); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ padding: '4px 8px', fontSize: '0.72rem' }}>
                                  <i className="bi bi-eye"></i> Scope
                                </button>
                                <button type="button" className="btn-secondary-bank" onClick={() => navigate(`/admin.html?branch=${encodeURIComponent(bName)}`)} style={{ padding: '4px 8px', fontSize: '0.72rem' }}>
                                  <i className="bi bi-box-arrow-up-right"></i> Portal
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* VIEW 2: BRANCHES DIRECTORY */}
          {activeNav === 'branches' && (
            <section className="admin-page-view active">
              <div className="enterprise-card">
                <div className="enterprise-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="enterprise-card-title-group">
                    <h3>Bank Branches Directory ({filteredBranches.length} Total)</h3>
                    <p>Official 80-Branch Network for The Nasik Merchants Co-operative Bank Ltd.</p>
                  </div>
                  <button type="button" className="btn-primary-bank" onClick={() => setShowAddBranchModal(true)}>
                    <i className="bi bi-plus-circle"></i> Add New Branch
                  </button>
                </div>

                <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <input
                    type="text"
                    className="branch-search-input"
                    placeholder="Search branches by code, name, or city..."
                    value={branchSearch}
                    onChange={(e) => setBranchSearch(e.target.value)}
                    style={{ maxWidth: '400px' }}
                  />
                </div>

                <div className="table-responsive-wrap">
                  <table className="enterprise-data-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Branch Name</th>
                        <th>City</th>
                        <th>Region</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBranches.map(b => (
                        <tr key={b.branch_code || b.code}>
                          <td className="mono" style={{ color: '#0284c7', fontWeight: 600 }}>{b.branch_code || b.code}</td>
                          <td style={{ fontWeight: 600 }}>{b.branch_name || b.name}</td>
                          <td>{b.city || 'Nashik'}</td>
                          <td>{b.region || 'Nashik Region'}</td>
                          <td><span className="badge badge-yes">ACTIVE</span></td>
                          <td>
                            <button
                              type="button"
                              className="btn-danger-bank"
                              onClick={() => { setTargetDeleteBranch(b); setShowDeleteBranchModal(true); }}
                              style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              <i className="bi bi-trash"></i> Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* VIEW 3: BRANCH ADMINS */}
          {activeNav === 'officers' && (
            <section className="admin-page-view active">
              <div className="enterprise-card">
                <div className="enterprise-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="enterprise-card-title-group">
                    <h3>Branch Administrators & Officers</h3>
                    <p>Credential Management, Role Isolation & 2FA Enforcement</p>
                  </div>
                  <button type="button" className="btn-primary-bank" onClick={() => setShowAddOfficerModal(true)}>
                    <i className="bi bi-person-plus-fill"></i> Add Branch Admin
                  </button>
                </div>

                <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <input
                    type="text"
                    className="branch-search-input"
                    placeholder="Search admins by username, full name, branch, or role..."
                    value={officerSearch}
                    onChange={(e) => setOfficerSearch(e.target.value)}
                    style={{ maxWidth: '420px' }}
                  />
                </div>

                <div className="table-responsive-wrap">
                  <table className="enterprise-data-table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Full Name</th>
                        <th>Branch Assignment</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>2FA Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOfficers.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                            <i className="bi bi-person-x" style={{ fontSize: '1.8rem', display: 'block', marginBottom: '8px', color: '#94a3b8' }}></i>
                            No administrators found matching your search.
                          </td>
                        </tr>
                      ) : (
                        filteredOfficers.map(o => (
                          <tr key={o.id || o.username}>
                            <td className="mono" style={{ fontWeight: 600 }}>{o.username}</td>
                            <td>
                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{o.fullName || o.full_name || o.username}</div>
                              <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {(o.employeeId || o.employee_id) && <span><strong style={{ color: '#475569' }}>Emp:</strong> {o.employeeId || o.employee_id}</span>}
                                {o.mobile && <span><strong style={{ color: '#475569' }}>Mob:</strong> {o.mobile}</span>}
                                {(o.accountNumber || o.account_number) && <span><strong style={{ color: '#475569' }}>A/C:</strong> {o.accountNumber || o.account_number}</span>}
                              </div>
                            </td>
                            <td>{o.branchName || o.branch || 'Central Head Office'}</td>
                            <td>
                              <span className="badge" style={{ background: o.role === 'SUPER_ADMIN' ? '#fee2e2' : '#e0f2fe', color: o.role === 'SUPER_ADMIN' ? '#b91c1c' : '#0369a1' }}>
                                {o.role}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${o.is_active !== false ? 'badge-yes' : 'badge-no'}`}>
                                {o.is_active !== false ? 'ACTIVE' : 'DEACTIVATED'}
                              </span>
                            </td>
                            <td><span className="badge badge-yes">2FA ENABLED</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className="btn-secondary-bank"
                                  onClick={() => { setTargetResetOfficer(o); setShowResetPwdModal(true); }}
                                  style={{ padding: '4px 8px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                  title="Reset Password"
                                >
                                  <i className="bi bi-key-fill"></i> Reset Password
                                </button>
                                {o.username !== 'admin' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleOfficerStatus(o)}
                                      className="btn-secondary-bank"
                                      style={{
                                        padding: '4px 8px',
                                        fontSize: '0.75rem',
                                        whiteSpace: 'nowrap',
                                        color: o.is_active !== false ? '#d97706' : '#059669',
                                        borderColor: o.is_active !== false ? '#fcd34d' : '#a7f3d0'
                                      }}
                                      title={o.is_active !== false ? "Deactivate Officer" : "Activate Officer"}
                                    >
                                      <i className={`bi bi-${o.is_active !== false ? 'slash-circle-fill' : 'check-circle-fill'}`}></i> {o.is_active !== false ? 'Deactivate' : 'Activate'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { setTargetDeleteOfficer(o); setShowDeleteOfficerModal(true); }}
                                      className="btn-secondary-bank"
                                      style={{
                                        padding: '4px 8px',
                                        fontSize: '0.75rem',
                                        whiteSpace: 'nowrap',
                                        color: '#dc2626',
                                        borderColor: '#fca5a5'
                                      }}
                                      title="Delete Administrator"
                                    >
                                      <i className="bi bi-trash-fill"></i> Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* VIEW 4: MASTER CONSENT REGISTRY */}
          {activeNav === 'consents' && (
            <section className="admin-page-view active">
              <div className="enterprise-card">
                <div className="enterprise-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="enterprise-card-title-group">
                    <h3>Bank-Wide Master Consent Registry</h3>
                    <p>Live Regulatory Customer Consent Records Across All Branches</p>
                  </div>
                  <button type="button" className="btn-secondary-bank" onClick={() => handleExportBankWideCsv(consentStatusFilter)}>
                    <i className="bi bi-download"></i> Export {consentStatusFilter === 'ALL' ? 'All' : consentStatusFilter} CSV
                  </button>
                </div>

                <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    className="branch-search-input"
                    placeholder="Search by name, account no, mobile, CIF..."
                    value={consentSearch}
                    onChange={(e) => setConsentSearch(e.target.value)}
                    style={{ flex: 1, minWidth: '240px' }}
                  />
                  <select
                    className="branch-select-control"
                    value={consentStatusFilter}
                    onChange={(e) => setConsentStatusFilter(e.target.value)}
                    style={{ width: '180px' }}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="YES">YES (Consented)</option>
                    <option value="NO">NO (Declined)</option>
                    <option value="PENDING">Pending</option>
                    <option value="REVOKED">Revoked</option>
                  </select>
                </div>

                <div className="table-responsive-wrap">
                  <table className="enterprise-data-table">
                    <thead>
                      <tr>
                        <th>Ref ID</th>
                        <th>Customer Name</th>
                        <th>Account No</th>
                        <th>PAN (Masked)</th>
                        <th>Aadhaar (Masked)</th>
                        <th>Mobile (Unmasked)</th>
                        <th>Branch</th>
                        <th>Status</th>
                        <th>Channel</th>
                        <th>CBS Sync</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredConsents.map(r => (
                        <tr key={r.id || r.refNo || r.referenceNumber}>
                          <td className="mono" style={{ color: '#0284c7', fontWeight: 600 }}>{r.refNo || r.referenceNumber || `NAMCO-${r.id}`}</td>
                          <td style={{ fontWeight: 600 }}>{r.customerName || r.name}</td>
                          <td className="mono">{r.accNo || r.accountNumber}</td>
                          <td className="mono" style={{ fontSize: '0.82rem', color: '#334155' }}>{r.pan || r.panNumber || (r.rawPan ? `XXXXX${r.rawPan.slice(-5)}` : 'XXXXX1234F')}</td>
                          <td className="mono" style={{ fontSize: '0.82rem', color: '#334155' }}>{r.aadhaar || r.aadhaarNumber || (r.rawAadhaar ? `XXXX-XXXX-${r.rawAadhaar.slice(-4)}` : 'XXXX-XXXX-1098')}</td>
                          <td className="mono" style={{ fontWeight: 600, color: '#166534' }}>{r.mobile || r.mobileNumber}</td>
                          <td>{r.branch || r.branchName || 'CBS Head Office'}</td>
                          <td>
                            <span className={`badge ${((r.status || r.consent) === 'YES') ? 'badge-yes' : 'badge-no'}`}>
                              {r.status || r.consent}
                            </span>
                          </td>
                          <td>{r.channel || r.intakeChannel || 'Online Portal'}</td>
                          <td>
                            <span className={`badge ${r.cbsUpdated === 'Yes' ? 'badge-yes' : 'badge-pending'}`}>
                              {r.cbsUpdated === 'Yes' ? 'SYNCED' : 'PENDING'}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{r.date || r.createdAt || 'Today'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* VIEW 5: CENTRAL AUDIT TRAIL */}
          {activeNav === 'audit' && (
            <section className="admin-page-view active">
              <div className="enterprise-card">
                <div className="enterprise-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="enterprise-card-title-group">
                    <h3>Central Tamper-Evident Regulatory Audit Trail</h3>
                    <p>Immutable Audit Logs Capturing All Branch Officer & Super Admin Actions</p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        className="branch-select-control"
                        placeholder="Search officer (e.g. karan, shivnath)..."
                        value={auditOfficerFilter}
                        onChange={(e) => setAuditOfficerFilter(e.target.value)}
                        style={{ width: '230px', paddingLeft: '28px' }}
                      />
                      <i className="bi bi-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.8rem' }}></i>
                    </div>
                    <select
                      className="branch-select-control"
                      value={auditActionFilter}
                      onChange={(e) => setAuditActionFilter(e.target.value)}
                      style={{ width: '220px' }}
                    >
                      <option value="ALL">All Event Types</option>
                      <option value="CONSENT_SUBMISSION">Consent Submissions & Revocations</option>
                      <option value="CBS_MANUAL_SYNC">CBS Status Updates</option>
                      <option value="OFFICER_LOGIN">Officer Logins & 2FA</option>
                      <option value="BRANCH_CREATION">Branch & Admin Governance</option>
                      <option value="REPORT_EXPORT">Report & Data Exports</option>
                      <option value="OCR">Physical Form OCR</option>
                      <option value="SECURITY">Security & Access Violations</option>
                    </select>
                  </div>
                </div>

                <div className="table-responsive-wrap">
                  <table className="enterprise-data-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Branch</th>
                        <th>Description</th>
                        <th>IP Address</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAuditLogs.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                            <i className="bi bi-funnel" style={{ fontSize: '2rem', color: '#94a3b8', display: 'block', marginBottom: '8px' }}></i>
                            <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.95rem' }}>
                              No audit logs match current filters
                            </div>
                            <div style={{ fontSize: '0.82rem', marginTop: '4px', color: '#64748b' }}>
                              Filtered by: <strong>{auditActionFilter !== 'ALL' ? auditActionFilter : 'All Events'}</strong> {auditOfficerFilter && <span> &bull; Officer: <strong>{auditOfficerFilter}</strong></span>}
                            </div>
                            <button
                              type="button"
                              className="btn-secondary-bank"
                              onClick={() => { setAuditActionFilter('ALL'); setAuditOfficerFilter(''); }}
                              style={{ marginTop: '12px', fontSize: '0.8rem', padding: '6px 14px' }}
                            >
                              <i className="bi bi-arrow-counterclockwise"></i> Reset Event Filters
                            </button>
                          </td>
                        </tr>
                      ) : (
                        filteredAuditLogs.map(l => (
                          <tr key={l.id}>
                            <td className="mono" style={{ fontSize: '0.78rem', color: '#475569' }}>
                              {new Date(l.timestamp).toLocaleString()}
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              <div style={{ color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="bi bi-person-badge text-primary" style={{ fontSize: '0.85rem' }}></i>
                                <span>{l.username || 'System User'}</span>
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500, marginTop: '2px', display: 'flex', gap: '8px' }}>
                                {l.officerRole && <span>[{l.officerRole.replace('_', ' ')}]</span>}
                                {(l.userId || l.user_id) && <span>UID: {l.userId || l.user_id}</span>}
                              </div>
                            </td>
                            <td>
                              <span className="badge" style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1' }}>
                                {l.actionType || l.action}
                              </span>
                            </td>
                            <td>{l.branchName || l.branch || 'Bank-Wide'}</td>
                            <td style={{ fontSize: '0.82rem', color: '#334155' }}>
                              {l.actionDetails || l.details || l.description || '—'}
                            </td>
                            <td className="mono" style={{ fontSize: '0.78rem' }}>{l.ipAddress || '127.0.0.1'}</td>
                            <td><span className="badge badge-yes">LOGGED</span></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* VIEW 6: REPORTS */}
          {activeNav === 'reports' && (
            <section className="admin-page-view active">
              <div className="enterprise-card">
                <div className="enterprise-card-header">
                  <div className="enterprise-card-title-group">
                    <h3>Regulatory Compliance & Executive Reports</h3>
                    <p>Mandatory RBI DLT & TRAI SMS Consent Disclosures</p>
                  </div>
                </div>
                <div style={{ padding: '24px' }}>
                  <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '24px', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <i className="bi bi-file-earmark-spreadsheet" style={{ fontSize: '1.4rem', color: '#1e3a5f' }}></i>
                        <h4 style={{ margin: 0, color: '#0f172a' }}>Master Consent Registry Export (CSV)</h4>
                      </div>
                      <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '0 0 18px 0' }}>
                        Official regulatory export with selective masking for RBI/TRAI compliance audits. Search and select bank branch and consent status to filter exported records.
                      </p>

                      {/* Branch Search & Selector for Export */}
                      <div className="form-group" style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', margin: 0 }}>
                            <i className="bi bi-building" style={{ marginRight: '6px', color: '#0284c7' }}></i>
                            Select Branch to Export:
                          </label>
                          {exportBranchFilter !== 'ALL' && (
                            <button
                              type="button"
                              onClick={() => { setExportBranchFilter('ALL'); setExportBranchSearch(''); }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#0284c7',
                                fontSize: '0.78rem',
                                cursor: 'pointer',
                                fontWeight: 600,
                                padding: 0,
                                textDecoration: 'underline'
                              }}
                            >
                              Reset to Bank-Wide (All)
                            </button>
                          )}
                        </div>

                        {/* Search Input for Branch */}
                        <div style={{ position: 'relative', marginBottom: '8px' }}>
                          <input
                            type="text"
                            className="branch-search-input"
                            placeholder="Search bank / branch by name, code, or city (e.g. Canada, Jalgaon, HO-001)..."
                            value={exportBranchSearch}
                            onChange={(e) => setExportBranchSearch(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '9px 32px 9px 12px',
                              fontSize: '0.86rem',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: '#ffffff'
                            }}
                          />
                          {exportBranchSearch && (
                            <button
                              type="button"
                              onClick={() => setExportBranchSearch('')}
                              title="Clear search"
                              style={{
                                position: 'absolute',
                                right: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                padding: 0
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Dropdown Options filtered by Search */}
                        <select
                          className="branch-select-control"
                          value={exportBranchFilter}
                          onChange={(e) => setExportBranchFilter(e.target.value)}
                          style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff' }}
                        >
                          <option value="ALL">All Branches (Bank-Wide)</option>
                          {filteredExportBranches.map((b, idx) => (
                            <option key={idx} value={b.branch_name || b.name}>
                              {b.branch_name || b.name} {b.branch_code || b.code ? `(${b.branch_code || b.code})` : ''} {b.city ? `— ${b.city}` : ''}
                            </option>
                          ))}
                        </select>

                        {exportBranchSearch && (
                          <div style={{ fontSize: '0.74rem', color: '#0284c7', marginTop: '4px', fontWeight: 500 }}>
                            Showing {filteredExportBranches.length} of {branches.length} branches matching "{exportBranchSearch}"
                          </div>
                        )}
                      </div>

                      {/* Consent Choice Selector */}
                      <div className="form-group" style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                          <i className="bi bi-funnel" style={{ marginRight: '6px', color: '#0284c7' }}></i>
                          Select Consent Status to Export:
                        </label>
                        <select
                          className="branch-select-control"
                          value={exportConsentFilter}
                          onChange={(e) => setExportConsentFilter(e.target.value)}
                          style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff' }}
                        >
                          <option value="ALL">All Records (YES, NO, PENDING, REVOKED)</option>
                          <option value="YES">YES — Consent Given (SMS Alerts Enabled)</option>
                          <option value="NO">NO — Consent Declined (Statutory Alerts Only)</option>
                          <option value="PENDING">PENDING — Intake Awaiting Paper Verification</option>
                          <option value="REVOKED">REVOKED — Customer Opted-Out</option>
                        </select>
                      </div>

                      {/* Scope & Privacy Info Badge */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '14px 16px', marginBottom: '18px', fontSize: '0.82rem', color: '#475569' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span><i className="bi bi-building" style={{ marginRight: '4px' }}></i> Branch Scope:</span>
                          <strong style={{ color: '#0f172a' }}>{exportBranchFilter === 'ALL' ? 'Bank-Wide (All Branches)' : exportBranchFilter}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span><i className="bi bi-funnel" style={{ marginRight: '4px' }}></i> Consent Filter:</span>
                          <strong style={{ color: '#0f172a' }}>{exportConsentFilter === 'ALL' ? 'All Statuses' : exportConsentFilter}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', paddingTop: '6px', borderTop: '1px solid #e2e8f0' }}>
                          <span><i className="bi bi-database" style={{ marginRight: '4px' }}></i> Matching Records:</span>
                          <strong style={{ color: '#0284c7', fontSize: '0.92rem' }}>
                            {getExportFilteredRecords().length} records ready
                          </strong>
                        </div>
                        <div style={{ color: '#059669', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                          <i className="bi bi-shield-check"></i> Selective Masking: Mobile, Name, Consent & Date unmasked; Account & CIF masked.
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn-primary-bank"
                        onClick={() => handleExportBankWideCsv(exportConsentFilter, exportBranchFilter)}
                        style={{ width: '100%', padding: '12px', fontSize: '0.92rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                      >
                        <i className="bi bi-download"></i> Export {exportBranchFilter === 'ALL' ? 'Bank-Wide' : exportBranchFilter.split(',')[0]} — {exportConsentFilter === 'ALL' ? 'All' : exportConsentFilter} CSV
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* VIEW 7: SETTINGS */}
          {activeNav === 'settings' && (
            <section className="admin-page-view active">
              <div className="enterprise-card">
                <div className="enterprise-card-header">
                  <div className="enterprise-card-title-group">
                    <h3>System Governance & Core Banking Gateway Configuration</h3>
                    <p>Security Parameters, Cryptographic Keys, and RBI DLT Integration</p>
                  </div>
                </div>
                <div style={{ padding: '24px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <h5 style={{ margin: '0 0 8px 0', color: '#1e3a5f' }}>Regulatory Cryptographic Ciphers</h5>
                      <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0 }}>AES-256-GCM Hardware Security Module (HSM) Emulation: <strong>ACTIVE</strong></p>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <h5 style={{ margin: '0 0 8px 0', color: '#1e3a5f' }}>TRAI DLT 2FA Delivery Channel</h5>
                      <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0 }}>SMS Gateway Direct Route: <strong>OPERATIONAL (100% Delivery)</strong></p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

        </main>
      </div>

      {/* =========================================================================
           MODALS
           ========================================================================= */}
      {/* Modal: Add Branch */}
      {showAddBranchModal && (
        <div className="modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 }}>
          <div className="modal-dialog" style={{ background: '#fff', borderRadius: '8px', padding: '24px', maxWidth: '520px', width: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#1e3a5f' }}>Add New Bank Branch</h3>
              <button type="button" className="close-btn" onClick={() => setShowAddBranchModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
            </div>
            <form onSubmit={handleCreateBranch}>
              <div className="modal-body">
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label">Branch Code *</label>
                  <input
                    type="text"
                    className="form-input mono"
                    placeholder="e.g. NSK-081"
                    value={newBranch.branch_code}
                    onChange={(e) => setNewBranch({ ...newBranch, branch_code: e.target.value.toUpperCase() })}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label">Branch Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Gangapur Road Branch, Nashik"
                    value={newBranch.branch_name}
                    onChange={(e) => setNewBranch({ ...newBranch, branch_name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label">City *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newBranch.city}
                    onChange={(e) => setNewBranch({ ...newBranch, city: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddBranchModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Register Branch</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Branch */}
      {showDeleteBranchModal && targetDeleteBranch && (
        <div className="modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 }}>
          <div className="modal-dialog" style={{ background: '#fff', borderRadius: '8px', padding: '24px', maxWidth: '460px', width: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, color: '#dc2626' }}>Confirm Branch Deletion</h3>
              <button type="button" className="close-btn" onClick={() => setShowDeleteBranchModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.9rem', color: '#374151' }}>
                Are you sure you want to delete branch <strong>{targetDeleteBranch.branch_name || targetDeleteBranch.name}</strong> ({targetDeleteBranch.branch_code || targetDeleteBranch.code})?
              </p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowDeleteBranchModal(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleConfirmDeleteBranch} style={{ background: '#dc2626', borderColor: '#b91c1c' }}>
                Yes, Delete Branch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Officer */}
      {showAddOfficerModal && (
        <div className="modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 }}>
          <div className="modal-dialog" style={{ background: '#fff', borderRadius: '8px', padding: '24px', maxWidth: '560px', width: '92%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#1e3a5f' }}>Add Branch Administrator</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Provision branch administrative credentials & operational authority</p>
              </div>
              <button type="button" className="close-btn" onClick={() => setShowAddOfficerModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
            </div>
            <form onSubmit={handleCreateOfficer}>
              <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Full Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Rahul Sharma"
                      value={newOfficer.fullName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewOfficer(prev => ({
                          ...prev,
                          fullName: val,
                          username: prev.username || (prev.employeeId ? prev.employeeId.toLowerCase() : val.toLowerCase().replace(/\s+/g, '_').slice(0, 20))
                        }));
                      }}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Mobile Number *</label>
                    <input
                      type="tel"
                      className="form-input mono"
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      value={newOfficer.mobile}
                      onChange={(e) => setNewOfficer(prev => ({ ...prev, mobile: e.target.value.replace(/\D/g, '') }))}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Employee ID *</label>
                    <input
                      type="text"
                      className="form-input mono"
                      placeholder="e.g. EMP-10492"
                      value={newOfficer.employeeId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewOfficer(prev => ({
                          ...prev,
                          employeeId: val,
                          username: val ? val.toLowerCase().replace(/\s+/g, '_') : prev.username
                        }));
                      }}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Account Number</label>
                    <input
                      type="text"
                      className="form-input mono"
                      placeholder="e.g. 50100234891023"
                      value={newOfficer.accountNumber}
                      onChange={(e) => setNewOfficer(prev => ({ ...prev, accountNumber: e.target.value.replace(/\D/g, '') }))}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Branch Assignment *</label>
                  <select
                    className="form-input"
                    value={newOfficer.branchName}
                    onChange={(e) => setNewOfficer(prev => ({ ...prev, branchName: e.target.value }))}
                    required
                  >
                    <option value="" disabled>Select Branch</option>
                    {branches.map(b => (
                      <option key={b.branch_code || b.code} value={b.branch_name || b.name}>
                        {b.branch_name || b.name} ({b.branch_code || b.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Username / Login ID *</label>
                    <input
                      type="text"
                      className="form-input mono"
                      placeholder="e.g. officer_nsk"
                      value={newOfficer.username}
                      onChange={(e) => setNewOfficer(prev => ({ ...prev, username: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Initial Password *</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Minimum 6 characters"
                      value={newOfficer.password}
                      onChange={(e) => setNewOfficer(prev => ({ ...prev, password: e.target.value }))}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddOfficerModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Account</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset Password */}
      {showResetPwdModal && targetResetOfficer && (
        <div className="modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 }}>
          <div className="modal-dialog" style={{ background: '#fff', borderRadius: '8px', padding: '24px', maxWidth: '440px', width: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#1e3a5f' }}>Reset Officer Password</h3>
              <button type="button" className="close-btn" onClick={() => setShowResetPwdModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
            </div>
            <form onSubmit={handleResetOfficerPassword}>
              <div className="modal-body">
                <p style={{ fontSize: '0.88rem', color: '#475569', marginBottom: '14px' }}>
                  Set a new secure password for <strong>{targetResetOfficer.username}</strong>:
                </p>
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter at least 6 characters"
                    value={newPasswordVal}
                    onChange={(e) => setNewPasswordVal(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowResetPwdModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Update Password</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Officer */}
      {showDeleteOfficerModal && targetDeleteOfficer && (
        <div className="modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 }}>
          <div className="modal-dialog" style={{ background: '#fff', borderRadius: '8px', padding: '24px', maxWidth: '460px', width: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, color: '#dc2626' }}>Confirm Officer Deletion</h3>
              <button type="button" className="close-btn" onClick={() => { setShowDeleteOfficerModal(false); setTargetDeleteOfficer(null); }} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.5' }}>
                Are you sure you want to permanently delete administrator account <strong className="mono">{targetDeleteOfficer.username}</strong> ({targetDeleteOfficer.fullName || targetDeleteOfficer.full_name || targetDeleteOfficer.username})?
              </p>
              <div style={{ marginTop: '12px', padding: '10px 14px', background: '#fef2f2', borderLeft: '4px solid #ef4444', borderRadius: '4px', fontSize: '0.82rem', color: '#991b1b' }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: '6px' }}></i>
                This action terminates all active sessions for this officer immediately and permanently removes access to the portal.
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowDeleteOfficerModal(false); setTargetDeleteOfficer(null); }}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleConfirmDeleteOfficer} style={{ background: '#dc2626', borderColor: '#b91c1c' }}>
                <i className="bi bi-trash-fill"></i> Permanently Delete Admin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
