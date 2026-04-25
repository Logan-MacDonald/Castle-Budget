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

# Drop dev deps so the runtime image doesn't carry vitest/tsx/esbuild and
# their CVEs. Run from repo root so the prune sees the workspace.
WORKDIR /app
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
# node:20-alpine ships npm with vulnerable bundled deps (tar/cross-spawn/
# glob/minimatch). Upgrade to the latest npm to pick up clean copies.
RUN npm install -g npm@latest

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

# Compiled seed runs on plain node — no tsx required. prisma is a runtime
# dep so migrate deploy still works after the prune.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/prisma/seed.js && node dist/index.js"]
