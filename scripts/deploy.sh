#!/bin/bash

# ============================================
# AENEWS BUILDER - VPS First Deployment Script
# ============================================
# Usage: ./scripts/deploy.sh
# Run this ONCE for first-time VPS setup
# For updates, use: ./scripts/update.sh
# ============================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║        🚀 AENEWS BUILDER - VPS Deployment                   ║"
echo "║        Industrial AI Operating System (L4 + MCP)             ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ============================================
# PRE-FLIGHT CHECKS
# ============================================

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed!${NC}"
    echo "Install it first: https://docs.docker.com/engine/install/"
    exit 1
fi

# Check Docker Compose plugin
if ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose plugin is not installed!${NC}"
    echo "Install it first: https://docs.docker.com/compose/install/"
    exit 1
fi

# Check .env file
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file missing!${NC}"
    echo -e "${YELLOW}Creating from .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${YELLOW}⚠️  .env created from template. EDIT IT BEFORE CONTINUING!${NC}"
        echo -e "${YELLOW}   nano .env${NC}"
        exit 1
    else
        echo -e "${RED}   .env.example not found either. Aborting.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Docker + Compose detected${NC}"
echo -e "${GREEN}✅ .env file found${NC}"

# ============================================
# GENERATE JWT KEYS
# ============================================

if [ ! -f secrets/jwt-private.pem ] || [ ! -f secrets/jwt-public.pem ]; then
    echo -e "${YELLOW}🔑 Generating JWT RS256 key pair...${NC}"
    mkdir -p secrets
    openssl genrsa -out secrets/jwt-private.pem 2048 2>/dev/null
    openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem 2>/dev/null
    chmod 600 secrets/jwt-private.pem
    chmod 644 secrets/jwt-public.pem
    echo -e "${GREEN}✅ JWT keys generated in secrets/${NC}"
else
    echo -e "${GREEN}✅ JWT keys already exist${NC}"
fi

# ============================================
# BUILD DOCKER IMAGES
# ============================================

echo -e "${YELLOW}📦 Building Docker images (this may take a few minutes)...${NC}"
docker compose build

# ============================================
# STOP EXISTING CONTAINERS
# ============================================

echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker compose down --remove-orphans 2>/dev/null || true

# ============================================
# START INFRASTRUCTURE (DB + Redis first)
# ============================================

echo -e "${YELLOW}🐘 Starting PostgreSQL and Redis...${NC}"
docker compose up -d postgres redis

# Wait for healthy databases
echo -e "${YELLOW}⏳ Waiting for databases to be ready...${NC}"
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    POSTGRES_READY=$(docker compose ps postgres --format json 2>/dev/null | grep -o '"Health":"[^"]*"' | grep -c 'healthy' || true)
    REDIS_READY=$(docker compose ps redis --format json 2>/dev/null | grep -o '"Health":"[^"]*"' | grep -c 'healthy' || true)
    if [ "$POSTGRES_READY" -ge 1 ] && [ "$REDIS_READY" -ge 1 ]; then
        echo -e "${GREEN}✅ PostgreSQL and Redis are healthy${NC}"
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo -e "${YELLOW}⚠️  Health checks timed out, proceeding anyway...${NC}"
fi

# ============================================
# RUN DATABASE MIGRATIONS
# ============================================

echo -e "${YELLOW}📊 Running Prisma migrations...${NC}"
if docker compose exec -T postgres pg_isready -U aenews &>/dev/null; then
    docker compose run --rm api npx prisma migrate deploy 2>&1 || {
        echo -e "${YELLOW}⚠️  Migration failed, attempting db push...${NC}"
        docker compose run --rm api npx prisma db push 2>&1
    }
    echo -e "${GREEN}✅ Database schema applied${NC}"
else
    echo -e "${RED}❌ PostgreSQL is not responding. Check logs: docker compose logs postgres${NC}"
    exit 1
fi

# ============================================
# START ALL SERVICES
# ============================================

echo -e "${YELLOW}🚀 Starting all services...${NC}"
docker compose up -d

# ============================================
# WAIT FOR API HEALTH
# ============================================

echo -e "${YELLOW}⏳ Waiting for API to respond...${NC}"
MAX_WAIT=120
WAITED=0

while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -sf http://localhost/api/health > /dev/null 2>&1; then
        break
    fi
    sleep 3
    WAITED=$((WAITED + 3))
    echo -e "   Waiting... (${WAITED}s)"
done

# ============================================
# FINAL STATUS
# ============================================

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if curl -sf http://localhost/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ DEPLOYMENT SUCCESSFUL!${NC}"
    echo ""
    echo -e "${BLUE}📊 Services Status:${NC}"
    docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    echo -e "${BLUE}🌐 Access Points:${NC}"
    echo -e "   Studio:      ${GREEN}http://$(hostname -I | awk '{print $1}')${NC}"
    echo -e "   Admin:       ${GREEN}http://$(hostname -I | awk '{print $1}')/admin${NC}"
    echo -e "   API Health:  ${GREEN}http://$(hostname -I | awk '{print $1}')/api/health${NC}"
    echo -e "   API Metrics: ${GREEN}http://$(hostname -I | awk '{print $1}')/metrics${NC}"
    echo ""
    echo -e "${BLUE}📋 Useful Commands:${NC}"
    echo -e "   View logs:    ${YELLOW}docker compose logs -f${NC}"
    echo -e "   View API logs:${YELLOW}docker compose logs -f api${NC}"
    echo -e "   Stop:         ${YELLOW}docker compose down${NC}"
    echo -e "   Update:       ${YELLOW}./scripts/update.sh${NC}"
    echo -e "   Restart:      ${YELLOW}docker compose restart${NC}"
    echo ""
else
    echo -e "${RED}❌ DEPLOYMENT FAILED — API health check did not pass${NC}"
    echo ""
    echo -e "${YELLOW}🔍 Debugging:${NC}"
    echo -e "   All logs:     docker compose logs"
    echo -e "   API logs:     docker compose logs api"
    echo -e "   DB logs:      docker compose logs postgres"
    echo -e "   Redis logs:   docker compose logs redis"
    echo -e "   Nginx logs:   docker compose logs nginx"
    docker compose logs --tail=30 api
    exit 1
fi
