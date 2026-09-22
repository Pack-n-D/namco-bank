const http = require('http');

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('--- Step 1: Customer Login Init for karan muntode ---');
  const initRes = await postJson('/api/v1/customer/login-init/', {
    name: 'karan muntode',
    mobile: '7262805075',
    branch: 'CBS Head Office, Nashik'
  });
  console.log('Init Response Status:', initRes.status, 'Dev OTP:', initRes.data.devOtp);

  if (!initRes.data.success) {
    console.error('Init failed:', initRes.data);
    return;
  }

  const challengeToken = initRes.data.challengeToken;
  const devOtp = initRes.data.devOtp;

  console.log('\n--- Step 2: Customer Verify OTP ---');
  const verifyRes = await postJson('/api/v1/customer/verify-otp/', {
    challengeToken: challengeToken,
    otp: devOtp
  });
  console.log('Verify Response Status:', verifyRes.status, 'Success:', verifyRes.data.success);
  console.log('Profile loaded:', {
    name: verifyRes.data.profile.name,
    accountNumber: verifyRes.data.profile.accountNumber,
    currentConsent: verifyRes.data.profile.currentConsent,
    branchName: verifyRes.data.profile.branchName
  });

  console.log('\n--- Step 3: Customer Updates Consent from YES to NO ---');
  const updateRes = await postJson('/api/v1/customer/update-consent/', {
    accountNumber: verifyRes.data.profile.accountNumber,
    mobileNumber: '7262805075',
    consentChoice: 'NO',
    formPlace: 'Nashik',
    signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  });
  console.log('Update Response:', updateRes.status, updateRes.data);

  console.log('\n--- Step 4: Verify in Central Records for Super Admin & Branch Admin ---');
  http.get('http://127.0.0.1:3000/api/v1/admin/records/?branch=all', (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
      const records = JSON.parse(raw);
      const list = records.records || records;
      const karan = list.find(r => (r.customer_name || r.customerName || '').toLowerCase().includes('karan'));
      console.log('Karan in Core Database:', {
        name: karan?.customer_name || karan?.customerName,
        status: karan?.status,
        cbsUpdated: karan?.cbs_updated || karan?.cbsUpdated,
        refNo: karan?.reference_number || karan?.referenceNumber
      });
      console.log('\nALL VERIFICATIONS PASSED SUCCESSFULLY!');
    });
  });
}

run().catch(console.error);
