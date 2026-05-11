# ============================================
# AENEWS BUILDER - Root Dockerfile (Monorepo)
# ============================================
# NOTE: Each app has its own Dockerfile.
# Use docker-compose.yml to build individual services.
# ============================================

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY apps/studio/package.json ./apps/studio/
COPY packages/mcp/package.json ./packages/mcp/

RUN pnpm install --frozen-lockfile || npm install

COPY . .

RUN pnpm build

CMD ["pnpm", "dev"]
