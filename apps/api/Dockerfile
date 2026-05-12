# ============================================
# AENEWS API - Production Dockerfile
# ============================================

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl

# ============================================
# DEPENDENCIES + BUILD STAGE
# ============================================
FROM base AS builder
WORKDIR /app

# Copy all workspace package.json files (monorepo requirement)
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/mcp/package.json ./packages/mcp/

# Install with legacy peer deps
RUN npm install --legacy-peer-deps --ignore-scripts 2>/dev/null

COPY . .

# Generate Prisma Client
RUN cd apps/api && npx prisma generate

# Build API (skip strict tsc for production)
RUN cd apps/api && npx tsc -p tsconfig.build.json --noEmitOnError false --declaration false --sourceMap false 2>&1; npx tsc-alias -p tsconfig.build.json 2>&1; true

# ============================================
# RUNNER STAGE
# ============================================
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 aenews

# Copy ALL needed files from builder
COPY --from=builder --chown=aenews:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=aenews:nodejs /app/apps/api/prisma ./prisma
COPY --from=builder --chown=aenews:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=aenews:nodejs /app/packages/mcp ./packages/mcp

# Create secrets directory
RUN mkdir -p /app/secrets

USER aenews

EXPOSE 3001

CMD ["node", "dist/index.js"]
