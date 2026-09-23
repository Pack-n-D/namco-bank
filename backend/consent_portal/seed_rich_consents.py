"""
Namco Bank - Comprehensive Enterprise Consent Seeder
Populates 180+ diverse customer consent records across all 80 branches.
"""
import os
import sys
import random
import datetime

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'namco_core.settings')
import django
django.setup()
from django.utils import timezone

from consent_portal.models import BankBranch, Customer, SMSConsent, ConsentHistory, AuditLog
from consent_portal.branches_data import NAMCO_80_BRANCHES

FIRST_NAMES = [
    ("Rajesh", "M"), ("Sunita", "F"), ("Kiran", "M"), ("Anil", "M"), ("Pooja", "F"),
    ("Ganesh", "M"), ("Pravin", "M"), ("Smita", "F"), ("Sanjay", "M"), ("Meena", "F"),
    ("Vikram", "M"), ("Shubhangi", "F"), ("Mahesh", "M"), ("Anita", "F"), ("Sachin", "M"),
    ("Vandana", "F"), ("Bhagwan", "M"), ("Kavita", "F"), ("Nitin", "M"), ("Swati", "F"),
    ("Prashant", "M"), ("Deepali", "F"), ("Ramesh", "M"), ("Archana", "F"), ("Sandeep", "M"),
    ("Manisha", "F"), ("Ravindra", "M"), ("Surekha", "F"), ("Santosh", "M"), ("Ashwini", "F"),
    ("Manoj", "M"), ("Pallavi", "F"), ("Yogesh", "M"), ("Rupali", "F"), ("Deepak", "M"),
    ("Jyoti", "F"), ("Milind", "M"), ("Pradnya", "F"), ("Chandrakant", "M"), ("Usha", "F"),
    ("Vijay", "M"), ("Sangita", "F"), ("Hemant", "M"), ("Madhuri", "F"), ("Ajay", "M"),
    ("Anuradha", "F"), ("Sudhir", "M"), ("Pratibha", "F"), ("Shrikant", "M"), ("Rohini", "F")
]

MIDDLE_NAMES = [
    "Madhavrao", "Suresh", "Vinayak", "Dattatray", "Santosh", "Ramchandra", "Ashok",
    "Ramesh", "Bhaskar", "Deepak", "Harishchandra", "Nitin", "Prabhakar", "Arvind",
    "Dilip", "Kailas", "Trimbak", "Sharad", "Kashinath", "Bhausaheb", "Pandurang",
    "Narayan", "Govind", "Eknath", "Tukaram", "Baburao", "Janardan", "Damodar"
]

LAST_NAMES = [
    "Patil", "Deshmukh", "Joshi", "Shinde", "Bhamare", "Kulkarni", "Gaikwad", "Wagh",
    "Sonawane", "Jadhav", "More", "Khairnar", "Chaudhari", "Borse", "Mahajan", "Gite",
    "Aher", "Pawar", "Kale", "Nikam", "Salunke", "Jagtap", "Baste", "Ahire", "Shirsath",
    "Darekar", "Gunjal", "Thakare", "Shelke", "Kapadnis", "Bhalerao", "Gangurde", "Sanap",
    "Dhumal", "Pingle", "Thorat", "Garud", "Shirore", "Kokate", "Avhad", "Chavan", "Bhosale"
]

def generate_pan(idx):
    letters = "ABCDE" + chr(65 + (idx % 26))
    digits = f"{1000 + (idx * 17) % 9000}"
    check = chr(65 + ((idx + 7) % 26))
    return f"{letters[:4]}{check}{digits}{chr(65 + (idx % 26))}"

def generate_aadhaar(idx):
    return f"{100000000000 + (idx * 8392173) % 899999999999}"

