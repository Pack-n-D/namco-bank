# pyrefly: ignore-file
# type: ignore
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(BASE_DIR, 'backend')
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'namco_core.settings')

import django
django.setup()

from consent_portal.models import SMSConsent  # type: ignore

consents = SMSConsent.objects.all().order_by('-created_at')[:8]
for c in consents:
    print(f"Name: {c.customer_name} | Mobile: {c.mobile_number} | Acc: {c.account_number} | Branch: {c.branch_name} | Status: {c.status}")
