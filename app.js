/**
 * Namco Bank - SMS Alert Consent & Registration Form
 * Interactive Application Logic & Print Handlers
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // 1. Element References
  // ==========================================
  const form = document.getElementById('smsConsentForm');
  const customerNameInput = document.getElementById('customerName');
  const accountNumberInput = document.getElementById('accountNumber');
  const customerCifInput = document.getElementById('customerCif');
  const branchNameSelect = document.getElementById('branchName');
  const accountTypeSelect = document.getElementById('accountType');
  const mobileNumberInput = document.getElementById('mobileNumber');
  const altMobileInput = document.getElementById('altMobileNumber');
  const emailInput = document.getElementById('emailAddress');
  const actionTypeSelect = document.getElementById('actionType');
  const consentCheckbox = document.getElementById('consentCheckbox');
  const submissionDateInput = document.getElementById('submissionDate');
  const submissionPlaceInput = document.getElementById('submissionPlace');
  const bankOfficerNameInput = document.getElementById('bankOfficerName');

  // Summary Card Elements
  const sumCustomerName = document.getElementById('sumCustomerName');
  const sumAccountNo = document.getElementById('sumAccountNo');
  const sumCif = document.getElementById('sumCif');
  const sumMobile = document.getElementById('sumMobile');
  const sumBranch = document.getElementById('sumBranch');
  const sumConsentStatus = document.getElementById('sumConsentStatus');

  // Signature Elements
  const signatureCanvas = document.getElementById('signatureCanvas');
  const canvasPlaceholder = document.getElementById('canvasPlaceholder');
  const clearSignatureBtn = document.getElementById('clearSignatureBtn');
  const sigTabs = document.querySelectorAll('.sig-tab');
  const drawSigTab = document.getElementById('drawSigTab');
  const typeSigTab = document.getElementById('typeSigTab');
  const uploadSigTab = document.getElementById('uploadSigTab');
  const typedSignatureInput = document.getElementById('typedSignatureInput');
  const typedSignaturePreview = document.getElementById('typedSignaturePreview');
  const sigFileInput = document.getElementById('sigFileInput');
  const sigDropzone = document.getElementById('sigDropzone');
  const uploadedSigPreviewContainer = document.getElementById('uploadedSigPreviewContainer');
  const uploadedSigImg = document.getElementById('uploadedSigImg');
  const removeUploadedSigBtn = document.getElementById('removeUploadedSigBtn');

  // Modals & Triggers
  const otpModal = document.getElementById('otpModal');
  const verifyOtpBtn = document.getElementById('verifyOtpBtn');
  const closeOtpModalBtn = document.getElementById('closeOtpModalBtn');
  const resendOtpBtn = document.getElementById('resendOtpBtn');
  const confirmOtpBtn = document.getElementById('confirmOtpBtn');
  const otpDigits = document.querySelectorAll('.otp-digit');
  const generatedOtpCodeElem = document.getElementById('generatedOtpCode');
  const otpTargetMobile = document.getElementById('otpTargetMobile');
  const otpErrorMsg = document.getElementById('otpErrorMsg');
  const otpVerifiedBadge = document.getElementById('otpVerifiedBadge');

  const receiptModal = document.getElementById('receiptModal');
  const closeReceiptModalBtn = document.getElementById('closeReceiptModalBtn');
  const closeReceiptBtn2 = document.getElementById('closeReceiptBtn2');
  const printReceiptBtn = document.getElementById('printReceiptBtn');

  const fullFormPrintModal = document.getElementById('fullFormPrintModal');
  const previewFormBtn = document.getElementById('previewFormBtn');
  const closeFullPrintModalBtn = document.getElementById('closeFullPrintModalBtn');
  const closeFullPrintModalBtn2 = document.getElementById('closeFullPrintModalBtn2');
  const printFullFormBtn = document.getElementById('printFullFormBtn');
  const printBlankFormBtn = document.getElementById('printBlankFormBtn');
  const fillSampleDataBtn = document.getElementById('fillSampleDataBtn');

  // Officer Portal
  const toggleOfficerModeBtn = document.getElementById('toggleOfficerModeBtn');
  const officerPortalSection = document.getElementById('officerPortalSection');
  const closeOfficerViewBtn = document.getElementById('closeOfficerViewBtn');
  const submissionsTableBody = document.getElementById('submissionsTableBody');
  const totalSubmissionsCount = document.getElementById('totalSubmissionsCount');
  const pendingVerificationCount = document.getElementById('pendingVerificationCount');
  const cbsUpdatedCount = document.getElementById('cbsUpdatedCount');

  // Toast
  const toastNotification = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');

  // Application State
  let currentActiveSigMode = 'draw'; // 'draw' | 'type' | 'upload'
  let isCanvasEmpty = true;
  let isOtpVerified = false;
  let currentOtp = '7492';
  let uploadedSigDataUrl = '';

  // LocalStorage Key
  const STORAGE_KEY = 'namco_bank_sms_consent_records';

  // ==========================================
  // 2. Initialize Date & Current Time
  // ==========================================
  const now = new Date();
  const todayISO = now.toISOString().split('T')[0];
  submissionDateInput.value = todayISO;

  const formattedHeaderDate = now.toLocaleDateString('en-IN', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  document.getElementById('currentDateDisplay').textContent = formattedHeaderDate;

  // ==========================================
  // 3. Canvas Signature Pad Setup
  // ==========================================
  const ctx = signatureCanvas.getContext('2d');
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  function resizeCanvas() {
    const rect = signatureCanvas.parentElement.getBoundingClientRect();
    signatureCanvas.width = rect.width;
    signatureCanvas.height = 160;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0e294b';
  }

  // Initial resize and listen for window resizing
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function getCanvasCoords(e) {
    const rect = signatureCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function startDrawing(e) {
    isDrawing = true;
    const coords = getCanvasCoords(e);
    lastX = coords.x;
    lastY = coords.y;
    canvasPlaceholder.classList.add('hidden');
    isCanvasEmpty = false;
    updateSummary();
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const coords = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    lastX = coords.x;
    lastY = coords.y;
  }

  function stopDrawing() {
    isDrawing = false;
  }

  // Mouse & Touch Listeners for Signature Canvas
  signatureCanvas.addEventListener('mousedown', startDrawing);
  signatureCanvas.addEventListener('mousemove', draw);
  signatureCanvas.addEventListener('mouseup', stopDrawing);
  signatureCanvas.addEventListener('mouseleave', stopDrawing);

  signatureCanvas.addEventListener('touchstart', startDrawing, { passive: false });
  signatureCanvas.addEventListener('touchmove', draw, { passive: false });
  signatureCanvas.addEventListener('touchend', stopDrawing);

  clearSignatureBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    canvasPlaceholder.classList.remove('hidden');
    isCanvasEmpty = true;
    updateSummary();
  });

  // ==========================================
  // 4. Signature Tabs Switching
  // ==========================================
  sigTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sigTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const target = tab.dataset.tab;
      currentActiveSigMode = target;

      drawSigTab.classList.add('hidden');
      typeSigTab.classList.add('hidden');
      uploadSigTab.classList.add('hidden');

      if (target === 'draw') {
        drawSigTab.classList.remove('hidden');
      } else if (target === 'type') {
        typeSigTab.classList.remove('hidden');
      } else if (target === 'upload') {
        uploadSigTab.classList.remove('hidden');
      }
      updateSummary();
    });
  });

  typedSignatureInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    typedSignaturePreview.textContent = val || 'Your Signature Here';
    updateSummary();
  });

  sigFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(evt) {
        uploadedSigDataUrl = evt.target.result;
        uploadedSigImg.src = uploadedSigDataUrl;
        sigDropzone.classList.add('hidden');
        uploadedSigPreviewContainer.classList.remove('hidden');
        updateSummary();
      };
      reader.readAsDataURL(file);
    }
  });

  removeUploadedSigBtn.addEventListener('click', () => {
    uploadedSigDataUrl = '';
    sigFileInput.value = '';
    sigDropzone.classList.remove('hidden');
    uploadedSigPreviewContainer.classList.add('hidden');
    updateSummary();
  });

  // ==========================================
  // 5. Live Summary Sync & Input Formatting
  // ==========================================
  function getSignatureDataUrl() {
    if (currentActiveSigMode === 'draw') {
      if (isCanvasEmpty) return null;
      return signatureCanvas.toDataURL('image/png');
    } else if (currentActiveSigMode === 'type') {
      const name = typedSignatureInput.value.trim() || customerNameInput.value.trim();
      if (!name) return null;
      // Generate canvas representation of typed signature
      const offCanvas = document.createElement('canvas');
      offCanvas.width = 400;
      offCanvas.height = 100;
      const offCtx = offCanvas.getContext('2d');
      offCtx.font = "italic 32px 'Brush Script MT', 'Dancing Script', cursive, sans-serif";
      offCtx.fillStyle = "#0e294b";
      offCtx.textAlign = "center";
      offCtx.textBaseline = "middle";
      offCtx.fillText(name, 200, 50);
      return offCanvas.toDataURL('image/png');
    } else if (currentActiveSigMode === 'upload') {
      return uploadedSigDataUrl || null;
    }
    return null;
  }

  function updateSummary() {
    sumCustomerName.textContent = customerNameInput.value.trim() || '--';
    sumAccountNo.textContent = accountNumberInput.value.trim() || '--';
    sumCif.textContent = customerCifInput.value.trim() || '--';
    
    const mob = mobileNumberInput.value.trim();
    sumMobile.textContent = mob ? `+91 ${mob}` : '--';
    sumBranch.textContent = branchNameSelect.value || '--';

    const hasSig = !!getSignatureDataUrl();
    const isAgreed = consentCheckbox.checked;

    if (isAgreed && hasSig) {
      sumConsentStatus.innerHTML = '<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Authorized & Ready</span>';
    } else if (isAgreed) {
      sumConsentStatus.innerHTML = '<span class="badge badge-warning"><i class="fa-solid fa-pen-nib"></i> Signature Needed</span>';
    } else {
      sumConsentStatus.innerHTML = '<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> Consent Pending</span>';
    }
  }

  // Inputs event listener
  [customerNameInput, accountNumberInput, customerCifInput, mobileNumberInput, branchNameSelect, accountTypeSelect, consentCheckbox].forEach(el => {
    el.addEventListener('input', updateSummary);
    el.addEventListener('change', updateSummary);
  });

  // Account Number Formatting (digits only)
  accountNumberInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16);
  });

  // Mobile Number Formatting (10 digits only)
  mobileNumberInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    isOtpVerified = false;
    otpVerifiedBadge.classList.add('hidden');
  });

  // Customer CIF Formatting
  customerCifInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 12);
  });

  // Auto-sync typed signature input with customer name if empty
  customerNameInput.addEventListener('input', (e) => {
    if (!typedSignatureInput.value.trim()) {
      typedSignaturePreview.textContent = e.target.value || 'Your Signature Here';
    }
  });

  // ==========================================
  // 6. OTP Verification Simulation
  // ==========================================
  function generateNewOtp() {
    currentOtp = Math.floor(1000 + Math.random() * 9000).toString();
    generatedOtpCodeElem.textContent = currentOtp;
    otpDigits.forEach(d => d.value = '');
    otpErrorMsg.classList.add('hidden');
  }

  verifyOtpBtn.addEventListener('click', () => {
    const mob = mobileNumberInput.value.trim();
    if (mob.length !== 10) {
      showToast('Please enter a valid 10-digit mobile number first', 'error');
      mobileNumberInput.focus();
      return;
    }
    otpTargetMobile.textContent = `+91 ${mob}`;
    generateNewOtp();
    otpModal.classList.remove('hidden');
    setTimeout(() => otpDigits[0].focus(), 150);
  });

  closeOtpModalBtn.addEventListener('click', () => {
    otpModal.classList.add('hidden');
  });

  resendOtpBtn.addEventListener('click', () => {
    generateNewOtp();
    showToast('New simulated OTP code generated: ' + currentOtp);
  });

  // Auto-advance OTP input digits
  otpDigits.forEach((digit, idx) => {
    digit.addEventListener('input', (e) => {
      digit.value = digit.value.replace(/\D/g, '');
      if (digit.value && idx < otpDigits.length - 1) {
        otpDigits[idx + 1].focus();
      }
    });

    digit.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !digit.value && idx > 0) {
        otpDigits[idx - 1].focus();
      }
    });
  });

  confirmOtpBtn.addEventListener('click', () => {
    let enteredCode = '';
    otpDigits.forEach(d => enteredCode += d.value);

    if (enteredCode === currentOtp) {
      isOtpVerified = true;
      otpModal.classList.add('hidden');
      otpVerifiedBadge.classList.remove('hidden');
      showToast('Mobile number successfully verified via OTP!');
    } else {
      otpErrorMsg.classList.remove('hidden');
    }
  });

  // ==========================================
  // 7. Populate A4 Printable Form Template
  // ==========================================
  function populateA4SheetData() {
    const cName = customerNameInput.value.trim() || '__________________________________';
    const accNo = accountNumberInput.value.trim() || '__________________';
    const cif = customerCifInput.value.trim() || '____________';
    const branch = branchNameSelect.value || '________________________';
    const accType = accountTypeSelect.value || 'Savings Bank Account';
    const mob = mobileNumberInput.value.trim() ? `+91 ${mobileNumberInput.value.trim()}` : '+91 ____________________';
    const reqType = actionTypeSelect.value || 'New Registration';
    const email = emailInput.value.trim() || '______________________________';
    const altMob = altMobileInput.value.trim() || '________________';
    const dateVal = submissionDateInput.value || todayISO;
    const placeVal = submissionPlaceInput.value.trim() || 'Nashik';
    const verifiedBy = bankOfficerNameInput.value.trim() || 'CBS Branch Incharge';

    document.getElementById('a4CustName').textContent = cName;
    document.getElementById('a4AccNo').textContent = accNo;
    document.getElementById('a4Cif').textContent = cif;
    document.getElementById('a4Branch').textContent = branch;
    document.getElementById('a4AccType').textContent = accType;
    document.getElementById('a4Mobile').textContent = mob;
    document.getElementById('a4ReqType').textContent = reqType;
    document.getElementById('a4Email').textContent = email;
    document.getElementById('a4AltMobile').textContent = altMob;
    document.getElementById('a4Date').textContent = dateVal;
    document.getElementById('a4Place').textContent = placeVal;
    document.getElementById('a4VerifiedBy').textContent = verifiedBy;

    // Signature preview in A4 Sheet
    const sigData = getSignatureDataUrl();
    const sigBox = document.getElementById('a4CustomerSigBox');
    if (sigData) {
      sigBox.innerHTML = `<img src="${sigData}" alt="Customer Signature">`;
    } else {
      sigBox.innerHTML = `<span class="a4-sig-text">(Signature of Customer)</span>`;
    }
  }

  previewFormBtn.addEventListener('click', () => {
    populateA4SheetData();
    fullFormPrintModal.classList.remove('hidden');
  });

  closeFullPrintModalBtn.addEventListener('click', () => fullFormPrintModal.classList.add('hidden'));
  closeFullPrintModalBtn2.addEventListener('click', () => fullFormPrintModal.classList.add('hidden'));

  printFullFormBtn.addEventListener('click', () => {
    populateA4SheetData();
    window.print();
  });

  printBlankFormBtn.addEventListener('click', () => {
    // Fill placeholder blanks for clean physical printing
    document.getElementById('a4CustName').textContent = '____________________________________________________';
    document.getElementById('a4AccNo').textContent = '________________________';
    document.getElementById('a4Cif').textContent = '________________________';
    document.getElementById('a4Branch').textContent = '________________________';
    document.getElementById('a4AccType').textContent = 'Savings / Current / CC';
    document.getElementById('a4Mobile').textContent = '+91 ____________________';
    document.getElementById('a4ReqType').textContent = 'New Registration / Update';
    document.getElementById('a4Email').textContent = '__________________________________';
    document.getElementById('a4AltMobile').textContent = '____________________';
    document.getElementById('a4Date').textContent = '____ / ____ / ________';
    document.getElementById('a4Place').textContent = '____________________';
    document.getElementById('a4CustomerSigBox').innerHTML = '<span class="a4-sig-text">(Customer Signature)</span>';

    fullFormPrintModal.classList.remove('hidden');
    setTimeout(() => {
      window.print();
    }, 300);
  });

  // ==========================================
  // 8. Sample Data Loader
  // ==========================================
  fillSampleDataBtn.addEventListener('click', () => {
    customerNameInput.value = 'Ramesh Shankar Patil';
    accountNumberInput.value = '001010100049281';
    customerCifInput.value = '10928472';
    branchNameSelect.value = 'CBS Head Office Branch, Nashik';
    accountTypeSelect.value = 'Savings Bank Account';
    mobileNumberInput.value = '9822012345';
    altMobileInput.value = '02532570000';
    emailInput.value = 'ramesh.patil.nsk@example.com';
    consentCheckbox.checked = true;
    submissionPlaceInput.value = 'Nashik';
    
    // Draw sample signature onto canvas
    ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    canvasPlaceholder.classList.add('hidden');
    isCanvasEmpty = false;
    
    ctx.beginPath();
    ctx.moveTo(80, 80);
    ctx.bezierCurveTo(120, 40, 160, 120, 200, 70);
    ctx.bezierCurveTo(240, 60, 260, 110, 310, 75);
    ctx.lineTo(340, 75);
    ctx.moveTo(90, 110);
    ctx.lineTo(350, 105);
    ctx.stroke();

    isOtpVerified = true;
    otpVerifiedBadge.classList.remove('hidden');

    updateSummary();
    showToast('Loaded sample customer data for Namco Bank!');
  });

  // ==========================================
  // 9. Form Submission Handler
  // ==========================================
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    // Validation
    const cName = customerNameInput.value.trim();
    const accNo = accountNumberInput.value.trim();
    const cif = customerCifInput.value.trim();
    const branch = branchNameSelect.value;
    const mob = mobileNumberInput.value.trim();
    const agreed = consentCheckbox.checked;
    const sigData = getSignatureDataUrl();

    if (!cName) {
      showToast('Please enter Customer Full Name', 'error');
      customerNameInput.focus();
      return;
    }
    if (!accNo || accNo.length < 10) {
      showToast('Please enter a valid Account Number (min 10-15 digits)', 'error');
      accountNumberInput.focus();
      return;
    }
    if (!cif) {
      showToast('Please enter Customer ID (CIF Number)', 'error');
      customerCifInput.focus();
      return;
    }
    if (!branch) {
      showToast('Please select Home Branch', 'error');
      branchNameSelect.focus();
      return;
    }
    if (!mob || mob.length !== 10) {
      showToast('Please enter valid 10-digit Mobile Number', 'error');
      mobileNumberInput.focus();
      return;
    }
    if (!agreed) {
      showToast('Please check the customer consent agreement box', 'error');
      consentCheckbox.focus();
      return;
    }
    if (!sigData) {
      showToast('Please provide your digital signature before submitting', 'error');
      return;
    }

    // Generate Reference Number
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const refNumber = `NAMCO/SMS/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${randomSuffix}`;
    const submitTimeStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    // Populate Receipt Modal
    document.getElementById('receiptRefNo').textContent = refNumber;
    document.getElementById('receiptDateTime').textContent = submitTimeStr;
    document.getElementById('receiptCustName').textContent = cName;
    document.getElementById('receiptAccNo').textContent = accNo;
    document.getElementById('receiptCif').textContent = cif;
    document.getElementById('receiptMobile').textContent = `+91 ${mob}`;
    document.getElementById('receiptBranch').textContent = branch;

    const receiptSigContainer = document.getElementById('receiptCustomerSigContainer');
    receiptSigContainer.innerHTML = `<img src="${sigData}" alt="Customer Signature">`;

    // Save to LocalStorage for Officer desk
    const newRecord = {
      refNumber,
      customerName: cName,
      accountNo: accNo,
      cif,
      branch,
      mobile: mob,
      submittedOn: submitTimeStr,
      status: 'Pending Verification',
      verifiedBy: bankOfficerNameInput.value.trim() || 'Branch Officer'
    };
    saveRecord(newRecord);

    // Show Receipt Modal
    receiptModal.classList.remove('hidden');
    showToast('Consent Form successfully registered!');
  });

  closeReceiptModalBtn.addEventListener('click', () => receiptModal.classList.add('hidden'));
  closeReceiptBtn2.addEventListener('click', () => receiptModal.classList.add('hidden'));

  printReceiptBtn.addEventListener('click', () => {
    window.print();
  });

  // ==========================================
  // 10. LocalStorage & Officer Desk
  // ==========================================
  function getStoredRecords() {
    try {
      const records = localStorage.getItem(STORAGE_KEY);
      return records ? JSON.parse(records) : [];
    } catch {
      return [];
    }
  }

  function saveRecord(record) {
    const list = getStoredRecords();
    list.unshift(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    renderOfficerTable();
  }

  function renderOfficerTable() {
    const list = getStoredRecords();
    totalSubmissionsCount.textContent = list.length;
    
    let pending = 0;
    let updated = 0;

    if (list.length === 0) {
      submissionsTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center empty-state">No submissions yet. Submit a form to populate records.</td>
        </tr>
      `;
      pendingVerificationCount.textContent = 0;
      cbsUpdatedCount.textContent = 0;
      return;
    }

    let rowsHtml = '';
    list.forEach((rec, idx) => {
      if (rec.status === 'Pending Verification') pending++;
      if (rec.status === 'CBS Updated') updated++;

      const statusBadge = rec.status === 'CBS Updated'
        ? '<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> CBS Updated</span>'
        : '<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> Pending</span>';

      rowsHtml += `
        <tr>
          <td class="mono-font font-bold">${rec.refNumber}</td>
          <td><strong>${rec.customerName}</strong></td>
          <td class="mono-font">${rec.accountNo}</td>
          <td class="mono-font">+91 ${rec.mobile}</td>
          <td>${rec.branch}</td>
          <td>${rec.submittedOn}</td>
          <td>${statusBadge}</td>
          <td>
            ${rec.status !== 'CBS Updated' 
              ? `<button class="btn btn-primary btn-sm" onclick="window.markCbsUpdated(${idx})"><i class="fa-solid fa-check"></i> Update CBS</button>`
              : `<span class="text-muted" style="font-size:0.75rem;"><i class="fa-solid fa-circle-check text-success"></i> Done</span>`
            }
          </td>
        </tr>
      `;
    });

    pendingVerificationCount.textContent = pending;
    cbsUpdatedCount.textContent = updated;
    submissionsTableBody.innerHTML = rowsHtml;
  }

  window.markCbsUpdated = function(index) {
    const list = getStoredRecords();
    if (list[index]) {
      list[index].status = 'CBS Updated';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      renderOfficerTable();
      showToast(`Record ${list[index].refNumber} marked as CBS Updated!`);
    }
  };

  toggleOfficerModeBtn.addEventListener('click', () => {
    officerPortalSection.classList.toggle('hidden');
    if (!officerPortalSection.classList.contains('hidden')) {
      officerPortalSection.scrollIntoView({ behavior: 'smooth' });
    }
    renderOfficerTable();
  });

  closeOfficerViewBtn.addEventListener('click', () => {
    officerPortalSection.classList.add('hidden');
  });

  // Initial table render
  renderOfficerTable();

  // ==========================================
  // 11. Toast Notification Helper
  // ==========================================
  let toastTimer;
  function showToast(msg, type = 'success') {
    clearTimeout(toastTimer);
    toastMessage.textContent = msg;
    const icon = toastNotification.querySelector('.toast-icon');
    
    if (type === 'error') {
      icon.className = 'fa-solid fa-circle-exclamation toast-icon';
      icon.style.color = '#f87171';
    } else {
      icon.className = 'fa-solid fa-circle-check toast-icon';
      icon.style.color = '#34d399';
    }

    toastNotification.classList.remove('hidden');
    toastTimer = setTimeout(() => {
      toastNotification.classList.add('hidden');
    }, 3500);
  }

});
