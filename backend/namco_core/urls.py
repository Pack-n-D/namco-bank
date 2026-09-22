"""
Namco Core URL Configuration
Serves REST API and Web Portals (index.html, admin.html, super-admin.html).
"""
import os
from pathlib import Path
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse, HttpResponseNotFound

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
DIST_DIR = ROOT_DIR / 'frontend' / 'dist'

def serve_react_app(request, *args, **kwargs):
    """Serves the unified React JS Single Page Application."""
    index_file = DIST_DIR / 'index.html'
    if index_file.exists():
        res = HttpResponse(index_file.read_bytes(), content_type='text/html; charset=utf-8')
        res['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        return res
    legacy_file = ROOT_DIR / 'index.html'
    if legacy_file.exists():
        return HttpResponse(legacy_file.read_bytes(), content_type='text/html; charset=utf-8')
    return HttpResponseNotFound("React build not found. Run 'npm run build' inside frontend/.")

def serve_static_asset(request, asset_path):
    # Prevent directory traversal attacks
    import posixpath
    clean_path = posixpath.normpath(asset_path).lstrip('/')
    if clean_path.startswith('..'):
        return HttpResponseNotFound("Asset not found.")
    
    # 1. Check frontend/dist/
    filepath = DIST_DIR / clean_path
    if not (filepath.exists() and filepath.is_file()):
        # 2. Check frontend/public/
        filepath = ROOT_DIR / 'frontend' / 'public' / clean_path
    if not (filepath.exists() and filepath.is_file()):
        # 3. Check project root
        filepath = ROOT_DIR / clean_path

    if filepath.exists() and filepath.is_file():
        content_type = 'application/octet-stream'
        lower = clean_path.lower()
        if lower.endswith('.css'):
            content_type = 'text/css; charset=utf-8'
        elif lower.endswith('.js') or lower.endswith('.mjs'):
            content_type = 'application/javascript; charset=utf-8'
        elif lower.endswith('.png'):
            content_type = 'image/png'
        elif lower.endswith('.jpg') or lower.endswith('.jpeg'):
            content_type = 'image/jpeg'
        elif lower.endswith('.svg'):
            content_type = 'image/svg+xml'
        elif lower.endswith('.woff2'):
            content_type = 'font/woff2'
        elif lower.endswith('.woff'):
            content_type = 'font/woff'
        elif lower.endswith('.ttf'):
            content_type = 'font/ttf'
        elif lower.endswith('.json'):
            content_type = 'application/json; charset=utf-8'
        res = HttpResponse(filepath.read_bytes(), content_type=content_type)
        res['Cache-Control'] = 'public, max-age=3600'
        return res
    return HttpResponseNotFound("Asset not found.")

urlpatterns = [
    # Django Native Admin
    path('django-admin/', admin.site.urls),
    
    # REST API endpoints
    path('api/v1/', include('consent_portal.urls')),

    # Direct static assets & root files
    path('logo.png', lambda r: serve_static_asset(r, 'logo.png')),
    path('favicon.ico', lambda r: serve_static_asset(r, 'logo.png')),
    re_path(r'^(?P<asset_path>assets/.+)$', serve_static_asset),

    # Web Portals - All served exclusively via the Unified React JS Application
    path('', serve_react_app, name='react-root'),
    path('index.html', serve_react_app, name='react-index'),
    path('index.html/login', serve_react_app, name='react-index-login'),
    re_path(r'^index\.html/.*$', serve_react_app),
    path('customer', serve_react_app, name='react-customer'),
    path('customer/login', serve_react_app, name='react-customer-login'),
    path('customer/profile', serve_react_app, name='react-customer-profile'),
    re_path(r'^customer/.*$', serve_react_app),
    path('login.html', serve_react_app, name='react-login-html'),
    path('login', serve_react_app, name='react-login'),
    path('super_admin_login.html', serve_react_app, name='react-super-admin-login-html'),
    path('super-admin/login', serve_react_app, name='react-super-admin-login'),
    path('admin/login', serve_react_app, name='react-admin-login'),
    path('admin.html', serve_react_app, name='react-admin-html'),
    path('admin', serve_react_app, name='react-admin'),
    path('super-admin.html', serve_react_app, name='react-super-admin-html'),
    path('superadmin.html', serve_react_app, name='react-superadmin-html'),
    path('superadmin', serve_react_app, name='react-superadmin'),
    path('dlt', serve_react_app, name='react-dlt'),
    path('dlt/', serve_react_app, name='react-dlt-slash'),
    path('dlt-partner', serve_react_app, name='react-dlt-partner'),
    path('dlt-partner/', serve_react_app, name='react-dlt-partner-slash'),
    path('dlt.html', serve_react_app, name='react-dlt-html'),
    path('dlt_partner.html', serve_react_app, name='react-dlt-partner-html'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
