# ============================================
# AENEWS STUDIO - Production Dockerfile
# ============================================

FROM node:20-alpine AS base

# ============================================
# DEPENDENCIES STAGE
# ============================================
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/studio/package.json ./apps/studio/

RUN npm install --ignore-scripts 2>/dev/null

# ============================================
# BUILDER STAGE
# ============================================
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN cd apps/studio && npx vite build

# ============================================
# RUNNER STAGE (Nginx to serve static files)
# ============================================
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/studio/dist /usr/share/nginx/html

# Nginx config for SPA (no /api proxy - external nginx handles that)
# HTML: no-cache so browsers/Cloudflare always fetch fresh version
# JS/CSS: immutable cache (Vite uses content-hashed filenames)
RUN echo 'server { \
    listen 5173; \
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

RUN chown -R 101:101 /usr/share/nginx/html && chown -R 101:101 /var/cache/nginx && chown -R 101:101 /var/log/nginx
USER 101

EXPOSE 5173

HEALTHCHECK --interval=15s --timeout=3s --retries=3 --start-period=5s \
  CMD wget -qO- http://localhost:5173/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
