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
from django.http import FileResponse, HttpResponseNotFound

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent

def serve_portal_file(filename):
    def view_func(request):
        filepath = FRONTEND_DIR / filename
        if filepath.exists():
            content_type = 'text/html'
            if filename.endswith('.css'):
                content_type = 'text/css'
            elif filename.endswith('.js'):
                content_type = 'application/javascript'
            elif filename.endswith('.png'):
                content_type = 'image/png'
            elif filename.endswith('.svg'):
                content_type = 'image/svg+xml'
            return FileResponse(open(filepath, 'rb'), content_type=content_type)
        return HttpResponseNotFound(f"File {filename} not found.")
    return view_func

def serve_static_asset(request, asset_path):
    filepath = FRONTEND_DIR / asset_path
    if filepath.exists() and filepath.is_file():
        content_type = 'application/octet-stream'
        if asset_path.endswith('.css'):
            content_type = 'text/css'
        elif asset_path.endswith('.js'):
            content_type = 'application/javascript'
        elif asset_path.endswith('.png'):
            content_type = 'image/png'
        elif asset_path.endswith('.jpg') or asset_path.endswith('.jpeg'):
            content_type = 'image/jpeg'
        elif asset_path.endswith('.svg'):
            content_type = 'image/svg+xml'
        return FileResponse(open(filepath, 'rb'), content_type=content_type)
    return HttpResponseNotFound("Asset not found.")

urlpatterns = [
    # Django Native Admin
    path('django-admin/', admin.site.urls),
    
    # REST API endpoints
    path('api/v1/', include('consent_portal.urls')),

    # Web Portals
    path('', serve_portal_file('index.html'), name='root-home'),
    path('index.html', serve_portal_file('index.html'), name='index-html'),
    path('login.html', serve_portal_file('login.html'), name='login-portal'),
    path('login', serve_portal_file('login.html'), name='login-portal-no-ext'),
    path('admin.html', serve_portal_file('admin.html'), name='admin-portal'),
    path('super-admin.html', serve_portal_file('super-admin.html'), name='super-admin-portal'),
    path('superadmin.html', serve_portal_file('super-admin.html'), name='superadmin-redirect'),
    path('super_admin.html', serve_portal_file('super-admin.html'), name='super_admin-redirect'),

    # Direct static assets
    path('favicon.ico', serve_portal_file('assets/logo.png')),
    path('style.css', serve_portal_file('style.css')),
    path('app.js', serve_portal_file('app.js')),
    path('api-service.js', serve_portal_file('api-service.js')),
    path('config.js', serve_portal_file('config.js')),
    
    # Asset folder catch-all
    re_path(r'^(?P<asset_path>assets/.+)$', serve_static_asset),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
