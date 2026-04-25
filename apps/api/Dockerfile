# ============================================
# AENEWS API - Production Dockerfile
# ============================================

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ============================================
# DEPENDENCIES STAGE
# ============================================
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

# ============================================
# BUILDER STAGE
# ============================================
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN cd apps/api && npx prisma generate

# Build API
RUN pnpm --filter @aenews/api build

# ============================================
# RUNNER STAGE
# ============================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 aenews

# Copy built application
COPY --from=builder --chown=aenews:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=aenews:nodejs /app/apps/api/node_modules ./node_modules
COPY --from=builder --chown=aenews:nodejs /app/apps/api/package.json ./package.json
COPY --from=builder --chown=aenews:nodejs /app/apps/api/prisma ./prisma

USER aenews

EXPOSE 3001

CMD ["node", "dist/index.js"]
