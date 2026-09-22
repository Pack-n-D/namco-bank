# ==============================================================================
# NAMCO BANK - Production Hardened Dockerfile
# Base: Official Python 3.12 Slim (Debian Bookworm)
# Includes: Tesseract OCR (Eng/Mar/Hin) for Physical Scanned Form Processing
# Security: Runs as non-root user (UID 10001) for Banking Compliance
# ==============================================================================
FROM python:3.12-slim-bookworm

# Prevent Python from writing .pyc files and enable unbuffered output for audit logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Install system dependencies:
# - tesseract-ocr, tesseract-ocr-mar (Marathi), tesseract-ocr-hin (Hindi)
# - libpq5 for PostgreSQL support
# - curl for Docker container health check
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-mar \
    tesseract-ocr-hin \
    curl \
    libpq5 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Security: Create dedicated non-root user (UID 10001) for banking isolation
RUN groupadd -g 10001 namco && \
    useradd -u 10001 -g namco -m -s /bin/bash appuser

WORKDIR /app

# Install Python dependencies first (leverages Docker layer cache)
COPY requirements.txt /app/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . /app/

# Create persistent storage directories and assign permissions
RUN mkdir -p /app/data /app/staticfiles /app/media && \
    chown -R appuser:namco /app

# Switch to non-root user
USER appuser

EXPOSE 8000

# Health check ensures Gunicorn is responding on API root
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://127.0.0.1:8000/api/v1/ || exit 1

# Production WSGI server execution
CMD ["gunicorn", "namco_core.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--threads", "2", "--timeout", "60", "--access-logfile", "-", "--error-logfile", "-"]
