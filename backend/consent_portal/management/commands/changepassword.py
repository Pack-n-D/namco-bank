import getpass
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from consent_portal.models import BankOfficer


class Command(BaseCommand):
    help = "Change the password for a Namco Bank Officer (BankOfficer) and/or Django user."

    def add_arguments(self, parser):
        parser.add_argument(
            'username',
            nargs='?',
            type=str,
            help='Username or Employee ID of the officer or admin user.'
        )

    def handle(self, *args, **options):
        try:
            from consent_portal.apps import init_bank_system
            init_bank_system()
        except Exception:
            pass

        username = options.get('username')
        
        # If username not passed, display available accounts and prompt
        if not username:
            officers = BankOfficer.objects.all().order_by('role', 'username')
            if officers.exists():
                self.stdout.write(self.style.NOTICE("Available Bank Officer accounts:"))
                for o in officers:
                    self.stdout.write(f" - {o.username} ({o.full_name} | Role: {o.role} | Branch: {o.branch_name})")
            username = input("Enter username: ").strip()

        if not username:
            raise CommandError("Username cannot be empty.")

        # Check BankOfficer model
        officer = BankOfficer.objects.filter(username__iexact=username).first()
        
        # If not found directly, check by employee_id or role name
        if not officer:
            officer = BankOfficer.objects.filter(employee_id__iexact=username).first()
        if not officer:
            if username.lower() in ['branch_admin', 'branchadmin', 'officer']:
                officer = BankOfficer.objects.filter(role='BRANCH_ADMIN').first()
            elif username.lower() in ['super_admin', 'superadmin']:
                officer = BankOfficer.objects.filter(role='SUPER_ADMIN').first()

        # Check Django auth User model
        UserModel = get_user_model()
        django_user = UserModel.objects.filter(username__iexact=username).first()

        if not officer and not django_user:
            available = [f"'{o.username}' ({o.role})" for o in BankOfficer.objects.all()]
            avail_str = ", ".join(available) if available else "None found"
            raise CommandError(
                f"User '{username}' does not exist in Namco Bank Officers or Django Admin.\n"
                f"Existing Bank Officer accounts: {avail_str}\n"
                f"Tip: The Canada Corner Branch Officer username is 'officer' (role: BRANCH_ADMIN)."
            )

        target_desc = []
        if officer:
            target_desc.append(f"Bank Officer '{officer.username}' ({officer.full_name}, Role: {officer.role})")
        if django_user:
            target_desc.append(f"Django Admin '{django_user.get_username()}'")

        self.stdout.write(self.style.NOTICE(f"Changing password for: {' and '.join(target_desc)}"))

        # Prompt for password
        p1 = getpass.getpass("New password: ")
        p2 = getpass.getpass("Retype new password: ")

        if p1 != p2:
            raise CommandError("Error: Passwords do not match.")
        if not p1:
            raise CommandError("Password cannot be blank.")
        if len(p1) < 6:
            raise CommandError("Password is too short (must be at least 6 characters).")

        # Update BankOfficer if found
        if officer:
            officer.set_password(p1)
            officer.reset_failed_logins()
            officer.is_active = True
            officer.save()
            self.stdout.write(self.style.SUCCESS(
                f"Successfully updated password and unlocked account for Bank Officer '{officer.username}'!"
            ))

        # Update Django User if found
        if django_user:
            django_user.set_password(p1)
            django_user.save()
            self.stdout.write(self.style.SUCCESS(
                f"Successfully updated password for Django User '{django_user.get_username()}'!"
            ))
