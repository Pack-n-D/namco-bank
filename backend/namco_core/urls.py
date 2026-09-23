"""
Namco Core URL Configuration
Serves REST API and Web Portals (index.html, admin.html, super-admin.html, login.html).
"""
import posixpath
from pathlib import Path
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse, HttpResponseNotFound

ROOT_DIR = Path(__file__).resolve().parent.parent.parent

def serve_html_file(filename):
    def view(request):
        filepath = ROOT_DIR / filename
        if filepath.exists() and filepath.is_file():
            res = HttpResponse(filepath.read_bytes(), content_type='text/html; charset=utf-8')
            res['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            return res
        return HttpResponseNotFound(f"File {filename} not found.")
    return view

def serve_static_asset(request, asset_path):
    clean_path = posixpath.normpath(asset_path).lstrip('/')
    if clean_path.startswith('..'):
        return HttpResponseNotFound("Asset not found.")
    
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

    # Web Portals - Pure HTML/CSS/JS Application
    path('', serve_html_file('index.html'), name='portal-root'),
    path('index.html', serve_html_file('index.html'), name='portal-index'),
    path('customer', serve_html_file('index.html'), name='portal-customer'),
    
    path('admin', serve_html_file('admin.html'), name='portal-admin'),
    path('admin.html', serve_html_file('admin.html'), name='portal-admin-html'),
    
    path('superadmin', serve_html_file('super-admin.html'), name='portal-superadmin'),
    path('super-admin.html', serve_html_file('super-admin.html'), name='portal-superadmin-html'),
    path('super_admin.html', serve_html_file('super-admin.html'), name='portal-superadmin-html-underscore'),
    path('superadmin.html', serve_html_file('super-admin.html'), name='portal-superadmin-html-flat'),

    path('login', serve_html_file('login.html'), name='portal-login'),
    path('login.html', serve_html_file('login.html'), name='portal-login-html'),

    path('dlt', serve_html_file('dlt-partner.html'), name='portal-dlt'),
    path('dlt-partner', serve_html_file('dlt-partner.html'), name='portal-dlt-partner'),
    path('dlt-partner.html', serve_html_file('dlt-partner.html'), name='portal-dlt-partner-html'),
    path('dlt_partner.html', serve_html_file('dlt-partner.html'), name='portal-dlt-partner-html-underscore'),
    path('dlt.html', serve_html_file('dlt-partner.html'), name='portal-dlt-html'),

    # Direct static assets & root files
    path('style.css', lambda r: serve_static_asset(r, 'style.css')),
    path('api-service.js', lambda r: serve_static_asset(r, 'api-service.js')),
    path('config.js', lambda r: serve_static_asset(r, 'config.js')),
    path('app.js', lambda r: serve_static_asset(r, 'app.js')),
    path('logo.png', lambda r: serve_static_asset(r, 'logo.png')),
    path('favicon.ico', lambda r: serve_static_asset(r, 'logo.png')),
    re_path(r'^(?P<asset_path>assets/.+)$', serve_static_asset),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
