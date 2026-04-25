FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/

# Install all workspace deps (needed for prisma generate + build)
RUN npm ci

# Copy api source
COPY packages/api ./packages/api

WORKDIR /app/packages/api
RUN npx prisma generate
RUN npm run build

# Separate prod-deps stage: a clean install with --omit=dev gives a
# correct prod-only tree. With workspaces, npm may keep some deps inside
# packages/<name>/node_modules instead of hoisting (e.g., date-fns@4
# stays in packages/api/node_modules when web pulls in date-fns@3),
# which is fine — the runner uses WORKDIR=/app/packages/api so node's
# resolver walks up through both layers.
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
RUN npm ci --omit=dev

# The prisma client is generated at build time, not installed from npm,
# so pull the produced artifacts over from the builder.
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
# node:20-alpine ships npm with vulnerable bundled deps (tar/cross-spawn/
# glob/minimatch). Upgrade to the latest npm to pick up clean copies.
RUN npm install -g npm@latest

# Run from inside the api workspace so node's module resolver finds
# both the workspace-local node_modules (e.g., date-fns@4) and the
# hoisted root node_modules (fastify, prisma, etc.).
WORKDIR /app/packages/api

# Hoisted prod deps (fastify, prisma client, bcrypt, …) at /app/node_modules
COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
# Workspace-local prod deps that didn't hoist (date-fns@4)
COPY --from=prod-deps --chown=node:node /app/packages/api/node_modules ./node_modules

COPY --from=builder --chown=node:node /app/packages/api/dist ./dist
COPY --from=builder --chown=node:node /app/packages/api/prisma ./prisma
COPY --from=builder --chown=node:node /app/packages/api/package.json ./

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3001/health || exit 1

# Compiled seed runs on plain node — no tsx required. prisma is a runtime
# dep so migrate deploy still works without dev deps.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/prisma/seed.js && node dist/index.js"]
