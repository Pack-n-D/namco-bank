import django.utils.timezone
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='BankBranch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('branch_code', models.CharField(db_index=True, max_length=20, unique=True)),
                ('branch_name', models.CharField(db_index=True, max_length=150)),
                ('city', models.CharField(default='Nashik', max_length=100)),
                ('address', models.TextField(blank=True, null=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Bank Branch',
                'verbose_name_plural': 'Bank Branches',
                'db_table': 'tbl_bank_branches',
                'ordering': ['branch_code'],
            },
        ),
        migrations.CreateModel(
            name='BankOfficer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('username', models.CharField(db_index=True, max_length=50, unique=True)),
                ('full_name', models.CharField(max_length=150)),
                ('employee_id', models.CharField(blank=True, max_length=50, null=True)),
                ('email', models.EmailField(blank=True, max_length=254, null=True)),
                ('mobile', models.CharField(blank=True, max_length=15, null=True)),
                ('password_hash', models.CharField(max_length=255)),
                ('role', models.CharField(choices=[('SUPER_ADMIN', 'Central Super Administrator'), ('BRANCH_ADMIN', 'Branch Administrative Officer'), ('AUDITOR', 'Compliance Auditor')], db_index=True, default='BRANCH_ADMIN', max_length=30)),
                ('branch_name', models.CharField(default='Head Office (HO)', max_length=150)),
                ('branch_code', models.CharField(default='HO-001', max_length=30)),
                ('is_active', models.BooleanField(default=True)),
                ('failed_login_attempts', models.IntegerField(default=0)),
                ('locked_until', models.DateTimeField(blank=True, null=True)),
                ('last_login', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='officers', to='consent_portal.bankbranch')),
            ],
            options={
                'verbose_name': 'Bank Officer',
                'verbose_name_plural': 'Bank Officers',
                'db_table': 'tbl_bank_officers',
            },
        ),
        migrations.CreateModel(
            name='Customer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=150)),
                ('account_number', models.CharField(db_index=True, max_length=25, unique=True)),
                ('cif_number', models.CharField(db_index=True, max_length=25)),
                ('mobile_number', models.CharField(db_index=True, max_length=15)),
                ('branch_name', models.CharField(default='Head Office, Nashik', max_length=150)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='customers', to='consent_portal.bankbranch')),
            ],
            options={
                'verbose_name': 'Bank Customer',
                'verbose_name_plural': 'Bank Customers',
                'db_table': 'tbl_customers',
            },
        ),
        migrations.CreateModel(
            name='SMSConsent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reference_number', models.CharField(db_index=True, max_length=64, unique=True)),
                ('status', models.CharField(choices=[('YES', 'YES (Consented to SMS alerts)'), ('NO', 'NO (Explicitly declined SMS alerts)'), ('PENDING', 'PENDING (Consent not yet submitted)'), ('REVOKED', 'REVOKED (Previously agreed, subsequently revoked)')], db_index=True, default='PENDING', max_length=15)),
                ('source', models.CharField(choices=[('ONLINE', 'Customer Online Self-Service'), ('PHYSICAL_OCR', 'Physical Scanned Paper Form (OCR Extraction)'), ('ADMIN_ENTRY', 'Branch Officer Manual Entry')], db_index=True, default='ONLINE', max_length=30)),
                ('customer_name', models.CharField(max_length=150)),
                ('account_number', models.CharField(db_index=True, max_length=25)),
                ('cif_number', models.CharField(db_index=True, max_length=25)),
                ('mobile_number', models.CharField(db_index=True, max_length=15)),
                ('branch_name', models.CharField(db_index=True, default='CBS Head Office, Nashik', max_length=150)),
                ('signature_data', models.TextField(blank=True, null=True)),
                ('form_date', models.DateField(default=django.utils.timezone.now)),
                ('form_place', models.CharField(default='Nashik', max_length=100)),
                ('verified_by', models.CharField(blank=True, max_length=150, null=True)),
                ('verified_at', models.DateTimeField(blank=True, null=True)),
                ('cbs_updated', models.CharField(db_index=True, default='No', max_length=5)),
                ('ip_address', models.CharField(blank=True, max_length=45, null=True)),
                ('user_agent', models.CharField(blank=True, max_length=255, null=True)),
                ('submitted_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('customer', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='consents', to='consent_portal.customer')),
            ],
            options={
                'verbose_name': 'SMS Consent',
                'verbose_name_plural': 'SMS Consents',
                'db_table': 'tbl_sms_consents',
                'ordering': ['-submitted_at'],
            },
        ),
        migrations.CreateModel(
            name='ConsentHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('previous_status', models.CharField(blank=True, max_length=15, null=True)),
                ('new_status', models.CharField(max_length=15)),
                ('source', models.CharField(default='ONLINE', max_length=30)),
                ('changed_by', models.CharField(default='CUSTOMER', max_length=150)),
                ('timestamp', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('reason', models.TextField(blank=True, null=True)),
                ('consent', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='history', to='consent_portal.smsconsent')),
            ],
            options={
                'verbose_name': 'Consent History Entry',
                'verbose_name_plural': 'Consent History Entries',
                'db_table': 'tbl_consent_history',
                'ordering': ['-timestamp'],
            },
        ),
        migrations.CreateModel(
            name='PhysicalForm',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('original_file', models.FileField(upload_to='physical_forms/%Y/%m/')),
                ('filename', models.CharField(max_length=255)),
                ('ocr_raw_text', models.TextField(blank=True, null=True)),
                ('ocr_extracted_json', models.JSONField(blank=True, null=True)),
                ('uploaded_by', models.CharField(default='BRANCH_OFFICER', max_length=150)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('verified_by', models.CharField(blank=True, max_length=150, null=True)),
                ('verified_at', models.DateTimeField(blank=True, null=True)),
                ('consent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='physical_forms', to='consent_portal.smsconsent')),
            ],
            options={
                'verbose_name': 'Physical Form',
                'verbose_name_plural': 'Physical Forms',
                'db_table': 'tbl_physical_forms',
                'ordering': ['-uploaded_at'],
            },
        ),
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('user_id', models.CharField(blank=True, max_length=50, null=True)),
                ('username', models.CharField(db_index=True, max_length=100)),
                ('officer_role', models.CharField(blank=True, max_length=40, null=True)),
                ('branch_name', models.CharField(db_index=True, max_length=150)),
                ('action_type', models.CharField(db_index=True, max_length=60)),
                ('entity_type', models.CharField(blank=True, max_length=50, null=True)),
                ('entity_id', models.CharField(blank=True, max_length=100, null=True)),
                ('action_details', models.TextField()),
                ('account_no', models.CharField(blank=True, max_length=25, null=True)),
                ('ref_no', models.CharField(blank=True, max_length=64, null=True)),
                ('ip_address', models.CharField(blank=True, max_length=45, null=True)),
                ('user_agent', models.CharField(blank=True, max_length=255, null=True)),
                ('timestamp', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
            ],
            options={
                'verbose_name': 'System Audit Log',
                'verbose_name_plural': 'System Audit Logs',
                'db_table': 'tbl_audit_logs',
                'ordering': ['-timestamp'],
            },
        ),
    ]