def seed_rich_consents():
    print(f"[*] Starting Bank-Wide Multi-Branch Consent Seeding...")
    branches = list(BankBranch.objects.filter(is_active=True).order_by('branch_code'))
    print(f"[*] Found {len(branches)} active branches in database.")

    total_created = 0
    now = timezone.now()

    # Distribute 180+ records across all 80 branches
    # Branch 1 (Canada Corner): 12 records
    # Branch 2 (CBS Head Office): 10 records
    # Branches 3-20 (Major Nashik urban branches): 3-4 records each
    # Branches 21-80 (Rural, District, Pune, Mumbai MMR, Khandesh): 1-3 records each
    
    global_record_idx = 100

    for b_idx, branch in enumerate(branches, start=1):
        b_name = branch.branch_name
        
        # Decide how many records for this branch
        if "Canada Corner" in b_name:
            target_count = 12
        elif "CBS Head Office" in b_name:
            target_count = 10
        elif any(k in b_name for k in ["Mumbai Naka", "Panchavati", "College Road", "Gangapur Road", "Nashik Road", "CIDCO", "Satpur", "Ambad", "Fort", "Dadar", "FC Road", "Deccan"]):
            target_count = random.choice([4, 5, 6])
        else:
            target_count = random.choice([1, 2, 3])

        # Check existing count for this branch
        existing_branch_count = SMSConsent.objects.filter(branch_name__icontains=b_name.split(',')[0].strip()).count()
        needed = max(0, target_count - existing_branch_count)

        for _ in range(needed):
            global_record_idx += 1
            idx = global_record_idx
            
            fn, gender = random.choice(FIRST_NAMES)
            mn = random.choice(MIDDLE_NAMES)
            ln = random.choice(LAST_NAMES)
            full_name = f"{fn} {mn} {ln}"

            acc_no = f"50100{idx:08d}"
            cif_no = f"CIF{100000 + idx}"
            mobile_no = f"98{20000000 + (idx * 7391) % 79999999}"
            pan_no = generate_pan(idx)
            aadhaar_no = generate_aadhaar(idx)

            # Realistic status distribution: 70% YES, 15% NO, 10% PENDING, 5% REVOKED
            rand_val = random.random()
            if rand_val < 0.70:
                status_choice = "YES"
            elif rand_val < 0.85:
                status_choice = "NO"
            elif rand_val < 0.95:
                status_choice = "PENDING"
            else:
                status_choice = "REVOKED"

            # Source distribution: 60% ONLINE, 25% PHYSICAL_OCR, 15% ADMIN_ENTRY
            source_rand = random.random()
            if source_rand < 0.60:
                source_choice = "ONLINE"
            elif source_rand < 0.85:
                source_choice = "PHYSICAL_OCR"
            else:
                source_choice = "ADMIN_ENTRY"

            # Submission date in past 30 days
            days_ago = random.randint(0, 28)
            submission_time = now - datetime.timedelta(days=days_ago, hours=random.randint(1, 12), minutes=random.randint(0, 59))
            form_date = submission_time.date()

            # CBS update status: if pending or submitted today -> No, else mostly Yes
            if status_choice == "PENDING" or days_ago == 0:
                cbs_choice = "No"
            else:
                cbs_choice = "Yes" if random.random() < 0.85 else "No"

            place = branch.city if branch.city else "Nashik"

            # 1. Create or get customer
            cust, _ = Customer.objects.get_or_create(
                account_number=acc_no,
                defaults={
                    "name": full_name,
                    "cif_number": cif_no,
                    "mobile_number": mobile_no,
                    "branch": branch,
                    "branch_name": b_name,
                    "pan_number": pan_no,
                    "aadhaar_number": aadhaar_no
                }
            )

            # 2. Create SMS Consent
            ref_no = f"NAMCO-SMS-2026-{200000 + idx}"
            consent_rec = SMSConsent.objects.create(
                reference_number=ref_no,
                customer=cust,
                status=status_choice,
                source=source_choice,
                customer_name=full_name,
                account_number=acc_no,
                cif_number=cif_no,
                pan_number=pan_no,
                aadhaar_number=aadhaar_no,
                mobile_number=mobile_no,
                branch_name=b_name,
                form_date=form_date,
                form_place=place,
                cbs_updated=cbs_choice,
                verified_by="Branch Verification Officer" if cbs_choice == "Yes" else None,
                verified_at=submission_time if cbs_choice == "Yes" else None,
                ip_address=f"10.{random.randint(10, 50)}.{random.randint(1, 254)}.{random.randint(1, 254)}",
                user_agent="Namco Secure Core Banking Terminal v3.2",
                submitted_at=submission_time
            )

            # 3. Create Consent History
            prev_st = "PENDING" if status_choice != "PENDING" else "UNREGISTERED"
            ConsentHistory.objects.create(
                consent=consent_rec,
                previous_status=prev_st,
                new_status=status_choice,
                source=source_choice,
                changed_by="Customer Self-Service Portal" if source_choice == "ONLINE" else "Branch Admin Verification",
                reason=f"Consent registered via {source_choice} with choice [{status_choice}]",
                timestamp=submission_time
            )

            total_created += 1

    total_consents = SMSConsent.objects.count()
    branch_count = SMSConsent.objects.values('branch_name').distinct().count()
    print(f"\n[+] Successfully seeded {total_created} new realistic consent records!")
    print(f"[+] Total SMSConsent records in DB: {total_consents}")
    print(f"[+] Branches with active records: {branch_count} of {len(branches)}")
    print(f"[+] Canada Corner Branch records: {SMSConsent.objects.filter(branch_name__icontains='Canada Corner').count()}")
    print(f"[+] YES: {SMSConsent.objects.filter(status='YES').count()} | NO: {SMSConsent.objects.filter(status='NO').count()} | PENDING: {SMSConsent.objects.filter(status='PENDING').count()} | REVOKED: {SMSConsent.objects.filter(status='REVOKED').count()}")

if __name__ == '__main__':
    seed_rich_consents()
