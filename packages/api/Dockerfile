# ── Build stage ───────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
COPY packages/portal/package.json ./packages/portal/

RUN npm ci

# Copy API source + prisma schema
COPY packages/api/ ./packages/api/

# Generate Prisma client and compile TypeScript
RUN npx prisma generate --schema=packages/api/prisma/schema.prisma
RUN npm run build --workspace=packages/api

# ── Production stage ──────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy workspace root files for production install
COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
COPY packages/portal/package.json ./packages/portal/

RUN npm ci --omit=dev

# Copy prisma schema and generate client for production
COPY packages/api/prisma/ ./packages/api/prisma/
RUN npx prisma generate --schema=packages/api/prisma/schema.prisma

# Copy compiled output from builder
COPY --from=builder /app/packages/api/dist/ ./packages/api/dist/

# Create uploads directory
RUN mkdir -p /app/packages/api/uploads

WORKDIR /app/packages/api

EXPOSE 3000

CMD ["node", "dist/index.js"]
