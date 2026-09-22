import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(BASE_DIR, 'backend')
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'namco_core.settings')

import django
django.setup()

from consent_portal.models import Customer, SMSConsent, AuditLog # type: ignore

logs = AuditLog.objects.filter(username__in=['PORTAL_CUSTOMER', 'Customer', 'Customer (76XXXXXX42)', 'Customer (72XXXXXX75)'])
updated = 0
for log in logs:
    cust = None
    if log.account_no:
        cust = Customer.objects.filter(account_number=log.account_no).first()
    if not cust and log.ref_no:
        consent = SMSConsent.objects.filter(reference_number=log.ref_no).first()
        if consent:
            cust = consent.customer
    if cust:
        log.username = f"{cust.name} (Customer - {cust.mobile_number})"
        log.save()
        updated += 1
    elif '5010008427632' in log.action_details:
        log.username = "shiv g (Customer - 7666760842)"
        log.save()
        updated += 1
    elif '5010050752593' in log.action_details:
        log.username = "Karan Suresh Muntode (Customer - 7262805075)"
        log.save()
        updated += 1

print(f"Successfully cleaned up {updated} audit log entries with real customer names & numbers!")
