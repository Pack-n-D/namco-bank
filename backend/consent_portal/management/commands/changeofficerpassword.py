from consent_portal.management.commands.changepassword import Command as ChangePasswordCommand

class Command(ChangePasswordCommand):
    help = "Change the password for a Namco Bank Officer (BankOfficer)."
