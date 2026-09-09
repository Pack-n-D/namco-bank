from django.apps import AppConfig
from django.db.models.signals import post_migrate

def init_bank_system(sender, **kwargs):
    try:
        from django.contrib.auth.models import User
        u, _ = User.objects.get_or_create(username='admin', defaults={'email': 'admin@namcobank.in'})
        u.is_staff = True
        u.is_superuser = True
        u.set_password('admin123')
        u.save()
    except Exception:
        pass

class ConsentPortalConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'consent_portal'
    verbose_name = 'Namco Bank SMS Consent & Governance'

    def ready(self):
        post_migrate.connect(init_bank_system, sender=self)

