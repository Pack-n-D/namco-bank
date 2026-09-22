import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import CustomerPortal from './pages/CustomerPortal';
import BranchAdminPortal from './pages/BranchAdminPortal';
import SuperAdminPortal from './pages/SuperAdminPortal';
import DltPartnerPortal from './pages/DltPartnerPortal';
import LoginPage from './pages/LoginPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Customer Self-Service Portal & 4-Step Flow */}
          <Route path="/" element={<CustomerPortal />} />
          <Route path="/index.html" element={<CustomerPortal />} />
          <Route path="/customer" element={<CustomerPortal />} />
          <Route path="/customer/*" element={<CustomerPortal />} />
          <Route path="/index.html/*" element={<CustomerPortal />} />

          {/* Branch Admin Portal */}
          <Route path="/admin" element={<BranchAdminPortal />} />
          <Route path="/admin.html" element={<BranchAdminPortal />} />

          {/* Super Admin Governance Portal */}
          <Route path="/superadmin" element={<SuperAdminPortal />} />
          <Route path="/super_admin.html" element={<SuperAdminPortal />} />
          <Route path="/super-admin.html" element={<SuperAdminPortal />} />

          {/* DLT SMS Gateway Regulatory Partner Portal */}
          <Route path="/dlt" element={<DltPartnerPortal />} />
          <Route path="/dlt-partner" element={<DltPartnerPortal />} />
          <Route path="/dlt_partner.html" element={<DltPartnerPortal />} />

          {/* 2FA Login Portal */}
          <Route path="/login" element={<LoginPage defaultRole="BRANCH_ADMIN" />} />
          <Route path="/login.html" element={<LoginPage defaultRole="BRANCH_ADMIN" />} />
          <Route path="/admin/login" element={<LoginPage defaultRole="BRANCH_ADMIN" />} />
          <Route path="/superadmin/login" element={<LoginPage defaultRole="SUPER_ADMIN" />} />
          <Route path="/super-admin/login" element={<LoginPage defaultRole="SUPER_ADMIN" />} />
          <Route path="/super_admin_login.html" element={<LoginPage defaultRole="SUPER_ADMIN" />} />
          <Route path="/dlt/login" element={<LoginPage defaultRole="DLT_PARTNER" />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
