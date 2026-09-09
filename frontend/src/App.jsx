import React, { useState, useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('admin');
  const [user, setUser] = useState({ username: 'officer', fullName: 'Branch Verification Officer', role: 'BRANCH_ADMIN', branch: 'Canada Corner Branch, Nashik' });
  const [records, setRecords] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [ocrData, setOcrData] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    setRecords([
      { id: '1', refNo: 'NAMCO-SMS-2026-839201', name: 'Pramod Kashinath Shinde', accNo: '50100234891023', cif: 'CIF8392018', branch: 'Canada Corner Branch, Nashik', mobile: '9822019483', consent: 'agree', cbsUpdated: 'Yes', date: '2026-08-30' },
      { id: '2', refNo: 'NAMCO-SMS-2026-749202', name: 'Sunita Rajendra Deshmukh', accNo: '50100492810394', cif: 'CIF7492021', branch: 'Canada Corner Branch, Nashik', mobile: '9423019284', consent: 'agree', cbsUpdated: 'No', date: '2026-08-31' },
      { id: '3', refNo: 'NAMCO-SMS-2026-619283', name: 'Ganesh Vitthal Jadhav', accNo: '50100918273612', cif: 'CIF6192830', branch: 'Nashik Road Branch', mobile: '9765019284', consent: 'disagree', cbsUpdated: 'No', date: '2026-08-31' },
    ]);

    setOfficers([
      { id: 1, username: 'admin', full_name: 'Central Systems Administrator', email: 'admin@namcobank.in', branch_name: 'CBS Head Office, Nashik', role: 'SUPER_ADMIN', is_active: true, created_at: '2026-08-31' },
      { id: 2, username: 'officer_cc', full_name: 'Rahul V. Patil', email: 'rahul.patil@namcobank.in', branch_name: 'Canada Corner Branch, Nashik', role: 'BRANCH_ADMIN', is_active: true, created_at: '2026-08-31' },
      { id: 3, username: 'officer_nsk', full_name: 'Pooja M. Joshi', email: 'pooja.joshi@namcobank.in', branch_name: 'Nashik Road Branch', role: 'BRANCH_ADMIN', is_active: true, created_at: '2026-08-31' },
    ]);

    setLogs([
      { id: 1, timestamp: new Date().toLocaleTimeString(), actionType: 'ADMIN_LOGIN', username: 'admin', officerRole: 'SUPER_ADMIN', branchName: 'CBS Head Office', actionDetails: 'Super Admin logged into central governance', ipAddress: '192.168.1.10' },
      { id: 2, timestamp: new Date().toLocaleTimeString(), actionType: 'CBS_STATUS_UPDATED', username: 'officer_cc', officerRole: 'BRANCH_ADMIN', branchName: 'Canada Corner Branch', actionDetails: 'CBS status synced to Yes for Account 50100234891023', ipAddress: '192.168.1.45' }
    ]);
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    setTimeout(() => {
      setOcrData({
        customerName: 'Ramesh Suresh Patil',
        accountNumber: '50100439281044',
        customerCif: 'CIF9028471',
        mobileNumber: '9823019284',
        branchName: user.branch,
        consentChoice: 'agree',
        date: new Date().toISOString().split('T')[0]
      });
      setIsUploading(false);
    }, 700);
  };

  const handleSaveOcr = (e) => {
    e.preventDefault();
    const newRef = `NAMCO-SMS-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const newRec = {
      id: String(Date.now()),
      refNo: newRef,
      name: ocrData.customerName,
      accNo: ocrData.accountNumber,
      cif: ocrData.customerCif,
      branch: ocrData.branchName,
      mobile: ocrData.mobileNumber,
      consent: ocrData.consentChoice,
      cbsUpdated: 'No',
      date: ocrData.date
    };
    setRecords([newRec, ...records]);
    setOcrData(null);
    alert(`Physical form successfully registered! Reference: ${newRef}`);
  };

  const toggleCBS = (refNo) => {
    setRecords(records.map(r => {
      if (r.refNo === refNo) {
        return { ...r, cbsUpdated: r.cbsUpdated === 'Yes' ? 'No' : 'Yes' };
      }
      return r;
    }));
  };

  // Branch Isolation
  const visibleRecords = user.role === 'SUPER_ADMIN' 
    ? records 
    : records.filter(r => r.branch.toLowerCase().includes(user.branch.toLowerCase().split(' ')[0]));

  return (
    <div className="bg-light min-vh-100">
      {/* Top Header */}
      <div className="bg-dark text-white py-1 px-3 small d-flex justify-content-between">
        <span>The Nasik Merchants Co-operative Bank Ltd. (Namco Bank)</span>
        <span>Electronic Banking Consent System</span>
      </div>

      <nav className="navbar navbar-expand-lg navbar-dark bg-primary px-3 shadow-sm">
        <div className="container-fluid">
          <span className="navbar-brand fw-bold">Namco Bank SMS Management</span>
          <div className="d-flex gap-2">
            <button 
              className={`btn btn-sm ${activeTab === 'admin' ? 'btn-light text-primary fw-bold' : 'btn-outline-light'}`}
              onClick={() => setActiveTab('admin')}>
              Branch Portal
            </button>
            <button 
              className={`btn btn-sm ${activeTab === 'super' ? 'btn-danger fw-bold' : 'btn-outline-light'}`}
              onClick={() => setActiveTab('super')}>
              Super Admin
            </button>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <div className="container-fluid py-4 px-4">
        {/* Metric Cards */}
        <div className="row g-3 mb-4">
          <div className="col-md-3">
            <div className="card shadow-sm border-0 border-start border-4 border-primary p-3">
              <div className="text-muted small text-uppercase">Branch Submissions</div>
              <div className="h4 fw-bold mb-0 text-primary">{visibleRecords.length}</div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card shadow-sm border-0 border-start border-4 border-success p-3">
              <div className="text-muted small text-uppercase">Synced in CBS</div>
              <div className="h4 fw-bold mb-0 text-success">{visibleRecords.filter(r => r.cbsUpdated === 'Yes').length}</div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card shadow-sm border-0 border-start border-4 border-warning p-3">
              <div className="text-muted small text-uppercase">Pending Sync</div>
              <div className="h4 fw-bold mb-0 text-warning">{visibleRecords.filter(r => r.cbsUpdated === 'No').length}</div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card shadow-sm border-0 border-start border-4 border-info p-3">
              <div className="text-muted small text-uppercase">Active Branches</div>
              <div className="h4 fw-bold mb-0 text-info">80 Branches</div>
            </div>
          </div>
        </div>

        {/* View 1: Branch Officer */}
        {activeTab === 'admin' && (
          <div>
            {/* Scanned Form Ingestion */}
            <div className="card shadow-sm border-0 mb-4 p-4 text-center bg-white border border-dashed">
              <h6 className="fw-bold text-primary mb-1">Physical Form Scanned Ingestion (OCR Auto-Fill)</h6>
              <p className="text-muted small mb-3">Upload physical forms signed by customers offline to extract data automatically.</p>
              <div>
                <input type="file" id="reactOcrInput" onChange={handleFileUpload} accept="image/*,.pdf" style={{ display: 'none' }} />
                <label htmlFor="reactOcrInput" className="btn btn-outline-primary btn-sm px-4">
                  {isUploading ? 'Processing File...' : 'Browse Scanned Form (PDF / Photo)'}
                </label>
              </div>

              {ocrData && (
                <form onSubmit={handleSaveOcr} className="card border p-3 mt-3 bg-light text-start">
                  <div className="d-flex justify-content-between mb-2">
                    <strong className="text-primary small">Auto-Extracted Information</strong>
                    <span className="badge bg-success">95% Confidence</span>
                  </div>
                  <div className="row g-2 small">
                    <div className="col-md-4">
                      <label className="form-label">Customer Name</label>
                      <input className="form-control form-control-sm" value={ocrData.customerName} onChange={e => setOcrData({ ...ocrData, customerName: e.target.value })} required />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Account Number</label>
                      <input className="form-control form-control-sm" value={ocrData.accountNumber} onChange={e => setOcrData({ ...ocrData, accountNumber: e.target.value })} required />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">CIF</label>
                      <input className="form-control form-control-sm" value={ocrData.customerCif} onChange={e => setOcrData({ ...ocrData, customerCif: e.target.value })} required />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Mobile</label>
                      <input className="form-control form-control-sm" value={ocrData.mobileNumber} onChange={e => setOcrData({ ...ocrData, mobileNumber: e.target.value })} required />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Branch</label>
                      <input className="form-control form-control-sm" value={ocrData.branchName} readOnly />
                    </div>
                  </div>
                  <div className="d-flex justify-content-end gap-2 mt-3">
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setOcrData(null)}>Discard</button>
                    <button type="submit" className="btn btn-sm btn-success">Save to Core Database</button>
                  </div>
                </form>
              )}
            </div>

            {/* Records Table */}
            <div className="card shadow-sm border-0">
              <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
                <h6 className="mb-0 fw-bold text-dark">Branch Consent Records (Scoped to {user.branch})</h6>
                <input 
                  type="text" 
                  className="form-control form-control-sm w-25" 
                  placeholder="Filter records..." 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                />
              </div>
              <div className="table-responsive">
                <table className="table table-hover table-striped align-middle mb-0 small">
                  <thead className="table-light">
                    <tr>
                      <th>Ref No</th>
                      <th>Customer Name</th>
                      <th>Account No</th>
                      <th>CIF</th>
                      <th>Mobile</th>
                      <th>Consent</th>
                      <th>CBS Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRecords.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || r.accNo.includes(search)).map(r => (
                      <tr key={r.id}>
                        <td className="fw-semibold text-primary">{r.refNo}</td>
                        <td>{r.name}</td>
                        <td>{r.accNo}</td>
                        <td>{r.cif}</td>
                        <td>+91 {r.mobile}</td>
                        <td><span className={`badge ${r.consent === 'agree' ? 'bg-success' : 'bg-danger'}`}>{r.consent === 'agree' ? 'Agreed' : 'Disagreed'}</span></td>
                        <td>
                          <button 
                            className={`btn btn-sm py-0 px-2 ${r.cbsUpdated === 'Yes' ? 'btn-outline-success' : 'btn-outline-warning'}`}
                            onClick={() => toggleCBS(r.refNo)}>
                            {r.cbsUpdated === 'Yes' ? 'Synced in CBS' : 'Pending CBS'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* View 2: Super Admin */}
        {activeTab === 'super' && (
          <div>
            <div className="card shadow-sm border-0 mb-4">
              <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
                <h6 className="mb-0 fw-bold text-danger">Bank Branch Administrators (80 Branches)</h6>
                <button 
                  className="btn btn-sm btn-danger"
                  onClick={() => {
                    const u = prompt('Enter officer username:');
                    const f = prompt('Enter officer full name:');
                    const b = prompt('Enter assigned branch:');
                    if (u && f && b) {
                      setOfficers([...officers, { id: Date.now(), username: u, full_name: f, email: `${u}@namcobank.in`, branch_name: b, role: 'BRANCH_ADMIN', is_active: true, created_at: '2026-08-31' }]);
                    }
                  }}>
                  + Add Branch Admin
                </button>
              </div>
              <div className="table-responsive">
                <table className="table table-hover table-striped align-middle mb-0 small">
                  <thead className="table-light">
                    <tr>
                      <th>Username</th>
                      <th>Full Name & Email</th>
                      <th>Assigned Branch</th>
                      <th>Role</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {officers.map(o => (
                      <tr key={o.id}>
                        <td className="fw-semibold text-primary">{o.username}</td>
                        <td>{o.full_name} ({o.email})</td>
                        <td><span className="badge bg-light text-dark border">{o.branch_name}</span></td>
                        <td><span className={`badge ${o.role === 'SUPER_ADMIN' ? 'bg-danger' : 'bg-primary'}`}>{o.role}</span></td>
                        <td><span className={`badge ${o.is_active ? 'bg-success' : 'bg-secondary'}`}>{o.is_active ? 'Active' : 'Inactive'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card shadow-sm border-0">
              <div className="card-header bg-white py-3">
                <h6 className="mb-0 fw-bold text-dark">Central Tamper-Evident Bank Audit Stream</h6>
              </div>
              <div className="table-responsive">
                <table className="table table-hover table-striped align-middle mb-0 small">
                  <thead className="table-light">
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Officer</th>
                      <th>Branch</th>
                      <th>Details</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(l => (
                      <tr key={l.id}>
                        <td className="text-muted">{l.timestamp}</td>
                        <td><span className="badge bg-primary-subtle text-primary border">{l.actionType}</span></td>
                        <td><strong>{l.username}</strong></td>
                        <td>{l.branchName}</td>
                        <td>{l.actionDetails}</td>
                        <td className="text-muted">{l.ipAddress}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
