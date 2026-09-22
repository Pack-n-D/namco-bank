const http = require('http');

function postJson(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
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

function getJson(path, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({
      hostname: '127.0.0.1',
      port: 3000,
      path: path,
      headers: headers
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
    }).on('error', reject);
  });
}

function patchJson(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path: path,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
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

async function runSyncVerification() {
  console.log('========================================================================');
  console.log('SYNC VERIFICATION TEST: SUPER ADMIN, BRANCH ADMIN, & DLT PARTNER');
  console.log('========================================================================\n');

  const adminHeaders = { 'Authorization': 'Bearer namco_sec_token_admin_super', 'X-Namco-Officer-User': 'admin' };
  const dltHeaders = { 'Authorization': 'Bearer namco_sec_token_dlt', 'X-Namco-Officer-User': 'dltpartner' };
  const officerHeaders = { 'Authorization': 'Bearer namco_sec_token_officer', 'X-Namco-Officer-User': 'officer' };

  // Step 1: Query initial counts across all dashboards
  const adminRecInit = await getJson('/api/v1/admin/records/?officer_user=admin', adminHeaders);
  const dltRecInit = await getJson('/api/v1/admin/records/?officer_user=dltpartner', dltHeaders);
  const branchAllRecInit = await getJson('/api/v1/admin/records/?officer_user=officer&branch=all', officerHeaders);

  console.log(`Initial Counts:`);
  console.log(`- Super Admin Records Count:   ${adminRecInit.data.count}`);
  console.log(`- DLT Partner Records Count:   ${dltRecInit.data.count}`);
  console.log(`- Branch Admin (All) Count:    ${branchAllRecInit.data.count}`);

  if (adminRecInit.data.count !== dltRecInit.data.count || adminRecInit.data.count !== branchAllRecInit.data.count) {
    throw new Error('Initial count mismatch between dashboards!');
  }
  console.log('✔ Initial counts are 100% in sync across Super Admin, DLT, and Branch Admin!\n');

  // Step 2: Create a new customer consent submission
  const testAcc = '5010099' + Math.floor(100000 + Math.random() * 900000);
  const testMob = '98' + Math.floor(10000000 + Math.random() * 90000000);
  const testName = 'Sync Test Customer ' + Date.now().toString().slice(-4);

  console.log(`Submitting new customer consent: ${testName} (Acc: ${testAcc}, Mob: ${testMob})...`);
  const submitRes = await postJson('/api/v1/consent/submit/', {
    name: testName,
    accNo: testAcc,
    cif: 'CIF888999',
    mobile: testMob,
    branch: 'Gangapur Road Branch, Nashik',
    consent: 'YES',
    date: '2026-09-22',
    place: 'Nashik'
  });

  console.log('Submission status:', submitRes.status, 'Ref:', submitRes.data.refNo || submitRes.data.referenceNumber);
  const newRef = submitRes.data.refNo || submitRes.data.referenceNumber;

  // Step 3: Verify all 3 dashboards immediately see this record
  const adminRecAfter = await getJson('/api/v1/admin/records/?officer_user=admin', adminHeaders);
  const dltRecAfter = await getJson('/api/v1/admin/records/?officer_user=dltpartner', dltHeaders);
  const branchAllAfter = await getJson('/api/v1/admin/records/?officer_user=officer&branch=all', officerHeaders);

  console.log(`\nCounts After New Submission:`);
  console.log(`- Super Admin Records Count:   ${adminRecAfter.data.count}`);
  console.log(`- DLT Partner Records Count:   ${dltRecAfter.data.count}`);
  console.log(`- Branch Admin (All) Count:    ${branchAllAfter.data.count}`);

  const foundInAdmin = adminRecAfter.data.data.find(r => r.refNo === newRef);
  const foundInDlt = dltRecAfter.data.data.find(r => r.refNo === newRef);
  const foundInBranch = branchAllAfter.data.data.find(r => r.refNo === newRef);

  console.log(`- Found in Super Admin:        ${foundInAdmin ? 'YES (' + foundInAdmin.customerName + ')' : 'NO'}`);
  console.log(`- Found in DLT Partner:        ${foundInDlt ? 'YES (' + foundInDlt.customerName + ', ' + foundInDlt.mobile + ')' : 'NO'}`);
  console.log(`- Found in Branch Admin (All): ${foundInBranch ? 'YES (' + foundInBranch.customerName + ')' : 'NO'}`);

  if (!foundInAdmin || !foundInDlt || !foundInBranch) {
    throw new Error('New record NOT found in all dashboards!');
  }
  console.log('✔ New submission is immediately synchronized across ALL dashboards!\n');

  // Step 4: Verify DLT Metrics vs Super Admin Metrics
  const adminMetrics = await getJson('/api/v1/admin/metrics/?officer_user=admin', adminHeaders);
  const dltMetrics = await getJson('/api/v1/admin/metrics/?officer_user=dltpartner', dltHeaders);

  console.log('Metrics Synchronization Check:');
  console.log(`- Super Admin Total Records:   ${adminMetrics.data.metrics.totalRecords}`);
  console.log(`- DLT Partner Total Records:   ${dltMetrics.data.metrics.totalRecords}`);
  console.log(`- Super Admin YES Count:       ${adminMetrics.data.metrics.yesCount}`);
  console.log(`- DLT Partner YES Count:       ${dltMetrics.data.metrics.yesCount}`);
  console.log(`- DLT Partner Branch Breakdown Count: ${dltMetrics.data.metrics.branchBreakdown.length} branches`);

  if (adminMetrics.data.metrics.totalRecords !== dltMetrics.data.metrics.totalRecords ||
      adminMetrics.data.metrics.yesCount !== dltMetrics.data.metrics.yesCount) {
    throw new Error('Metrics mismatch between Super Admin and DLT Partner!');
  }
  console.log('✔ Metrics are 100% synchronized between Super Admin and DLT Partner!\n');

  // Step 5: Update CBS Status and verify sync
  console.log(`Updating CBS Sync Status to 'Yes' for Ref: ${newRef}...`);
  const cbsRes = await patchJson(`/api/v1/admin/records/${encodeURIComponent(newRef)}/cbs-status/`, {
    cbsUpdated: 'Yes'
  }, adminHeaders);

  console.log('CBS update response:', cbsRes.status, cbsRes.data.message);

  const dltRecAfterCbs = await getJson('/api/v1/admin/records/?officer_user=dltpartner', dltHeaders);
  const updatedInDlt = dltRecAfterCbs.data.data.find(r => r.refNo === newRef);
  console.log(`DLT Record CBS Status: ${updatedInDlt ? updatedInDlt.cbsUpdated : 'Not Found'}`);

  if (updatedInDlt && updatedInDlt.cbsUpdated === 'Yes') {
    console.log('✔ CBS Status change is immediately synchronized in DLT Partner dashboard!\n');
  } else {
    throw new Error('CBS status did not sync to DLT Partner!');
  }

  console.log('========================================================================');
  console.log('ALL SYNCHRONIZATION TESTS PASSED WITH 100% INTEGRITY!');
  console.log('========================================================================');
}

runSyncVerification().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
