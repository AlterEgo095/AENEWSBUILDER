# ============================================
# AENEWS STUDIO - Production Dockerfile
# ============================================

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ============================================
# DEPENDENCIES STAGE
# ============================================
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
COPY apps/studio/package.json ./apps/studio/
RUN pnpm install --frozen-lockfile || npm install

# ============================================
# BUILDER STAGE
# ============================================
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/studio/node_modules ./apps/studio/node_modules
COPY . .

RUN pnpm --filter @aenews/studio build

# ============================================
# RUNNER STAGE (Nginx to serve static files)
# ============================================
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/studio/dist /usr/share/nginx/html

# Nginx config for SPA
RUN echo 'server { \
    listen 5173; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /api { \
        proxy_pass http://api:3001; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
