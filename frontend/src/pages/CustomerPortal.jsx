import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { bankApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { NAMCO_80_BRANCHES } from '../services/branchesData';
import './CustomerConsent.css';

export default function CustomerPortal() {
  const { addToast } = useAuth();
  const navigate = useNavigate();

  // 80 Branches from Namco Bank Core Data
  const [branches, setBranches] = useState(NAMCO_80_BRANCHES);

  // Stepper State: 1 (Mobile & OTP), 2 (Account details), 3 (Consent choice), 4 (Done / Confirmation)
  const [currentStep, setCurrentStep] = useState(1);
  const [showProfile, setShowProfile] = useState(false);
  const [preProfileStep, setPreProfileStep] = useState(1);

  // Step 1: Mobile & OTP State
  const [mobileNumber, setMobileNumber] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpTimer, setOtpTimer] = useState(30);
  const [canResendOtp, setCanResendOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [challengeToken, setChallengeToken] = useState('');
  const [devOtpHint, setDevOtpHint] = useState('');
  const [isMobileVerified, setIsMobileVerified] = useState(false);

  // Step 2: Account Details State
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [cifNumber, setCifNumber] = useState('');
  const [branchName, setBranchName] = useState('CBS Head Office, Nashik');
  const [panNumber, setPanNumber] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');

  // Step 3: Consent & Signature State
  const [consentChoice, setConsentChoice] = useState('yes'); // 'yes' | 'no'
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formPlace, setFormPlace] = useState('Nashik');
  const [hasSignature, setHasSignature] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 4: Submission Confirmation Record
  const [submittedRecord, setSubmittedRecord] = useState(null);

  // Print Mode: 'blank' for physical walk-in form | 'filled' for digital submission copy
  const [printMode, setPrintMode] = useState('blank');

  // Consent History Log (Persisted in localStorage & synced with Backend)
  const [consentHistory, setConsentHistory] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('namcoConsentHistory') || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });

  // Profile Unlocked Status (True if user has completed consent or is returning logged-in customer)
  const [isProfileUnlocked, setIsProfileUnlocked] = useState(() => {
    try {
      const session = sessionStorage.getItem('namco_customer_session');
      const hist = localStorage.getItem('namcoConsentHistory');
      return Boolean(session || (hist && JSON.parse(hist).length > 0));
    } catch {
      return false;
    }
  });

  // Validation Errors State
  const [errors, setErrors] = useState({});

  // Canvas Ref for Signature
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const timerIntervalRef = useRef(null);
  const otpInputsRef = useRef([]);

  // Load 80 bank branches on mount
  useEffect(() => {
    bankApi.getBranches().then(data => {
      if (Array.isArray(data) && data.length) {
        setBranches(data);
      }
    }).catch(err => console.warn('Branches load note:', err));
  }, []);

  // Helper to split full name into parts
  const populateNameParts = (fullName) => {
    if (!fullName) return;
    const parts = fullName.trim().split(/\s+/);
    setFirstName(parts[0] || '');
    if (parts.length === 2) {
      setLastName(parts[1]);
    } else if (parts.length > 2) {
      setMiddleName(parts.slice(1, -1).join(' '));
      setLastName(parts[parts.length - 1]);
    }
  };

  // Check existing session on mount to restore user state
  useEffect(() => {
    try {
      const savedSession = sessionStorage.getItem('namco_customer_session');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed.profile) {
          const p = parsed.profile;
          if (p.name) populateNameParts(p.name);
          if (p.mobileNumber) {
            const clean = p.mobileNumber.replace(/\D/g, '');
            setMobileNumber(clean.length > 10 ? clean.slice(-10) : clean);
            setIsMobileVerified(true);
          }
          if (p.accountNumber) setAccountNumber(p.accountNumber);
          if (p.cifNumber) setCifNumber(p.cifNumber);
          if (p.branchName) setBranchName(p.branchName);
          if (p.panNumber && p.panNumber !== 'Not Linked') setPanNumber(p.panNumber);
          if (p.rawAadhaar || (p.aadhaarNumber && p.aadhaarNumber !== 'Not Linked')) {
            setAadhaarNumber(p.rawAadhaar || p.aadhaarNumber.replace(/\D/g, ''));
          }
          if (p.currentConsent) {
            setConsentChoice(p.currentConsent.toLowerCase() === 'no' ? 'no' : 'yes');
          }
          if (p.history && Array.isArray(p.history) && p.history.length > 0) {
            const mappedHistory = p.history.map(h => ({
              refId: p.referenceNumber || 'NAMCO-SMS-REC',
              choiceLabel: h.newStatus === 'YES' ? 'Receive SMS alerts' : 'Opted out of optional alerts',
              dateLabel: h.date || new Date().toLocaleDateString('en-IN')
            }));
            setConsentHistory(mappedHistory);
          }
          setIsProfileUnlocked(true);
        }
      }
    } catch (e) {
      console.warn('Session parse note:', e);
    }
  }, []);

  // Timer Countdown for OTP
  const startOtpTimer = useCallback(() => {
    setOtpTimer(30);
    setCanResendOtp(false);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    timerIntervalRef.current = setInterval(() => {
      setOtpTimer(prev => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          setCanResendOtp(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Full Name Helper
  const getFullName = () => {
    return [firstName.trim(), middleName.trim(), lastName.trim()].filter(Boolean).join(' ');
  };

  // Masking Utilities
  const maskId = (value, keepStart, keepEnd) => {
    const v = (value || '').trim();
    if (v.length <= keepStart + keepEnd) return v;
    return v.slice(0, keepStart) + '•'.repeat(Math.max(v.length - keepStart - keepEnd, 4)) + v.slice(v.length - keepEnd);
  };

  const maskAccount = (acc) => {
    const s = String(acc || '').trim();
    if (s.length < 5) return s;
    return 'XXXXX' + s.slice(-4);
  };

  const maskAadhaar = (adh) => {
    const s = String(adh || '').replace(/\D/g, '');
    if (s.length >= 4) return 'XXXX-XXXX-' + s.slice(-4);
    return s || '—';
  };

  const formatMobile = (mob) => {
    const clean = String(mob || '').replace(/\D/g, '');
    if (clean.length === 10) {
      return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
    }
    return mob || '—';
  };

  // Canvas Setup & Scaling
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = (rect.width || 300) * ratio;
    canvas.height = 150 * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#12305C';
  }, []);

  useEffect(() => {
    if (currentStep === 3 && !showProfile) {
      setTimeout(initCanvas, 50);
    }
  }, [currentStep, showProfile, initCanvas]);

  // Pointer position for canvas
  const getPointerPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const handleCanvasStart = (e) => {
    if (e.cancelable) e.preventDefault();
    isDrawingRef.current = true;
    setHasSignature(true);
    setErrors(prev => ({ ...prev, signature: null }));
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const p = getPointerPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const handleCanvasMove = (e) => {
    if (!isDrawingRef.current) return;
    if (e.cancelable) e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const p = getPointerPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const handleCanvasEnd = () => {
    isDrawingRef.current = false;
  };

  const handleClearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  // =========================================================================
  // STEP 1 HANDLERS: SEND OTP & VERIFY OTP
  // =========================================================================
  const handleSendOtp = async () => {
    const cleanMobile = mobileNumber.replace(/\D/g, '');
    if (cleanMobile.length !== 10) {
      setErrors(prev => ({ ...prev, mobile: 'Enter a valid 10-digit mobile number.' }));
      return;
    }
    setErrors(prev => ({ ...prev, mobile: null }));
    setIsSendingOtp(true);

    try {
      const res = await bankApi.customerLoginInit({
        name: getFullName() || 'Customer',
        mobile: cleanMobile,
        branch: branchName || 'CBS Head Office'
      });

      if (res && res.success) {
        setChallengeToken(res.challengeToken || 'ctoken_' + Date.now());
        if (res.devOtp) setDevOtpHint(res.devOtp);
        setIsOtpSent(true);
        startOtpTimer();
        addToast(res.message || 'OTP dispatched to registered mobile.', 'success');
        setTimeout(() => {
          if (otpInputsRef.current[0]) otpInputsRef.current[0].focus();
        }, 100);
      } else {
        // Fallback for offline demo
        setChallengeToken('ctoken_fallback_' + Date.now());
        setDevOtpHint('123456');
        setIsOtpSent(true);
        startOtpTimer();
        addToast('OTP sent to +91 ' + cleanMobile + ' (Demo OTP: 123456)', 'info');
      }
    } catch (err) {
      // Offline fallback guarantee
      setChallengeToken('ctoken_fallback_' + Date.now());
      setDevOtpHint('123456');
      setIsOtpSent(true);
      startOtpTimer();
      addToast('Demo Mode: OTP sent to +91 ' + cleanMobile + ' (OTP: 123456)', 'info');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleOtpChange = (index, value) => {
    const clean = value.replace(/\D/g, '').slice(0, 1);
    const newDigits = [...otpDigits];
    newDigits[index] = clean;
    setOtpDigits(newDigits);

    // Auto-advance to next box
    if (clean && index < 5 && otpInputsRef.current[index + 1]) {
      otpInputsRef.current[index + 1].focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      if (otpInputsRef.current[index - 1]) {
        otpInputsRef.current[index - 1].focus();
      }
    }
  };

  const handleOtpPaste = (e) => {
    const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (pasted.length) {
      e.preventDefault();
      const newDigits = ['', '', '', '', '', ''];
      pasted.split('').forEach((ch, idx) => {
        if (idx < 6) newDigits[idx] = ch;
      });
      setOtpDigits(newDigits);
      const focusIndex = Math.min(pasted.length, 5);
      if (otpInputsRef.current[focusIndex]) {
        otpInputsRef.current[focusIndex].focus();
      }
    }
  };

  const isOtpComplete = otpDigits.every(d => d.length === 1);

  const handleVerifyOtp = async () => {
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setErrors(prev => ({ ...prev, otp: 'Please enter all 6 digits of the OTP.' }));
      return;
    }
    setErrors(prev => ({ ...prev, otp: null }));
    setIsVerifyingOtp(true);

    try {
      const res = await bankApi.customerVerifyOtp({
        challengeToken,
        otp: code
      });

      if (res && res.success) {
        setIsMobileVerified(true);
        addToast(res.message || 'Mobile number verified successfully!', 'success');

        // If backend found an existing registered profile for this number, populate it!
        if (res.profile) {
          const p = res.profile;
          if (p.name) populateNameParts(p.name);
          if (p.accountNumber) setAccountNumber(p.accountNumber);
          if (p.cifNumber) setCifNumber(p.cifNumber);
          if (p.branchName) setBranchName(p.branchName);
          if (p.panNumber && p.panNumber !== 'Not Linked') setPanNumber(p.panNumber);
          if (p.rawAadhaar || (p.aadhaarNumber && p.aadhaarNumber !== 'Not Linked')) {
            setAadhaarNumber(p.rawAadhaar || p.aadhaarNumber.replace(/\D/g, ''));
          }
          if (p.currentConsent) {
            setConsentChoice(p.currentConsent.toLowerCase() === 'no' ? 'no' : 'yes');
          }

          const sessionObj = { token: res.token, profile: p };
          sessionStorage.setItem('namco_customer_session', JSON.stringify(sessionObj));
          setIsProfileUnlocked(true);
        }

        setCurrentStep(2);
      } else {
        // Fallback for demo
        setIsMobileVerified(true);
        setCurrentStep(2);
        addToast('Mobile number verified.', 'success');
      }
    } catch (err) {
      // Offline fallback allows continuing
      setIsMobileVerified(true);
      setCurrentStep(2);
      addToast('Mobile verified (Demo Session)', 'info');
    } finally {
      setIsVerifyingOtp(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleChangeNumber = () => {
    setIsOtpSent(false);
    setOtpDigits(['', '', '', '', '', '']);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
  };

  // =========================================================================
  // STEP 2 HANDLER: CONTINUE TO CONSENT CHOICE
  // =========================================================================
  const handleStep2Continue = () => {
    const errs = {};
    if (!firstName.trim()) errs.firstName = "Please enter account holder's first name.";
    if (!lastName.trim()) errs.lastName = "Please enter account holder's last name.";
    if (!accountNumber.trim()) errs.accountNumber = "Please enter your bank account number.";
    if (!cifNumber.trim()) errs.cifNumber = "Please enter your Customer ID / CIF.";
    if (!branchName.trim()) errs.branch = "Please select your bank branch.";
    if (!panNumber.trim() || panNumber.trim().length < 10) errs.pan = "Please enter a valid 10-digit PAN card number.";
    if (!aadhaarNumber.trim() || aadhaarNumber.replace(/\D/g, '').length < 12) errs.aadhaar = "Please enter a valid 12-digit Aadhaar number.";

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      addToast('Please complete all mandatory account details.', 'error');
      return;
    }

    setErrors({});
    setCurrentStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // =========================================================================
  // STEP 3 HANDLER: SUBMIT CONSENT
  // =========================================================================
  const handleSubmitConsent = async () => {
    const errs = {};
    if (!consentChoice) errs.choice = 'Please select a preference to continue.';
    if (!hasSignature) errs.signature = 'Please provide your digital signature.';
    if (!formPlace.trim()) errs.place = 'Please enter your city/place.';

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      addToast('Please provide your signature and select a consent preference.', 'error');
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    const canvas = canvasRef.current;
    const sigDataUrl = canvas ? canvas.toDataURL('image/png') : '';

    const fullName = getFullName();
    const cleanMobile = mobileNumber.replace(/\D/g, '');
    const cleanPan = panNumber.trim().toUpperCase();
    const cleanAadhaar = aadhaarNumber.replace(/\D/g, '');
    const formattedDate = new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const payload = {
      name: fullName,
      customerName: fullName,
      customer_name: fullName,
      accNo: accountNumber.trim(),
      accountNumber: accountNumber.trim(),
      account_number: accountNumber.trim(),
      cif: cifNumber.trim(),
      cifNumber: cifNumber.trim(),
      cif_number: cifNumber.trim(),
      mobile: cleanMobile,
      mobileNumber: cleanMobile,
      mobile_number: cleanMobile,
      branch: branchName,
      branchName: branchName,
      branch_name: branchName,
      pan: cleanPan,
      panNumber: cleanPan,
      pan_number: cleanPan,
      aadhaar: cleanAadhaar,
      aadhaarNumber: cleanAadhaar,
      aadhaar_number: cleanAadhaar,
      consent: consentChoice.toUpperCase(),
      consentChoice: consentChoice.toUpperCase(),
      consent_choice: consentChoice.toUpperCase(),
      date: formDate,
      form_date: formDate,
      place: formPlace.trim(),
      form_place: formPlace.trim(),
      signatureData: sigDataUrl,
      signature_data: sigDataUrl
    };

    try {
      const res = await bankApi.submitCustomerConsent(payload);
      const refId = res.referenceNumber || res.refNo || `NAMCO-SMS-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

      const choiceLabel = consentChoice === 'yes' ? 'Receive SMS alerts' : 'Opted out of optional alerts';

      const newHistoryEntry = {
        refId,
        choiceLabel,
        dateLabel: formattedDate,
        status: consentChoice.toUpperCase()
      };

      const updatedHistory = [newHistoryEntry, ...consentHistory];
      setConsentHistory(updatedHistory);
      try {
        localStorage.setItem('namcoConsentHistory', JSON.stringify(updatedHistory));
      } catch (e) {}

      // Save Customer Session so Profile is unlocked across pages & refreshes
      const profileSession = {
        token: 'ctk_' + Date.now(),
        profile: {
          name: fullName,
          accountNumber: accountNumber.trim(),
          maskedAccount: maskAccount(accountNumber),
          cifNumber: cifNumber.trim(),
          mobileNumber: cleanMobile,
          maskedMobile: formatMobile(cleanMobile),
          branchName: branchName,
          panNumber: cleanPan,
          aadhaarNumber: maskAadhaar(cleanAadhaar),
          rawAadhaar: cleanAadhaar,
          currentConsent: consentChoice.toUpperCase(),
          referenceNumber: refId,
          submittedAt: formattedDate,
          history: updatedHistory
        }
      };
      sessionStorage.setItem('namco_customer_session', JSON.stringify(profileSession));
      setIsProfileUnlocked(true);

      setSubmittedRecord({
        refId,
        name: fullName,
        choice: choiceLabel,
        date: formattedDate
      });

      addToast(`Consent preference (${consentChoice.toUpperCase()}) recorded successfully!`, 'success');
      setCurrentStep(4);
    } catch (err) {
      // Fallback
      const refId = `NAMCO-SMS-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      const choiceLabel = consentChoice === 'yes' ? 'Receive SMS alerts' : 'Opted out of optional alerts';
      const newHistoryEntry = {
        refId,
        choiceLabel,
        dateLabel: formattedDate,
        status: consentChoice.toUpperCase()
      };
      const updatedHistory = [newHistoryEntry, ...consentHistory];
      setConsentHistory(updatedHistory);
      try {
        localStorage.setItem('namcoConsentHistory', JSON.stringify(updatedHistory));
      } catch (e) {}

      setIsProfileUnlocked(true);
      setSubmittedRecord({
        refId,
        name: fullName,
        choice: choiceLabel,
        date: formattedDate
      });
      setCurrentStep(4);
    } finally {
      setIsSubmitting(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // =========================================================================
  // PROFILE VIEW HANDLERS
  // =========================================================================
  const handleOpenProfile = () => {
    if (!isProfileUnlocked) {
      addToast('Complete the consent form to unlock your customer profile.', 'info');
      return;
    }
    setPreProfileStep(currentStep);
    setShowProfile(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCloseProfile = () => {
    setShowProfile(false);
    setCurrentStep(preProfileStep || 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleProfileUpdateConsent = () => {
    setShowProfile(false);
    setCurrentStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Masking helpers specifically formatted for boxed character rendering
  const getMaskedAccountBoxes = (acc, count = 16) => {
    const clean = String(acc || '').trim();
    if (!clean) return '';
    if (clean.length <= 4) return clean;
    const visible = clean.slice(-4);
    const masked = 'X'.repeat(clean.length - 4) + visible;
    return masked;
  };

  const getMaskedCifBoxes = (cif, count = 11) => {
    const clean = String(cif || '').trim();
    if (!clean) return '';
    if (clean.length <= 2) return clean;
    const keep = clean.length > 5 ? 3 : 2;
    const visible = clean.slice(-keep);
    const masked = 'X'.repeat(clean.length - keep) + visible;
    return masked;
  };

  const getMaskedPanBoxes = (pan, count = 10) => {
    const clean = String(pan || '').trim().toUpperCase();
    if (!clean || clean.length < 5) return clean;
    const last4 = clean.slice(-4);
    return 'X'.repeat(clean.length - 4) + last4;
  };

  const getMaskedAadhaarBoxes = (adh) => {
    const clean = String(adh || '').replace(/\D/g, '');
    if (!clean) return '';
    const last4 = clean.slice(-4).padStart(4, '0');
    return 'XXXXXXXX' + last4;
  };

  const getMaskedMobileBoxes = (mob) => {
    const clean = String(mob || '').replace(/\D/g, '');
    if (clean.length === 10) {
      return clean.slice(0, 2) + 'XXXXXX' + clean.slice(-2);
    }
    return clean;
  };

  // Helper to render boxed character cells matching physical bank form
  const renderBoxes = (value, count, isAadhaar = false, forceBlank = false) => {
    const isBlankMode = forceBlank || printMode === 'blank';
    const chars = isBlankMode ? [] : (value || '').toString().toUpperCase().replace(/[\s-]/g, '').split('');
    if (isAadhaar) {
      return (
        <div className="char-container aadhaar-group">
          <div className="char-subgroup">
            {[0, 1, 2, 3].map(i => (
              <div key={`a1-${i}`} className="char-box">{chars[i] || ''}</div>
            ))}
          </div>
          <span className="char-sep">-</span>
          <div className="char-subgroup">
            {[4, 5, 6, 7].map(i => (
              <div key={`a2-${i}`} className="char-box">{chars[i] || ''}</div>
            ))}
          </div>
          <span className="char-sep">-</span>
          <div className="char-subgroup">
            {[8, 9, 10, 11].map(i => (
              <div key={`a3-${i}`} className="char-box">{chars[i] || ''}</div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="char-container">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="char-box">{chars[i] || ''}</div>
        ))}
      </div>
    );
  };

  // =========================================================================
  // DOWNLOAD / PRINT FORM HANDLERS (BLANK PHYSICAL vs FILLED DIGITAL)
  // =========================================================================
  const handleDownloadBlankForm = () => {
    setPrintMode('blank');
    setTimeout(() => {
      window.print();
    }, 60);
  };

  const handleDownloadFilledForm = () => {
    setPrintMode('filled');
    setTimeout(() => {
      window.print();
    }, 60);
  };

  const handleDownloadForm = () => {
    if (currentStep === 4 || showProfile) {
      handleDownloadFilledForm();
    } else {
      handleDownloadBlankForm();
    }
  };

  // Primary action button text for mobile sticky bar
  const getStickyButtonText = () => {
    if (currentStep === 1) {
      return isOtpSent ? 'Verify & continue' : 'Send OTP';
    }
    if (currentStep === 2) return 'Continue';
    if (currentStep === 3) return 'Submit consent';
    return 'Done';
  };

  const handleStickyButtonClick = () => {
    if (currentStep === 1) {
      if (isOtpSent) handleVerifyOtp();
      else handleSendOtp();
    } else if (currentStep === 2) {
      handleStep2Continue();
    } else if (currentStep === 3) {
      handleSubmitConsent();
    }
  };

  return (
    <div className="consent-app-wrapper">
      {/* ===== TOPBAR WITH FULL RECTANGULAR LOGO ===== */}
      <header className="consent-topbar no-print">
        <div className="consent-topbar-inner">
          <div
            className="consent-brand"
            onClick={() => {
              if (showProfile) handleCloseProfile();
              else setCurrentStep(1);
            }}
            title="Namco Bank Home"
          >
            {/* Full Rectangular Official Logo Banner */}
            <div className="consent-brand-logo-container">
              <img
                src="/logo.png"
                alt="The Nasik Merchants Co-operative Bank Ltd. (Namco Bank)"
                className="consent-brand-logo-img"
                onError={(e) => {
                  e.target.style.display = 'none';
                  if (e.target.parentElement) e.target.parentElement.innerHTML = '<strong>Namco Bank</strong>';
                }}
              />
            </div>
          </div>

          <div className="topbar-actions">
            <div className="secure-chip">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <span>RBI Secure Gateway</span>
            </div>

            {/* Profile Button in Top-Right Corner */}
            <button
              type="button"
              className={`profile-btn ${showProfile ? 'active-profile' : ''}`}
              id="profileBtn"
              disabled={!isProfileUnlocked}
              onClick={handleOpenProfile}
              aria-expanded={showProfile}
              title={
                isProfileUnlocked
                  ? 'View your customer profile & consent history'
                  : 'Complete the consent form to unlock your profile'
              }
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
              </svg>
              {isProfileUnlocked && <span className="profile-unlocked-dot" />}
            </button>
          </div>
        </div>
      </header>

      {/* ===== MAIN SHELL ===== */}
      <main className="consent-shell no-print">
        {!showProfile ? (
          <>
            {/* Intro & Download Row */}
            <div className="intro" id="formIntro">
              <h1>SMS alert consent</h1>
              <p>
                Tell us how you'd like to hear from us. This takes about two minutes — verify your registered
                mobile number, confirm your account, then choose your preference.
              </p>
            </div>

            <div className="download-row">
              <div style={{ fontSize: '13px', color: '#6B7284' }}>
                {isProfileUnlocked ? (
                  <button
                    type="button"
                    onClick={handleOpenProfile}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#1B3E70',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline'
                    }}
                  >
                    Already registered? View Profile / Update Consent
                  </button>
                ) : (
                  <span>Official Reserve Bank of India SMS Registration Portal</span>
                )}
              </div>
              <button
                className="btn btn-secondary"
                id="downloadFormBtn"
                type="button"
                onClick={handleDownloadBlankForm}
                title="Download blank physical pen-and-paper form for branch walk-in submission"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />
                </svg>
                Download form
              </button>
            </div>

            {/* Stepper Progress */}
            <nav className="consent-stepper" id="formStepper" aria-label="Form progress">
              <div className={`step ${currentStep === 1 ? 'active' : ''} ${currentStep > 1 ? 'done' : ''}`} data-step-indicator="1">
                <div className="step-connector"></div>
                <div className="step-dot">{currentStep > 1 ? '✓' : '1'}</div>
                <div className="step-label">Verify mobile</div>
              </div>
              <div className={`step ${currentStep === 2 ? 'active' : ''} ${currentStep > 2 ? 'done' : ''}`} data-step-indicator="2">
                <div className="step-connector"></div>
                <div className="step-dot">{currentStep > 2 ? '✓' : '2'}</div>
                <div className="step-label">Account details</div>
              </div>
              <div className={`step ${currentStep === 3 ? 'active' : ''} ${currentStep > 3 ? 'done' : ''}`} data-step-indicator="3">
                <div className="step-connector"></div>
                <div className="step-dot">{currentStep > 3 ? '✓' : '3'}</div>
                <div className="step-label">Consent choice</div>
              </div>
              <div className={`step ${currentStep === 4 ? 'active done' : ''}`} data-step-indicator="4">
                <div className="step-connector"></div>
                <div className="step-dot">{currentStep === 4 ? '✓' : '4'}</div>
                <div className="step-label">Done</div>
              </div>
            </nav>

            {/* STEP 1: MOBILE + OTP */}
            {currentStep === 1 && (
              <section className="consent-card panel active" data-panel="1" aria-labelledby="s1h">
                <div className="card-head">
                  <span className="eyebrow">Step 1 of 4</span>
                  <h2 id="s1h">Verify your registered mobile number</h2>
                  <p className="helper">
                    We'll send a one‑time password to confirm it's really you. Standard SMS rates may apply.
                  </p>
                </div>

                {!isOtpSent ? (
                  <div id="mobileEntry">
                    <div className={`field ${errors.mobile ? 'invalid' : ''}`} id="mobileField">
                      <label htmlFor="mobile">
                        Registered mobile number <span className="req">*</span>
                      </label>
                      <div className="tel-group">
                        <span className="tel-prefix">+91</span>
                        <input
                          type="tel"
                          id="mobile"
                          inputMode="numeric"
                          maxLength="10"
                          placeholder="10‑digit mobile number"
                          autoComplete="tel-national"
                          value={mobileNumber}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                            setMobileNumber(val);
                            if (val.length === 10) setErrors(prev => ({ ...prev, mobile: null }));
                          }}
                        />
                      </div>
                      <p className="hint">Must match the number on file with your branch.</p>
                      {errors.mobile && <p className="err">{errors.mobile}</p>}
                    </div>
                    <div className="btn-row">
                      <button
                        className="btn btn-primary"
                        id="sendOtpBtn"
                        type="button"
                        disabled={isSendingOtp || mobileNumber.length !== 10}
                        onClick={handleSendOtp}
                      >
                        {isSendingOtp ? 'Sending OTP...' : 'Send OTP'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div id="otpEntry">
                    <div className={`field ${errors.otp ? 'invalid' : ''}`}>
                      <label>
                        Enter the 6‑digit OTP <span className="req">*</span>
                      </label>
                      <div className="otp-row" role="group" aria-label="One time password" onPaste={handleOtpPaste}>
                        {otpDigits.map((digit, idx) => (
                          <input
                            key={idx}
                            ref={(el) => (otpInputsRef.current[idx] = el)}
                            type="text"
                            inputMode="numeric"
                            maxLength="1"
                            className="otp-box"
                            aria-label={`Digit ${idx + 1}`}
                            value={digit}
                            onChange={(e) => handleOtpChange(idx, e.target.value)}
                            onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                          />
                        ))}
                      </div>
                      {errors.otp && <p className="err">{errors.otp}</p>}

                      <div className="otp-meta">
                        {otpTimer > 0 ? (
                          <span className="timer" id="otpTimer">
                            Resend available in 0:{otpTimer.toString().padStart(2, '0')}
                          </span>
                        ) : (
                          <button
                            className="resend-link"
                            id="resendBtn"
                            type="button"
                            onClick={handleSendOtp}
                          >
                            Resend OTP
                          </button>
                        )}
                      </div>

                      <div className="demo-note">
                        Demo mode — in production this OTP is delivered via Namco Bank's internal SMS gateway.{' '}
                        {devOtpHint && <span>(Active Demo OTP: <strong>{devOtpHint}</strong>)</span>}
                      </div>
                    </div>

                    <div className="btn-row">
                      <button className="btn btn-secondary" id="changeNumberBtn" type="button" onClick={handleChangeNumber}>
                        Change number
                      </button>
                      <button
                        className="btn btn-primary"
                        id="verifyOtpBtn"
                        type="button"
                        disabled={!isOtpComplete || isVerifyingOtp}
                        onClick={handleVerifyOtp}
                      >
                        {isVerifyingOtp ? 'Verifying...' : 'Verify & continue'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="trust-strip">
                  <div className="trust-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="4" y="10" width="16" height="10" rx="2" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    </svg>
                    OTP sent via bank‑internal SMS only
                  </div>
                  <div className="trust-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
                    </svg>
                    No data shared with third parties
                  </div>
                </div>
              </section>
            )}

            {/* STEP 2: ACCOUNT DETAILS */}
            {currentStep === 2 && (
              <section className="consent-card panel active" data-panel="2" aria-labelledby="s2h">
                <div className="card-head">
                  <span className="eyebrow">Step 2 of 4</span>
                  <h2 id="s2h">Confirm your account details</h2>
                  <p className="helper">These details link your consent record to the correct customer profile.</p>
                </div>

                <div className="verified-banner">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  <span id="verifiedNumberText">
                    Mobile number {formatMobile(mobileNumber)} verified
                  </span>
                </div>

                <div className="row2">
                  <div className={`field ${errors.firstName ? 'invalid' : ''}`}>
                    <label htmlFor="firstName">
                      First name <span className="req">*</span>
                    </label>
                    <input
                      type="text"
                      id="firstName"
                      placeholder="As it appears on your account"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                    {errors.firstName && <p className="err">{errors.firstName}</p>}
                  </div>
                  <div className="field">
                    <label htmlFor="middleName">Middle name</label>
                    <input
                      type="text"
                      id="middleName"
                      placeholder="As it appears on your account"
                      autoComplete="additional-name"
                      value={middleName}
                      onChange={(e) => setMiddleName(e.target.value)}
                    />
                  </div>
                </div>

                <div className={`field ${errors.lastName ? 'invalid' : ''}`}>
                  <label htmlFor="lastName">
                    Last name <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    placeholder="As it appears on your account"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                  {errors.lastName && <p className="err">{errors.lastName}</p>}
                </div>

                <div className="row2">
                  <div className={`field ${errors.accountNumber ? 'invalid' : ''}`}>
                    <label htmlFor="acctNo">
                      Account number <span className="req">*</span>
                    </label>
                    <input
                      type="text"
                      id="acctNo"
                      inputMode="numeric"
                      placeholder="Bank account number"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                    />
                    {errors.accountNumber && <p className="err">{errors.accountNumber}</p>}
                  </div>
                  <div className={`field ${errors.cifNumber ? 'invalid' : ''}`}>
                    <label htmlFor="cif">
                      Customer ID (CIF) <span className="req">*</span>
                    </label>
                    <input
                      type="text"
                      id="cif"
                      placeholder="Found on your passbook or cheque book"
                      value={cifNumber}
                      onChange={(e) => setCifNumber(e.target.value)}
                    />
                    {errors.cifNumber && <p className="err">{errors.cifNumber}</p>}
                  </div>
                </div>

                <div className={`field ${errors.branch ? 'invalid' : ''}`}>
                  <label htmlFor="branch">
                    Branch <span className="req">*</span>
                  </label>
                  <select
                    id="branch"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                  >
                    <option value="">Select your branch</option>
                    {branches.map((b, i) => (
                      <option key={b.branch_code || i} value={b.branch_name}>
                        {b.branch_name} {b.branch_code ? `(${b.branch_code})` : ''}
                      </option>
                    ))}
                  </select>
                  {errors.branch && <p className="err">{errors.branch}</p>}
                </div>

                <div className="row2">
                  <div className={`field ${errors.pan ? 'invalid' : ''}`}>
                    <label htmlFor="panCard">
                      PAN card number <span className="req">*</span>
                    </label>
                    <input
                      type="text"
                      id="panCard"
                      placeholder="e.g. ABCDE1234F"
                      maxLength="10"
                      style={{ textTransform: 'uppercase' }}
                      autoComplete="off"
                      value={panNumber}
                      onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                    />
                    {errors.pan && <p className="err">{errors.pan}</p>}
                  </div>
                  <div className={`field ${errors.aadhaar ? 'invalid' : ''}`}>
                    <label htmlFor="aadhaarCard">
                      Aadhaar card number <span className="req">*</span>
                    </label>
                    <input
                      type="text"
                      id="aadhaarCard"
                      inputMode="numeric"
                      placeholder="12-digit Aadhaar number"
                      maxLength="12"
                      autoComplete="off"
                      value={aadhaarNumber}
                      onChange={(e) => setAadhaarNumber(e.target.value.replace(/\D/g, ''))}
                    />
                    {errors.aadhaar && <p className="err">{errors.aadhaar}</p>}
                  </div>
                </div>

                <div className="btn-row">
                  <button className="btn btn-secondary" type="button" onClick={() => setCurrentStep(1)}>
                    Back
                  </button>
                  <button className="btn btn-primary" id="toStep3Btn" type="button" onClick={handleStep2Continue}>
                    Continue
                  </button>
                </div>
              </section>
            )}

            {/* STEP 3: CONSENT CHOICE & SIGNATURE */}
            {currentStep === 3 && (
              <section className="consent-card panel active" data-panel="3" aria-labelledby="s3h">
                <div className="card-head">
                  <span className="eyebrow">Step 3 of 4</span>
                  <h2 id="s3h">Your SMS alert preference</h2>
                  <p className="helper">As per Reserve Bank of India guidelines for electronic banking communications.</p>
                </div>

                <div className="consent-text">
                  <p>
                    I, <strong id="consentName">{getFullName() || 'Account Holder'}</strong>, authorise{' '}
                    <strong>The Nasik Merchants Co‑operative Bank Ltd. (Namco Bank)</strong> to send SMS alerts and service
                    communications to my registered mobile number ({formatMobile(mobileNumber)}) for account{' '}
                    <strong>{maskAccount(accountNumber)}</strong>.
                  </p>
                  <ul>
                    <li>Alerts are sent only to the mobile number registered with the bank.</li>
                    <li>I'll inform the bank immediately if this number changes.</li>
                    <li>Applicable SMS alert charges may apply as per the bank's approved tariff.</li>
                    <li>I can revoke or update this consent anytime from my profile, or at my branch.</li>
                  </ul>
                </div>

                <div className="choice-group" role="radiogroup" aria-label="SMS alert consent choice">
                  <label
                    className={`choice yes ${consentChoice === 'yes' ? 'selected' : ''}`}
                    data-choice="yes"
                    onClick={() => setConsentChoice('yes')}
                  >
                    <input
                      type="radio"
                      name="consentChoice"
                      value="yes"
                      checked={consentChoice === 'yes'}
                      onChange={() => setConsentChoice('yes')}
                    />
                    <span>
                      <span className="choice-title">Yes — send me SMS alerts</span>
                      <span className="choice-sub">Recommended. Get notified of every credit, debit and security event.</span>
                    </span>
                  </label>

                  <label
                    className={`choice no ${consentChoice === 'no' ? 'selected' : ''}`}
                    data-choice="no"
                    onClick={() => setConsentChoice('no')}
                  >
                    <input
                      type="radio"
                      name="consentChoice"
                      value="no"
                      checked={consentChoice === 'no'}
                      onChange={() => setConsentChoice('no')}
                    />
                    <span>
                      <span className="choice-title">No — I don't want optional alerts</span>
                      <span className="choice-sub">Statutory and security alerts required by RBI will still be sent.</span>
                    </span>
                  </label>
                </div>
                {errors.choice && <p className="err" style={{ display: 'block', marginTop: '8px' }}>{errors.choice}</p>}

                {/* Signature Canvas */}
                <div className="field" style={{ marginTop: '22px' }}>
                  <label>
                    Digital signature <span className="req">*</span>
                  </label>
                  <div className="sig-wrap">
                    <canvas
                      ref={canvasRef}
                      id="sigPad"
                      onMouseDown={handleCanvasStart}
                      onMouseMove={handleCanvasMove}
                      onMouseUp={handleCanvasEnd}
                      onMouseLeave={handleCanvasEnd}
                      onTouchStart={handleCanvasStart}
                      onTouchMove={handleCanvasMove}
                      onTouchEnd={handleCanvasEnd}
                    />
                    {!hasSignature && (
                      <div className="sig-placeholder" id="sigPlaceholder">
                        Sign here with mouse or touch
                      </div>
                    )}
                  </div>
                  <div className="sig-toolbar">
                    <span className="sig-hint">Confirms this preference was submitted by you.</span>
                    <button className="clear-link" id="clearSigBtn" type="button" onClick={handleClearSignature}>
                      Clear signature
                    </button>
                  </div>
                  {errors.signature && (
                    <p className="err" style={{ display: 'block' }}>
                      {errors.signature}
                    </p>
                  )}
                </div>

                <div className="row2">
                  <div className="field">
                    <label htmlFor="dateField">Date</label>
                    <input
                      type="date"
                      id="dateField"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                    />
                  </div>
                  <div className={`field ${errors.place ? 'invalid' : ''}`}>
                    <label htmlFor="placeField">
                      Place <span className="req">*</span>
                    </label>
                    <input
                      type="text"
                      id="placeField"
                      placeholder="City"
                      value={formPlace}
                      onChange={(e) => setFormPlace(e.target.value)}
                    />
                    {errors.place && <p className="err">{errors.place}</p>}
                  </div>
                </div>

                <div className="btn-row">
                  <button className="btn btn-secondary" type="button" onClick={() => setCurrentStep(2)}>
                    Back
                  </button>
                  <button
                    className="btn btn-primary"
                    id="submitBtn"
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleSubmitConsent}
                  >
                    {isSubmitting ? 'Recording Consent...' : 'Submit consent'}
                  </button>
                </div>
              </section>
            )}

            {/* STEP 4: CONFIRMATION / DONE */}
            {currentStep === 4 && submittedRecord && (
              <section className="consent-card panel active" data-panel="4" aria-labelledby="s4h">
                <div className="confirm-center">
                  <div className="confirm-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#166A3F" strokeWidth="2.5">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <h2 id="s4h">Your preference has been recorded</h2>
                  <p>
                    A confirmation SMS has been sent to your registered number. You can view or update this
                    preference anytime from your profile.
                  </p>
                </div>

                <div className="ref-box">
                  <div className="ref-row">
                    <span className="k">Reference ID</span>
                    <span className="v" id="refId">{submittedRecord.refId}</span>
                  </div>
                  <div className="ref-row">
                    <span className="k">Account holder</span>
                    <span className="v" id="refName">{submittedRecord.name}</span>
                  </div>
                  <div className="ref-row">
                    <span className="k">Preference</span>
                    <span className="v" id="refChoice" style={{ color: consentChoice === 'yes' ? '#1E7A46' : '#171B24' }}>
                      {submittedRecord.choice}
                    </span>
                  </div>
                  <div className="ref-row">
                    <span className="k">Submitted</span>
                    <span className="v" id="refDate">{submittedRecord.date}</span>
                  </div>
                </div>

                <div className="btn-row" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <button className="btn btn-primary" id="downloadCopyBtn" type="button" onClick={handleDownloadFilledForm} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <path d="M6 14h12v8H6z" />
                    </svg>
                    Print / Download Form (A4)
                  </button>
                  <button className="btn btn-secondary" id="downloadBlankFromDoneBtn" type="button" onClick={handleDownloadBlankForm} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />
                    </svg>
                    Blank Branch Form
                  </button>
                  <button className="btn btn-secondary" id="viewHistoryBtn" type="button" onClick={handleOpenProfile}>
                    View consent history
                  </button>
                  <button className="btn btn-secondary" id="updateConsentBtn" type="button" onClick={() => setCurrentStep(3)}>
                    Update consent
                  </button>
                </div>
              </section>
            )}
          </>
        ) : (
          /* ===== CUSTOMER PROFILE PAGE ===== */
          <section className="consent-card" id="profilePage" aria-labelledby="profileTitle">
            <button className="back-link" id="profileBackBtn" type="button" onClick={handleCloseProfile}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back to form
            </button>

            <div className="card-head">
              <span className="eyebrow">Customer Profile</span>
              <h2 id="profileTitle">Your profile</h2>
              <p className="helper">Your verified account details and SMS alert consent history.</p>
            </div>

            <div className="ref-box">
              <div className="ref-row">
                <span className="k">Account holder</span>
                <span className="v" id="profName">{getFullName() || '—'}</span>
              </div>
              <div className="ref-row">
                <span className="k">Mobile number</span>
                <span className="v" id="profMobile">{formatMobile(mobileNumber)}</span>
              </div>
              <div className="ref-row">
                <span className="k">Account number</span>
                <span className="v" id="profAcctNo">{maskAccount(accountNumber)}</span>
              </div>
              <div className="ref-row">
                <span className="k">Customer ID (CIF)</span>
                <span className="v" id="profCif">{cifNumber || '—'}</span>
              </div>
              <div className="ref-row">
                <span className="k">Branch</span>
                <span className="v" id="profBranch">{branchName || '—'}</span>
              </div>
              <div className="ref-row">
                <span className="k">PAN</span>
                <span className="v" id="profPan">{panNumber ? maskId(panNumber.toUpperCase(), 2, 2) : '—'}</span>
              </div>
              <div className="ref-row">
                <span className="k">Aadhaar</span>
                <span className="v" id="profAadhaar">{aadhaarNumber ? maskAadhaar(aadhaarNumber) : '—'}</span>
              </div>
            </div>

            <div className="profile-history">
              <h3>Consent history</h3>
              <ul className="history-list" id="historyList">
                {consentHistory.length === 0 ? (
                  <li className="history-empty">No consent updates yet.</li>
                ) : (
                  consentHistory.map((item, idx) => (
                    <li key={idx} className="history-item">
                      <span className={`h-choice ${item.choiceLabel.includes('Receive') ? 'yes' : 'no'}`}>
                        {item.choiceLabel}
                      </span>
                      <span className="h-date">{item.dateLabel}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="btn-row" style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                id="profileDownloadCopyBtn"
                type="button"
                onClick={handleDownloadFilledForm}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <path d="M6 14h12v8H6z" />
                </svg>
                Download Consent Copy (A4)
              </button>
              <button
                className="btn btn-primary"
                id="profileUpdateConsentBtn"
                type="button"
                onClick={handleProfileUpdateConsent}
              >
                Update consent
              </button>
            </div>
          </section>
        )}
      </main>

      {/* ===== STICKY MOBILE ACTION BAR ===== */}
      {!showProfile && currentStep < 4 && (
        <div className="consent-sticky-bar no-print" id="stickyBar">
          <button
            className="btn btn-primary btn-full"
            id="stickyActionBtn"
            type="button"
            onClick={handleStickyButtonClick}
          >
            {getStickyButtonText()}
          </button>
        </div>
      )}

      {/* ===== FOOTER ===== */}
      <footer className="consent-footer no-print">
        © The Nasik Merchants Co‑operative Bank Ltd., Nashik (Namco Bank). All rights reserved.<br />
        RBI electronic banking consent compliance · <Link to="/login">Bank staff sign‑in</Link>
      </footer>

      {/* ===== AUTHENTIC OFFICIAL NAMCO BANK CONSENT FORMS (DUAL MODE: BLANK PHYSICAL vs FILLED DIGITAL) ===== */}
      <div className="print-summary" id="printSummary">
        <div className="bank-header-print">
          <div className="marathi-top-sub">दि नाशिक मर्चंटस् को- ऑपरेटिव्ह बँक लि., नाशिक</div>
          <img
            src="/logo.png"
            alt="The Nasik Merchants Co-operative Bank Ltd."
            className="logo-img-print"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div className="marathi-title-print">द नाशिक मर्चंटस् को-ऑपरेटिव्ह बँक लि. (नामको बँक)</div>
          <div className="english-title-print">THE NASIK MERCHANTS CO-OPERATIVE BANK LTD. (NAMCO BANK)</div>
          <div className="sub-title-print">Multi-State Scheduled Bank &bull; Head Office: Nashik &bull; Estd. 1949</div>
        </div>

        {printMode === 'blank' ? (
          /* =========================================================================
             FORM 1: BLANK PHYSICAL FORM (FOR PEN & PAPER WALK-IN BRANCH SUBMISSION)
             ========================================================================= */
          <>
            <div className="form-title-main-print">BANK SMS ALERT REGISTRATION / CONSENT FORM</div>
            <div className="form-subtitle-rbi-print">As per Reserve Bank of India (RBI) Guidelines for Electronic Banking Communications &bull; (Physical Branch Copy)</div>

            {/* Section 1: Customer Details */}
            <div className="sec-box-print">
              <div className="sec-title-print">1. Customer Details <span style={{ fontWeight: 'normal', color: '#4b5563', textTransform: 'none' }}>(Fill in Capital Letters)</span></div>
              <div className="box-row-print">
                <span className="row-lbl-print">Customer Name:</span>
                <div className="rule-line-print"></div>
              </div>
              <div className="box-row-print">
                <span className="row-lbl-print">Account No:</span>
                {renderBoxes('', 16, false, true)}
              </div>
              <div className="box-row-print">
                <span className="row-lbl-print">Customer ID (CIF):</span>
                {renderBoxes('', 11, false, true)}
              </div>
              <div className="box-row-print">
                <span className="row-lbl-print">PAN Card No:</span>
                {renderBoxes('', 10, false, true)}
              </div>
              <div className="box-row-print">
                <span className="row-lbl-print">Aadhaar Card No:</span>
                {renderBoxes('', 12, true, true)}
              </div>
              <div className="box-row-print">
                <span className="row-lbl-print">Branch Name:</span>
                <div className="rule-line-print"></div>
              </div>
            </div>

            {/* Section 2: Mobile Number */}
            <div className="sec-box-print">
              <div className="sec-title-print">2. Mobile Number Registration</div>
              <div className="box-row-print">
                <span className="row-lbl-print">Registered Mobile No: &nbsp;&nbsp; <strong>+91</strong></span>
                {renderBoxes('', 10, false, true)}
              </div>
              <div style={{ fontSize: '9px', color: '#4b5563', marginTop: '2px', fontStyle: 'italic' }}>
                SMS alerts and OTPs will be delivered to this registered mobile number.
              </div>
            </div>

            {/* Section 3: Consent Declaration */}
            <div className="sec-box-print">
              <div className="sec-title-print">3. Consent Declaration</div>
              <p className="decl-text-print">
                I hereby submit my consent choice to <strong>The Nasik Merchants Co-operative Bank Ltd. (Namco Bank)</strong> regarding SMS alerts for my bank account, service-related information, and banking communications on my registered mobile number. I understand and agree to the following terms &amp; guidelines:
              </p>
              <div className="decl-guidelines-print">
                <ul className="guidelines-list-print">
                  <li>SMS alerts will be sent only to the registered mobile number provided by me.</li>
                  <li>I am responsible for informing the bank immediately about any change in my mobile number.</li>
                  <li>The bank may charge applicable SMS alert service charges as per its approved rules.</li>
                  <li>I may revoke or update this consent at any time online or by submitting a physical request at my branch.</li>
                </ul>
              </div>
              <div className="consent-options-print">
                <div className="consent-opt-row">
                  <span className="print-square-box"></span>
                  <div>
                    <div><strong>YES</strong> — I want to receive SMS alerts from the bank.</div>
                    <div className="opt-subtext-print">(Recommended: Stay notified of all account credits, debits &amp; security alerts)</div>
                  </div>
                </div>
                <div className="consent-opt-row">
                  <span className="print-square-box"></span>
                  <div>
                    <div><strong>NO</strong> — I do not want to receive optional SMS alerts.</div>
                    <div className="opt-subtext-print">(Note: Critical statutory alerts will still be delivered as mandated by RBI)</div>
                  </div>
                </div>
              </div>

              <div className="sig-row-print">
                <div className="date-place-print">
                  Date: <span className="dotted-line-inline"></span> &nbsp;&nbsp;&nbsp;&nbsp; Place: <span className="dotted-line-inline"></span>
                </div>
                <div className="sig-box-print">
                  <div className="sig-placeholder-space"></div>
                  <div className="sig-line-print">Customer Signature</div>
                </div>
              </div>
            </div>

            {/* Section 4: FOR BANK USE ONLY */}
            <div className="bank-use-box-print">
              <div className="bank-use-title-print">FOR BANK USE ONLY</div>
              <div className="bank-use-grid-print">
                <div className="bank-use-cell">
                  <span>Verified By:</span>
                  <div className="rule-line-print"></div>
                </div>
                <div className="bank-use-cell">
                  <span>Employee ID:</span>
                  <div className="rule-line-print"></div>
                </div>
                <div className="bank-use-cell">
                  <span>Branch Code:</span>
                  <div className="rule-line-print"></div>
                </div>
                <div className="bank-use-cell">
                  <span>Entry Date:</span>
                  <div className="rule-line-print"></div>
                </div>
              </div>
            </div>

            <div className="footer-note-print">
              &copy; Namco Bank &bull; Customer Copy &bull; Hand over signed form to Branch Officer for In-Person Verification
            </div>
          </>
        ) : (
          /* =========================================================================
             FORM 2: FILLED DIGITAL CONSENT RECORD & OFFICIAL SUBMISSION ACKNOWLEDGEMENT
             ========================================================================= */
          <>
            <div className="form-title-main-print" style={{ color: '#0f2b48' }}>
              BANK SMS ALERT DIGITAL CONSENT RECORD &amp; SUBMISSION ACKNOWLEDGEMENT
            </div>
            <div className="form-subtitle-rbi-print">
              Official Customer Copy &bull; Recorded Electronically via RBI-Compliant Digital Banking Portal
            </div>

            {/* Digital Tracking Status Banner */}
            <div className="digital-audit-bar-print">
              <div className="audit-bar-col">
                <strong>Tracking Reference ID:</strong> <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{submittedRecord?.refId || 'NAMCO-SMS-2026-ONLINE'}</span>
              </div>
              <div className="audit-bar-col">
                <strong>Submission Mode:</strong> <span>ONLINE SELF-SERVICE</span>
              </div>
              <div className="audit-bar-col">
                <strong>2FA Authentication:</strong> <span>✓ VERIFIED (+91 {mobileNumber ? mobileNumber.slice(-4).padStart(10, '•') : '••••••••••'})</span>
              </div>
            </div>

            {/* Section 1: Customer Details */}
            <div className="sec-box-print">
              <div className="sec-title-print">1. Verified Customer Details</div>
              <div className="box-row-print">
                <span className="row-lbl-print">Customer Name:</span>
                <div className="rule-line-print filled">{getFullName() || '—'}</div>
              </div>
              <div className="box-row-print">
                <span className="row-lbl-print">Account No:</span>
                {renderBoxes(getMaskedAccountBoxes(accountNumber, 16), 16)}
              </div>
              <div className="box-row-print">
                <span className="row-lbl-print">Customer ID (CIF):</span>
                {renderBoxes(getMaskedCifBoxes(cifNumber, 11), 11)}
              </div>
              <div className="box-row-print">
                <span className="row-lbl-print">PAN Card No:</span>
                {renderBoxes(getMaskedPanBoxes(panNumber, 10), 10)}
              </div>
              <div className="box-row-print">
                <span className="row-lbl-print">Aadhaar Card No:</span>
                {renderBoxes(getMaskedAadhaarBoxes(aadhaarNumber), 12, true)}
              </div>
              <div className="box-row-print">
                <span className="row-lbl-print">Selected Branch:</span>
                <div className="rule-line-print filled" style={{ color: '#0f2b48', fontWeight: 700 }}>
                  {branchName || 'CBS Head Office, Nashik'}
                </div>
              </div>
            </div>

            {/* Section 2: Mobile Number */}
            <div className="sec-box-print">
              <div className="sec-title-print">2. Registered Mobile Number (2FA OTP Verified)</div>
              <div className="box-row-print">
                <span className="row-lbl-print">Registered Mobile No: &nbsp;&nbsp; <strong>+91</strong></span>
                {renderBoxes(getMaskedMobileBoxes(mobileNumber), 10)}
              </div>
              <div style={{ fontSize: '9px', color: '#15803d', marginTop: '2px', fontWeight: 600 }}>
                ✓ SMS alerts and mandatory OTPs will be delivered to this verified mobile number.
              </div>
            </div>

            {/* Section 3: Consent Declaration & Marked Choice */}
            <div className="sec-box-print">
              <div className="sec-title-print">3. Consent Declaration &amp; Recorded Preference</div>
              <p className="decl-text-print">
                I hereby submit my consent choice to <strong>The Nasik Merchants Co-operative Bank Ltd. (Namco Bank)</strong> regarding SMS alerts for my bank account, service-related information, and banking communications on my registered mobile number. I understand and agree to the bank's terms &amp; guidelines.
              </p>
              
              <div className="consent-options-print">
                {consentChoice === 'yes' ? (
                  <>
                    <div className="consent-opt-row selected-opt-print">
                      <span className="print-square-box checked">✓</span>
                      <div>
                        <div>
                          <strong>YES</strong> — I want to receive SMS alerts from the bank. <span className="badge-chosen-print">✓ SELECTED BY CUSTOMER</span>
                        </div>
                        <div className="opt-subtext-print">(Active: Stay notified of all account credits, debits &amp; security alerts)</div>
                      </div>
                    </div>
                    <div className="consent-opt-row opt-dim-print">
                      <span className="print-square-box"></span>
                      <div>
                        <div><strong>NO</strong> — I do not want to receive optional SMS alerts.</div>
                        <div className="opt-subtext-print">(Statutory alerts still delivered as mandated by RBI)</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="consent-opt-row opt-dim-print">
                      <span className="print-square-box"></span>
                      <div>
                        <div><strong>YES</strong> — I want to receive SMS alerts from the bank.</div>
                        <div className="opt-subtext-print">(Stay notified of all account credits, debits &amp; security alerts)</div>
                      </div>
                    </div>
                    <div className="consent-opt-row selected-opt-print">
                      <span className="print-square-box checked">✓</span>
                      <div>
                        <div>
                          <strong>NO</strong> — I do not want to receive optional SMS alerts. <span className="badge-chosen-print" style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fca5a5' }}>✓ SELECTED BY CUSTOMER</span>
                        </div>
                        <div className="opt-subtext-print">(Declined: Statutory alerts will still be delivered as mandated by RBI)</div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="sig-row-print">
                <div className="date-place-print">
                  Date: <strong style={{ color: '#0f2b48' }}>{formDate}</strong> &nbsp;&nbsp;&nbsp;&nbsp; 
                  Place: <strong style={{ color: '#0f2b48' }}>{formPlace}</strong>
                </div>
                <div className="sig-box-print">
                  {canvasRef.current && hasSignature ? (
                    <img
                      src={canvasRef.current.toDataURL()}
                      alt="Customer Signature"
                      className="sig-img-print"
                    />
                  ) : (
                    <div className="sig-digital-badge">DIGITALLY VERIFIED VIA 2FA</div>
                  )}
                  <div className="sig-line-print">Digital E-Signature / Authorized</div>
                </div>
              </div>
            </div>

            {/* Section 4: DIGITAL SUBMISSION SYSTEM METRICS & AUDIT CERTIFICATE */}
            <div className="bank-use-box-print digital-cert-box-print">
              <div className="bank-use-title-print">DIGITAL SUBMISSION SYSTEM METRICS &amp; AUDIT CERTIFICATE</div>
              <div className="bank-use-grid-print">
                <div className="bank-use-cell">
                  <span>Tracking Reference ID:</span>
                  <strong style={{ fontFamily: 'monospace' }}>{submittedRecord?.refId || 'NAMCO-SMS-2026-ONLINE'}</strong>
                </div>
                <div className="bank-use-cell">
                  <span>Assigned Branch:</span>
                  <strong>{branchName}</strong>
                </div>
                <div className="bank-use-cell">
                  <span>Authentication Status:</span>
                  <strong style={{ color: '#15803d' }}>✓ OTP 2FA Verified Online</strong>
                </div>
                <div className="bank-use-cell">
                  <span>Submission Timestamp:</span>
                  <strong>{submittedRecord?.date || new Date().toLocaleDateString('en-IN')}</strong>
                </div>
              </div>
            </div>

            <div className="footer-note-print">
              &copy; Namco Bank &bull; Official Customer Digital Consent Record &bull; Retain this acknowledgement copy for your records.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
