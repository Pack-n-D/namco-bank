#!/bin/bash
# ==============================================================================
# NAMCO BANK - ON-PREMISE DATACENTER AUTOMATED DEPLOYMENT SCRIPT
# Target OS: RHEL 9 / Rocky Linux 9 / Ubuntu 22.04+ Server
# Run as root or with sudo
# ==============================================================================

set -e

echo "🏦 Starting Namco Bank SMS Consent Portal Datacenter Setup..."

# 1. Create Dedicated Non-Root Application User
if ! id -u namcoapp >/dev/null 2>&1; then
    echo "Creating system user 'namcoapp'..."
    useradd -r -s /bin/false -d /var/www/namco-bank namcoapp
fi

# 2. Setup Directories & Permissions
mkdir -p /var/www/namco-bank
mkdir -p /var/log/namco
chown -R namcoapp:namcoapp /var/log/namco

# 3. Setup Python Virtual Environment
echo "Setting up Python 3.12+ Virtual Environment..."
cd /var/www/namco-bank/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 4. Run Django Database Migrations
echo "Applying database migrations..."
python manage.py makemigrations consent_portal
python manage.py migrate

# 5. Install Systemd Daemon
echo "Configuring Systemd service..."
cp /var/www/namco-bank/deploy/namco-consent.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable namco-consent
systemctl restart namco-consent

# 6. Configure Nginx
echo "Configuring Nginx reverse proxy..."
cp /var/www/namco-bank/deploy/nginx_namco_bank.conf /etc/nginx/sites-available/namco_consent.conf
ln -sf /etc/nginx/sites-available/namco_consent.conf /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

echo "✅ Namco Bank SMS Consent System deployed and running on-premise successfully!"
