"""
WSGI config for Namco Bank project.
"""
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'namco_core.settings')
application = get_wsgi_application()
