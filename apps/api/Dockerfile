# ============================================
# AENEWS API - Production Dockerfile
# ============================================

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl

# ============================================
# DEPENDENCIES STAGE
# ============================================
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* pnpm-workspace.yaml* ./
COPY apps/api/package.json ./apps/api/

RUN npm ci --ignore-scripts 2>/dev/null || npm install

# ============================================
# BUILDER STAGE
# ============================================
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .

# Generate Prisma Client
RUN cd apps/api && npx prisma generate

# Build API
RUN cd apps/api && npm run build

# ============================================
# RUNNER STAGE
# ============================================
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 aenews

# Copy built application
COPY --from=builder --chown=aenews:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=aenews:nodejs /app/apps/api/node_modules ./node_modules
COPY --from=builder --chown=aenews:nodejs /app/apps/api/package.json ./package.json
COPY --from=builder --chown=aenews:nodejs /app/apps/api/prisma ./prisma

# Create secrets directory with placeholder
RUN mkdir -p /app/secrets

USER aenews

EXPOSE 3001

CMD ["node", "dist/index.js"]
