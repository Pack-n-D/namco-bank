/**
 * Namco Bank - SMS Alert Registration / Consent Form
 * Clean & Lightweight JavaScript Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const form = document.getElementById('smsConsentForm');
  const customerNameInput = document.getElementById('customerName');
  const accountNumberInput = document.getElementById('accountNumber');
  const customerCifInput = document.getElementById('customerCif');
  const branchNameInput = document.getElementById('branchName');
  const mobileNumberInput = document.getElementById('mobileNumber');
  const formDateInput = document.getElementById('formDate');
  const formPlaceInput = document.getElementById('formPlace');

  // Signature Canvas
  const canvas = document.getElementById('signatureCanvas');
  const ctx = canvas.getContext('2d');
  const sigPlaceholder = document.getElementById('sigPlaceholder');
  const clearSigBtn = document.getElementById('clearSigBtn');

  // Print & Modal Elements
  const printBtn = document.getElementById('printBtn');
  const successModal = document.getElementById('successModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalDoneBtn = document.getElementById('modalDoneBtn');
  const printSlipBtn = document.getElementById('printSlipBtn');

  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  formDateInput.value = today;

  // Initialize Canvas
  let isDrawing = false;
  let hasSigned = false;

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 130;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e3a5f';
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function getCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function startDraw(e) {
    isDrawing = true;
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    sigPlaceholder.style.display = 'none';
    hasSigned = true;
  }

  function draw(e) {
    if (!isDrawing) return;
    if (e.cancelable) e.preventDefault();
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function stopDraw() {
    isDrawing = false;
  }

  // Mouse & Touch events
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDraw);
  canvas.addEventListener('mouseleave', stopDraw);

  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDraw);

  clearSigBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    sigPlaceholder.style.display = 'block';
    hasSigned = false;
  });

  // Account Number & Mobile formatting
  accountNumberInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16);
  });

  mobileNumberInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
  });

  customerCifInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 12);
  });

  // Print button
  printBtn.addEventListener('click', () => {
    window.print();
  });

  // Form Submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = customerNameInput.value.trim();
    const accNo = accountNumberInput.value.trim();
    const cif = customerCifInput.value.trim();
    const branch = branchNameInput.value.trim();
    const mobile = mobileNumberInput.value.trim();
    const consent = document.querySelector('input[name="consentChoice"]:checked').value;
    const dateVal = formDateInput.value;
    const placeVal = formPlaceInput.value.trim();

    if (!name) {
      alert('Please enter the customer full name.');
      customerNameInput.focus();
      return;
    }
    if (!accNo || accNo.length < 8) {
      alert('Please enter a valid bank account number.');
      accountNumberInput.focus();
      return;
    }
    if (!cif) {
      alert('Please enter Customer ID (CIF).');
      customerCifInput.focus();
      return;
    }
    if (!branch) {
      alert('Please enter the Branch Name.');
      branchNameInput.focus();
      return;
    }
    if (!mobile || mobile.length !== 10) {
      alert('Please enter a valid 10-digit registered mobile number.');
      mobileNumberInput.focus();
      return;
    }
    if (!hasSigned) {
      alert('Please provide customer signature in the signature box before submitting.');
      return;
    }

    // Generate clean reference number
    const randId = Math.floor(10000 + Math.random() * 90000);
    const refNo = `NAMCO-SMS-${new Date().getFullYear()}-${randId}`;

    // Populate Modal
    document.getElementById('modalRefNo').textContent = refNo;
    document.getElementById('modalCustName').textContent = name;
    document.getElementById('modalAccNo').textContent = accNo;
    document.getElementById('modalCif').textContent = cif;
    document.getElementById('modalMobile').textContent = `+91 ${mobile}`;
    document.getElementById('modalStatus').textContent = consent === 'agree' ? 'Agreed to receive SMS Alerts' : 'Opted out of optional SMS alerts';
    document.getElementById('modalDatePlace').textContent = `${dateVal}, ${placeVal}`;

    // Save record to LocalStorage for Admin/Officer desk
    const newRecord = {
      refNo: refNo,
      name: name,
      accNo: accNo,
      cif: cif,
      branch: branch,
      mobile: mobile,
      consent: consent,
      cbsUpdated: document.querySelector('input[name="mobileUpdated"]:checked')?.value || 'Yes',
      verifiedBy: document.getElementById('verifiedBy')?.value || 'Online Consent',
      date: dateVal,
      place: placeVal,
      timestamp: new Date().toISOString()
    };

    try {
      const existing = JSON.parse(localStorage.getItem('namco_sms_records') || '[]');
      existing.unshift(newRecord);
      localStorage.setItem('namco_sms_records', JSON.stringify(existing));
    } catch(err) {
      console.error('Storage error', err);
    }

    successModal.classList.remove('hidden');
  });

  // Modal Handlers
  closeModalBtn.addEventListener('click', () => successModal.classList.add('hidden'));
  modalDoneBtn.addEventListener('click', () => successModal.classList.add('hidden'));
  printSlipBtn.addEventListener('click', () => {
    window.print();
  });
});
