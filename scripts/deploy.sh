#!/bin/bash

# ============================================
# AENEWS BUILDER - VPS Deployment Script
# ============================================

set -e

echo "🚀 AENEWS BUILDER - Deployment"
echo "======================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file missing!${NC}"
    echo "Copy .env.example to .env and configure variables"
    exit 1
fi

# Create secrets directory if missing
if [ ! -d secrets ]; then
    mkdir -p secrets
fi

# Generate JWT keys if missing
if [ ! -f secrets/jwt-private.pem ] || [ ! -f secrets/jwt-public.pem ]; then
    echo -e "${YELLOW}⚠️  JWT keys missing. Generating...${NC}"
    openssl genrsa -out secrets/jwt-private.pem 2048 2>/dev/null
    openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem 2>/dev/null
    chmod 600 secrets/jwt-private.pem
    chmod 644 secrets/jwt-public.pem
    echo -e "${GREEN}✅ JWT keys generated${NC}"
fi

# Build images
echo -e "${YELLOW}📦 Building Docker images...${NC}"
docker-compose build

# Stop existing containers (if any)
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker-compose down --remove-orphans 2>/dev/null || true

# Start services
echo -e "${YELLOW}🚀 Starting services...${NC}"
docker-compose up -d

# Wait for services to be healthy
echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"

MAX_WAIT=120
WAITED=0

while [ $WAITED -lt $MAX_WAIT ]; do
    if docker-compose ps | grep -q "unhealthy\|starting"; then
        sleep 5
        WAITED=$((WAITED + 5))
    else
        break
    fi
done

# Run database migrations
echo -e "${YELLOW}📊 Running database migrations...${NC}"
docker-compose exec -T api npx prisma migrate deploy 2>&1 || {
    echo -e "${YELLOW}⚠️  Migration failed, attempting db push...${NC}"
    docker-compose exec -T api npx prisma db push 2>&1
}

# Health check
echo -e "${YELLOW}🏥 Checking health...${NC}"
sleep 5

if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
    echo ""
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo ""
    echo "📊 Services Status:"
    docker-compose ps
    echo ""
    echo "📝 View logs: docker-compose logs -f"
    echo "🌐 API: http://localhost:3001"
    echo "🎨 Studio: http://localhost:5173"
    echo "📊 Grafana: http://localhost:3000"
    echo "📈 Prometheus: http://localhost:9090"
else
    echo ""
    echo -e "${RED}❌ Health check failed!${NC}"
    echo ""
    echo "View logs: docker-compose logs api"
    docker-compose logs --tail=50 api
    exit 1
fi
