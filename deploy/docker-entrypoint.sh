#!/bin/sh
set -e

echo "=== NAMCO BANK PRODUCTION CONTAINER INITIALIZATION ==="

# Wait for database if external PostgreSQL is configured
if [ -n "$DB_HOST" ] && [ "$DB_HOST" != "localhost" ]; then
    echo "Waiting for database connection at $DB_HOST:${DB_PORT:-5432}..."
    while ! nc -z "$DB_HOST" "${DB_PORT:-5432}"; do
        sleep 1
    done
    echo "Database is reachable."
fi

# Run Django database migrations
echo "Applying database schema migrations..."
python manage.py migrate --noinput

# Collect static assets into staticfiles directory
echo "Collecting static assets..."
python manage.py collectstatic --noinput --clear

echo "Starting Gunicorn WSGI Server (Workers: 4, Threads: 2)..."
exec "$@"
