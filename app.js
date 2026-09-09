/**
 * Namco Bank - Customer SMS Alert Registration & Status Inquiry Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Form Elements
  const form = document.getElementById('smsConsentForm');
  const customerNameInput = document.getElementById('customerName');
  const accountNumberInput = document.getElementById('accountNumber');
  const customerCifInput = document.getElementById('customerCif');
  const branchNameInput = document.getElementById('branchName');
  const mobileNumberInput = document.getElementById('mobileNumber');
  const formDateInput = document.getElementById('formDate');
  const formPlaceInput = document.getElementById('formPlace');

  // Set default date to today
  if (formDateInput) {
    formDateInput.value = new Date().toISOString().split('T')[0];
  }

  // Signature Canvas
  const canvas = document.getElementById('signatureCanvas');
  const ctx = canvas.getContext('2d');
  const sigPlaceholder = document.getElementById('sigPlaceholder');
  const clearSigBtn = document.getElementById('clearSigBtn');
  let isDrawing = false;
  let hasSigned = false;

  // Print & Modal Elements
  const printBtn = document.getElementById('printBtn');
  const downloadBlankBtn = document.getElementById('downloadBlankBtn');
  const successModal = document.getElementById('successModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalDoneBtn = document.getElementById('modalDoneBtn');
  const printSlipBtn = document.getElementById('printSlipBtn');

  // Canvas Drawing
  function setupCanvas() {
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f2b48';
  }
  setupCanvas();

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const prevData = hasSigned ? canvas.toDataURL() : null;
    canvas.width = rect.width;
    canvas.height = 130;
    setupCanvas();
    if (prevData) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = prevData;
    }
  }

  window.addEventListener('resize', resizeCanvas);
  setTimeout(resizeCanvas, 100);

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
    if (sigPlaceholder) sigPlaceholder.style.display = 'none';
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

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDraw);
  canvas.addEventListener('mouseleave', stopDraw);

  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDraw);

  if (clearSigBtn) {
    clearSigBtn.addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (sigPlaceholder) sigPlaceholder.style.display = 'block';
      hasSigned = false;
    });
  }

  // Formatting Restrictions
  accountNumberInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 18);
  });
  mobileNumberInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
  });
  customerCifInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 12);
  });

  // Download Blank Physical Form
  if (downloadBlankBtn) {
    downloadBlankBtn.addEventListener('click', () => {
      const printWin = window.open('', '_blank', 'width=850,height=900');
      if (!printWin) {
        alert('Please allow popups to download/print the blank physical form.');
        return;
      }
      const accBoxes = Array(16).fill('<div class="char-box"></div>').join('');
      const cifBoxes = Array(11).fill('<div class="char-box"></div>').join('');
      const mobBoxes = Array(10).fill('<div class="char-box"></div>').join('');

      printWin.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Namco Bank - Blank Physical SMS Alert Consent Form</title>
          <style>
            @page { size: A4 portrait; margin: 12mm 15mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #111827; font-size: 12px; line-height: 1.4; padding: 0; margin: 0; }
            .bank-header { text-align: center; border-bottom: 2px solid #0f2b48; padding-bottom: 8px; margin-bottom: 12px; }
            .marathi-title { color: #831843; font-size: 15px; font-weight: bold; margin-bottom: 2px; }
            .english-title { color: #0f2b48; font-size: 17px; font-weight: bold; }
            .form-badge { background: #0f2b48; color: #fff; padding: 4px 10px; font-size: 12px; font-weight: bold; text-align: center; text-transform: uppercase; margin: 8px 0 14px 0; border-radius: 3px; }
            .sec-box { border: 1px solid #9ca3af; border-radius: 4px; padding: 10px 12px; margin-bottom: 12px; }
            .sec-title { font-weight: bold; font-size: 12px; color: #0f2b48; margin-bottom: 8px; }
            .box-row { display: flex; align-items: center; margin-bottom: 8px; gap: 8px; }
            .char-box { width: 22px; height: 26px; border: 1px solid #4b5563; display: inline-block; margin-right: 2px; }
            .char-container { display: flex; flex-wrap: wrap; }
            .rule-line { border-bottom: 1px dotted #6b7280; flex: 1; height: 18px; }
            .footer-note { font-size: 10px; color: #6b7280; text-align: center; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="bank-header">
            <div class="marathi-title">द नाशिक मर्चंट्स को-ऑपरेटिव्ह बँक लि. (नामको बँक)</div>
            <div class="english-title">THE NASIK MERCHANTS CO-OPERATIVE BANK LTD. (NAMCO BANK)</div>
            <div style="font-size: 11px; color: #4b5563;">Multi-State Scheduled Bank &bull; Head Office: Nashik</div>
          </div>
          <div class="form-badge">BANK SMS ALERT REGISTRATION / CONSENT FORM</div>
          <div class="sec-box">
            <div class="sec-title">1. CUSTOMER DETAILS (Fill in CAPITAL Letters)</div>
            <div class="box-row"><span>Customer Name:</span><div class="rule-line"></div></div>
            <div class="box-row"><span>Account No:</span><div class="char-container">${accBoxes}</div></div>
            <div class="box-row"><span>Customer ID (CIF):</span><div class="char-container">${cifBoxes}</div></div>
            <div class="box-row"><span>Branch Name:</span><div class="rule-line"></div></div>
          </div>
          <div class="sec-box">
            <div class="sec-title">2. REGISTERED MOBILE NUMBER</div>
            <div class="box-row"><span>Mobile No: <strong>+91</strong></span><div class="char-container">${mobBoxes}</div></div>
          </div>
          <div class="sec-box">
            <div class="sec-title">3. CONSENT DECLARATION</div>
            <p style="margin: 4px 0 8px 0; font-size: 11px;">
              I hereby submit my consent choice regarding SMS alerts on my registered mobile number.
            </p>
            <div style="margin: 8px 0;">
              <div>[ &nbsp; ] <strong>YES</strong> — I agree to receive SMS alerts.</div>
              <div style="margin-top: 4px;">[ &nbsp; ] <strong>NO</strong> — I do not want optional SMS alerts.</div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 25px;">
              <div>Date: __________________ &bull; Place: __________________</div>
              <div style="text-align: center; border-top: 1px solid #111; width: 180px; padding-top: 4px;">Customer Signature</div>
            </div>
          </div>
          <div class="footer-note">&copy; Namco Bank &bull; Customer Copy &bull; Hand over signed form to Branch Officer</div>
        </body>
        </html>
      `);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => { printWin.print(); }, 400);
    });
  }

  // Print button
  if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
  }

  // Form Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = customerNameInput.value.trim();
    const accNo = accountNumberInput.value.trim();
    const cif = customerCifInput.value.trim();
    const branch = branchNameInput.value.trim();
    const mobile = mobileNumberInput.value.trim();
    const consent = document.querySelector('input[name="consentChoice"]:checked')?.value || 'YES';
    const dateVal = formDateInput.value;
    const placeVal = formPlaceInput.value.trim();
    const submitBtn = form.querySelector('button[type="submit"]');

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
      alert('Please select the Bank Branch.');
      branchNameInput.focus();
      return;
    }
    if (!mobile || mobile.length !== 10) {
      alert('Please enter a valid 10-digit registered mobile number.');
      mobileNumberInput.focus();
      return;
    }
    if (!hasSigned) {
      alert('Please provide your digital signature in the signature box before submitting.');
      return;
    }

    const signatureData = canvas.toDataURL('image/png');

    const payload = {
      customerName: name,
      accountNumber: accNo,
      customerCif: cif,
      branchName: branch,
      mobileNumber: mobile,
      consentChoice: consent,
      formDate: dateVal,
      formPlace: placeVal,
      digitalSignature: signatureData
    };

    const origText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳ Registering Consent...</span>';

    try {
      const result = await window.bankApi.submitConsent(payload);

      document.getElementById('modalRefNo').textContent = result.referenceNo || result.refNo;
      document.getElementById('modalCustName').textContent = name;
      document.getElementById('modalAccNo').textContent = accNo;
      document.getElementById('modalCif').textContent = cif;
      document.getElementById('modalMobile').textContent = `+91 ${mobile}`;
      document.getElementById('modalStatus').textContent = consent === 'YES' ? 'YES (Consented)' : 'NO (Declined)';
      document.getElementById('modalStatus').style.color = consent === 'YES' ? '#166534' : '#991b1b';
      document.getElementById('modalBranch').textContent = branch;
      document.getElementById('modalDatePlace').textContent = `${dateVal}, ${placeVal}`;

      successModal.classList.remove('hidden');
    } catch (err) {
      console.error(err);
      alert('Submission response: ' + (err.message || 'Error recording consent.'));
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origText;
    }
  });

  // Modal Close Handlers
  if (closeModalBtn) closeModalBtn.addEventListener('click', () => successModal.classList.add('hidden'));
  if (modalDoneBtn) modalDoneBtn.addEventListener('click', () => successModal.classList.add('hidden'));
  if (printSlipBtn) printSlipBtn.addEventListener('click', () => window.print());
});

