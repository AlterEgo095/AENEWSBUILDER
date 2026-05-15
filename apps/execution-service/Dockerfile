# ============================================
# AENEWS Execution Service - Isolated Docker API
# Security: Docker socket access only in this container
# Build context: ./apps/execution-service
# ============================================

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat

# ============================================
# DEPENDENCIES + BUILD STAGE
# ============================================
FROM base AS builder
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --legacy-peer-deps 2>/dev/null

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# ============================================
# RUNNER STAGE
# ============================================
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat wget

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 execsvc

# Copy built files and dependencies
COPY --from=builder --chown=execsvc:nodejs /app/dist ./dist
COPY --from=builder --chown=execsvc:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=execsvc:nodejs /app/package.json ./

# Create sandbox temp directory
RUN mkdir -p /tmp/aenewsb-sandbox && chown execsvc:nodejs /tmp/aenewsb-sandbox

USER execsvc

EXPOSE 3010

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3010/exec/health || exit 1

CMD ["node", "dist/index.js"]
