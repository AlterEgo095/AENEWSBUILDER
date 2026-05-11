# ============================================
# AENEWS BUILDER - Makefile (VPS Commands)
# ============================================
# Usage: make <command>
# ============================================

.PHONY: help deploy update restart stop start status health logs logs-api logs-db logs-nginx backup clean ssl-renew shell-api migrate psql redis-cli

# Default
help:
        @echo ""
        @echo "╔══════════════════════════════════════════════════════════════╗"
        @echo "║        AENEWS BUILDER - Commandes VPS                       ║"
        @echo "╚══════════════════════════════════════════════════════════════╝"
        @echo ""
        @echo "  make deploy      First-time deployment"
        @echo "  make update      Pull + rebuild + migrate + healthcheck"
        @echo "  make restart     Restart all services"
        @echo "  make stop        Stop all services"
        @echo "  make start       Start all services"
        @echo "  make status      Show containers status"
        @echo "  make health      API health check"
        @echo "  make logs        Tail all logs"
        @echo "  make logs-api    Tail API logs only"
        @echo "  make logs-db     Tail DB logs only"
        @echo "  make logs-nginx  Tail Nginx logs only"
        @echo "  make backup      Manual database backup"
        @echo "  make clean       Remove old Docker images"
        @echo "  make ssl-renew   Renew SSL certificates"
        @echo "  make shell-api   Open shell inside API container"
        @echo "  make migrate     Run Prisma migrations"
        @echo "  make psql        Open PostgreSQL shell"
        @echo "  make redis-cli   Open Redis CLI"
        @echo ""

# First-time deployment
deploy:
        @./scripts/deploy.sh

# Pull + rebuild + restart
update:
        @./scripts/update.sh

# Restart services
restart:
        @echo "Restarting all services..."
        docker compose restart
        @echo "Done. Check status: make status"

# Stop all services
stop:
        @echo "Stopping all services..."
        docker compose down
        @echo "Stopped."

# Start all services
start:
        @echo "Starting all services..."
        docker compose up -d
        @echo "Started. Check status: make status"

# Container status
status:
        @docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

# API health check
health:
        @echo "Checking API health..."
        @curl -sf http://localhost/api/health | python3 -m json.tool 2>/dev/null || \
        echo "API is not responding. Check logs: make logs-api"

# Tail all logs
logs:
        docker compose logs -f --tail=100

# Tail API logs
logs-api:
        docker compose logs -f --tail=100 api

# Tail DB logs
logs-db:
        docker compose logs -f --tail=50 postgres redis

# Tail Nginx logs
logs-nginx:
        docker compose logs -f --tail=50 nginx

# Manual backup
backup:
        @echo "Creating backup..."
        @mkdir -p backups
        @docker compose exec -T postgres pg_dump -U aenews aenews_builder | gzip > backups/postgres_$$(date +%Y%m%d_%H%M%S).sql.gz
        @echo "Backup saved to backups/"

# Clean old Docker images
clean:
        @echo "Cleaning Docker..."
        docker image prune -af
        docker builder prune -af
        @echo "Done."

# SSL renewal (run as root or with sudo)
ssl-renew:
        @echo "Renewing SSL certificates..."
        sudo certbot renew --quiet
        sudo docker compose exec nginx nginx -s reload
        @echo "SSL renewed."

# Shell inside API container
shell-api:
        docker compose exec api sh

# Run Prisma migrations
migrate:
        @echo "Running migrations..."
        docker compose exec -T api npx prisma migrate deploy

# Open PostgreSQL shell
psql:
        docker compose exec postgres psql -U aenews -d aenews_builder

# Open Redis CLI
redis-cli:
        docker compose exec -e REDISCLI_AUTH=$${REDIS_PASSWORD:-aenews_redis_secure_password} redis redis-cli
