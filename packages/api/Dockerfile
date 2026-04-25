FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/

# Install all workspace deps (needed for prisma generate)
RUN npm ci

# Copy api source
COPY packages/api ./packages/api

WORKDIR /app/packages/api
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl

# Copy built app and runtime files, owned by the unprivileged node user.
# Workspace deps are hoisted to /app/node_modules, not /app/packages/api/node_modules.
COPY --from=builder --chown=node:node /app/packages/api/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages/api/prisma ./prisma
COPY --from=builder --chown=node:node /app/packages/api/package.json ./

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3001/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && node dist/index.js"]
