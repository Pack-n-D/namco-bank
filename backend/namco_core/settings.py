"""
Django settings for Namco Bank SMS Alert Consent & Governance System.
Production-ready configuration supporting PostgreSQL and SQLite fallback.
"""

from pathlib import Path
import os
import sys

# Python 3.14 Compatibility Patch for Django 5 Template Context
try:
    import django.template.context
    def _py314_context_copy(self):
        obj = object.__new__(self.__class__)
        obj.__dict__.update(self.__dict__)
        if hasattr(self, 'dicts'):
            obj.dicts = self.dicts[:]
        return obj
    django.template.context.BaseContext.__copy__ = _py314_context_copy
    django.template.context.Context.__copy__ = _py314_context_copy
    django.template.context.RequestContext.__copy__ = _py314_context_copy
except Exception:
    pass

BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from .env file if present
try:
    from dotenv import load_dotenv
    env_path = BASE_DIR / '.env'
    if env_path.exists():
        load_dotenv(env_path)
except Exception:
    pass

# SECRET_KEY: Must be set via environment variable in production
_secret_key = os.environ.get('DJANGO_SECRET_KEY', '')
if not _secret_key:
    import warnings
    _secret_key = 'django-insecure-LOCAL-DEV-ONLY-DO-NOT-USE-IN-PRODUCTION'
    warnings.warn(
        'DJANGO_SECRET_KEY not set! Using insecure fallback. '
        'Set DJANGO_SECRET_KEY environment variable before deployment.',
        RuntimeWarning
    )
SECRET_KEY = _secret_key

# DEBUG defaults to False for production safety. Set DEBUG=True explicitly for local development.
DEBUG = os.environ.get('DEBUG', 'False') == 'True'

# ALLOWED_HOSTS: Explicit list from env or safe defaults
_allowed_hosts_str = os.environ.get('ALLOWED_HOSTS', '127.0.0.1,localhost')
ALLOWED_HOSTS = [h.strip() for h in _allowed_hosts_str.split(',') if h.strip()]

# Application definition
INSTALLED_APPS = [
    'consent_portal',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'namco_core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR.parent],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'namco_core.wsgi.application'

# Database Configuration (Supports Railway DATABASE_URL, Hostinger .env, or Local SQLite)
database_url = os.environ.get('DATABASE_URL')
if database_url and database_url.startswith('postgres'):
    import urllib.parse
    url = urllib.parse.urlparse(database_url)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': url.path[1:],
            'USER': url.username,
            'PASSWORD': url.password,
            'HOST': url.hostname,
            'PORT': url.port or 5432,
            'CONN_MAX_AGE': 600,
        }
    }
elif os.environ.get('DB_NAME') or os.environ.get('DB_ENGINE') == 'postgresql':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME', 'namco_bank_db'),
            'USER': os.environ.get('DB_USER', 'postgres'),
            'PASSWORD': os.environ.get('DB_PASSWORD', 'postgres'),
            'HOST': os.environ.get('DB_HOST', 'localhost'),
            'PORT': os.environ.get('DB_PORT', '5432'),
            'CONN_MAX_AGE': 600,
        }
    }
else:
    _sqlite_path = os.environ.get('SQLITE_DB_PATH')
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': Path(_sqlite_path) if _sqlite_path else (BASE_DIR / 'db.sqlite3'),
        }
    }

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# CORS Configuration
CORS_ALLOW_ALL_ORIGINS = os.environ.get('CORS_ALLOW_ALL_ORIGINS', 'True') == 'True'
CORS_ALLOWED_ORIGINS = [
    h.strip() for h in os.environ.get(
        'CORS_ALLOWED_ORIGINS',
        'http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:8000,http://localhost:8000,http://127.0.0.1:5500,http://localhost:5500'
    ).split(',') if h.strip()
]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
    'x-namco-auth-token',
]
CORS_EXPOSE_HEADERS = [
    'content-disposition',
]

REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ] + (['rest_framework.renderers.BrowsableAPIRenderer'] if DEBUG else []),
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.MultiPartParser',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '500/minute',
        'user': '1000/minute',
    },
}

# Banking Security & Session Hardening
X_FRAME_OPTIONS = 'DENY'
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Strict'
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = 'Strict'

# HTTPS Enforcement (strictly enabled for production WSGI/Gunicorn, disabled for local dev runserver)
IS_DEV_RUNSERVER = 'runserver' in sys.argv or os.environ.get('DISABLE_SSL_REDIRECT', 'False') == 'True'

if not DEBUG and not IS_DEV_RUNSERVER:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
else:
    SECURE_SSL_REDIRECT = False
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False

# Content Security Policy
CSP_DEFAULT_SRC = ("'self'",)
CSP_SCRIPT_SRC = ("'self'", "'unsafe-inline'")
CSP_STYLE_SRC = ("'self'", "'unsafe-inline'", 'https://fonts.googleapis.com')
CSP_FONT_SRC = ("'self'", 'https://fonts.gstatic.com')
CSP_IMG_SRC = ("'self'", 'data:')
