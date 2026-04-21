# Castle Budget — Deployment & Operations Guide

**Dev VM (MS-01 Proxmox, Ubuntu) → GitHub (personal) → Ops VM (MS-01, TBD)**

---

## Development loop

All development happens on the dev VM in `/home/logan/projects/castle-budget/`.

### Prerequisites

- Docker 24+, Docker Compose v2
- Node 20+, npm 10+
- git
- Postgres is exposed on `127.0.0.1:5433` by the compose stack (5432 is taken by the dev VM's system postgres)

Verify:
```bash
docker --version
docker compose version
node --version
git --version
```

### First-time setup on the dev VM

```bash
cd ~/projects/castle-budget
cp .env.example .env
# Edit .env:
#   JWT_SECRET        openssl rand -hex 32
#   COOKIE_SECRET     openssl rand -hex 32
#   POSTGRES_PASSWORD openssl rand -hex 24
#   ADMIN_SEED_PASSWORD   (something memorable)
#   MEMBER_SEED_PASSWORD  (something memorable)

npm install
docker compose up -d --build
```

The api container runs `prisma migrate deploy` + seed on every start. First start creates the schema and seeds users + debts + income sources + savings goals. Seed is idempotent — safe to re-run.

Load the app at `http://localhost` on the dev VM. Log in as `logan@castle.home` with the `ADMIN_SEED_PASSWORD` from `.env`.

### Day-to-day

```bash
# Logs
docker compose logs -f api
docker compose logs --tail=50 api

# Restart after code changes
docker compose up -d --build api

# Restart one service
docker compose restart api

# Stop everything
docker compose down

# Start fresh (destroys DB volume!)
docker compose down -v
docker compose up -d --build
```

### Running tests

```bash
npm test
# or watch mode:
cd packages/api && npm run test:watch
```

Tests require the postgres container to be running (they connect to `127.0.0.1:5433`). The test DB is `castle_budget_test` (created automatically on first volume init via `postgres-init/10-create-test-db.sh`).

Vitest runs test files sequentially (not in parallel) because tests share the same test DB. See `packages/api/vitest.config.ts`.

### Prisma Studio

```bash
# From dev VM:
cd packages/api
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5433/castle_budget" \
  npx prisma studio
# Opens http://localhost:5555 — pointed at the dev DB
```

### Making schema changes

```bash
# Edit packages/api/prisma/schema.prisma
cd packages/api
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5433/castle_budget" \
  npx prisma migrate dev --name descriptive-name

# Commit the generated migration folder
git add prisma/migrations/
```

### Pushing to GitHub

Repo: https://github.com/Logan-MacDonald/Castle-Budget (private).
Remote is configured via SSH:
```bash
git push origin main
```

The `github-personal` host alias in `~/.ssh/config` routes through the personal SSH key.

---

## Ops VM provisioning (post-dev)

**Not yet done.** Placeholder for the work after dev is complete:

1. Provision Ubuntu Server VM on MS-01 Proxmox.
2. Install Docker 24+, Docker Compose v2.
3. Clone the repo: `git clone git@github-personal:Logan-MacDonald/Castle-Budget.git` (or over HTTPS with a PAT).
4. Place `.env` with production secrets (not in the repo).
5. Set up local DNS or Tailscale routing for `budget.home`.
6. `docker compose up -d --build`.
7. Verify `curl http://localhost/health`.
8. First login + password change flow via the UI.
9. Set up pg_dump cron for weekly backups (see Backups below).

Treat ops VM as disposable — everything lives in the repo + `.env` + the `pg_data` volume.

---

## Backups (pg_dump)

Manual backup:
```bash
DB_USER=$(grep ^POSTGRES_USER .env | cut -d= -f2)
docker compose exec postgres pg_dump -U "$DB_USER" castle_budget \
  > ~/backups/castle-budget-$(date +%Y%m%d).sql
```

Restore:
```bash
DB_USER=$(grep ^POSTGRES_USER .env | cut -d= -f2)
cat ~/backups/castle-budget-YYYYMMDD.sql | \
  docker compose exec -T postgres psql -U "$DB_USER" castle_budget
```

Automating with cron on the ops VM is a roadmap item, not in this project's scope.

---

## Troubleshooting

**Can't reach http://localhost:**
```bash
docker compose ps
# All four services should show "Up". If nginx is down, check its logs:
docker compose logs nginx
```

**API 500 errors:**
```bash
docker compose logs api
# Look for Prisma connection errors or migration failures
```

**Database empty after wipe:**
```bash
# Seed is idempotent via count checks — safe to re-run:
docker compose exec api npx tsx prisma/seed.ts
```

**Forgot Logan's password:**
```bash
docker compose exec api node -e "
  const bcrypt = require('bcrypt');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  bcrypt.hash('NewPassword123!', 12).then(h =>
    prisma.user.update({ where: { email: 'logan@castle.home' }, data: { passwordHash: h, refreshToken: null } })
      .then(() => { console.log('Password reset; existing sessions invalidated.'); process.exit(0); })
  );
"
```

Setting `refreshToken: null` invalidates the logged-in session — user must log in again with the new password.

---

## Security notes

- LAN-only; Tailscale for remote (future).
- JWT access 15 min, refresh 30 days, refresh token rotated on every `/refresh`.
- Refresh tokens are SHA-256 digested before bcrypt hashing (bcrypt's 72-byte input limit would otherwise cause same-user JWT hashes to collide).
- `secure` cookies gated on `NODE_ENV=production`.
- Postgres on internal Docker network only; host port 5433 binds to 127.0.0.1 on the dev VM loopback.
- No 2FA, no rate limiting — acceptable for a 2-user LAN app.
- Role-based access: admin (Logan) edits the ledger, member (Carla) records activity (pay bills, record debt payments, contribute to savings, change own password).
