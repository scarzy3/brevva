# ── Build stage ───────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
COPY packages/portal/package.json ./packages/portal/

RUN npm ci

# Copy portal source
COPY packages/portal/ ./packages/portal/

RUN npm run build --workspace=packages/portal

# ── Serve stage ───────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/packages/portal/dist /usr/share/nginx/html

# SPA fallback: serve index.html for all routes
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
