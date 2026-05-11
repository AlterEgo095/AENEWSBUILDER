# ============================================
# AENEWS BUILDER - Root Dockerfile (Monorepo)
# ============================================
# NOTE: Each app has its own Dockerfile.
# Use docker-compose.yml to build individual services.
# ============================================

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY apps/studio/package.json ./apps/studio/
COPY packages/mcp/package.json ./packages/mcp/

RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY . .

RUN pnpm build

CMD ["node", "apps/api/dist/index.js"]
