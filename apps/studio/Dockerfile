# ============================================
# AENEWS STUDIO - Production Dockerfile
# ============================================

FROM node:20-alpine AS base

# ============================================
# DEPENDENCIES STAGE
# ============================================
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* pnpm-workspace.yaml* ./
COPY apps/studio/package.json ./apps/studio/

RUN npm ci --ignore-scripts 2>/dev/null || npm install

# ============================================
# BUILDER STAGE
# ============================================
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/studio/node_modules ./apps/studio/node_modules
COPY . .

RUN cd apps/studio && npm run build

# ============================================
# RUNNER STAGE (Nginx to serve static files)
# ============================================
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/studio/dist /usr/share/nginx/html

# Nginx config for SPA (no /api proxy - external nginx handles that)
RUN echo 'server { \
    listen 5173; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
