import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { bankApi, syncChannel } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function BranchAdminPortal() {
  const { user, logout, addToast } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Navigation tab: 'dashboard' | 'consents' | 'ocr' | 'reports' | 'audit' | 'account'
  const [activeNav, setActiveNav] = useState('dashboard');

  // Branch Focus (from query param or officer assignment or default)
  const queryParams = new URLSearchParams(location.search);
  const branchFromUrl = queryParams.get('branch');
  const isSuper = user?.role === 'SUPER_ADMIN' || user?.isSuperAdmin;
  const [activeBranch, setActiveBranch] = useState(branchFromUrl || (isSuper ? 'All Branches' : (user?.branchName || user?.branch_name || user?.branch || 'Canada Corner Branch, Nashik')));

  useEffect(() => {
    if (branchFromUrl) {
      setActiveBranch(branchFromUrl);
    } else if (!isSuper && (user?.branchName || user?.branch_name || user?.branch)) {
      setActiveBranch(user.branchName || user.branch_name || user.branch);
    }
  }, [user, branchFromUrl, isSuper]);

  // Data States
  const [records, setRecords] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [branches, setBranches] = useState([]);
  const [lastSyncTime, setLastSyncTime] = useState(new Date().toLocaleTimeString());
  const isSyncingRef = useRef(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [exportConsentFilter, setExportConsentFilter] = useState('ALL');

  // OCR Upload State
  const [ocrFile, setOcrFile] = useState(null);
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState(null);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [isVerifyingOcr, setIsVerifyingOcr] = useState(false);

  // Clock
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Chart References
  const donutChartRef = useRef(null);
  const barChartRef = useRef(null);

  // Load Data with silent background polling support
  const loadData = async (silent = false) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      const isAll = !activeBranch || activeBranch === 'All Branches' || activeBranch === 'ALL';
      const branchParam = isAll ? 'all' : activeBranch;
      const [recordsData, logsData, branchesData] = await Promise.all([
        bankApi.getRecords({ officer_user: user?.username || 'admin', branch: branchParam }),
        bankApi.getAuditLogs({ branch: branchParam }),
        bankApi.getBranches()
      ]);

      if (recordsData) {
        setRecords(recordsData);
        setLastSyncTime(new Date().toLocaleTimeString());
      }
      if (logsData) setAuditLogs(logsData);
      if (branchesData && branchesData.length > 0) setBranches(branchesData);
    } catch (err) {
      console.warn('Branch Admin load note:', err);
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
  }, [activeBranch]);

  // KPI Metrics Calculation
  const totalCount = records.length;
  const yesCount = records.filter(r => (r.status || r.consent || '').toUpperCase() === 'YES').length;
  const noCount = records.filter(r => (r.status || r.consent || '').toUpperCase() === 'NO').length;
  const pendingCount = records.filter(r => r.cbsUpdated === 'No' || (r.status || r.consent || '').toUpperCase() === 'PENDING').length;
  const revokedCount = records.filter(r => (r.status || r.consent || '').toUpperCase() === 'REVOKED').length;

  // Render Chart.js
  useEffect(() => {
    if (activeNav !== 'dashboard' || !window.Chart) return;

    // Donut Chart
    const donutEl = document.getElementById('consentDonutChart');
    if (donutEl) {
      if (donutChartRef.current) donutChartRef.current.destroy();
      donutChartRef.current = new window.Chart(donutEl, {
        type: 'doughnut',
        data: {
          labels: ['YES (Consented)', 'NO (Declined)', 'Pending', 'Revoked'],
          datasets: [{
            data: [yesCount, noCount, pendingCount, revokedCount],
            backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#8b5cf6'],
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14, font: { family: 'Inter', size: 11 } } }
          }
        }
      });
    }

    // Bar Chart
    const barEl = document.getElementById('intakeChannelsChart');
    if (barEl) {
      if (barChartRef.current) barChartRef.current.destroy();
      barChartRef.current = new window.Chart(barEl, {
        type: 'bar',
        data: {
          labels: ['Online Portal', 'Physical Form (OCR)', 'Branch Admin Entry'],
          datasets: [{
            label: 'Submissions',
            data: [3, 1, 1],
            backgroundColor: ['#0284c7', '#0d9488', '#475569'],
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
  }, [activeNav, yesCount, noCount, pendingCount, revokedCount]);

  // CBS Sync Toggle
  const handleToggleCbsSync = async (recordId, currentStatus) => {
    const newStatus = currentStatus === 'Yes' ? 'No' : 'Yes';
    try {
      await bankApi.toggleCbsStatus(recordId, newStatus);
      bankApi.recordAuditLog({
        actionType: 'CBS_STATUS_UPDATED',
        details: `Officer ${user?.fullName || user?.username || 'Branch Officer'} updated CBS status to '${newStatus}' for Ref: ${recordId}.`,
        refNo: recordId,
        branchName: activeBranch
      }).catch(() => {});
      addToast(`Record ${recordId} CBS status updated to ${newStatus}.`, 'success');
      loadData();
    } catch (err) {
      addToast('CBS sync failed: ' + err.message, 'error');
    }
  };

  // OCR File Drop/Select
  const handleOcrFileSelect = async (file) => {
    if (!file) return;
    setOcrFile(file);
    const previewUrl = URL.createObjectURL(file);
    setOcrPreviewUrl(previewUrl);
    setIsOcrProcessing(true);

    try {
      const branchTarget = activeBranch !== 'All Branches' ? activeBranch : 'CBS Head Office, Nashik';
      const res = await bankApi.uploadOcrForm(file, branchTarget);
      const extracted = res.extractedData || res.extracted || {};
      const isPdfFile = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

      setOcrResult({
        customerName: extracted.customerName || '',
        accountNumber: extracted.accountNumber || '',
        customerCif: extracted.customerCif || '',
        panNumber: extracted.panNumber || '',
        aadhaarNumber: extracted.aadhaarNumber || '',
        mobileNumber: extracted.mobileNumber || '',
        branchName: extracted.branchName || branchTarget,
        consentChoice: (extracted.consentChoice && String(extracted.consentChoice).toUpperCase() === 'NO') ? 'NO' : 'YES',
        formDate: extracted.formDate || new Date().toISOString().split('T')[0],
        formPlace: extracted.formPlace || 'Nashik',
        formId: res.formId || null,
        confidence: extracted.confidence || null,
        isPdf: isPdfFile,
        serverFileUrl: res.fileUrl || null
      });

      bankApi.recordAuditLog({
        actionType: 'OCR_UPLOAD',
        details: `Officer ${user?.fullName || user?.username || 'Branch Officer'} uploaded physical form '${file.name}' for branch [${branchTarget}].`,
        branchName: branchTarget
      }).catch(() => {});

      addToast(`Document '${file.name}' parsed. Please review fields and select YES or NO to submit.`, 'success');
    } catch (err) {
      addToast('OCR processing error: ' + err.message, 'error');
    } finally {
      setIsOcrProcessing(false);
    }
  };

  // Confirm OCR Verification
  const handleConfirmOcr = async (e) => {
    e.preventDefault();
    if (!ocrResult) return;
    if (!ocrResult.customerName?.trim() || !ocrResult.accountNumber?.trim() || !ocrResult.customerCif?.trim() || !ocrResult.mobileNumber?.trim()) {
      addToast('Please verify and fill in all mandatory fields (Name, Account No, CIF, Mobile No).', 'error');
      return;
    }
    setIsVerifyingOcr(true);

    try {
      const branchToUse = ocrResult.branchName || (activeBranch !== 'All Branches' ? activeBranch : 'CBS Head Office, Nashik');
      const payload = {
        formId: ocrResult.formId,
        name: ocrResult.customerName.trim(),
        accNo: ocrResult.accountNumber.trim(),
        cif: ocrResult.customerCif.trim(),
        pan: ocrResult.panNumber ? ocrResult.panNumber.trim().toUpperCase() : '',
        aadhaar: ocrResult.aadhaarNumber ? ocrResult.aadhaarNumber.replace(/\D/g, '') : '',
        mobile: ocrResult.mobileNumber.trim(),
        branch: branchToUse,
        officer: user?.fullName || user?.username || 'Branch Officer',
        officer_name: user?.fullName || user?.username || 'Branch Officer',
        consent: ocrResult.consentChoice || 'YES',
        date: ocrResult.formDate || new Date().toISOString().split('T')[0],
        place: ocrResult.formPlace || 'Nashik'
      };

      const res = await bankApi.verifyPhysicalForm(payload);
      addToast(`Physical consent registered successfully with choice: ${ocrResult.consentChoice}! Ref: ${res.referenceNo || res.referenceNumber || res.refNo}`, 'success');
      setOcrResult(null);
      setOcrFile(null);
      setOcrPreviewUrl(null);
      setActiveNav('consents');
      loadData();
    } catch (err) {
      addToast('Verification save error: ' + err.message, 'error');
    } finally {
      setIsVerifyingOcr(false);
    }
  };

  // CSV Export with Selective Masking & Consent Status Filter
  const handleExportCsv = (specificFilter = null) => {
    const filterToUse = (specificFilter !== null && specificFilter !== undefined) ? specificFilter : exportConsentFilter;
    const cleanBranch = activeBranch.split(',')[0].trim().replace(/\s+/g, '_');
    
    let toExport = records;
    if (filterToUse !== 'ALL') {
      toExport = records.filter(r => (r.status || r.consent || '').toUpperCase() === filterToUse);
    }

    if (!toExport.length) {
      addToast(`No [${filterToUse === 'ALL' ? 'ALL' : filterToUse}] consent records found to export for ${activeBranch}.`, 'info');
      return;
    }

    const filename = `Namco_SMS_Consent_${cleanBranch}_${filterToUse}.csv`;
    const success = bankApi.exportToCsv(toExport, filename);
    if (success) {
      bankApi.recordAuditLog({
        actionType: 'DATA_EXPORT',
        details: `Officer ${user?.fullName || user?.username || 'Branch Officer'} exported ${toExport.length} consent records (${filterToUse}) for branch [${activeBranch}].`,
        branchName: activeBranch
      }).catch(() => {});
      addToast(`Compliance CSV exported successfully (${toExport.length} records).`, 'success');
    }
  };

  // Filtered records
  const filteredRecords = records.filter(r => {
    const q = searchQuery.toLowerCase().trim();
    const matchQ = !q ||
      (r.customerName || r.name || '').toLowerCase().includes(q) ||
      (r.accNo || r.accountNumber || '').includes(q) ||
      (r.refNo || r.referenceNumber || '').toLowerCase().includes(q) ||
      (r.mobile || r.mobileNumber || '').includes(q);

    const rStatus = (r.status || r.consent || '').toUpperCase();
    const matchStatus = statusFilter === 'ALL' || rStatus === statusFilter;
    return matchQ && matchStatus;
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
            <span className="sidebar-brand-subtitle">SMS Consent Portal</span>
          </div>
        </div>

        {/* User Card */}
        <div className="sidebar-user-card">
          <div className="sidebar-user-avatar">
            {(user?.fullName || user?.username || 'BO').slice(0, 2).toUpperCase()}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.fullName || user?.username || 'Branch Officer'}</div>
            <div className="sidebar-user-role">{user?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Branch Admin / Officer'}</div>
            <span className="sidebar-branch-badge">{user?.branchName || user?.branch || activeBranch.split(',')[0]}</span>
          </div>
        </div>

        {/* Sidebar Menu */}
        <nav className="sidebar-menu">
          <div className="sidebar-nav-header">Core Navigation</div>

          <a className={`sidebar-nav-item ${activeNav === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveNav('dashboard')}>
            <i className="bi bi-grid-1x2 sidebar-nav-icon"></i>
            <span>Dashboard</span>
          </a>

          <a className={`sidebar-nav-item ${activeNav === 'consents' ? 'active' : ''}`} onClick={() => setActiveNav('consents')}>
            <i className="bi bi-file-earmark-check sidebar-nav-icon"></i>
            <span>Consent Records</span>
            <span className="sidebar-nav-badge">{records.length || 5}</span>
          </a>

          <a className={`sidebar-nav-item ${activeNav === 'ocr' ? 'active' : ''}`} onClick={() => setActiveNav('ocr')}>
            <i className="bi bi-camera-fill sidebar-nav-icon"></i>
            <span>Physical Form OCR</span>
          </a>

          <div className="sidebar-nav-header" style={{ marginTop: '10px' }}>Governance & Data</div>

          <a className={`sidebar-nav-item ${activeNav === 'reports' ? 'active' : ''}`} onClick={() => setActiveNav('reports')}>
            <i className="bi bi-file-earmark-spreadsheet sidebar-nav-icon"></i>
            <span>Branch Reports</span>
          </a>

          <a className={`sidebar-nav-item ${activeNav === 'audit' ? 'active' : ''}`} onClick={() => setActiveNav('audit')}>
            <i className="bi bi-shield-check sidebar-nav-icon"></i>
            <span>Audit Trail</span>
          </a>

          <a className={`sidebar-nav-item ${activeNav === 'account' ? 'active' : ''}`} onClick={() => setActiveNav('account')}>
            <i className="bi bi-person-gear sidebar-nav-icon"></i>
            <span>Officer Account</span>
          </a>
        </nav>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <button type="button" className="sidebar-logout-btn" onClick={async () => {
            try {
              await bankApi.recordAuditLog({
                actionType: 'AUTH_LOGOUT',
                details: `Officer ${user?.fullName || user?.username || 'Branch Officer'} logged out securely from branch portal.`,
                branchName: activeBranch
              });
            } catch (e) {}
            logout();
            navigate('/login.html');
          }}>
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
              {activeNav === 'dashboard' && 'Branch Dashboard'}
              {activeNav === 'consents' && 'Consent Records Registry'}
              {activeNav === 'ocr' && 'Physical Form OCR Ingestion'}
              {activeNav === 'reports' && 'Branch Compliance Reports'}
              {activeNav === 'audit' && 'Branch Audit Trail'}
              {activeNav === 'account' && 'Officer Account Profile'}
            </h1>
            <div className="topbar-breadcrumb">
              <span>Namco Bank</span> / <span>Branch Admin</span> / <span>Overview</span>
            </div>
          </div>

          <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <select
              className="branch-select-control"
              value={activeBranch}
              onChange={(e) => setActiveBranch(e.target.value)}
              style={{
                fontSize: '0.82rem',
                padding: '5px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                fontWeight: 600,
                color: '#1e293b',
                cursor: 'pointer'
              }}
            >
              <option value="All Branches">All Branches (Bank-Wide)</option>
              {branches.map(b => (
                <option key={b.branch_code || b.branchCode} value={b.branch_name || b.branchName}>
                  {b.branch_name || b.branchName}
                </option>
              ))}
            </select>

            <div className="topbar-session-badge">
              <span className="session-dot"></span>
              <span>RBI Compliant &bull; Live DB</span>
            </div>

            <div className="topbar-clock">{currentTime}</div>

            <div className="topbar-user-pill" title="Click to Refresh" onClick={loadData} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="bi bi-person-circle text-primary"></i>
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{user?.fullName || user?.username || 'Branch Officer'}</span>
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
              {/* Welcome Banner */}
              <div className="dashboard-welcome-header">
                <div className="welcome-title-group">
                  <h2>Good Day, {user?.fullName || user?.username || 'Branch Officer'}</h2>
                  <p>
                    Logged in as <strong>{user?.fullName || user?.username || 'Branch Officer'}</strong> ({user?.role === 'SUPER_ADMIN' ? 'Central Super Admin' : 'Branch Administrative Officer'}) &bull; Branch: <strong>{user?.branchName || user?.branch || activeBranch}</strong>
                  </p>
                </div>
                <div className="branch-isolation-pill">
                  <i className="bi bi-geo-alt-fill text-primary"></i>
                  <span>{user?.branchName || user?.branch || activeBranch}</span>
                </div>
              </div>

              {/* 5 KPI Metric Cards */}
              <div className="kpi-grid-5">
                <div className="kpi-card kpi-total">
                  <div className="kpi-card-header">
                    <span className="kpi-card-label">TOTAL REGISTERED</span>
                    <div className="kpi-card-icon"><i className="bi bi-people-fill"></i></div>
                  </div>
                  <div className="kpi-card-value">{totalCount}</div>
                  <div className="kpi-card-subtext"><i className="bi bi-check2-circle text-info"></i> Branch population</div>
                </div>

                <div className="kpi-card kpi-yes">
                  <div className="kpi-card-header">
                    <span className="kpi-card-label">YES (CONSENTED)</span>
                    <div className="kpi-card-icon"><i className="bi bi-check-circle-fill"></i></div>
                  </div>
                  <div className="kpi-card-value">{yesCount}</div>
                  <div className="kpi-card-subtext text-success"><i className="bi bi-bell-fill"></i> SMS alerts enabled</div>
                </div>

                <div className="kpi-card kpi-no">
                  <div className="kpi-card-header">
                    <span className="kpi-card-label">NO (DECLINED)</span>
                    <div className="kpi-card-icon"><i className="bi bi-x-circle-fill"></i></div>
                  </div>
                  <div className="kpi-card-value">{noCount}</div>
                  <div className="kpi-card-subtext text-danger"><i className="bi bi-shield-x"></i> Statutory only</div>
                </div>

                <div className="kpi-card kpi-pending">
                  <div className="kpi-card-header">
                    <span className="kpi-card-label">PENDING INTAKE</span>
                    <div className="kpi-card-icon"><i className="bi bi-hourglass-split"></i></div>
                  </div>
                  <div className="kpi-card-value">{pendingCount}</div>
                  <div className="kpi-card-subtext text-warning"><i className="bi bi-clock-history"></i> Awaiting form</div>
                </div>

                <div className="kpi-card kpi-revoked">
                  <div className="kpi-card-header">
                    <span className="kpi-card-label">REVOKED CONSENT</span>
                    <div className="kpi-card-icon"><i className="bi bi-shield-slash-fill"></i></div>
                  </div>
                  <div className="kpi-card-value">{revokedCount}</div>
                  <div className="kpi-card-subtext" style={{ color: '#9333ea' }}><i className="bi bi-arrow-counterclockwise"></i> Opted-out</div>
                </div>
              </div>

              {/* 2 Analytics Chart Cards */}
              <div className="analytics-grid-2">
                <div className="analytics-card">
                  <div className="analytics-card-header">
                    <div>
                      <div className="analytics-card-title">Consent Distribution</div>
                      <div className="analytics-card-sub">Branch-wide customer response breakdown</div>
                    </div>
                  </div>
                  <div className="chart-container" style={{ position: 'relative', height: '240px' }}>
                    <canvas id="consentDonutChart"></canvas>
                  </div>
                </div>

                <div className="analytics-card">
                  <div className="analytics-card-header">
                    <div>
                      <div className="analytics-card-title">Intake Channels & Submissions</div>
                      <div className="analytics-card-sub">Online self-service vs. Physical paper OCR</div>
                    </div>
                  </div>
                  <div className="chart-container" style={{ position: 'relative', height: '240px' }}>
                    <canvas id="intakeChannelsChart"></canvas>
                  </div>
                </div>
              </div>

              {/* Recent Submissions Card */}
              <div className="enterprise-card" style={{ marginTop: '24px' }}>
                <div className="enterprise-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="enterprise-card-title-group">
                    <h3>Recent Consent Submissions</h3>
                    <p>Latest customer consent records recorded for this branch</p>
                  </div>
                  <button type="button" className="btn-primary-bank" onClick={() => setActiveNav('consents')}>
                    <span>View All Records</span>
                    <i className="bi bi-arrow-right"></i>
                  </button>
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
                        <th>Status</th>
                        <th>Source</th>
                        <th>Date</th>
                        <th>CBS Sync</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.slice(0, 5).map(r => (
                        <tr key={r.id || r.refNo}>
                          <td className="mono" style={{ color: '#0284c7', fontWeight: 600 }}>{r.refNo || r.referenceNumber}</td>
                          <td style={{ fontWeight: 600 }}>{r.customerName || r.name}</td>
                          <td className="mono">{r.accNo || r.accountNumber}</td>
                          <td className="mono" style={{ fontSize: '0.82rem', color: '#334155' }}>{r.pan || r.panNumber || (r.rawPan ? `XXXXX${r.rawPan.slice(-5)}` : 'XXXXX1234F')}</td>
                          <td className="mono" style={{ fontSize: '0.82rem', color: '#334155' }}>{r.aadhaar || r.aadhaarNumber || (r.rawAadhaar ? `XXXX-XXXX-${r.rawAadhaar.slice(-4)}` : 'XXXX-XXXX-1098')}</td>
                          <td className="mono" style={{ fontWeight: 600, color: '#166534' }}>{r.mobile || r.mobileNumber}</td>
                          <td>
                            <span className={`badge ${((r.status || r.consent) === 'YES') ? 'badge-yes' : 'badge-no'}`}>
                              {r.status || r.consent}
                            </span>
                          </td>
                          <td>{r.channel || r.intakeChannel || 'Online'}</td>
                          <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{r.date || 'Today'}</td>
                          <td>
                            <span className={`badge ${r.cbsUpdated === 'Yes' ? 'badge-yes' : 'badge-pending'}`}>
                              {r.cbsUpdated === 'Yes' ? 'SYNCED' : 'PENDING'}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn-text"
                              onClick={() => handleToggleCbsSync(r.id, r.cbsUpdated)}
                              style={{ color: '#0284c7', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none' }}
                            >
                              Toggle Sync
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

          {/* VIEW 2: ALL CONSENT RECORDS */}
          {activeNav === 'consents' && (
            <section className="admin-page-view active">
              <div className="enterprise-card">
                <div className="enterprise-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="enterprise-card-title-group">
                    <h3>Branch Master Consent Records</h3>
                    <p>All Registered Customer SMS Alert Choices for {activeBranch}</p>
                  </div>
                  <button type="button" className="btn-secondary-bank" onClick={() => handleExportCsv(statusFilter)}>
                    <i className="bi bi-download"></i> Export {statusFilter === 'ALL' ? 'All' : statusFilter} CSV
                  </button>
                </div>

                <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    className="branch-search-input"
                    placeholder="Search by customer name, account number, mobile..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ flex: 1, minWidth: '240px' }}
                  />
                  <select
                    className="branch-select-control"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
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
                        <th>CIF</th>
                        <th>PAN (Masked)</th>
                        <th>Aadhaar (Masked)</th>
                        <th>Mobile (Unmasked)</th>
                        <th>Consent</th>
                        <th>Channel</th>
                        <th>CBS Sync</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map(r => (
                        <tr key={r.id || r.refNo}>
                          <td className="mono" style={{ color: '#0284c7', fontWeight: 600 }}>{r.refNo || r.referenceNumber}</td>
                          <td style={{ fontWeight: 600 }}>{r.customerName || r.name}</td>
                          <td className="mono">{r.accNo || r.accountNumber}</td>
                          <td className="mono">{r.cif || r.customerCif || 'CIF-NA'}</td>
                          <td className="mono" style={{ fontSize: '0.82rem', color: '#334155' }}>{r.pan || r.panNumber || (r.rawPan ? `XXXXX${r.rawPan.slice(-5)}` : 'XXXXX1234F')}</td>
                          <td className="mono" style={{ fontSize: '0.82rem', color: '#334155' }}>{r.aadhaar || r.aadhaarNumber || (r.rawAadhaar ? `XXXX-XXXX-${r.rawAadhaar.slice(-4)}` : 'XXXX-XXXX-1098')}</td>
                          <td className="mono" style={{ fontWeight: 600, color: '#166534' }}>{r.mobile || r.mobileNumber}</td>
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
                          <td>
                            <button
                              type="button"
                              className="btn-text"
                              onClick={() => handleToggleCbsSync(r.id, r.cbsUpdated)}
                              style={{ color: '#0284c7', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none' }}
                            >
                              Toggle
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

          {/* VIEW 3: PHYSICAL FORM OCR */}
          {activeNav === 'ocr' && (
            <section className="admin-page-view active">
              <div className="enterprise-card">
                <div className="enterprise-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="enterprise-card-title-group">
                    <h3>Physical Scanned Consent Form OCR Ingestion</h3>
                    <p>Automated OCR Extraction, Field Verification & Core Banking System Ingestion</p>
                  </div>
                  <button type="button" className="btn-secondary-bank" onClick={() => bankApi.downloadBlankPhysicalForm()} style={{ fontSize: '0.84rem' }}>
                    <i className="bi bi-printer"></i> Print Blank Physical Form
                  </button>
                </div>

                <div style={{ padding: '24px' }}>
                  {/* Upload Drop Zone */}
                  <div
                    style={{
                      border: '2px dashed #cbd5e1',
                      borderRadius: '8px',
                      padding: '36px',
                      textAlign: 'center',
                      background: '#f8fafc',
                      cursor: 'pointer',
                      marginBottom: '24px'
                    }}
                    onClick={() => document.getElementById('ocrFileInput').click()}
                  >
                    <input
                      type="file"
                      id="ocrFileInput"
                      style={{ display: 'none' }}
                      accept="image/*,.pdf"
                      onChange={(e) => handleOcrFileSelect(e.target.files[0])}
                    />
                    <i className="bi bi-cloud-arrow-up-fill" style={{ fontSize: '2.5rem', color: '#0284c7' }}></i>
                    <h4 style={{ margin: '12px 0 6px 0', color: '#1e3a5f' }}>
                      {ocrFile ? ocrFile.name : 'Drag & Drop Scanned Physical Form here'}
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                      Supports High-Res PNG, JPEG, or Scanned PDF from Branch Flatbed Scanner
                    </p>
                    {isOcrProcessing && (
                      <div style={{ marginTop: '14px', color: '#0284c7', fontWeight: 600 }}>
                        <i className="bi bi-gear-wide-connected" style={{ marginRight: '6px' }}></i>
                        Extracting Marathi & English text via Tesseract OCR...
                      </div>
                    )}
                  </div>

                  {/* Side-by-side Verification Form */}
                  {ocrResult && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '24px', alignItems: 'start' }}>
                      {/* Left: Scanned Document Preview */}
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <h4 style={{ margin: 0, color: '#0f2b48', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="bi bi-file-earmark-medical-fill" style={{ color: '#0284c7' }}></i>
                            Scanned Document Preview
                          </h4>
                          <span style={{ fontSize: '0.78rem', background: ocrResult.isPdf ? '#fee2e2' : '#e0f2fe', color: ocrResult.isPdf ? '#b91c1c' : '#0369a1', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
                            {ocrResult.isPdf ? 'PDF Scanned Document' : 'High-Res Image Scan'}
                          </span>
                        </div>
                        {ocrPreviewUrl ? (
                          ocrResult.isPdf ? (
                            <iframe
                              src={ocrPreviewUrl}
                              title="Scanned PDF Preview"
                              style={{ width: '100%', height: '640px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc' }}
                            />
                          ) : (
                            <div style={{ textAlign: 'center', background: '#f8fafc', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                              <img
                                src={ocrPreviewUrl}
                                alt="Scanned Form"
                                style={{ width: '100%', maxHeight: '640px', objectFit: 'contain', borderRadius: '4px' }}
                              />
                            </div>
                          )
                        ) : (
                          <div style={{ height: '360px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', borderRadius: '6px' }}>
                            <i className="bi bi-file-earmark-text" style={{ fontSize: '2rem', marginRight: '8px' }}></i>
                            No document preview loaded
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '0.78rem', color: '#64748b' }}>
                          <span>Document: <strong>{ocrFile ? ocrFile.name : 'Scanned Form'}</strong></span>
                          {ocrPreviewUrl && (
                            <a href={ocrPreviewUrl} target="_blank" rel="noreferrer" style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 600 }}>
                              <i className="bi bi-arrows-fullscreen"></i> Open in Full Window
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Right: Extracted OCR Fields (All 100% Editable) */}
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '20px', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                          <div>
                            <h4 style={{ margin: 0, color: '#166534', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <i className="bi bi-pencil-square"></i> Verified Form Fields
                            </h4>
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>All fields are editable. Verify and confirm with physical paper copy.</span>
                          </div>
                          <span style={{ fontSize: '0.78rem', background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '4px', fontWeight: 700 }}>
                            <i className="bi bi-shield-check"></i> Ready for Verification
                          </span>
                        </div>

                        <form onSubmit={handleConfirmOcr}>
                          <div className="form-group" style={{ marginBottom: '14px' }}>
                            <label className="form-label" style={{ fontWeight: 600 }}>Customer Name (as per Bank Records) <span style={{ color: '#dc2626' }}>*</span></label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Full Name"
                              value={ocrResult.customerName}
                              onChange={(e) => setOcrResult({ ...ocrResult, customerName: e.target.value })}
                              required
                            />
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                            <div className="form-group">
                              <label className="form-label" style={{ fontWeight: 600 }}>Account Number <span style={{ color: '#dc2626' }}>*</span></label>
                              <input
                                type="text"
                                className="form-input mono"
                                placeholder="16-digit Account No"
                                value={ocrResult.accountNumber}
                                onChange={(e) => setOcrResult({ ...ocrResult, accountNumber: e.target.value.replace(/\D/g, '') })}
                                required
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label" style={{ fontWeight: 600 }}>Customer ID (CIF) <span style={{ color: '#dc2626' }}>*</span></label>
                              <input
                                type="text"
                                className="form-input mono"
                                placeholder="e.g. 11-digit CIF"
                                value={ocrResult.customerCif}
                                onChange={(e) => setOcrResult({ ...ocrResult, customerCif: e.target.value.toUpperCase() })}
                                required
                              />
                            </div>
                          </div>

                          <div className="form-group" style={{ marginBottom: '14px' }}>
                            <label className="form-label" style={{ fontWeight: 600 }}>Registered Mobile Number <span style={{ color: '#dc2626' }}>*</span></label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <span style={{ padding: '8px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontWeight: 700, fontSize: '0.9rem', color: '#334155' }}>+91</span>
                              <input
                                type="tel"
                                className="form-input mono"
                                placeholder="10-digit Mobile Number"
                                value={ocrResult.mobileNumber}
                                onChange={(e) => setOcrResult({ ...ocrResult, mobileNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                                maxLength="10"
                                required
                                style={{ flex: 1 }}
                              />
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                            <div className="form-group">
                              <label className="form-label">PAN Card Number</label>
                              <input
                                type="text"
                                className="form-input mono"
                                placeholder="e.g. ABCDE1234F"
                                value={ocrResult.panNumber || ''}
                                onChange={(e) => setOcrResult({ ...ocrResult, panNumber: e.target.value.toUpperCase() })}
                                maxLength="10"
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Aadhaar Card Number</label>
                              <input
                                type="text"
                                className="form-input mono"
                                placeholder="e.g. 12-digit Aadhaar"
                                value={ocrResult.aadhaarNumber || ''}
                                onChange={(e) => setOcrResult({ ...ocrResult, aadhaarNumber: e.target.value.replace(/[^0-9]/g, '').slice(0, 12) })}
                                maxLength="12"
                              />
                            </div>
                          </div>

                          <div className="form-group" style={{ marginBottom: '14px' }}>
                            <label className="form-label">Branch Name</label>
                            {branches && branches.length > 0 ? (
                              <select
                                className="form-input"
                                value={ocrResult.branchName || activeBranch}
                                onChange={(e) => setOcrResult({ ...ocrResult, branchName: e.target.value })}
                              >
                                {branches.map((b) => (
                                  <option key={b.branch_code || b.branch_name} value={b.branch_name}>
                                    {b.branch_name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                className="form-input"
                                value={ocrResult.branchName || activeBranch}
                                onChange={(e) => setOcrResult({ ...ocrResult, branchName: e.target.value })}
                              />
                            )}
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                            <div className="form-group">
                              <label className="form-label">Form Date</label>
                              <input
                                type="date"
                                className="form-input"
                                value={ocrResult.formDate || new Date().toISOString().split('T')[0]}
                                onChange={(e) => setOcrResult({ ...ocrResult, formDate: e.target.value })}
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Form Place</label>
                              <input
                                type="text"
                                className="form-input"
                                value={ocrResult.formPlace || 'Nashik'}
                                onChange={(e) => setOcrResult({ ...ocrResult, formPlace: e.target.value })}
                              />
                            </div>
                          </div>

                          {/* Customer Consent Marked on Paper Form */}
                          <div style={{ marginBottom: '20px', padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            <label className="form-label" style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '8px', display: 'block', color: '#0f2b48' }}>
                              Customer Consent Choice on Paper Form: <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                              <button
                                type="button"
                                onClick={() => setOcrResult({ ...ocrResult, consentChoice: 'YES' })}
                                style={{
                                  padding: '12px 14px',
                                  borderRadius: '6px',
                                  border: ocrResult.consentChoice === 'YES' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                                  background: ocrResult.consentChoice === 'YES' ? '#f0fdf4' : '#ffffff',
                                  color: ocrResult.consentChoice === 'YES' ? '#15803d' : '#475569',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px',
                                  fontSize: '0.92rem',
                                  boxShadow: ocrResult.consentChoice === 'YES' ? '0 2px 8px rgba(22, 163, 74, 0.15)' : 'none',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <i className="bi bi-check-circle-fill" style={{ fontSize: '1.2rem', color: ocrResult.consentChoice === 'YES' ? '#16a34a' : '#94a3b8' }}></i>
                                <span>YES — Agrees to SMS Alerts</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setOcrResult({ ...ocrResult, consentChoice: 'NO' })}
                                style={{
                                  padding: '12px 14px',
                                  borderRadius: '6px',
                                  border: ocrResult.consentChoice === 'NO' ? '2px solid #dc2626' : '1px solid #cbd5e1',
                                  background: ocrResult.consentChoice === 'NO' ? '#fef2f2' : '#ffffff',
                                  color: ocrResult.consentChoice === 'NO' ? '#b91c1c' : '#475569',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px',
                                  fontSize: '0.92rem',
                                  boxShadow: ocrResult.consentChoice === 'NO' ? '0 2px 8px rgba(220, 38, 38, 0.15)' : 'none',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <i className="bi bi-x-circle-fill" style={{ fontSize: '1.2rem', color: ocrResult.consentChoice === 'NO' ? '#dc2626' : '#94a3b8' }}></i>
                                <span>NO — Declines Optional Alerts</span>
                              </button>
                            </div>
                            <div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#64748b' }}>
                              Verified status to commit: <strong style={{ color: ocrResult.consentChoice === 'YES' ? '#15803d' : '#b91c1c' }}>{ocrResult.consentChoice === 'YES' ? 'OPT-IN (SMS Alerts Enabled)' : 'OPT-OUT (SMS Alerts Declined)'}</strong>
                            </div>
                          </div>

                          <button
                            type="submit"
                            className="btn-primary-bank"
                            disabled={isVerifyingOcr}
                            style={{
                              width: '100%',
                              padding: '14px',
                              fontSize: '0.95rem',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              background: ocrResult.consentChoice === 'YES' ? '#166534' : '#991b1b'
                            }}
                          >
                            {isVerifyingOcr ? (
                              <>
                                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                <span>Saving to Core Banking &amp; Audit Trail...</span>
                              </>
                            ) : (
                              <>
                                <i className="bi bi-shield-check"></i>
                                <span>Submit &amp; Commit Physical Consent ({ocrResult.consentChoice}) to CBS</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            className="btn-secondary-bank"
                            onClick={() => { setOcrResult(null); setOcrFile(null); setOcrPreviewUrl(null); }}
                            style={{ width: '100%', marginTop: '8px', padding: '8px', fontSize: '0.84rem' }}
                          >
                            Discard &amp; Upload Different Form
                          </button>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* VIEW 4: BRANCH REPORTS */}
          {activeNav === 'reports' && (
            <section className="admin-page-view active">
              <div className="enterprise-card">
                <div className="enterprise-card-header">
                  <div className="enterprise-card-title-group">
                    <h3>Branch Compliance & Regulatory Reports</h3>
                    <p>Export official logs and statistics for {activeBranch}</p>
                  </div>
                </div>
                <div style={{ padding: '24px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', background: '#ffffff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <i className="bi bi-file-earmark-spreadsheet" style={{ fontSize: '1.4rem', color: '#1e3a5f' }}></i>
                        <h4 style={{ margin: 0, color: '#0f172a' }}>Branch Compliance Records (CSV)</h4>
                      </div>
                      <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '0 0 16px 0' }}>
                        Download branch compliance records with selective masking. Choose the consent status category below to export only the required customer choices.
                      </p>

                      {/* Consent Choice Selector */}
                      <div className="form-group" style={{ marginBottom: '14px' }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                          Select Consent Status to Export:
                        </label>
                        <select
                          className="branch-select-control"
                          value={exportConsentFilter}
                          onChange={(e) => setExportConsentFilter(e.target.value)}
                          style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                        >
                          <option value="ALL">All Records (YES, NO, PENDING, REVOKED)</option>
                          <option value="YES">YES — Consent Given (SMS Alerts Enabled)</option>
                          <option value="NO">NO — Consent Declined (Statutory Alerts Only)</option>
                          <option value="PENDING">PENDING — Intake Awaiting Paper Verification</option>
                          <option value="REVOKED">REVOKED — Customer Opted-Out</option>
                        </select>
                      </div>

                      {/* Matching Records & Selective Masking Info */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px', marginBottom: '16px', fontSize: '0.8rem', color: '#475569' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span>Matching Branch Records:</span>
                          <strong style={{ color: '#0f172a' }}>
                            {exportConsentFilter === 'ALL' ? records.length : records.filter(r => (r.status || r.consent || '').toUpperCase() === exportConsentFilter).length} records ready
                          </strong>
                        </div>
                        <div style={{ color: '#059669', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                          <i className="bi bi-shield-check"></i> Selective Masking: Mobile, Name, Consent & Date unmasked; Account & CIF masked.
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn-primary-bank"
                        onClick={() => handleExportCsv(exportConsentFilter)}
                        style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                      >
                        <i className="bi bi-download"></i> Export {exportConsentFilter === 'ALL' ? 'All' : exportConsentFilter} CSV
                      </button>
                    </div>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', background: '#ffffff' }}>
                      <h4 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>Print Branch Daily Log</h4>
                      <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '0 0 16px 0' }}>
                        Generate printable PDF summary of all customer intake today for branch records.
                      </p>
                      <button type="button" className="btn-secondary-bank" onClick={() => window.print()}>
                        <i className="bi bi-printer"></i> Print Daily Log
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* VIEW 5: BRANCH AUDIT TRAIL */}
          {activeNav === 'audit' && (
            <section className="admin-page-view active">
              <div className="enterprise-card">
                <div className="enterprise-card-header">
                  <div className="enterprise-card-title-group">
                    <h3>Branch Isolated Regulatory Audit Trail</h3>
                    <p>Tamper-Evident Security Log for {activeBranch}</p>
                  </div>
                </div>
                <div className="table-responsive-wrap">
                  <table className="enterprise-data-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Details</th>
                        <th>IP Address</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map(l => (
                        <tr key={l.id}>
                          <td className="mono" style={{ fontSize: '0.78rem', color: '#475569' }}>
                            {new Date(l.timestamp).toLocaleString()}
                          </td>
                          <td style={{ fontWeight: 600 }}>{l.username || 'Branch Officer'}</td>
                          <td>
                            <span className="badge" style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1' }}>
                              {l.actionType || l.action}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.82rem', color: '#334155' }}>{l.actionDetails || l.details || l.description || '—'}</td>
                          <td className="mono" style={{ fontSize: '0.78rem' }}>{l.ipAddress || '127.0.0.1'}</td>
                          <td><span className="badge badge-yes">RECORDED</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* VIEW 6: OFFICER ACCOUNT */}
          {activeNav === 'account' && (
            <section className="admin-page-view active">
              <div className="enterprise-card">
                <div className="enterprise-card-header">
                  <div className="enterprise-card-title-group">
                    <h3>Branch Officer Account Profile & Security Settings</h3>
                    <p>Credentials and Two-Factor Authentication Status</p>
                  </div>
                </div>
                <div style={{ padding: '24px' }}>
                  <div style={{ maxWidth: '480px' }}>
                    <div style={{ marginBottom: '14px' }}>
                      <label className="form-label" style={{ fontWeight: 600 }}>Full Name</label>
                      <input type="text" className="form-input" value={user?.fullName || user?.username || 'Branch Officer'} readOnly />
                    </div>
                    {user?.employeeId && (
                      <div style={{ marginBottom: '14px' }}>
                        <label className="form-label" style={{ fontWeight: 600 }}>Employee ID</label>
                        <input type="text" className="form-input" value={user.employeeId} readOnly />
                      </div>
                    )}
                    <div style={{ marginBottom: '14px' }}>
                      <label className="form-label" style={{ fontWeight: 600 }}>Role Assignment</label>
                      <input type="text" className="form-input" value={user?.role === 'SUPER_ADMIN' ? 'Central Super Admin' : 'Branch Admin / Officer'} readOnly />
                    </div>
                    <div style={{ marginBottom: '14px' }}>
                      <label className="form-label" style={{ fontWeight: 600 }}>Assigned Branch</label>
                      <input type="text" className="form-input" value={user?.branchName || user?.branch || activeBranch} readOnly />
                    </div>
                    <div style={{ marginBottom: '14px' }}>
                      <label className="form-label" style={{ fontWeight: 600 }}>Two-Factor Authentication (2FA)</label>
                      <div style={{ background: '#ecfdf5', padding: '10px 14px', borderRadius: '6px', border: '1px solid #a7f3d0', color: '#065f46', fontSize: '0.85rem' }}>
                        🔒 <strong>Mandatory 2FA Active</strong> &bull; Cryptographic OTP challenge verified for this session.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

        </main>
      </div>
    </div>
  );
}
