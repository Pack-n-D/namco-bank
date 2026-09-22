from django.apps import AppConfig
from django.db.models.signals import post_migrate

def init_bank_system(sender=None, **kwargs):
    try:
        from django.contrib.auth.models import User
        # Ensure Django auth_user accounts exist
        u_admin, _ = User.objects.get_or_create(username='admin', defaults={'email': 'admin@namcobank.in'})
        u_admin.is_staff = True
        u_admin.is_superuser = True
        u_admin.save()

        u_officer, _ = User.objects.get_or_create(username='officer', defaults={'email': 'officer@namcobank.in'})
        u_officer.is_staff = True
        u_officer.save()

        u_branch_admin, _ = User.objects.get_or_create(username='branch_admin', defaults={'email': 'branch_admin@namcobank.in'})
        u_branch_admin.is_staff = True
        u_branch_admin.save()
    except Exception:
        pass

    try:
        from consent_portal.views import ensure_default_accounts
        ensure_default_accounts()
    except Exception:
        pass


class ConsentPortalConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'consent_portal'
    verbose_name = 'Namco Bank SMS Consent & Governance'

    def ready(self):
        post_migrate.connect(init_bank_system, sender=self)

