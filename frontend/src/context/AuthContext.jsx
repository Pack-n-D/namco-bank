import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  // Default session with fallback to Super Admin for seamless development
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('namco_auth_user');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return {
      username: 'admin',
      fullName: 'Central Systems Administrator',
      role: 'SUPER_ADMIN',
      branch: 'CBS Head Office, Nashik',
      isSuperAdmin: true
    };
  });

  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const login = (userData, token) => {
    setUser(userData);
    localStorage.setItem('namco_auth_user', JSON.stringify(userData));
    localStorage.setItem('namco_auth_token', token);
    addToast(`Welcome back, ${userData.fullName || userData.username}!`, 'success');
  };

  const logout = () => {
    localStorage.removeItem('namco_auth_user');
    localStorage.removeItem('namco_auth_token');
    setUser(null);
    addToast('You have been securely logged out.', 'info');
  };

  const switchRole = (role) => {
    if (role === 'SUPER_ADMIN') {
      const superUser = {
        username: 'admin',
        fullName: 'Central Systems Administrator',
        role: 'SUPER_ADMIN',
        branch: 'CBS Head Office, Nashik',
        isSuperAdmin: true
      };
      setUser(superUser);
      localStorage.setItem('namco_auth_user', JSON.stringify(superUser));
      localStorage.setItem('namco_auth_token', 'namco_sec_token_admin_super');
      addToast('Switched context to Super Administrator (Bank-Wide).', 'info');
    } else {
      const officerUser = {
        username: 'officer',
        fullName: 'Branch Verification Officer',
        role: 'BRANCH_ADMIN',
        branch: 'Canada Corner Branch, Nashik',
        isSuperAdmin: false
      };
      setUser(officerUser);
      localStorage.setItem('namco_auth_user', JSON.stringify(officerUser));
      localStorage.setItem('namco_auth_token', 'namco_sec_token_officer');
      addToast('Switched context to Branch Admin (Canada Corner Branch).', 'info');
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, switchRole, addToast }}>
      {children}

      {/* Global Toast Stack */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast-item ${t.type}`} onClick={() => removeToast(t.id)}>
            <i className={`bi ${t.type === 'success' ? 'bi-check-circle-fill text-success' : t.type === 'error' ? 'bi-x-circle-fill text-danger' : 'bi-info-circle-fill text-primary'}`}></i>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              type="button"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              onClick={(e) => { e.stopPropagation(); removeToast(t.id); }}
            >
              <i className="bi bi-x"></i>
            </button>
          </div>
        ))}
      </div>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
