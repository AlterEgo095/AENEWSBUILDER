# ============================================
# AENEWS ADMIN - Production Dockerfile
# ============================================

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ============================================
# DEPENDENCIES STAGE
# ============================================
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY apps/admin/package.json ./apps/admin/

RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install --prod=false

# ============================================
# BUILDER STAGE
# ============================================
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY . .

RUN pnpm --filter @aenews/admin build

# ============================================
# RUNNER STAGE (Nginx to serve static files)
# ============================================
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html

# Nginx config for SPA (no /api proxy - external nginx handles that)
RUN echo 'server { \
    listen 5174; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 5174

CMD ["nginx", "-g", "daemon off;"]
