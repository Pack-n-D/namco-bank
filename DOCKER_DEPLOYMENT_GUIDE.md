# 🐳 Namco Bank - Containerized Docker Deployment Guide

## 📋 Overview
This guide provides the official instructions for running the **Namco Bank SMS Alert Consent Portal** using Docker & Docker Compose inside **The Nasik Merchants Co-operative Bank Ltd.’s Datacenter**.

With Docker:
- **Zero software installation** required on the host server (no Python, no pip, no compiler).
- **100% bundled dependencies**: Tesseract OCR, Gunicorn, Pillow, cryptography, and DRF are self-contained.
- **Data safety**: All customer database records, audit logs, and signatures persist on Docker named volumes.
- **Air-gap friendly**: Can be delivered on an offline USB / pendrive with no internet connection required.

---

## 🚀 Scenario A: Online / Connected Server (Standard)

If the server has access to pull standard base images or an internal Docker registry:

### 1. Copy Project to Server
```bash
sudo mkdir -p /var/www/namco-bank
sudo cp -r /path/to/extracted/namco-bank/* /var/www/namco-bank/
cd /var/www/namco-bank
```

### 2. Start the Entire Stack (1 Command)
```bash
docker compose up -d --build
```

### 3. Verify Health
```bash
docker compose ps
```
Both `namco_backend_app` and `namco_web_gateway` will show **Up (healthy)**.

---

## 💾 Scenario B: 100% Offline / Air-Gapped Datacenter (USB Delivery)

If the Bank's datacenter server has **ZERO internet access** (strict RBI banking security isolation):

### Step 1: On Your Development Machine (Build and Export Bundle)
```bash
# Build the Docker images
docker compose build

# Save Docker images into a single compressed archive
docker save namco-bank-app:latest nginx:1.25-alpine | gzip > namco-bank-images.tar.gz
```

### Step 2: Transfer to Bank Server via Secure USB / Internal Share
Copy these items onto the bank server:
1. `namco-bank-images.tar.gz`
2. The `namco-bank` project folder containing `docker-compose.yml`, `index.html`, `admin.html`, `assets/`, etc.

### Step 3: On the Bank's Server (Load and Launch)
```bash
cd /var/www/namco-bank

# 1. Load the pre-built images into Docker (Zero internet required)
docker load -i namco-bank-images.tar.gz

# 2. Launch the containers
docker compose up -d
```

---

## 🛠️ Essential Day-to-Day Operations

### View Live Logs
```bash
# All containers
docker compose logs -f

# Backend only
docker compose logs -f app

# Nginx access & security blocks
docker compose logs -f nginx
```

### Stop / Restart System
```bash
# Stop all services safely
docker compose down

# Restart services
docker compose restart
```

### Backup Database & Customer Data
All data is stored inside Docker named volume `namco_bank_data`. To take an instant backup snapshot:
```bash
docker run --rm -v namco_bank_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/namco_db_backup_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
```

### Restore Database from Backup
```bash
docker run --rm -v namco_bank_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/namco_db_backup_XXXXXX.tar.gz -C /data
```

---

## 🌐 Network & Access Rules

| Port | Service | Access Rules |
| :--- | :--- | :--- |
| **80 / 443** | Nginx Reverse Proxy | **Public Routes**: Accessible to all customers.<br/>**Admin Routes** (`admin.html`, `login.html`, `/api/v1/admin/`): Locked to bank internal subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.1.0/24`). |
| **8000** | Django Backend Gunicorn | Accessible **only internally** inside Docker bridge network. Never exposed to the host network directly. |
