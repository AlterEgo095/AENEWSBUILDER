#!/bin/bash

# ============================================
# AENEWS BUILDER - VPS Update Script
# ============================================
# Usage: ./scripts/update.sh
# Pulls latest code, rebuilds, and restarts
# Zero-downtime strategy: builds before stopping
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
echo "║        🔄 AENEWS BUILDER - VPS Update                       ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ============================================
# PULL LATEST CODE
# ============================================

echo -e "${YELLOW}📥 Pulling latest code from main branch...${NC}"
git fetch origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    echo -e "${GREEN}✅ Already up to date (no changes)${NC}"
else
    echo -e "${BLUE}📦 Changes found. Updating...${NC}"
    git pull origin main
    echo -e "${GREEN}✅ Code updated${NC}"
fi

# ============================================
# BUILD NEW IMAGES (before stopping old ones)
# ============================================

echo -e "${YELLOW}📦 Building new Docker images...${NC}"
docker compose build

# ============================================
# RESTART WITH NEW IMAGES
# ============================================

echo -e "${YELLOW}🔄 Restarting services with new images...${NC}"
docker compose up -d

# ============================================
# RUN PENDING MIGRATIONS
# ============================================

echo -e "${YELLOW}📊 Checking for database migrations...${NC}"
sleep 10
docker compose exec -T api npx prisma migrate deploy 2>&1 || {
    echo -e "${YELLOW}⚠️  No new migrations or migration skipped${NC}"
}

# ============================================
# HEALTH CHECK
# ============================================

echo -e "${YELLOW}🏥 Checking API health...${NC}"
MAX_WAIT=90
WAITED=0

while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -sf http://localhost/api/health > /dev/null 2>&1; then
        break
    fi
    sleep 3
    WAITED=$((WAITED + 3))
done

echo ""
if curl -sf http://localhost/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ UPDATE SUCCESSFUL!${NC}"
    docker compose ps --format "table {{.Name}}\t{{.Status}}"
    echo ""
    echo -e "${BLUE}🧹 Cleaning up old images...${NC}"
    docker image prune -f --filter "label=com.docker.compose.project=aenews" 2>/dev/null || true
else
    echo -e "${RED}❌ Update failed — health check did not pass${NC}"
    echo -e "${YELLOW}Rolling back...${NC}"
    git checkout HEAD~1 -- . 2>/dev/null || true
    docker compose up -d --build
    echo -e "${YELLOW}Check logs: docker compose logs -f api${NC}"
    exit 1
fi
