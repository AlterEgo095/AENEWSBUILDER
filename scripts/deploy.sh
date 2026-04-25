#!/bin/bash

# ============================================
# AENEWS BUILDER - VPS Deployment Script
# ============================================

set -e

echo "🚀 AENEWS BUILDER - Déploiement VPS"
echo "======================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Fichier .env manquant!${NC}"
    echo "Copier .env.example vers .env et configurer les variables"
    exit 1
fi

# Check if JWT keys exist
if [ ! -f secrets/jwt-private.pem ]; then
    echo -e "${YELLOW}⚠️  Clés JWT manquantes. Génération...${NC}"
    mkdir -p secrets
    openssl genrsa -out secrets/jwt-private.pem 2048
    openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem
    chmod 600 secrets/jwt-private.pem
    echo -e "${GREEN}✅ Clés JWT générées${NC}"
fi

# Pull latest images
echo -e "${YELLOW}📦 Pulling Docker images...${NC}"
docker-compose pull

# Stop existing containers
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker-compose down

# Start services
echo -e "${YELLOW}🚀 Starting services...${NC}"
docker-compose up -d

# Wait for services to be ready
echo -e "${YELLOW}⏳ Waiting for services...${NC}"
sleep 10

# Run database migrations
echo -e "${YELLOW}📊 Running database migrations...${NC}"
docker-compose exec -T api npx prisma migrate deploy

# Health check
echo -e "${YELLOW}🏥 Checking health...${NC}"
sleep 5

if curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo ""
    echo "📊 Services Status:"
    docker-compose ps
    echo ""
    echo "📝 View logs: docker-compose logs -f"
    echo "🌐 API: http://localhost:3001"
    echo "🎨 Studio: http://localhost:5173"
else
    echo -e "${RED}❌ Health check failed!${NC}"
    echo "View logs: docker-compose logs"
    exit 1
fi
