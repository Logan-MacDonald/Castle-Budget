FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/

RUN npm ci

COPY packages/web ./packages/web

WORKDIR /app/packages/web
RUN npm run build

# nginx-unprivileged runs as uid 101 by default and listens on 8080,
# satisfying KICS/Trivy "Missing USER" without needing a CAP_NET_BIND.
FROM nginxinc/nginx-unprivileged:alpine AS runner
USER 101
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
