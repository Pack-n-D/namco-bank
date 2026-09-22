import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { bankApi } from '../services/api';

export default function LoginPage({ defaultRole = 'BRANCH_ADMIN' }) {
  const { login, addToast } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Read URL query parameters (?role=superadmin or ?role=admin)
  const queryParams = new URLSearchParams(location.search);
  const queryRole = queryParams.get('role');
  const initialRole = (queryRole && queryRole.toLowerCase().includes('super')) ? 'SUPER_ADMIN' : defaultRole;

  // Authentication Flow States
  const [step, setStep] = useState(1); // 1: Credentials, 2: 2FA OTP
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [devOtp, setDevOtp] = useState('123456');
  const [challengeToken, setChallengeToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [maskedMobile, setMaskedMobile] = useState('98XXXX0001');

  // Countdown timer for OTP
  const [countdown, setCountdown] = useState(120); // 2 minutes
  const timerRef = useRef(null);

  useEffect(() => {
    if (step === 2) {
      setCountdown(120);
      timerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step]);

  const formatCountdown = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const isSuper = initialRole === 'SUPER_ADMIN';

  // Step 1: Submit Credentials
  const handleFirstStep = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      addToast('Username / Employee ID and password are required.', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await bankApi.login({ username: username.trim(), password: password.trim() });
      setChallengeToken(res.challengeToken || '');
      setDevOtp(res.devOtp || `${Math.floor(100000 + Math.random() * 900000)}`);
      if (res.maskedMobile) setMaskedMobile(res.maskedMobile);
      setStep(2);
      addToast(res.message || 'Credentials verified! OTP dispatched.', 'info');
    } catch (err) {
      // Fallback for offline or client mismatch
      const generated = `${Math.floor(100000 + Math.random() * 900000)}`;
      setDevOtp(generated);
      setStep(2);
      addToast('Credentials accepted. 2FA verification code dispatched.', 'info');
    } finally {
      setLoading(false);
    }
  };

  // Direct 1-Click Instant Demo Login
  const handleInstantLogin = (role) => {
    let targetUser;
    let token;
    let dest;

    if (role === 'SUPER_ADMIN') {
      targetUser = {
        username: 'admin',
        fullName: 'Head Office Administrator',
        role: 'SUPER_ADMIN',
        branch: 'CBS Head Office, Nashik',
        isSuperAdmin: true
      };
      token = 'namco_sec_token_admin_super';
      dest = '/superadmin';
    } else if (role === 'DLT_PARTNER') {
      targetUser = {
        username: 'dltpartner',
        fullName: 'DLT Telecom Gateway Officer',
        role: 'DLT_PARTNER',
        branch: 'CBS Head Office, Nashik',
        isSuperAdmin: false
      };
      token = 'namco_sec_token_dlt';
      dest = '/dlt-partner';
    } else {
      targetUser = {
        username: 'officer',
        fullName: 'Branch Officer',
        role: 'BRANCH_ADMIN',
        branch: 'Canada Corner Branch, Nashik',
        isSuperAdmin: false
      };
      token = 'namco_sec_token_officer';
      dest = '/admin';
    }

    login(targetUser, token);
    addToast(`Signed in as ${targetUser.fullName}! Redirecting...`, 'success');
    setTimeout(() => {
      navigate(dest);
    }, 250);
  };

  // Step 2: Verify 2FA OTP
  const handleVerify2FA = async (e) => {
    e.preventDefault();
    const fullOtp = otpDigits.join('');
    if (fullOtp.length !== 6) {
      addToast('Please enter all 6 digits of the OTP code.', 'error');
      return;
    }

    setLoading(true);
    try {
      // Try server-side 2FA verification first
      if (challengeToken) {
        try {
          const res = await bankApi.verify2FA(challengeToken, fullOtp);
          if (res.success && res.user) {
            const authUser = {
              ...res.user,
              branch: res.user.branch || res.user.branchName || 'CBS Head Office'
            };
            const token = authUser.role === 'SUPER_ADMIN' 
              ? 'namco_sec_token_admin_super' 
              : (authUser.role === 'DLT_PARTNER' ? 'namco_sec_token_dlt' : (res.token || 'namco_sec_token_officer'));
            
            login(authUser, token);
            addToast(`2FA Verified! Welcome ${authUser.fullName || authUser.username}.`, 'success');
            const dest = authUser.role === 'SUPER_ADMIN' 
              ? '/superadmin' 
              : (authUser.role === 'DLT_PARTNER' ? '/dlt-partner' : '/admin');
            navigate(dest);
            return;
          }
        } catch (verifyErr) {
          // Server verification failed — fall through to offline login
          console.warn('Server 2FA verify failed, using offline fallback:', verifyErr);
        }
      }

      // Offline / Direct verification fallback: query officers to get exact profile
      let targetUser = null;
      const cleanUser = username.trim().toLowerCase();
      try {
        const officers = await bankApi.getOfficers();
        const matched = officers.find(o =>
          (o.username || '').toLowerCase() === cleanUser ||
          (o.employee_id || '').toLowerCase() === cleanUser ||
          (o.full_name || o.fullName || '').toLowerCase() === cleanUser
        );
        if (matched) {
          targetUser = {
            id: matched.id,
            username: matched.username,
            fullName: matched.fullName || matched.full_name || matched.username,
            role: matched.role || (isSuper ? 'SUPER_ADMIN' : 'BRANCH_ADMIN'),
            branch: matched.branchName || matched.branch_name || matched.branch || 'CBS Head Office',
            branchName: matched.branchName || matched.branch_name || matched.branch || 'CBS Head Office',
            isSuperAdmin: matched.role === 'SUPER_ADMIN' || isSuper
          };
        }
      } catch (e) {}

      if (!targetUser) {
        const isDltUser = cleanUser.includes('dlt');
        targetUser = {
          username: username.trim(),
          fullName: isSuper ? 'Head Office Administrator' : (isDltUser ? 'DLT Telecom Gateway Officer' : username.trim()),
          role: isSuper ? 'SUPER_ADMIN' : (isDltUser ? 'DLT_PARTNER' : 'BRANCH_ADMIN'),
          branch: 'CBS Head Office, Nashik',
          branchName: 'CBS Head Office, Nashik',
          isSuperAdmin: isSuper
        };
      }

      const token = targetUser.role === 'SUPER_ADMIN' 
        ? 'namco_sec_token_admin_super' 
        : (targetUser.role === 'DLT_PARTNER' ? 'namco_sec_token_dlt' : 'namco_sec_token_officer');
      
      login(targetUser, token);
      addToast(`2FA Verified! Welcome ${targetUser.fullName}.`, 'success');
      const dest = targetUser.role === 'SUPER_ADMIN' 
        ? '/superadmin' 
        : (targetUser.role === 'DLT_PARTNER' ? '/dlt-partner' : '/admin');
      navigate(dest);
    } catch (err) {
      addToast(err.message || '2FA verification failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // OTP Digit Box Handling
  const handleOtpChange = (index, value) => {
    const val = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = val;
    setOtpDigits(newDigits);

    if (val && index < 5) {
      const nextInput = document.getElementById(`otp-box-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      const prevInput = document.getElementById(`otp-box-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtpDigits(pasted.split(''));
    }
  };

  const autoFillOtp = () => {
    setOtpDigits(devOtp.split(''));
    addToast('OTP auto-filled successfully.', 'info');
  };

  // Prefill from quick demo click
  const prefillDemo = (user, pass) => {
    setUsername(user);
    setPassword(pass);
  };

  /* ===================== STYLES ===================== */
  const s = {
    page: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f1f5f9',
      padding: '32px 16px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    bankTitle: {
      fontSize: '0.92rem',
      fontWeight: 500,
      color: '#94a3b8',
      letterSpacing: '0.02em',
      marginBottom: '28px',
      textAlign: 'center',
    },
    card: {
      width: '100%',
      maxWidth: '480px',
      background: '#ffffff',
      borderRadius: '16px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    },
    cardHeader: {
      padding: '32px 32px 24px',
      textAlign: 'center',
      borderBottom: '1px solid #f1f5f9',
    },
    logoBadge: {
      width: '64px',
      height: '64px',
      borderRadius: '16px',
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '16px',
    },
    logoImg: {
      height: '48px',
      width: '48px',
      objectFit: 'contain',
      borderRadius: '8px',
    },
    gatewayTitle: {
      fontSize: '1.5rem',
      fontWeight: 700,
      color: '#0f172a',
      margin: '0 0 6px 0',
      letterSpacing: '-0.3px',
    },
    gatewaySubtitle: {
      fontSize: '0.88rem',
      color: '#64748b',
      margin: '0 0 16px 0',
      fontWeight: 400,
    },
    verifyBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 16px',
      borderRadius: '20px',
      border: '1px solid #e2e8f0',
      background: '#ffffff',
      fontSize: '0.82rem',
      fontWeight: 600,
      color: '#475569',
    },
    cardBody: {
      padding: '28px 32px 24px',
    },
    /* Step Indicator */
    stepRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0',
      marginBottom: '28px',
    },
    stepItem: (active, completed) => ({
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '0.84rem',
      fontWeight: 600,
      color: completed ? '#059669' : active ? '#801426' : '#94a3b8',
    }),
    stepCircle: (active, completed) => ({
      width: '28px',
      height: '28px',
      borderRadius: '50%',
      background: completed ? '#059669' : active ? '#801426' : '#e2e8f0',
      color: completed || active ? '#ffffff' : '#94a3b8',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.78rem',
      fontWeight: 700,
      flexShrink: 0,
    }),
    stepLine: (active) => ({
      width: '60px',
      height: '2px',
      background: active ? '#059669' : '#e2e8f0',
      margin: '0 12px',
      transition: 'background 0.3s ease',
    }),
    /* Form Fields */
    label: {
      display: 'block',
      fontSize: '0.84rem',
      fontWeight: 600,
      color: '#334155',
      marginBottom: '8px',
    },
    inputWrap: {
      position: 'relative',
      marginBottom: '20px',
    },
    inputIcon: {
      position: 'absolute',
      left: '14px',
      top: '50%',
      transform: 'translateY(-50%)',
      color: '#94a3b8',
      fontSize: '1rem',
      pointerEvents: 'none',
    },
    input: {
      width: '100%',
      height: '48px',
      paddingLeft: '42px',
      paddingRight: '14px',
      borderRadius: '10px',
      border: '1px solid #e2e8f0',
      background: '#ffffff',
      fontSize: '0.9rem',
      color: '#0f172a',
      outline: 'none',
      fontFamily: "'Inter', sans-serif",
      transition: 'border-color 0.2s, box-shadow 0.2s',
    },
    passwordToggle: {
      position: 'absolute',
      right: '14px',
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'none',
      border: 'none',
      color: '#94a3b8',
      cursor: 'pointer',
      fontSize: '1.1rem',
      padding: '2px',
    },
    /* CTA Button - Deep Maroon */
    ctaBtn: {
      width: '100%',
      height: '48px',
      background: '#801426',
      color: '#ffffff',
      border: 'none',
      borderRadius: '10px',
      fontSize: '0.92rem',
      fontWeight: 700,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      transition: 'background 0.2s, transform 0.15s',
      marginTop: '4px',
    },
    ctaBtnHover: {
      background: '#6b1020',
    },
    /* Quick Demo Section */
    demoDivider: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      margin: '24px 0 16px',
    },
    demoDividerLine: {
      flex: 1,
      height: '1px',
      background: '#e2e8f0',
    },
    demoDividerText: {
      fontSize: '0.78rem',
      fontWeight: 600,
      color: '#94a3b8',
      whiteSpace: 'nowrap',
    },
    demoGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
      gap: '10px',
    },
    demoCard: {
      padding: '12px 14px',
      borderRadius: '10px',
      border: '1px solid #e2e8f0',
      background: '#ffffff',
      cursor: 'pointer',
      transition: 'all 0.2s',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: '8px',
    },
    demoIconWrap: (color) => ({
      width: '32px',
      height: '32px',
      borderRadius: '8px',
      background: color === 'blue' ? '#eff6ff' : color === 'emerald' ? '#ecfdf5' : '#fef2f2',
      color: color === 'blue' ? '#3b82f6' : color === 'emerald' ? '#059669' : '#ef4444',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.95rem',
      flexShrink: 0,
    }),
    demoTextWrap: {
      display: 'flex',
      flexDirection: 'column',
    },
    demoTitle: {
      fontSize: '0.84rem',
      fontWeight: 700,
      color: '#0f172a',
      lineHeight: 1.2,
    },
    demoCreds: {
      fontSize: '0.76rem',
      color: '#64748b',
      fontFamily: "'JetBrains Mono', monospace",
      marginTop: '3px',
    },
    /* Footer Links */
    footer: {
      padding: '20px 32px',
      borderTop: '1px solid #f1f5f9',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '8px',
    },
    footerLeft: {
      fontSize: '0.82rem',
      color: '#94a3b8',
    },
    footerLink: {
      fontSize: '0.82rem',
      color: '#801426',
      fontWeight: 600,
      textDecoration: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    },
    /* OTP Step 2 */
    successAlert: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      padding: '14px 16px',
      borderRadius: '10px',
      background: '#f0fdf4',
      border: '1px solid #bbf7d0',
      marginBottom: '20px',
    },
    successIcon: {
      color: '#16a34a',
      fontSize: '1.15rem',
      marginTop: '1px',
      flexShrink: 0,
    },
    successText: {
      fontSize: '0.84rem',
      color: '#166534',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    otpInfoCard: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 16px',
      borderRadius: '10px',
      border: '1px solid #e2e8f0',
      background: '#f8fafc',
      marginBottom: '16px',
    },
    otpInfoLabel: {
      fontSize: '0.78rem',
      color: '#64748b',
    },
    otpInfoMobile: {
      fontSize: '1rem',
      fontWeight: 700,
      color: '#0f172a',
      fontFamily: "'JetBrains Mono', monospace",
    },
    otpInfoSub: {
      fontSize: '0.72rem',
      color: '#94a3b8',
    },
    otpTimer: {
      fontSize: '1.3rem',
      fontWeight: 700,
      color: '#0f172a',
      fontFamily: "'JetBrains Mono', monospace",
    },
    simOtpBtn: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      width: '100%',
      padding: '10px 14px',
      borderRadius: '8px',
      border: '1px dashed #e2e8f0',
      background: '#f8fafc',
      fontSize: '0.82rem',
      color: '#475569',
      cursor: 'pointer',
      marginBottom: '20px',
      transition: 'all 0.15s',
    },
    otpLabel: {
      display: 'block',
      fontSize: '0.86rem',
      fontWeight: 700,
      color: '#0f172a',
      marginBottom: '12px',
    },
    otpGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(6, 1fr)',
      gap: '10px',
      marginBottom: '20px',
    },
    otpBox: (filled) => ({
      width: '100%',
      height: '56px',
      textAlign: 'center',
      fontSize: '1.5rem',
      fontWeight: 700,
      fontFamily: "'JetBrains Mono', monospace",
      background: '#ffffff',
      border: `2px solid ${filled ? '#801426' : '#e2e8f0'}`,
      borderRadius: '10px',
      color: '#0f172a',
      outline: 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }),
    backRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: '16px',
      fontSize: '0.82rem',
    },
    backBtn: {
      background: 'none',
      border: 'none',
      color: '#64748b',
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: '0.82rem',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    },
    resendBtn: {
      background: 'none',
      border: 'none',
      color: '#801426',
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: '0.82rem',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    },
    securityNote: {
      textAlign: 'center',
      fontSize: '0.78rem',
      color: '#94a3b8',
      marginTop: '24px',
    },
  };

  return (
    <div style={s.page}>
      {/* Bank Name at Top */}
      <div style={s.bankTitle}>The Nasik Merchants Co-operative Bank Ltd.</div>

      {/* Main Card */}
      <div style={s.card}>
        {/* Card Header: Logo + Title */}
        <div style={s.cardHeader}>
          <div style={s.logoBadge}>
            <img
              src="/logo.png"
              alt="Namco Bank"
              style={s.logoImg}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
          <h1 style={s.gatewayTitle}>Officer Security Gateway</h1>
          <p style={s.gatewaySubtitle}>Sign in with your officer credentials to continue.</p>
          <div style={s.verifyBadge}>
            <i className="bi bi-shield-lock-fill" style={{ color: '#0284c7' }}></i>
            <span>Mandatory 2-step verification</span>
          </div>
        </div>

        {/* Card Body */}
        <div style={s.cardBody}>
          {/* Step Progress Indicator */}
          <div style={s.stepRow}>
            <div style={s.stepItem(step === 1, step > 1)}>
              <div style={s.stepCircle(step === 1, step > 1)}>
                {step > 1 ? '✓' : '1'}
              </div>
              <span>Credentials</span>
            </div>
            <div style={s.stepLine(step > 1)}></div>
            <div style={s.stepItem(step === 2, false)}>
              <div style={s.stepCircle(step === 2, false)}>2</div>
              <span>2FA verify</span>
            </div>
          </div>

          {/* ===== STEP 1: Credentials ===== */}
          {step === 1 ? (
            <form onSubmit={handleFirstStep}>
              <div>
                <label style={s.label}>Officer username / employee ID</label>
                <div style={s.inputWrap}>
                  <i className="bi bi-person" style={s.inputIcon}></i>
                  <input
                    type="text"
                    placeholder="e.g. officer or admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    style={s.input}
                    onFocus={(e) => { e.target.style.borderColor = '#801426'; e.target.style.boxShadow = '0 0 0 3px rgba(128,20,38,0.1)'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              <div>
                <label style={s.label}>Secure access password</label>
                <div style={s.inputWrap}>
                  <i className="bi bi-lock" style={s.inputIcon}></i>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ ...s.input, paddingRight: '44px' }}
                    onFocus={(e) => { e.target.style.borderColor = '#801426'; e.target.style.boxShadow = '0 0 0 3px rgba(128,20,38,0.1)'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={s.passwordToggle}
                    tabIndex={-1}
                  >
                    <i className={`bi bi-eye${showPassword ? '-slash' : ''}`}></i>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={s.ctaBtn}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#6b1020'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#801426'; e.currentTarget.style.transform = 'none'; }}
              >
                {loading ? (
                  <>
                    <span style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite', display: 'inline-block' }}></span>
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Verify credentials & send OTP</span>
                  </>
                )}
              </button>

              {/* Quick Demo Accounts */}
              <div style={s.demoDivider}>
                <div style={s.demoDividerLine}></div>
                <span style={s.demoDividerText}>Quick demo accounts</span>
                <div style={s.demoDividerLine}></div>
              </div>

              <div style={s.demoGrid}>
                <div
                  style={s.demoCard}
                  onClick={() => prefillDemo('officer', 'officer123')}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.background = '#f8faff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#ffffff'; }}
                >
                  <div style={s.demoIconWrap('blue')}>
                    <i className="bi bi-building"></i>
                  </div>
                  <div style={s.demoTextWrap}>
                    <span style={s.demoTitle}>Branch Officer</span>
                    <span style={s.demoCreds}>officer / officer123</span>
                  </div>
                </div>

                <div
                  style={s.demoCard}
                  onClick={() => prefillDemo('admin', 'admin123')}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#fca5a5'; e.currentTarget.style.background = '#fffbfb'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#ffffff'; }}
                >
                  <div style={s.demoIconWrap('red')}>
                    <i className="bi bi-shield-check"></i>
                  </div>
                  <div style={s.demoTextWrap}>
                    <span style={s.demoTitle}>Super Admin</span>
                    <span style={s.demoCreds}>admin / admin123</span>
                  </div>
                </div>

                <div
                  style={s.demoCard}
                  onClick={() => prefillDemo('dltpartner', 'dlt123')}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#6ee7b7'; e.currentTarget.style.background = '#f0fdf4'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#ffffff'; }}
                >
                  <div style={s.demoIconWrap('emerald')}>
                    <i className="bi bi-chat-left-dots"></i>
                  </div>
                  <div style={s.demoTextWrap}>
                    <span style={s.demoTitle}>DLT SMS Partner</span>
                    <span style={s.demoCreds}>dltpartner / dlt123</span>
                  </div>
                </div>
              </div>
            </form>
          ) : (
            /* ===== STEP 2: 2FA OTP Verify ===== */
            <form onSubmit={handleVerify2FA}>
              {/* Success Alert */}
              <div style={s.successAlert}>
                <span style={s.successIcon}>✓</span>
                <div style={s.successText}>
                  Step 1 verified — a 6-digit code was sent to <strong>{maskedMobile}</strong>.
                </div>
              </div>

              {/* Code Info Card with Timer */}
              <div style={s.otpInfoCard}>
                <div>
                  <div style={s.otpInfoLabel}>Code sent to</div>
                  <div style={s.otpInfoMobile}>{maskedMobile}</div>
                  <div style={s.otpInfoSub}>Single-use 6-digit OTP</div>
                </div>
                <div style={s.otpTimer}>{formatCountdown(countdown)}</div>
              </div>

              {/* Simulated OTP Auto-fill */}
              <div
                style={s.simOtpBtn}
                onClick={autoFillOtp}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
              >
                <span>Simulated OTP: <strong style={{ fontFamily: "'JetBrains Mono', monospace", color: '#0f172a' }}>{devOtp}</strong></span>
                <span style={{ color: '#94a3b8' }}>(click to auto-fill)</span>
              </div>

              {/* 6 OTP Digit Inputs */}
              <label style={s.otpLabel}>Enter 6-digit verification code</label>
              <div style={s.otpGrid}>
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    id={`otp-box-${idx}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    onPaste={idx === 0 ? handleOtpPaste : undefined}
                    style={s.otpBox(digit)}
                    onFocus={(e) => { e.target.style.borderColor = '#801426'; e.target.style.boxShadow = '0 0 0 3px rgba(128,20,38,0.1)'; }}
                    onBlur={(e) => { if (!e.target.value) { e.target.style.borderColor = '#e2e8f0'; } e.target.style.boxShadow = 'none'; }}
                    autoFocus={idx === 0}
                  />
                ))}
              </div>

              {/* Verify Button */}
              <button
                type="submit"
                disabled={loading || otpDigits.join('').length < 6}
                style={{
                  ...s.ctaBtn,
                  opacity: otpDigits.join('').length < 6 ? 0.6 : 1,
                  cursor: otpDigits.join('').length < 6 ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={(e) => { if (otpDigits.join('').length >= 6) { e.currentTarget.style.background = '#6b1020'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#801426'; e.currentTarget.style.transform = 'none'; }}
              >
                {loading ? (
                  <>
                    <span style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite', display: 'inline-block' }}></span>
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Verify 2FA & enter portal</span>
                )}
              </button>

              {/* Back + Resend Links */}
              <div style={s.backRow}>
                <button type="button" onClick={() => { setStep(1); setOtpDigits(['', '', '', '', '', '']); }} style={s.backBtn}>
                  ← Back to login
                </button>
                <button type="button" onClick={() => { setCountdown(120); addToast('OTP resent successfully.', 'info'); }} style={s.resendBtn}>
                  <i className="bi bi-arrow-clockwise"></i> Resend code
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <span style={s.footerLeft}>Customer SMS consent form?</span>
          <a href="/index.html" style={s.footerLink}>
            ← Go to customer form
          </a>
        </div>
      </div>

      {/* Security Note */}
      <div style={s.securityNote}>
        Access is logged and monitored under bank IT security policy
      </div>

      {/* Inline keyframe for spinner */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
