import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { bankApi, syncChannel } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function DltPartnerPortal() {
  const { user, logout, addToast } = useAuth();
  const navigate = useNavigate();

  // Data States
  const [branches, setBranches] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState(new Date().toLocaleTimeString());
  const isSyncingRef = useRef(false);

  // Search & Filter States
  const [exportBranchSearch, setExportBranchSearch] = useState('');
  const [exportBranchFilter, setExportBranchFilter] = useState('ALL');
  const [exportConsentFilter, setExportConsentFilter] = useState('ALL');

  // Table Quick Search
  const [tableSearch, setTableSearch] = useState('');
  const [tableStatusFilter, setTableStatusFilter] = useState('ALL');

  // Clock
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load Data (with silent background polling support)
  const loadData = async (silent = false) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (!silent) setLoading(true);
    try {
      const [branchesData, recordsData] = await Promise.all([
        bankApi.getBranches(),
        bankApi.getRecords({ officer_user: 'dltpartner' })
      ]);
      if (branchesData && branchesData.length > 0) setBranches(branchesData);
      if (recordsData) {
        setAllRecords(recordsData);
        setLastSyncTime(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.warn('DLT Partner load note:', err);
    } finally {
      if (!silent) setLoading(false);
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

  // Compute live KPIs
  const totalCount = allRecords.length;
  const yesCount = allRecords.filter(r => (r.status || r.consent || '').toUpperCase() === 'YES').length;
  const noCount = allRecords.filter(r => (r.status || r.consent || '').toUpperCase() === 'NO').length;
  const pendingCount = allRecords.filter(r => (r.status || r.consent || '').toUpperCase() === 'PENDING').length;
  const revokedCount = allRecords.filter(r => (r.status || r.consent || '').toUpperCase() === 'REVOKED').length;

  // Filtered branches for export selector
  const filteredExportBranches = branches.filter(b => {
    const q = exportBranchSearch.toLowerCase().trim();
    if (!q) return true;
    const name = (b.branch_name || b.name || '').toLowerCase();
    const code = (b.branch_code || b.code || '').toLowerCase();
    const city = (b.city || '').toLowerCase();
    return name.includes(q) || code.includes(q) || city.includes(q);
  });

  // Filtered records for CSV export
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

  // CSV Export Handler
  const handleExportCsv = () => {
    const recordsToExport = getExportFilteredRecords();
    if (!recordsToExport.length) {
      addToast(`No [${exportConsentFilter}] records found for ${exportBranchFilter === 'ALL' ? 'Bank-Wide' : exportBranchFilter}.`, 'info');
      return;
    }

    const branchSlug = exportBranchFilter === 'ALL' ? 'BankWide_AllBranches' : exportBranchFilter.split(',')[0].trim().replace(/\s+/g, '_');
    const filename = `Namco_DLT_SMS_Consent_${exportConsentFilter}_${branchSlug}.csv`;
    const success = bankApi.exportToCsv(recordsToExport, filename);
    if (success) {
      addToast(`Exported ${recordsToExport.length} [${exportConsentFilter}] records for DLT SMS dispatch successfully.`, 'success');
    }
  };

  // Filter records for table view
  const filteredTableRecords = allRecords.filter(r => {
    const q = tableSearch.toLowerCase().trim();
    const matchQ = !q ||
      (r.customerName || r.name || '').toLowerCase().includes(q) ||
      (r.mobile || r.mobileNumber || '').includes(q) ||
      (r.accNo || r.accountNumber || '').includes(q) ||
      (r.refNo || r.referenceNumber || '').toLowerCase().includes(q) ||
      (r.branch || r.branchName || '').toLowerCase().includes(q);

    const rStatus = (r.status || r.consent || '').toUpperCase();
    const matchStatus = tableStatusFilter === 'ALL' || rStatus === tableStatusFilter;

    return matchQ && matchStatus;
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="admin-app-layout" style={{ background: '#f1f5f9', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ===== TOP NAVIGATION BAR ===== */}
      <header style={{ background: '#0f172a', color: '#ffffff', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img src="/logo.png" alt="Namco Bank" style={{ height: '36px', background: '#ffffff', padding: '2px 6px', borderRadius: '4px' }} />
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '0.5px' }}>THE NASIK MERCHANTS CO-OP BANK LTD.</div>
            <div style={{ fontSize: '0.76rem', color: '#38bdf8', fontWeight: 600 }}>DLT SMS Regulatory Gateway Partner &bull; Telecom Consent Registry</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '6px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }}></span>
            <span>Live Sync Active &bull; {totalCount} records synced &bull; {lastSyncTime}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#0284c7', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>
              DL
            </div>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 700 }}>{user?.fullName || 'DLT Telecom Partner'}</div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Telecom Gateway Ops</div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            style={{ background: '#dc2626', color: '#ffffff', border: 'none', padding: '7px 14px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* ===== MAIN CONTENT AREA ===== */}
      <main style={{ padding: '24px', flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        
        {/* Banner Notice */}
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="bi bi-broadcast" style={{ fontSize: '1.25rem', color: '#1e40af' }}></i>
            <div style={{ fontSize: '0.84rem', color: '#1e3a8a' }}>
              <strong>Telecom DLT Regulatory Mandate:</strong> SMS alerts may ONLY be broadcasted to numbers with active <strong>YES</strong> consent. Numbers with <strong>NO</strong> consent must strictly receive statutory security OTPs only.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.76rem', color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '4px 10px', borderRadius: '4px', fontWeight: 600 }}>
              ● Auto-Sync: 3.5s
            </span>
            <button
              type="button"
              onClick={() => loadData(false)}
              style={{ background: '#ffffff', border: '1px solid #93c5fd', color: '#1d4ed8', padding: '6px 12px', borderRadius: '5px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <i className={`bi bi-arrow-clockwise ${loading ? 'spin-icon' : ''}`}></i>
              <span>{loading ? 'Syncing...' : 'Force Sync Now'}</span>
            </button>
          </div>
        </div>

        {/* ===== KPI CARDS ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: '#ffffff', borderRadius: '8px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Bank-Wide Customers</div>
              <i className="bi bi-people" style={{ color: '#64748b' }}></i>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a' }}>{totalCount}</div>
            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '4px' }}>Across all 80 branches</div>
          </div>

          <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '18px', border: '1px solid #bbf7d0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 600, textTransform: 'uppercase' }}>YES — SMS Allowed</div>
              <i className="bi bi-check-circle" style={{ color: '#15803d' }}></i>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#15803d' }}>{yesCount}</div>
            <div style={{ fontSize: '0.74rem', color: '#166534', marginTop: '4px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <i className="bi bi-check2"></i> Eligible for SMS broadcasts
            </div>
          </div>

          <div style={{ background: '#fef2f2', borderRadius: '8px', padding: '18px', border: '1px solid #fecaca', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ fontSize: '0.78rem', color: '#991b1b', fontWeight: 600, textTransform: 'uppercase' }}>NO — SMS Blocked</div>
              <i className="bi bi-slash-circle" style={{ color: '#b91c1c' }}></i>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#b91c1c' }}>{noCount}</div>
            <div style={{ fontSize: '0.74rem', color: '#991b1b', marginTop: '4px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <i className="bi bi-shield-x"></i> Statutory / OTP alerts only
            </div>
          </div>

          <div style={{ background: '#fffbeb', borderRadius: '8px', padding: '18px', border: '1px solid #fde68a', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ fontSize: '0.78rem', color: '#92400e', fontWeight: 600, textTransform: 'uppercase' }}>Pending Intake</div>
              <i className="bi bi-clock-history" style={{ color: '#d97706' }}></i>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#d97706' }}>{pendingCount}</div>
            <div style={{ fontSize: '0.74rem', color: '#92400e', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <i className="bi bi-hourglass-split"></i> Awaiting verification
            </div>
          </div>

          <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600, textTransform: 'uppercase' }}>Revoked</div>
              <i className="bi bi-x-circle" style={{ color: '#475569' }}></i>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#475569' }}>{revokedCount}</div>
            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '4px' }}>Opt-outs recorded</div>
          </div>
        </div>

        {/* ===== EXPORT CARD ===== */}
        <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <i className="bi bi-file-earmark-spreadsheet" style={{ fontSize: '1.4rem', color: '#0284c7' }}></i>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem' }}>DLT Compliance Consent Registry Export (CSV)</h3>
          </div>
          <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '0 0 20px 0' }}>
            Download verified mobile numbers and consent status datasets for TRAI / DLT regulatory telecommunication scrubbing and campaign routing.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px', marginBottom: '18px' }}>
            {/* Branch Search & Selector */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="bi bi-building" style={{ color: '#0284c7' }}></i>
                  <span>Select Bank Branch:</span>
                </label>
                {exportBranchFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => { setExportBranchFilter('ALL'); setExportBranchSearch(''); }}
                    style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', padding: 0 }}
                  >
                    Reset to All Branches
                  </button>
                )}
              </div>

              {/* Branch search field */}
              <div style={{ position: 'relative', marginBottom: '6px' }}>
                <input
                  type="text"
                  placeholder="Search bank branch by name, code, or city..."
                  value={exportBranchSearch}
                  onChange={(e) => setExportBranchSearch(e.target.value)}
                  style={{ width: '100%', padding: '8px 30px 8px 10px', fontSize: '0.84rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
                {exportBranchSearch && (
                  <button
                    type="button"
                    onClick={() => setExportBranchSearch('')}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <select
                value={exportBranchFilter}
                onChange={(e) => setExportBranchFilter(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff' }}
              >
                <option value="ALL">All Branches (Bank-Wide — 80 Branches)</option>
                {filteredExportBranches.map((b, idx) => (
                  <option key={idx} value={b.branch_name || b.name}>
                    {b.branch_name || b.name} {b.branch_code || b.code ? `(${b.branch_code || b.code})` : ''} {b.city ? `— ${b.city}` : ''}
                  </option>
                ))}
              </select>

              {exportBranchSearch && (
                <div style={{ fontSize: '0.74rem', color: '#0284c7', marginTop: '4px' }}>
                  Showing {filteredExportBranches.length} matching branches
                </div>
              )}
            </div>

            {/* Consent Status Filter */}
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                <i className="bi bi-funnel" style={{ color: '#0284c7', marginRight: '6px' }}></i>
                <span>Select Consent Status to Export:</span>
              </label>
              <select
                value={exportConsentFilter}
                onChange={(e) => setExportConsentFilter(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff', marginTop: '34px' }}
              >
                <option value="ALL">All Consent Records (YES, NO, PENDING, REVOKED)</option>
                <option value="YES">YES — Consent Given (Eligible for SMS Dispatch)</option>
                <option value="NO">NO — Consent Declined (Blocked from Optional SMS)</option>
                <option value="PENDING">PENDING — Intake Awaiting Paper Verification</option>
                <option value="REVOKED">REVOKED — Customer Revoked Consent</option>
              </select>
            </div>
          </div>

          {/* Scope Info & Match Count */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ fontSize: '0.82rem', color: '#475569' }}>
              <span>Branch Scope: <strong style={{ color: '#0f172a' }}>{exportBranchFilter === 'ALL' ? 'Bank-Wide (All 80 Branches)' : exportBranchFilter}</strong></span>
              <span style={{ margin: '0 10px', color: '#cbd5e1' }}>|</span>
              <span>Consent: <strong style={{ color: '#0f172a' }}>{exportConsentFilter}</strong></span>
            </div>
            <div style={{ fontSize: '0.88rem', color: '#0284c7', fontWeight: 700 }}>
              {getExportFilteredRecords().length} records ready for download
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            style={{ width: '100%', background: '#0284c7', color: '#ffffff', border: 'none', padding: '12px 18px', borderRadius: '6px', fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
          >
            <i className="bi bi-download"></i>
            <span>Download CSV ({exportBranchFilter === 'ALL' ? 'Bank-Wide' : exportBranchFilter.split(',')[0]} &bull; {exportConsentFilter})</span>
          </button>
        </div>

        {/* ===== LIVE REGISTRY LOOKUP TABLE ===== */}
        <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.05rem' }}>Live DLT SMS Registry Search</h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>Search and verify customer mobile consent status in real-time before dispatching</p>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search by Mobile, Name, Account, CIF..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                style={{ width: '260px', padding: '8px 12px', fontSize: '0.84rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />

              <select
                value={tableStatusFilter}
                onChange={(e) => setTableStatusFilter(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '0.84rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff' }}
              >
                <option value="ALL">All Statuses</option>
                <option value="YES">YES (SMS Allowed)</option>
                <option value="NO">NO (SMS Blocked)</option>
                <option value="PENDING">Pending</option>
                <option value="REVOKED">Revoked</option>
              </select>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                  <th style={{ padding: '12px 16px' }}>Tracking Ref ID</th>
                  <th style={{ padding: '12px 16px' }}>Customer Name</th>
                  <th style={{ padding: '12px 16px' }}>Mobile (DLT Dispatch)</th>
                  <th style={{ padding: '12px 16px' }}>Account No</th>
                  <th style={{ padding: '12px 16px' }}>Branch</th>
                  <th style={{ padding: '12px 16px' }}>Consent Status</th>
                  <th style={{ padding: '12px 16px' }}>CBS Core Banking</th>
                  <th style={{ padding: '12px 16px' }}>DLT Dispatch Rule</th>
                  <th style={{ padding: '12px 16px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredTableRecords.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      No consent records match your current search filter.
                    </td>
                  </tr>
                ) : (
                  filteredTableRecords.slice(0, 100).map((r, idx) => {
                    const st = (r.status || r.consent || '').toUpperCase();
                    const isYes = st === 'YES';
                    const isCbsSynced = (r.cbsUpdated || '').toLowerCase() === 'yes';
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 16px', fontFamily: 'monospace', color: '#0284c7', fontWeight: 600 }}>
                          {r.refNo || r.referenceNumber || `NAMCO-${r.id}`}
                        </td>
                        <td style={{ padding: '10px 16px', fontWeight: 600, color: '#0f172a' }}>
                          {r.customerName || r.name}
                        </td>
                        <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                          {r.mobile || r.mobileNumber}
                        </td>
                        <td style={{ padding: '10px 16px', fontFamily: 'monospace', color: '#64748b' }}>
                          {r.accNo || r.accountNumber ? `XXXXXX${String(r.accNo || r.accountNumber).slice(-4)}` : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', color: '#334155' }}>
                          {r.branch || r.branchName || 'CBS Head Office'}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: isYes ? '#dcfce7' : (st === 'NO' ? '#fee2e2' : '#fef3c7'),
                            color: isYes ? '#15803d' : (st === 'NO' ? '#b91c1c' : '#b45309')
                          }}>
                            {st}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            background: isCbsSynced ? '#f0fdf4' : '#fffbeb',
                            color: isCbsSynced ? '#166534' : '#b45309',
                            border: `1px solid ${isCbsSynced ? '#bbf7d0' : '#fde68a'}`
                          }}>
                            {isCbsSynced ? 'Synced (CBS)' : 'Pending Sync'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {isYes ? (
                            <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <i className="bi bi-check-circle-fill"></i> DISPATCH PERMITTED
                            </span>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <i className="bi bi-slash-circle-fill"></i> BLOCKED (Statutory Only)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px', color: '#64748b', fontSize: '0.78rem' }}>
                          {r.date || r.createdAt || 'Today'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {filteredTableRecords.length > 100 && (
            <div style={{ padding: '10px 16px', fontSize: '0.78rem', color: '#64748b', background: '#f8fafc', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
              Showing first 100 of {filteredTableRecords.length} records. Use search or export CSV for full dataset.
            </div>
          )}
        </div>
      </main>

      {/* ===== FOOTER ===== */}
      <footer style={{ textAlign: 'center', padding: '16px', fontSize: '0.78rem', color: '#64748b', borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
        The Nasik Merchants Co-operative Bank Ltd. (Namco Bank) &bull; Telecom DLT SMS Gateway Dispatch Portal &bull; Strictly Confidential Regulatory Data
      </footer>
    </div>
  );
}
