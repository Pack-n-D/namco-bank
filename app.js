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
      const panBoxes = Array(10).fill('<div class="char-box"></div>').join('');
      const aadhaarBoxes = `
        <div style="display:inline-flex;align-items:center;flex-shrink:0;">
          <div class="char-box"></div><div class="char-box"></div><div class="char-box"></div><div class="char-box"></div>
        </div>
        <span style="margin: 0 4px; font-weight: bold; color: #4b5563; flex-shrink: 0;">-</span>
        <div style="display:inline-flex;align-items:center;flex-shrink:0;">
          <div class="char-box"></div><div class="char-box"></div><div class="char-box"></div><div class="char-box"></div>
        </div>
        <span style="margin: 0 4px; font-weight: bold; color: #4b5563; flex-shrink: 0;">-</span>
        <div style="display:inline-flex;align-items:center;flex-shrink:0;">
          <div class="char-box"></div><div class="char-box"></div><div class="char-box"></div><div class="char-box"></div>
        </div>
      `;
      const mobBoxes = Array(10).fill('<div class="char-box"></div>').join('');

      printWin.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Namco Bank - Bank SMS Alert Registration / Consent Form</title>
          <style>
            @page { size: A4 portrait; margin: 6mm 12mm 6mm 12mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 10.5px; line-height: 1.35; padding: 0; margin: 0; background: #fff; }
            .bank-header { text-align: center; border-bottom: 1.5px solid #111827; padding-bottom: 4px; margin-bottom: 6px; }
            .marathi-top-sub { font-size: 12px; color: #831843; font-weight: bold; text-align: center; margin-bottom: 2px; letter-spacing: 0.3px; }
            .logo-img { height: 44px; object-fit: contain; margin: 0 auto 2px auto; display: block; }
            .marathi-title { color: #831843; font-size: 12.5px; font-weight: bold; margin-bottom: 1px; letter-spacing: 0.2px; }
            .english-title { color: #0f2b48; font-size: 13.5px; font-weight: 800; letter-spacing: 0.3px; }
            .sub-title { font-size: 9.5px; color: #4b5563; margin-top: 1px; font-weight: 500; }
            .form-title-main { font-size: 12.5px; font-weight: 800; color: #0f2b48; text-align: center; text-transform: uppercase; margin: 4px 0 1px 0; letter-spacing: 0.5px; }
            .form-subtitle-rbi { font-size: 9px; color: #64748b; text-align: center; margin-bottom: 6px; font-style: italic; }
            .sec-box { border: 1px solid #374151; border-radius: 4px; padding: 6px 10px; margin-bottom: 6px; background: #fff; }
            .sec-title { font-weight: bold; font-size: 10.5px; color: #0f2b48; margin-bottom: 5px; letter-spacing: 0.2px; }
            .box-row { display: flex; align-items: center; margin-bottom: 4px; gap: 8px; flex-wrap: nowrap; }
            .row-lbl { width: 125px; min-width: 125px; flex-shrink: 0; font-size: 10px; font-weight: 600; color: #1f2937; }
            .char-box { width: 18px; height: 20px; border: 1px solid #1f2937; display: inline-flex; align-items: center; justify-content: center; margin-right: 2px; flex-shrink: 0; background: #fff; }
            .char-container { display: inline-flex; align-items: center; flex-wrap: nowrap; }
            .rule-line { border-bottom: 1px dotted #374151; flex: 1; height: 16px; }
            .decl-text { margin: 2px 0 4px 0; font-size: 9.5px; line-height: 1.35; color: #1f2937; }
            .guidelines-list { margin: 0; padding-left: 15px; line-height: 1.3; font-size: 9px; color: #374151; }
            .guidelines-list li { margin-bottom: 1px; }
            .print-square-box { display: inline-block; width: 13px; height: 13px; border: 1.2px solid #111827; border-radius: 2px; flex-shrink: 0; margin-top: 1.5px; background: #fff; }
            .opt-subtext { font-size: 8.5px; color: #4b5563; margin-top: 1px; }
            .dotted-line-inline { display: inline-block; width: 100px; border-bottom: 1px dotted #111827; height: 14px; }
            .bank-use-box { border: 1px dashed #4b5563; border-radius: 4px; padding: 6px 10px; margin-bottom: 5px; background: #fafafa; }
            .bank-use-title { font-weight: bold; font-size: 9.5px; color: #111827; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.3px; }
            .bank-use-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; }
            .bank-use-cell { display: flex; align-items: center; gap: 6px; font-size: 9px; font-weight: 500; color: #111827; }
            .bank-use-cell span { flex-shrink: 0; }
            .footer-note { font-size: 8.5px; color: #6b7280; text-align: center; margin-top: 5px; font-style: italic; }
          </style>
        </head>
        <body>
          <div class="bank-header">
            <div class="marathi-top-sub">दि नाशिक मर्चंटस् को- ऑपरेटिव्ह बँक लि., नाशिक</div>
            <img src="/logo.png" alt="The Nasik Merchants Co-operative Bank Ltd." class="logo-img" onerror="this.style.display='none'" />
            <div class="marathi-title">द नाशिक मर्चंटस् को-ऑपरेटिव्ह बँक लि. (नामको बँक)</div>
            <div class="english-title">THE NASIK MERCHANTS CO-OPERATIVE BANK LTD. (NAMCO BANK)</div>
            <div class="sub-title">Multi-State Scheduled Bank &bull; Head Office: Nashik &bull; Estd. 1949</div>
          </div>
          <div class="form-title-main">BANK SMS ALERT REGISTRATION / CONSENT FORM</div>
          <div class="form-subtitle-rbi">As per Reserve Bank of India (RBI) Guidelines for Electronic Banking Communications</div>

          <div class="sec-box">
            <div class="sec-title">1. Customer Details <span style="font-weight: normal; color: #4b5563; text-transform: none;">(Fill in Capital Letters)</span></div>
            <div class="box-row"><span class="row-lbl">Customer Name:</span><div class="rule-line"></div></div>
            <div class="box-row"><span class="row-lbl">Account No:</span><div class="char-container">${accBoxes}</div></div>
            <div class="box-row"><span class="row-lbl">Customer ID (CIF):</span><div class="char-container">${cifBoxes}</div></div>
            <div class="box-row"><span class="row-lbl">PAN Card No:</span><div class="char-container">${panBoxes}</div></div>
            <div class="box-row"><span class="row-lbl">Aadhaar Card No:</span><div class="char-container">${aadhaarBoxes}</div></div>
            <div class="box-row"><span class="row-lbl">Branch Name:</span><div class="rule-line"></div></div>
          </div>

          <div class="sec-box">
            <div class="sec-title">2. Mobile Number Registration</div>
            <div class="box-row"><span class="row-lbl">Registered Mobile No: &nbsp;&nbsp; <strong>+91</strong></span><div class="char-container">${mobBoxes}</div></div>
            <div style="font-size: 9px; color: #4b5563; margin-top: 2px; font-style: italic;">
              SMS alerts and OTPs will be delivered to this registered mobile number.
            </div>
          </div>

          <div class="sec-box">
            <div class="sec-title">3. Consent Declaration</div>
            <p class="decl-text">
              I hereby submit my consent choice to <strong>The Nasik Merchants Co-operative Bank Ltd. (Namco Bank)</strong> regarding SMS alerts for my bank account, service-related information, and banking communications on my registered mobile number. I understand and agree to the following terms &amp; guidelines:
            </p>
            <ul class="guidelines-list">
              <li>SMS alerts will be sent only to the registered mobile number provided by me.</li>
              <li>I am responsible for informing the bank immediately about any change in my mobile number.</li>
              <li>The bank may charge applicable SMS alert service charges as per its approved rules.</li>
              <li>I may revoke or update this consent at any time online or by submitting a physical request at my branch.</li>
            </ul>
            <div style="margin: 5px 0;">
              <div style="display: flex; align-items: flex-start; gap: 7px; margin-bottom: 4px;">
                <span class="print-square-box"></span>
                <div>
                  <div><strong>YES</strong> — I want to receive SMS alerts from the bank.</div>
                  <div class="opt-subtext">(Recommended: Stay notified of all account credits, debits &amp; security alerts)</div>
                </div>
              </div>
              <div style="display: flex; align-items: flex-start; gap: 7px;">
                <span class="print-square-box"></span>
                <div>
                  <div><strong>NO</strong> — I do not want to receive optional SMS alerts.</div>
                  <div class="opt-subtext">(Note: Critical statutory alerts will still be delivered as mandated by RBI)</div>
                </div>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px;">
              <div style="font-size: 9.5px;">Date: <span class="dotted-line-inline"></span> &nbsp;&nbsp;&nbsp;&nbsp; Place: <span class="dotted-line-inline"></span></div>
              <div style="text-align: center; border-top: 1px solid #111; width: 170px; padding-top: 2px; font-size: 9.5px; font-weight: 600;">Customer Signature</div>
            </div>
          </div>

          <div class="bank-use-box">
            <div class="bank-use-title">FOR BANK USE ONLY</div>
            <div class="bank-use-grid">
              <div class="bank-use-cell"><span>Verified By:</span><div class="rule-line"></div></div>
              <div class="bank-use-cell"><span>Employee ID:</span><div class="rule-line"></div></div>
              <div class="bank-use-cell"><span>Branch Code:</span><div class="rule-line"></div></div>
              <div class="bank-use-cell"><span>Entry Date:</span><div class="rule-line"></div></div>
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

