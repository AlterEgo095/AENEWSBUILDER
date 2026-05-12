# ============================================
# AENEWS ADMIN - Production Dockerfile
# ============================================

FROM node:20-alpine AS base

# ============================================
# DEPENDENCIES STAGE
# ============================================
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* pnpm-workspace.yaml* ./
COPY apps/admin/package.json ./apps/admin/

RUN npm ci --ignore-scripts 2>/dev/null || npm install

# ============================================
# BUILDER STAGE
# ============================================
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY . .

RUN cd apps/admin && npx vite build

# ============================================
# RUNNER STAGE (Nginx to serve static files)
# ============================================
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html

# Nginx config for SPA (no /api proxy - external nginx handles that)
# HTML: no-cache so Cloudflare always fetches fresh version
# JS/CSS: immutable cache (Vite uses content-hashed filenames)
RUN echo 'server { \
    listen 5174; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    \
    location ~* \.html$ { \
        add_header Cache-Control "no-cache, no-store, must-revalidate"; \
        add_header Pragma "no-cache"; \
        add_header Expires "0"; \
    } \
    \
    location ~* \.(js|css|woff2?|png|jpg|svg|ico)$ { \
        add_header Cache-Control "public, max-age=31536000, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

RUN apk add --no-cache wget

EXPOSE 5174

HEALTHCHECK --interval=15s --timeout=3s --retries=3 --start-period=5s \
  CMD wget -qO- http://localhost:5174/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
