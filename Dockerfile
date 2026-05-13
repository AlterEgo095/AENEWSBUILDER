# ============================================
# AENEWS BUILDER - Root Dockerfile (Monorepo)
# ============================================
# NOTE: Each app has its own optimized Dockerfile.
# Use docker compose to build individual services.
# This root Dockerfile is for reference/local builds only.
# ============================================

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# ============================================
# DEPENDENCIES STAGE
# ============================================
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* pnpm-workspace.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY apps/studio/package.json ./apps/studio/
COPY apps/admin/package.json ./apps/admin/
COPY packages/mcp/package.json ./packages/mcp/

RUN npm ci --ignore-scripts 2>/dev/null || npm install

# ============================================
# BUILDER STAGE
# ============================================
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/apps/studio/node_modules ./apps/studio/node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY --from=deps /app/packages/mcp/node_modules ./packages/mcp/node_modules
COPY . .

# Generate Prisma Client
RUN cd apps/api && npx prisma generate

# Build all packages
RUN npm run build 2>/dev/null || (cd apps/api && npm run build)

# ============================================
# RUNNER STAGE (API only)
# ============================================
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl wget

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 aenews

# Copy built API application
COPY --from=builder --chown=aenews:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=aenews:nodejs /app/apps/api/node_modules ./node_modules
COPY --from=builder --chown=aenews:nodejs /app/apps/api/package.json ./package.json
COPY --from=builder --chown=aenews:nodejs /app/apps/api/prisma ./prisma

# Create secrets directory
RUN mkdir -p /app/secrets

USER aenews

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "dist/index.js"]
