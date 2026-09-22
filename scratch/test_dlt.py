import urllib.request
import json

def test_dlt():
    login_data = json.dumps({'username': 'dltpartner', 'password': 'dlt123'}).encode('utf-8')
    req = urllib.request.Request(
        'http://127.0.0.1:3000/api/v1/admin/login/',
        data=login_data,
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        body = json.loads(resp.read().decode('utf-8'))
        print("LOGIN RESPONSE:", body)
        token = body.get('token')
        challenge_token = body.get('challengeToken')
        dev_otp = body.get('devOtp') or '123456'

    # Verify 2FA
    verify_data = json.dumps({'challengeToken': challenge_token, 'otp': dev_otp}).encode('utf-8')
    req_2fa = urllib.request.Request(
        'http://127.0.0.1:3000/api/v1/admin/verify-2fa/',
        data=verify_data,
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req_2fa) as resp:
        verify_body = json.loads(resp.read().decode('utf-8'))
        print("VERIFY 2FA RESPONSE:", verify_body)
        auth_token = verify_body.get('token')

    # Test Consent Records query
    req_records = urllib.request.Request(
        'http://127.0.0.1:3000/api/v1/admin/records/?officer_user=dltpartner',
        headers={'Authorization': f'Bearer {auth_token}'}
    )
    with urllib.request.urlopen(req_records) as resp:
        records_body = json.loads(resp.read().decode('utf-8'))
        print("RECORDS COUNT:", records_body.get('count', len(records_body.get('data', []))))

    # Test Export endpoint
    req_export = urllib.request.Request(
        'http://127.0.0.1:3000/api/v1/admin/export/?status=ALL',
        headers={'Authorization': f'Bearer {auth_token}'}
    )
    with urllib.request.urlopen(req_export) as resp:
        csv_data = resp.read().decode('utf-8')
        print("CSV PREVIEW FIRST 3 LINES:")
        for line in csv_data.splitlines()[:3]:
            print("  ", line)

if __name__ == '__main__':
    test_dlt()
