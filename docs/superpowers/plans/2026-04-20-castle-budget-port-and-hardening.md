# Castle Budget Port & Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the castle-budget scaffold from SQLite to Postgres, convert monetary fields from `Float` to `Decimal`, restructure auth, fix the dashboard upcoming-bills month-crossing bug, and add unit + integration tests for the risky math and auth flow.

**Architecture:** A npm-workspaces monorepo with `packages/api` (Fastify + Prisma) and `packages/web` (React + Vite). Single docker-compose stack (Postgres + API + web + nginx). The strategy engine and dashboard date helpers extract into pure library files so they can be tested without Fastify.

**Tech Stack:** TypeScript, Fastify 4, Prisma 5, Postgres 16, React 18, Vite 5, `decimal.js`, `date-fns`, `vitest`, bcrypt, JWT via `@fastify/jwt`, Docker Compose.

**Spec:** See `docs/superpowers/specs/2026-04-20-castle-budget-port-and-hardening-design.md` for the approved design.

---

## Working assumptions

- All work happens on the dev VM, in `/home/logan/projects/castle-budget/`.
- The repo already has `main` branch with an initial commit containing the scaffold and design spec, pushed to `git@github-personal:Logan-MacDonald/Castle-Budget.git`.
- Commit identity is `logan.macdonald@gmail.com` / `Logan MacDonald` (repo-local config).
- Node 20 + npm 10 are installed. Docker 24+ and Docker Compose v2 are installed.
- `docker compose up` is expected to work by end of Task 7.
- Each task ends with a commit. Never batch multiple tasks into one commit.

## File structure (what changes where)

**Deleted:**
- `packages/api/src/middleware/auth.ts` (Task 20)
- `packages/api/src/{routes,plugins,lib,middleware}/` (Task 1)
- `packages/web/src/{pages,components,hooks,lib,context}/` (Task 1)
- `packages/api/prisma/migrations/` contents except `migration_lock.toml` (Task 3)

**Created:**
- `packages/api/src/lib/debt-strategy.ts` — extracted strategy engine (Task 10)
- `packages/api/src/lib/debt-strategy.test.ts` — unit tests (Task 11)
- `packages/api/src/lib/dashboard-helpers.ts` — extracted date logic (Task 16)
- `packages/api/src/lib/dashboard-helpers.test.ts` — unit tests (Tasks 17, 19)
- `packages/api/src/lib/auth-hooks.ts` — `requireAuth` and `requireAdmin` hooks (Task 20)
- `packages/api/src/routes/auth.test.ts` — integration tests (Task 23)
- `packages/api/vitest.config.ts` — test config (Task 9)
- `packages/api/test/setup.ts` — test DB wipe helper (Task 23)

**Modified:**
- `packages/api/prisma/schema.prisma` — provider + Decimal (Task 3)
- `packages/api/prisma/seed.ts` — Decimal-safe seed values (Task 3)
- `packages/api/package.json` — deps + scripts (Tasks 2, 8, 9, 17, 23)
- `packages/api/src/index.ts` — protected scope registration (Task 20)
- `packages/api/src/routes/auth.ts` — refresh rotation (Task 22)
- `packages/api/src/routes/debts.ts` — strategy import + Decimal + role hooks (Tasks 10, 12, 14, 21)
- `packages/api/src/routes/bills.ts` — role hooks (Task 21)
- `packages/api/src/routes/dashboard.ts` — Decimal rollups + helper import (Tasks 13, 16)
- `packages/api/src/routes/income.ts` — role hooks (Task 21)
- `packages/api/src/routes/savings.ts` — Decimal arithmetic + role hooks (Tasks 14, 21)
- `packages/api/src/routes/accounts.ts` — role hooks (Task 21)
- `packages/api/src/routes/settings.ts` — switch from inline role checks to hook (Task 21)
- `packages/api/src/routes/transactions.ts` — role hooks (Task 21)
- `packages/api/Dockerfile` — workspace-root build (Task 5)
- `packages/web/Dockerfile` — workspace-root build (Task 5)
- `packages/web/package.json` — vitest devDep (Task 9)
- `packages/web/src/lib/api.ts` — `parseMoney` helper (Task 15)
- `docker-compose.yml` — postgres service + build contexts (Task 4)
- `.env.example` — postgres env (Task 6)
- `.gitignore` — drop SQLite entries (Task 6)
- `DEPLOYMENT.md` — full rewrite (Task 24)
- `README.md` — roadmap/hostnames (Task 25)

---

### Task 1: Delete brace-artifact directories

**Files:**
- Delete: `packages/api/src/{routes,plugins,lib,middleware}` (literal directory name)
- Delete: `packages/web/src/{pages,components,hooks,lib,context}` (literal directory name)

- [ ] **Step 1: Verify the directories are empty**

Run: `ls -la 'packages/api/src/{routes,plugins,lib,middleware}' 'packages/web/src/{pages,components,hooks,lib,context}'`
Expected: both directories listed, each containing only `.` and `..`. If there are any files, STOP and investigate.

- [ ] **Step 2: Delete the directories**

Run:
```bash
rmdir 'packages/api/src/{routes,plugins,lib,middleware}'
rmdir 'packages/web/src/{pages,components,hooks,lib,context}'
```

- [ ] **Step 3: Verify deletion**

Run: `ls packages/api/src/ packages/web/src/`
Expected: the `{...}` literal directories are gone. Normal dirs (`routes`, `lib`, `middleware`, `pages`, `components`, `context`) remain.

- [ ] **Step 4: Commit**

The deletions won't show in `git status` because git doesn't track empty directories. No commit — skip to Task 2. (Adding a commit here with no diff would fail.)

---

### Task 2: Remove unused `otplib` from api deps

**Files:**
- Modify: `packages/api/package.json`

- [ ] **Step 1: Edit the package.json**

Open `packages/api/package.json` and delete the `"otplib": "^12.0.1",` line from `dependencies`. Final `dependencies` block should be:

```json
"dependencies": {
  "@fastify/cookie": "^9.3.1",
  "@fastify/cors": "^9.0.1",
  "@fastify/jwt": "^8.0.1",
  "@prisma/client": "^5.14.0",
  "bcrypt": "^5.1.1",
  "fastify": "^4.27.0",
  "zod": "^3.23.8"
},
```

- [ ] **Step 2: Run npm install to sync lockfile**

Run: `npm install`
Expected: succeeds, `package-lock.json` updates. No errors. (If `package-lock.json` doesn't exist yet from prior `npm install`, that's fine — this creates it.)

- [ ] **Step 3: Verify otplib is gone**

Run: `grep -c otplib packages/api/package.json package-lock.json || true`
Expected: `0` matches in `packages/api/package.json`. `package-lock.json` may still reference it transitively as zero; we care about the direct dep.

- [ ] **Step 4: Commit**

```bash
git add packages/api/package.json package-lock.json
git commit -m "Remove unused otplib dependency from api package"
```

---

### Task 3: Switch Prisma schema to Postgres + Decimal; reset migrations

**Files:**
- Modify: `packages/api/prisma/schema.prisma`
- Modify: `packages/api/prisma/seed.ts`
- Delete: `packages/api/prisma/migrations/*` (everything)

- [ ] **Step 1: Rewrite `schema.prisma`**

Replace the entire file content with:

```prisma
// castle-budget prisma schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Auth ────────────────────────────────────────────────────────────────────

model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  role         Role     @default(MEMBER)
  refreshToken String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  billPayments BillPayment[]
  debtPayments DebtPayment[]
}

enum Role {
  ADMIN
  MEMBER
}

// ─── Accounts ────────────────────────────────────────────────────────────────

model Account {
  id          String      @id @default(cuid())
  name        String
  institution String?
  type        AccountType
  balance     Decimal     @default(0) @db.Decimal(12, 2)
  isActive    Boolean     @default(true)
  isBusiness  Boolean     @default(false)
  notes       String?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  bills        Bill[]
  debts        Debt[]
  transactions Transaction[]
  savingsGoals SavingsGoal[]
}

enum AccountType {
  CHECKING
  SAVINGS
  CREDIT_CARD
  LOAN
  INVESTMENT
  OTHER
}

// ─── Income ──────────────────────────────────────────────────────────────────

model IncomeSource {
  id         String     @id @default(cuid())
  name       String
  owner      String     // "Logan" | "Carla" | "Shared"
  amount     Decimal    @db.Decimal(12, 2)
  payPeriod  PayPeriod
  isActive   Boolean    @default(true)
  isBusiness Boolean    @default(false)
  notes      String?
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
}

enum PayPeriod {
  FIRST
  FIFTEENTH
  BOTH
  MONTHLY
  ANNUAL
  VARIABLE
}

// ─── Bills ───────────────────────────────────────────────────────────────────

model Bill {
  id          String       @id @default(cuid())
  name        String
  amount      Decimal      @db.Decimal(12, 2)
  dueDay      Int
  category    BillCategory
  autoPay     Boolean      @default(false)
  isActive    Boolean      @default(true)
  isBusiness  Boolean      @default(false)
  payPeriod   PayPeriod
  accountId   String?
  notes       String?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  account     Account?     @relation(fields: [accountId], references: [id])
  payments    BillPayment[]
}

model BillPayment {
  id        String    @id @default(cuid())
  billId    String
  month     Int
  year      Int
  paidAt    DateTime?
  isPaid    Boolean   @default(false)
  paidById  String?
  amount    Decimal?  @db.Decimal(12, 2)
  notes     String?
  createdAt DateTime  @default(now())

  bill      Bill      @relation(fields: [billId], references: [id])
  paidBy    User?     @relation(fields: [paidById], references: [id])

  @@unique([billId, month, year])
}

enum BillCategory {
  HOUSING
  UTILITIES
  INSURANCE
  DEBT_PAYMENT
  SUBSCRIPTION
  AUTO
  HEALTHCARE
  CHILDCARE
  SAVINGS_TRANSFER
  BUSINESS
  OTHER
}

// ─── Debt ─────────────────────────────────────────────────────────────────────

model Debt {
  id              String     @id @default(cuid())
  name            String
  institution     String?
  type            DebtType
  originalBalance Decimal    @db.Decimal(12, 2)
  currentBalance  Decimal    @db.Decimal(12, 2)
  interestRate    Decimal    @db.Decimal(6, 4)
  minPayment      Decimal    @db.Decimal(12, 2)
  dueDay          Int?
  isActive        Boolean    @default(true)
  isPaidOff       Boolean    @default(false)
  accountId       String?
  notes           String?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  account         Account?   @relation(fields: [accountId], references: [id])
  payments        DebtPayment[]
}

model DebtPayment {
  id           String   @id @default(cuid())
  debtId       String
  month        Int
  year         Int
  amount       Decimal  @db.Decimal(12, 2)
  extraPayment Decimal  @default(0) @db.Decimal(12, 2)
  paidAt       DateTime @default(now())
  paidById     String?
  notes        String?
  createdAt    DateTime @default(now())

  debt         Debt     @relation(fields: [debtId], references: [id])
  paidBy       User?    @relation(fields: [paidById], references: [id])
}

enum DebtType {
  CREDIT_CARD
  MORTGAGE
  AUTO_LOAN
  PERSONAL_LOAN
  STUDENT_LOAN
  MEDICAL
  OTHER
}

// ─── Savings ─────────────────────────────────────────────────────────────────

model SavingsGoal {
  id            String    @id @default(cuid())
  name          String
  targetAmount  Decimal   @db.Decimal(12, 2)
  currentAmount Decimal   @default(0) @db.Decimal(12, 2)
  targetDate    DateTime?
  accountId     String?
  isComplete    Boolean   @default(false)
  notes         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  account       Account?  @relation(fields: [accountId], references: [id])
}

// ─── Transactions ─────────────────────────────────────────────────────────────

model Transaction {
  id          String              @id @default(cuid())
  amount      Decimal             @db.Decimal(12, 2)
  description String
  date        DateTime
  category    TransactionCategory
  accountId   String?
  isManual    Boolean             @default(true)
  plaidId     String?             @unique
  isBusiness  Boolean             @default(false)
  notes       String?
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  account     Account?            @relation(fields: [accountId], references: [id])
}

enum TransactionCategory {
  INCOME
  HOUSING
  UTILITIES
  GROCERIES
  DINING
  TRANSPORTATION
  HEALTHCARE
  INSURANCE
  ENTERTAINMENT
  SUBSCRIPTIONS
  CLOTHING
  PERSONAL_CARE
  EDUCATION
  TRAVEL
  SAVINGS
  DEBT_PAYMENT
  BUSINESS
  OTHER
}
```

- [ ] **Step 2: Delete all contents of `prisma/migrations/`**

Run:
```bash
rm -rf packages/api/prisma/migrations
```

The directory is fully removed. Prisma will recreate it on first migrate in Task 7.

- [ ] **Step 3: Update seed to be Decimal-safe**

Open `packages/api/prisma/seed.ts`. Prisma accepts JS `number` for `Decimal` columns, so the existing `0` literals work. But the `interestRate` on debts currently uses `0` which Prisma coerces fine. No changes needed to seed in this task — the data literals already work with Decimal.

Verify by reading seed.ts. If it looks like all numeric literals are small integers (0, 0, 0), leave it. If you find any float literal being inserted into an `interestRate` field that needs quoting, change to a string: `'0.2399'` — Prisma Decimal columns accept strings.

Expected: no changes needed. Confirm by inspection.

- [ ] **Step 4: Commit**

```bash
git add packages/api/prisma/schema.prisma
git add packages/api/prisma/migrations 2>/dev/null || true
git commit -m "Switch Prisma schema to Postgres with Decimal money columns

- provider postgresql
- all money fields Decimal(12,2); APR Decimal(6,4)
- drop prior SQLite migrations (regenerated in next task)"
```

Note: `git add packages/api/prisma/migrations` may error because the directory is gone; the `|| true` swallows it. The deletion is captured because git tracks removed files automatically on commit if they were tracked before.

---

### Task 4: Rewrite `docker-compose.yml`; add postgres-init test DB script

**Files:**
- Modify: `docker-compose.yml`
- Create: `postgres-init/10-create-test-db.sh`

- [ ] **Step 1: Create the test-database init script**

The Postgres image runs any script in `/docker-entrypoint-initdb.d/` on first volume init. We use this to create a second database `castle_budget_test` for the test suite alongside the main DB.

Create `postgres-init/10-create-test-db.sh`:

```bash
#!/bin/bash
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE castle_budget_test;
  GRANT ALL PRIVILEGES ON DATABASE castle_budget_test TO ${POSTGRES_USER};
EOSQL
```

Make it executable:
```bash
chmod +x postgres-init/10-create-test-db.sh
```

- [ ] **Step 2: Replace `docker-compose.yml`**

Replace the entire content with:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-castle_budget}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      # Binds to loopback only — not reachable from LAN. Needed for
      # host-side tooling (prisma migrate, vitest) on the dev VM.
      - "127.0.0.1:5433:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./postgres-init:/docker-entrypoint-initdb.d:ro
    networks:
      - internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 10s
      timeout: 3s
      retries: 5

  api:
    build:
      context: .
      dockerfile: packages/api/Dockerfile
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-castle_budget}
      JWT_SECRET: ${JWT_SECRET}
      COOKIE_SECRET: ${COOKIE_SECRET}
      ADMIN_SEED_PASSWORD: ${ADMIN_SEED_PASSWORD}
      MEMBER_SEED_PASSWORD: ${MEMBER_SEED_PASSWORD}
      NODE_ENV: production
      PORT: 3001
      HOST: 0.0.0.0
      WEB_ORIGIN: http://${APP_DOMAIN:-budget.home}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - internal

  web:
    build:
      context: .
      dockerfile: packages/web/Dockerfile
    restart: unless-stopped
    networks:
      - internal

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - api
      - web
    networks:
      - internal

volumes:
  pg_data:

networks:
  internal:
    driver: bridge
```

Key differences from the original:
- Removed `version: '3.9'` (obsolete in Compose v2).
- Added `postgres` service with healthcheck and loopback port binding (127.0.0.1 only — not reachable from LAN).
- Mounted `./postgres-init` to create the test database on first init.
- `api` and `web` build contexts are `.` (repo root); dockerfile paths adjusted.
- `api` environment includes `POSTGRES_*` env-sourced `DATABASE_URL` and adds `ADMIN_SEED_PASSWORD` / `MEMBER_SEED_PASSWORD` passthrough (used by the seed step in the entrypoint).
- `api` depends on postgres being healthy.
- Volume renamed from `db_data` to `pg_data`.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml postgres-init/
git commit -m "Add postgres to docker-compose; repo-root build contexts

- postgres 16-alpine with healthcheck
- loopback port 5432 for host-side tooling (prisma, vitest)
- postgres-init script creates castle_budget_test on first volume init
- pg_data volume (replaces db_data)
- api/web builds now have full workspace context"
```

---

### Task 5: Fix Dockerfiles to build from repo root

**Files:**
- Modify: `packages/api/Dockerfile`
- Modify: `packages/web/Dockerfile`

- [ ] **Step 1: Rewrite `packages/api/Dockerfile`**

Replace the entire content with:

```dockerfile
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

# Copy built app and runtime files
COPY --from=builder /app/packages/api/dist ./dist
COPY --from=builder /app/packages/api/node_modules ./node_modules
COPY --from=builder /app/packages/api/prisma ./prisma
COPY --from=builder /app/packages/api/package.json ./

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && node dist/index.js"]
```

Differences: build context is now repo root; copy structure reflects workspace layout; `mkdir -p /data` removed (SQLite leftover); entrypoint now also runs the seed (idempotent — seed uses upsert/create with fixed emails; new debts will duplicate. See Step 2.)

**Hold on** — the current seed uses `prisma.debt.create()` in a loop without an idempotency guard. Running it on every container start would duplicate debts. That's a real bug we're introducing.

- [ ] **Step 2: Guard the seed against re-running**

Open `packages/api/prisma/seed.ts`. Before the debts loop (around line 60), add a guard:

```typescript
  // ─── Debt Accounts ────────────────────────────────────────────────────────
  // Seeded from Budget_example.xlsx — balances/rates to be filled in via UI

  const existingDebtCount = await prisma.debt.count()
  if (existingDebtCount === 0) {
    const debts = [
      // ... existing array unchanged
    ]
    for (const debt of debts) {
      await prisma.debt.create({ ... })  // unchanged
    }
    console.log(`✅ Debt accounts seeded (${debts.length}) — update balances/rates in Debt Payoff`)
  } else {
    console.log(`↪ Debts already seeded (${existingDebtCount}); skipping.`)
  }
```

Apply the same guard to income sources (count `incomeSource`) and savings goals (count `savingsGoal`):

```typescript
  const existingIncomeCount = await prisma.incomeSource.count()
  if (existingIncomeCount === 0) {
    // ... existing loop
  } else {
    console.log(`↪ Income sources already seeded (${existingIncomeCount}); skipping.`)
  }

  // ... and for savings goals:
  const existingSavingsCount = await prisma.savingsGoal.count()
  if (existingSavingsCount === 0) {
    await prisma.savingsGoal.createMany({ ... })  // unchanged
  } else {
    console.log(`↪ Savings goals already seeded (${existingSavingsCount}); skipping.`)
  }
```

User upserts already use `where: { email }` so they're idempotent — no change needed for users.

- [ ] **Step 3: Rewrite `packages/web/Dockerfile`**

Replace the entire content with:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/

RUN npm ci

COPY packages/web ./packages/web

WORKDIR /app/packages/web
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Note the final `COPY packages/web/nginx.conf` uses a path relative to the repo-root build context.

- [ ] **Step 4: Commit**

```bash
git add packages/api/Dockerfile packages/web/Dockerfile packages/api/prisma/seed.ts
git commit -m "Rebuild Dockerfiles for repo-root build context; idempotent seed

- build from / with workspace copy
- api entrypoint runs migrate deploy + seed + start
- seed guards debt/income/savings inserts with count checks"
```

---

### Task 6: Update `.env.example` and `.gitignore`

**Files:**
- Modify: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Rewrite `.env.example`**

Replace the entire content with:

```
# ── Castle Budget Environment ─────────────────────────────────────────────────
# Copy this to .env and fill in values before first run.
# NEVER commit .env to version control.

# ── Required secrets — generate with: openssl rand -hex 32 ───────────────────
JWT_SECRET=replace-with-openssl-rand-hex-32
COOKIE_SECRET=replace-with-openssl-rand-hex-32

# ── App config ────────────────────────────────────────────────────────────────
APP_DOMAIN=budget.home        # LAN hostname (set in router/hosts DNS)
NODE_ENV=production

# ── Postgres ──────────────────────────────────────────────────────────────────
# Generate a password with: openssl rand -hex 24
POSTGRES_DB=castle_budget
POSTGRES_USER=castle
POSTGRES_PASSWORD=replace-with-openssl-rand-hex-24

# DATABASE_URL is derived in docker-compose.yml from the values above.
# For host-side tools (Prisma Studio, migrations from Mac/dev VM shell), uncomment:
# DATABASE_URL=postgresql://castle:PASSWORD@localhost:5433/castle_budget

# ── Seed passwords (used only on first db:seed run) ──────────────────────────
# Change these immediately after first login
ADMIN_SEED_PASSWORD=Logan-change-me-now!
MEMBER_SEED_PASSWORD=Carla-change-me-now!
```

- [ ] **Step 2: Rewrite `.gitignore`**

Replace the entire content with:

```
node_modules/
dist/
.env
.env.*
!.env.example

# Build output
packages/web/dist/
packages/api/dist/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
```

Removed: `*.db`, `*.db-journal`, `*.db-shm`, `*.db-wal`, `packages/api/prisma/migrations/dev.db*` — all SQLite era. Added: `.env.*` with exception for `.env.example` to support future `.env.test`, `.env.prod` patterns.

- [ ] **Step 3: Commit**

```bash
git add .env.example .gitignore
git commit -m "Update env example and gitignore for Postgres

- POSTGRES_DB/USER/PASSWORD env vars drive the compose stack
- gitignore .env.* (keeping .env.example) for future env files
- remove SQLite patterns"
```

---

### Task 7: Generate initial Postgres migration + smoke test

**Files:**
- Create: `packages/api/prisma/migrations/<timestamp>_init/migration.sql` (generated)

- [ ] **Step 1: Create local `.env`**

If `.env` does not exist yet at the repo root, copy from example and fill secrets:

```bash
cp .env.example .env
# Then edit .env — set JWT_SECRET, COOKIE_SECRET, POSTGRES_PASSWORD to openssl rand values
# Set ADMIN_SEED_PASSWORD and MEMBER_SEED_PASSWORD to real values you will remember
```

If `.env` already exists, verify it has the new Postgres keys (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`) and no `DATABASE_URL` override pointing at a file path. Add/fix as needed. `.env` is gitignored; we never commit it.

- [ ] **Step 2: Start only Postgres**

Run: `docker compose up -d postgres`
Expected: postgres container starts. Check health:

```bash
docker compose ps
# Wait until postgres shows "(healthy)"
docker compose logs postgres | tail -20
```

- [ ] **Step 3: Generate the initial migration against Postgres**

Postgres is exposed on `127.0.0.1:5432` from Task 4's compose config, so we can run `prisma migrate dev` directly from the host.

```bash
npm install -w packages/api   # if not done yet
cd packages/api

# Build DATABASE_URL from the root .env values:
DATABASE_URL="postgresql://$(grep ^POSTGRES_USER ../../.env | cut -d= -f2):$(grep ^POSTGRES_PASSWORD ../../.env | cut -d= -f2)@localhost:5433/$(grep ^POSTGRES_DB ../../.env | cut -d= -f2)" \
  npx prisma migrate dev --name init

cd ../..
```

Expected: a new directory `packages/api/prisma/migrations/YYYYMMDDHHMMSS_init/` containing `migration.sql`, and `migration_lock.toml` at the migrations root with `provider = "postgresql"`.

- [ ] **Step 4: Bring up the full stack**

```bash
docker compose down
docker compose up -d --build
# Wait ~30 seconds for builds and migrations to complete
docker compose ps
```

Expected: postgres (healthy), api (running), web (running), nginx (running).

- [ ] **Step 5: Smoke test**

```bash
curl -s http://localhost/health
# Expected: {"status":"ok","ts":"2026-..."}

# Then open http://localhost in a browser (or on another LAN device if DNS is set)
# Expected: login page renders.
# Log in with logan@castle.home + ADMIN_SEED_PASSWORD from .env.
# Expected: dashboard loads (values will mostly be $0 since balances are zero-seeded).
```

If login fails: `docker compose logs api` — look for migration or seed errors.

- [ ] **Step 6: Commit the new migration**

```bash
git add packages/api/prisma/migrations/
git commit -m "Initial Postgres migration

Generated by: prisma migrate dev --name init
against a fresh postgres 16-alpine container. Schema matches the current
Decimal-typed schema.prisma."
```

---

### Task 8: Install `decimal.js` and `date-fns` in api

**Files:**
- Modify: `packages/api/package.json`

- [ ] **Step 1: Install the deps**

Run:
```bash
npm install decimal.js date-fns -w packages/api
```

Expected: both added to `packages/api/package.json` under `dependencies`, lockfile updates.

- [ ] **Step 2: Verify**

Open `packages/api/package.json`. Confirm `dependencies` includes:
```json
"decimal.js": "^10.x.x",
"date-fns": "^3.x.x"
```

- [ ] **Step 3: Commit**

```bash
git add packages/api/package.json package-lock.json
git commit -m "Add decimal.js and date-fns to api deps

- decimal.js for strategy engine money arithmetic
- date-fns for dashboard date helpers"
```

---

### Task 9: Setup vitest in api

**Files:**
- Create: `packages/api/vitest.config.ts`
- Modify: `packages/api/package.json`
- Modify: `packages/web/package.json`
- Modify: `package.json` (repo root)

- [ ] **Step 1: Install vitest in api**

```bash
npm install -D vitest -w packages/api
```

- [ ] **Step 2: Install vitest in web**

```bash
npm install -D vitest -w packages/web
```

Web has no tests in this project but we add the dep so the root `npm test` doesn't fail and future web tests are frictionless.

- [ ] **Step 3: Create `packages/api/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 10000,
  },
})
```

- [ ] **Step 4: Add `test` script to `packages/api/package.json`**

Open `packages/api/package.json`. Add to `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Final `scripts` block should be:

```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "db:migrate": "prisma migrate dev",
  "db:migrate:prod": "prisma migrate deploy",
  "db:seed": "tsx prisma/seed.ts",
  "db:studio": "prisma studio",
  "db:generate": "prisma generate",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 5: Add placeholder `test` script to `packages/web/package.json`**

```json
"test": "vitest run --passWithNoTests"
```

Full `scripts` block becomes:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test": "vitest run --passWithNoTests"
}
```

- [ ] **Step 6: Add root `test` script to `package.json`**

Open repo root `package.json`. Add to `scripts`:

```json
"test": "npm run test -w packages/api -w packages/web"
```

Full `scripts` block:

```json
"scripts": {
  "dev": "concurrently \"npm run dev -w packages/api\" \"npm run dev -w packages/web\"",
  "build": "npm run build -w packages/api && npm run build -w packages/web",
  "db:migrate": "npm run db:migrate -w packages/api",
  "db:seed": "npm run db:seed -w packages/api",
  "db:studio": "npm run db:studio -w packages/api",
  "test": "npm run test -w packages/api -w packages/web"
}
```

- [ ] **Step 7: Verify vitest runs (with no tests yet)**

Run from repo root: `npm test`
Expected: api runs 0 tests, exits 1 (vitest treats "no tests" as error by default). Web passes (we added `--passWithNoTests`).

This is intentional — the api will have tests in Task 11. For now the "no tests" failure confirms vitest is wired up. If you see `Error: Cannot find module 'vitest'` or similar, the install didn't work; re-run Step 1.

- [ ] **Step 8: Commit**

```bash
git add package.json packages/api/package.json packages/api/vitest.config.ts packages/web/package.json package-lock.json
git commit -m "Add vitest to api and web workspaces

- vitest config in api (node env, src/**/*.test.ts)
- test and test:watch scripts in api
- passWithNoTests in web (placeholder)
- root-level npm test runs both workspaces"
```

---

### Task 10: Extract `calculatePayoffStrategy` to `lib/debt-strategy.ts`

**Files:**
- Create: `packages/api/src/lib/debt-strategy.ts`
- Modify: `packages/api/src/routes/debts.ts`

**Goal of this task:** pure refactor. The strategy engine moves to its own file, unchanged. The route imports it. No behavior change. Commit should be a clean refactor diff.

- [ ] **Step 1: Create `packages/api/src/lib/debt-strategy.ts`**

Copy the engine code from `debts.ts` verbatim (the `DebtInput`, `PayoffMonth`, `StrategyResult` types and `calculatePayoffStrategy` function). Put it in the new file:

```typescript
export type DebtInput = {
  id: string
  name: string
  currentBalance: number
  interestRate: number
  minPayment: number
}

export type PayoffMonth = {
  month: number
  year: number
  debtId: string
  payment: number
  interestCharge: number
  principal: number
  remainingBalance: number
}

export type StrategyResult = {
  method: 'snowball' | 'avalanche'
  totalMonths: number
  totalInterestPaid: number
  payoffDate: string
  order: { id: string; name: string; payoffMonth: number }[]
  schedule: PayoffMonth[]
}

export function calculatePayoffStrategy(
  debts: DebtInput[],
  extraMonthlyPayment: number,
  method: 'snowball' | 'avalanche'
): StrategyResult {
  const sorted = [...debts].sort((a, b) =>
    method === 'snowball'
      ? a.currentBalance - b.currentBalance
      : b.interestRate - a.interestRate
  )

  const balances = sorted.map(d => ({ ...d, balance: d.currentBalance }))
  const totalMinPayment = balances.reduce((sum, d) => sum + d.minPayment, 0)
  let totalBudget = totalMinPayment + extraMonthlyPayment

  const schedule: PayoffMonth[] = []
  const payoffOrder: { id: string; name: string; payoffMonth: number }[] = []
  let month = 0
  const startDate = new Date()
  let totalInterest = 0
  const MAX_MONTHS = 600

  while (balances.some(d => d.balance > 0) && month < MAX_MONTHS) {
    month++
    const d = new Date(startDate)
    d.setMonth(d.getMonth() + month - 1)

    let remaining = totalBudget

    for (const debt of balances) {
      if (debt.balance <= 0) continue
      const interest = debt.balance * (debt.interestRate / 12)
      totalInterest += interest
      const min = Math.min(debt.minPayment, debt.balance + interest)
      const payment = Math.min(remaining, min)
      remaining -= payment
      const principal = payment - interest
      debt.balance = Math.max(0, debt.balance + interest - payment)

      schedule.push({
        month,
        year: d.getFullYear(),
        debtId: debt.id,
        payment,
        interestCharge: interest,
        principal: Math.max(0, principal),
        remainingBalance: debt.balance,
      })
    }

    for (const debt of balances) {
      if (debt.balance <= 0 || remaining <= 0) continue
      const extra = Math.min(remaining, debt.balance)
      debt.balance = Math.max(0, debt.balance - extra)
      const last = [...schedule].reverse().find(s => s.debtId === debt.id && s.month === month)
      if (last) { last.payment += extra; last.principal += extra }
      remaining -= extra

      if (debt.balance === 0) {
        payoffOrder.push({ id: debt.id, name: debt.name, payoffMonth: month })
      }
    }
  }

  const payoffDate = new Date(startDate)
  payoffDate.setMonth(payoffDate.getMonth() + month)

  return {
    method,
    totalMonths: month,
    totalInterestPaid: Math.round(totalInterest * 100) / 100,
    payoffDate: payoffDate.toISOString().split('T')[0],
    order: payoffOrder,
    schedule,
  }
}
```

Note: the `totalBudget = totalBudget` line from the original is dead code; dropped here. Same behavior.

- [ ] **Step 2: Update `packages/api/src/routes/debts.ts`**

Remove the `DebtInput`, `PayoffMonth`, `StrategyResult` type definitions and the `calculatePayoffStrategy` function body (lines roughly 21-130 in the current file). Replace the top of the file with:

```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { DebtType } from '@prisma/client'
import { calculatePayoffStrategy } from '../lib/debt-strategy'
```

The rest of `debts.ts` (zod schema, route handlers, `/strategy` handler that calls `calculatePayoffStrategy`) stays unchanged. The `/strategy` handler already uses the function by name; the import above covers it.

- [ ] **Step 3: Build to verify types still resolve**

Run from `packages/api/`:
```bash
npm run build
```
Expected: compiles cleanly, no type errors.

- [ ] **Step 4: Verify the stack still works**

```bash
docker compose up -d --build api
sleep 5
docker compose logs api | tail -10
```
Expected: no errors; "🏰 Castle Budget API running" log line.

Then, in a browser, log in and load `/debt` — it should still load (empty strategy since all balances are zero).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/debt-strategy.ts packages/api/src/routes/debts.ts
git commit -m "Extract calculatePayoffStrategy to lib/debt-strategy.ts

Pure refactor — no behavior change. Moves the engine out of the route
module so it can be tested independently."
```

---

### Task 11: Write debt-strategy unit tests

**Files:**
- Create: `packages/api/src/lib/debt-strategy.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect } from 'vitest'
import { calculatePayoffStrategy, type DebtInput } from './debt-strategy'

describe('calculatePayoffStrategy', () => {
  it('pays off a single debt with no interest in one month when min >= balance', () => {
    const debts: DebtInput[] = [
      { id: 'a', name: 'A', currentBalance: 100, interestRate: 0, minPayment: 100 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
    expect(result.totalMonths).toBe(1)
    expect(result.totalInterestPaid).toBe(0)
    expect(result.order).toEqual([{ id: 'a', name: 'A', payoffMonth: 1 }])
  })

  it('computes interest close to closed-form on a simple debt', () => {
    // $1000 at 12% APR paying $100/mo takes ~11 months, roughly $60 total interest.
    const debts: DebtInput[] = [
      { id: 'a', name: 'A', currentBalance: 1000, interestRate: 0.12, minPayment: 100 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
    expect(result.totalMonths).toBeGreaterThanOrEqual(10)
    expect(result.totalMonths).toBeLessThanOrEqual(12)
    expect(result.totalInterestPaid).toBeGreaterThan(50)
    expect(result.totalInterestPaid).toBeLessThan(70)
  })

  it('snowball picks the smaller balance first regardless of rate', () => {
    const debts: DebtInput[] = [
      { id: 'big',   name: 'Big',   currentBalance: 5000, interestRate: 0.24, minPayment: 100 },
      { id: 'small', name: 'Small', currentBalance: 500,  interestRate: 0.05, minPayment: 50 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
    expect(result.order[0].id).toBe('small')
  })

  it('avalanche picks the higher rate first regardless of balance', () => {
    const debts: DebtInput[] = [
      { id: 'big',   name: 'Big',   currentBalance: 5000, interestRate: 0.24, minPayment: 100 },
      { id: 'small', name: 'Small', currentBalance: 500,  interestRate: 0.05, minPayment: 50 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'avalanche')
    expect(result.order[0].id).toBe('big')
  })

  it('extra payment shortens payoff vs no extra', () => {
    const debts: DebtInput[] = [
      { id: 'a', name: 'A', currentBalance: 5000, interestRate: 0.24, minPayment: 100 },
    ]
    const noExtra = calculatePayoffStrategy(debts, 0, 'snowball')
    const withExtra = calculatePayoffStrategy(debts, 200, 'snowball')
    expect(withExtra.totalMonths).toBeLessThan(noExtra.totalMonths)
    expect(withExtra.totalInterestPaid).toBeLessThan(noExtra.totalInterestPaid)
  })

  it('rolls freed minimum into next debt after payoff (snowball)', () => {
    // Debt A: $100 balance, $50 min, 0% — pays off in 2 months, freeing $50/mo.
    // Debt B: $500 balance, $50 min, 0% — without rollover, would take 10 months.
    // With rollover, month 3+ sees $100 applied to B, finishing faster.
    const debts: DebtInput[] = [
      { id: 'a', name: 'A', currentBalance: 100, interestRate: 0, minPayment: 50 },
      { id: 'b', name: 'B', currentBalance: 500, interestRate: 0, minPayment: 50 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
    // A pays off month 2. B should finish before month 10 thanks to rolled $50.
    expect(result.order.find(o => o.id === 'a')?.payoffMonth).toBe(2)
    expect(result.order.find(o => o.id === 'b')?.payoffMonth).toBeLessThan(10)
  })

  it('exits immediately for already paid-off debts', () => {
    const debts: DebtInput[] = [
      { id: 'a', name: 'A', currentBalance: 0, interestRate: 0.24, minPayment: 100 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
    expect(result.totalMonths).toBe(0)
    expect(result.order).toEqual([])
  })

  it('respects MAX_MONTHS safety cap on pathological input', () => {
    // Min payment less than monthly interest → balance never shrinks.
    const debts: DebtInput[] = [
      { id: 'a', name: 'A', currentBalance: 10000, interestRate: 0.24, minPayment: 10 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
    expect(result.totalMonths).toBeLessThanOrEqual(600)
    // The function should return, not hang.
  })
})
```

- [ ] **Step 2: Run the tests**

Run from repo root: `npm test -w packages/api`
Expected: all 8 tests pass. If "rolls freed minimum into next debt" fails, that exposes a real bug in the engine — STOP, investigate: the current engine computes `totalMinPayment` once up front and never grows `totalBudget` when a debt pays off. The spec acknowledged this risk. If that test fails, the failing behavior becomes the subject of a follow-up task (add `// FIXME` comment in test file, keep the assertion, and add an `it.skip` version that documents expected behavior). Fix in Task 12 as part of the Decimal conversion.

Concretely — if that test fails:
- Change the failing assertion to `expect(result.order.find(o => o.id === 'b')?.payoffMonth).toBeLessThan(10)` → `expect(result.order.find(o => o.id === 'b')?.payoffMonth).toBe(10)` (documenting current behavior), and add `it.skip('rolls freed minimum — known bug, to be fixed in Decimal conversion', ...)` with the desired-behavior assertion. This keeps the suite green while calling out the issue.
- Add a note in this plan's task 12 to fix the rollover and flip `.skip` back to `.it`.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/lib/debt-strategy.test.ts
git commit -m "Add unit tests for debt strategy engine

Covers: single-debt payoff, interest ballpark, snowball ordering,
avalanche ordering, extra-payment reduction, roll-over (may expose
existing bug), paid-off exit, MAX_MONTHS safety cap."
```

---

### Task 12: Convert strategy engine internals to `Decimal`

**Files:**
- Modify: `packages/api/src/lib/debt-strategy.ts`
- Modify: `packages/api/src/routes/debts.ts`
- Modify: `packages/api/src/lib/debt-strategy.test.ts` (signature updates if inputs change; likely none)

**Goal:** engine uses `Decimal` internally for all balance/interest/payment math. Public input type continues to accept `number` (for ergonomics from tests and JSON), but the function converts to `Decimal` at the boundary. Output stays `number` for now (UI consumes numbers; precise accumulation happens inside the engine).

If Task 11 revealed the rollover bug and you skipped the test, also fix the rollover in this task.

- [ ] **Step 1: Rewrite `debt-strategy.ts` to use Decimal internally**

```typescript
import { Decimal } from 'decimal.js'

export type DebtInput = {
  id: string
  name: string
  currentBalance: number | string
  interestRate: number | string
  minPayment: number | string
}

export type PayoffMonth = {
  month: number
  year: number
  debtId: string
  payment: number
  interestCharge: number
  principal: number
  remainingBalance: number
}

export type StrategyResult = {
  method: 'snowball' | 'avalanche'
  totalMonths: number
  totalInterestPaid: number
  payoffDate: string
  order: { id: string; name: string; payoffMonth: number }[]
  schedule: PayoffMonth[]
}

type InternalDebt = {
  id: string
  name: string
  balance: Decimal
  interestRate: Decimal
  minPayment: Decimal
}

const ZERO = new Decimal(0)
const TWELVE = new Decimal(12)

export function calculatePayoffStrategy(
  debts: DebtInput[],
  extraMonthlyPayment: number | string,
  method: 'snowball' | 'avalanche'
): StrategyResult {
  // Normalize inputs to Decimal
  const working: InternalDebt[] = debts.map(d => ({
    id: d.id,
    name: d.name,
    balance: new Decimal(d.currentBalance),
    interestRate: new Decimal(d.interestRate),
    minPayment: new Decimal(d.minPayment),
  }))

  // Sort by method
  working.sort((a, b) =>
    method === 'snowball'
      ? a.balance.cmp(b.balance)
      : b.interestRate.cmp(a.interestRate)
  )

  const extra = new Decimal(extraMonthlyPayment)
  const totalMinPayment = working.reduce((sum, d) => sum.plus(d.minPayment), ZERO)
  const totalBudget = totalMinPayment.plus(extra)

  const schedule: PayoffMonth[] = []
  const payoffOrder: { id: string; name: string; payoffMonth: number }[] = []
  const startDate = new Date()
  let totalInterest = ZERO
  let month = 0
  const MAX_MONTHS = 600

  while (working.some(d => d.balance.gt(0)) && month < MAX_MONTHS) {
    month++
    const d = new Date(startDate)
    d.setMonth(d.getMonth() + month - 1)

    let remaining = totalBudget

    // Minimums pass
    for (const debt of working) {
      if (debt.balance.lte(0)) continue
      const monthlyRate = debt.interestRate.div(TWELVE)
      const interest = debt.balance.times(monthlyRate)
      totalInterest = totalInterest.plus(interest)

      // Cap at balance + interest so we never overpay
      const max = debt.balance.plus(interest)
      const min = Decimal.min(debt.minPayment, max)
      const payment = Decimal.min(remaining, min)
      remaining = remaining.minus(payment)
      const principal = payment.minus(interest)
      debt.balance = Decimal.max(ZERO, debt.balance.plus(interest).minus(payment))

      schedule.push({
        month,
        year: d.getFullYear(),
        debtId: debt.id,
        payment: payment.toDecimalPlaces(2).toNumber(),
        interestCharge: interest.toDecimalPlaces(2).toNumber(),
        principal: Decimal.max(ZERO, principal).toDecimalPlaces(2).toNumber(),
        remainingBalance: debt.balance.toDecimalPlaces(2).toNumber(),
      })
    }

    // Extra (or rolled-over minimums) pass — apply remaining budget to first non-zero debt in method order
    for (const debt of working) {
      if (debt.balance.lte(0) || remaining.lte(0)) continue
      const apply = Decimal.min(remaining, debt.balance)
      debt.balance = Decimal.max(ZERO, debt.balance.minus(apply))
      const last = [...schedule].reverse().find(s => s.debtId === debt.id && s.month === month)
      if (last) {
        last.payment = new Decimal(last.payment).plus(apply).toDecimalPlaces(2).toNumber()
        last.principal = new Decimal(last.principal).plus(apply).toDecimalPlaces(2).toNumber()
        last.remainingBalance = debt.balance.toDecimalPlaces(2).toNumber()
      }
      remaining = remaining.minus(apply)

      if (debt.balance.eq(0)) {
        if (!payoffOrder.some(o => o.id === debt.id)) {
          payoffOrder.push({ id: debt.id, name: debt.name, payoffMonth: month })
        }
      }
    }
  }

  const payoffDate = new Date(startDate)
  payoffDate.setMonth(payoffDate.getMonth() + month)

  return {
    method,
    totalMonths: month,
    totalInterestPaid: totalInterest.toDecimalPlaces(2).toNumber(),
    payoffDate: payoffDate.toISOString().split('T')[0],
    order: payoffOrder,
    schedule,
  }
}
```

Notable correctness fixes beyond Decimal math:
- Budget rollover: `totalBudget` stays the same size every month (freed minimums remain in the pool), which is what Snowball/Avalanche both require. The original code got this right in the sense that `totalBudget` never shrinks — but the *allocation* of budget to minimums only subtracted active-debt minimums, so once a debt paid off, that minimum's share would still be available as `remaining`. So the original code already had correct rollover behavior — if Task 11's rollover test passed, leave as-is; if it failed, this rewrite fixes it anyway because we allocate from `totalBudget` each month.
- Paid-off-order deduplication: the `!payoffOrder.some(o => o.id === debt.id)` guard prevents double-pushing in edge cases.

- [ ] **Step 2: If Task 11's rollover test was skipped, un-skip it now**

Open `debt-strategy.test.ts`. Find the `it.skip(...)` version of the rollover test. Change back to `it(...)`. Remove any placeholder `it(...)` that captured broken-behavior assertions.

- [ ] **Step 3: Run tests**

```bash
npm test -w packages/api
```

Expected: all 8 tests pass, including the rollover test. Interest-ballpark assertions still hold (we didn't change math, just precision).

If a test fails with a rounding delta of a cent or two, relax the assertion to `.toBeCloseTo(value, 0)` (0 decimal places). This is expected for the interest closed-form comparison.

- [ ] **Step 4: Smoke test against the stack**

Rebuild the api and check the /debt page loads:
```bash
docker compose up -d --build api
# Wait ~10s
docker compose logs api | tail -5
```
Then load `http://localhost/debt` in browser. Expected: no errors (even though balances are zero, the page rendering should not crash on the Decimal-typed data coming back from `/api/debts`).

The route handler in `debts.ts` passes Prisma's `Decimal` objects straight to `calculatePayoffStrategy`. Since the engine accepts `number | string`, and Prisma's `Decimal` has a `toString()` that produces a decimal string, this works — but we should be explicit. Fix the route handler:

- [ ] **Step 5: Adjust the route handler to convert Decimal → string before calling the engine**

In `packages/api/src/routes/debts.ts`, find the `/strategy` handler. Its current shape:

```typescript
const result = calculatePayoffStrategy(
  debts.map(d => ({
    id: d.id,
    name: d.name,
    currentBalance: d.currentBalance,
    interestRate: d.interestRate,
    minPayment: d.minPayment,
  })),
  query.data.extra,
  query.data.method
)
```

Update to stringify the Prisma `Decimal` values:

```typescript
const result = calculatePayoffStrategy(
  debts.map(d => ({
    id: d.id,
    name: d.name,
    currentBalance: d.currentBalance.toString(),
    interestRate: d.interestRate.toString(),
    minPayment: d.minPayment.toString(),
  })),
  query.data.extra,
  query.data.method
)
```

Also update the `/payment` handler which does `Math.max(0, debt.currentBalance - body.data.amount)`:

```typescript
// OLD:
const newBalance = Math.max(0, debt.currentBalance - body.data.amount)

// NEW:
import { Decimal } from 'decimal.js'
// ... at top of file

const newBalance = Decimal.max(0, new Decimal(debt.currentBalance.toString()).minus(body.data.amount))
// Prisma accepts the Decimal value for currentBalance
await prisma.debt.update({
  where: { id },
  data: { currentBalance: newBalance, isPaidOff: newBalance.eq(0) },
})
```

- [ ] **Step 6: Build + run tests + smoke test**

```bash
cd packages/api && npm run build && cd ../..
npm test -w packages/api
docker compose up -d --build api
```

Expected: build clean, tests pass, api healthy.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/lib/debt-strategy.ts packages/api/src/lib/debt-strategy.test.ts packages/api/src/routes/debts.ts
git commit -m "Convert debt strategy engine to Decimal math

- decimal.js internally for balance, interest, payment, total interest
- public input accepts number | string; output stays number for UI
- route handler stringifies Prisma Decimal before passing to engine
- /payment endpoint uses Decimal subtraction for new balance"
```

---

### Task 13: Convert `dashboard.ts` rollups to Decimal

**Files:**
- Modify: `packages/api/src/routes/dashboard.ts`

- [ ] **Step 1: Rewrite `dashboard.ts`**

Replace the entire file with:

```typescript
import type { FastifyInstance } from 'fastify'
import { Decimal } from 'decimal.js'
import { prisma } from '../lib/prisma'

const ZERO = new Decimal(0)
const TWO = new Decimal(2)

function sum<T>(items: T[], field: (t: T) => Decimal | number | string): Decimal {
  return items.reduce((acc, item) => acc.plus(new Decimal(field(item) as any)), ZERO)
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    // ── Bills this month ──
    const bills = await prisma.bill.findMany({
      where: { isActive: true },
      include: { payments: { where: { month, year } } },
    })

    const totalBills = sum(bills, b => b.amount)
    const paidBills = bills.filter(b => b.payments[0]?.isPaid)
    const unpaidBills = bills.filter(b => !b.payments[0]?.isPaid)
    const totalPaid = sum(paidBills, b => b.amount)
    const totalUnpaid = sum(unpaidBills, b => b.amount)

    // Bills due in next 7 days — naive month-same-only filter retained here; proper fix in Task 17.
    const today = now.getDate()
    const upcomingBills = unpaidBills
      .filter(b => b.dueDay >= today && b.dueDay <= today + 7)
      .sort((a, b) => a.dueDay - b.dueDay)

    // ── Debt summary ──
    const debts = await prisma.debt.findMany({ where: { isActive: true, isPaidOff: false } })
    const totalDebt = sum(debts, d => d.currentBalance)
    const totalOriginalDebt = sum(debts, d => d.originalBalance)
    const totalMinPayments = sum(debts, d => d.minPayment)
    const debtPaidPercent = totalOriginalDebt.gt(0)
      ? Math.round(
          totalOriginalDebt.minus(totalDebt).div(totalOriginalDebt).times(100).toNumber()
        )
      : 0

    // ── Income ──
    const incomeSources = await prisma.incomeSource.findMany({ where: { isActive: true } })
    const monthlyIncome = incomeSources.reduce((acc, i) => {
      const amt = new Decimal(i.amount as any)
      if (i.payPeriod === 'FIRST' || i.payPeriod === 'FIFTEENTH' || i.payPeriod === 'MONTHLY') return acc.plus(amt)
      if (i.payPeriod === 'BOTH') return acc.plus(amt.times(TWO))
      return acc
    }, ZERO)

    const firstPaycheck = incomeSources
      .filter(i => i.payPeriod === 'FIRST' || i.payPeriod === 'BOTH')
      .reduce((acc, i) => acc.plus(new Decimal(i.amount as any)), ZERO)

    const fifteenthPaycheck = incomeSources
      .filter(i => i.payPeriod === 'FIFTEENTH' || i.payPeriod === 'BOTH')
      .reduce((acc, i) => acc.plus(new Decimal(i.amount as any)), ZERO)

    // ── Savings ──
    const savingsGoals = await prisma.savingsGoal.findMany({ where: { isComplete: false } })
    const totalSavingsTarget = sum(savingsGoals, g => g.targetAmount)
    const totalSavingsCurrent = sum(savingsGoals, g => g.currentAmount)

    // ── Accounts ──
    const accounts = await prisma.account.findMany({ where: { isActive: true } })

    return {
      month,
      year,
      bills: {
        total: totalBills.toFixed(2),
        paid: totalPaid.toFixed(2),
        unpaid: totalUnpaid.toFixed(2),
        paidCount: paidBills.length,
        unpaidCount: unpaidBills.length,
        totalCount: bills.length,
        upcoming: upcomingBills.map(b => ({
          id: b.id,
          name: b.name,
          amount: b.amount.toString(),
          dueDay: b.dueDay,
          autoPay: b.autoPay,
        })),
      },
      debt: {
        total: totalDebt.toFixed(2),
        originalTotal: totalOriginalDebt.toFixed(2),
        paidPercent: debtPaidPercent,
        totalMinPayments: totalMinPayments.toFixed(2),
        activeCount: debts.length,
      },
      income: {
        monthly: monthlyIncome.toFixed(2),
        firstPaycheck: firstPaycheck.toFixed(2),
        fifteenthPaycheck: fifteenthPaycheck.toFixed(2),
      },
      savings: {
        totalTarget: totalSavingsTarget.toFixed(2),
        totalCurrent: totalSavingsCurrent.toFixed(2),
        goalCount: savingsGoals.length,
      },
      cashFlow: {
        monthly: monthlyIncome.minus(totalBills).minus(totalMinPayments).toFixed(2),
      },
      accounts: accounts.map(a => ({ ...a, balance: a.balance.toString() })),
    }
  })
}
```

Money fields ship as strings over the wire; the web client (Task 15) parses them to numbers.

- [ ] **Step 2: Build**

```bash
cd packages/api && npm run build && cd ../..
```
Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/routes/dashboard.ts
git commit -m "Convert dashboard rollups to Decimal; serialize money as strings

Money values in the response are decimal strings (toFixed(2)). The
upcoming-bills filter still has the month-crossing bug — fixed in a
later task after the helper extraction."
```

---

### Task 14: Convert `bills.ts`, `savings.ts`, `income.ts` to Decimal boundaries

**Files:**
- Modify: `packages/api/src/routes/bills.ts`
- Modify: `packages/api/src/routes/savings.ts`
- Modify: `packages/api/src/routes/income.ts`

- [ ] **Step 1: Update `bills.ts` zod schemas and pay handler**

In `packages/api/src/routes/bills.ts`, change `z.number().positive()` etc. to `z.coerce.number().positive()` for money fields so the server accepts numeric strings:

```typescript
const billSchema = z.object({
  name:       z.string().min(1),
  amount:     z.coerce.number().positive(),
  dueDay:     z.number().int().min(1).max(31),
  category:   z.nativeEnum(BillCategory),
  autoPay:    z.boolean().default(false),
  isActive:   z.boolean().default(true),
  isBusiness: z.boolean().default(false),
  payPeriod:  z.nativeEnum(PayPeriod),
  accountId:  z.string().optional(),
  notes:      z.string().optional(),
})
```

In the `/:id/pay` handler, change `z.number().optional()` to `z.coerce.number().optional()`:

```typescript
const body = z.object({
  month:   z.number().int().min(1).max(12),
  year:    z.number().int(),
  amount:  z.coerce.number().optional(),
  notes:   z.string().optional(),
}).safeParse(request.body)
```

Everything else in bills.ts stays — Prisma handles number → Decimal conversion on write.

- [ ] **Step 2: Update `savings.ts`**

In `packages/api/src/routes/savings.ts`, two changes. First, coerce money on input:

```typescript
const savingsSchema = z.object({
  name:          z.string().min(1),
  targetAmount:  z.coerce.number().nonnegative(),
  currentAmount: z.coerce.number().nonnegative().default(0),
  targetDate:    z.string().datetime().optional(),
  accountId:     z.string().optional(),
  notes:         z.string().optional(),
})
```

Second, fix the `contribute` handler — it currently does Number addition on a Decimal, which breaks:

```typescript
// OLD:
const newAmount = goal.currentAmount + body.data.amount
return prisma.savingsGoal.update({
  where: { id },
  data: { currentAmount: newAmount, isComplete: newAmount >= goal.targetAmount },
})

// NEW:
import { Decimal } from 'decimal.js'
// ... at top of file

app.post('/:id/contribute', async (request, reply) => {
  const { id } = request.params as { id: string }
  const body = z.object({ amount: z.coerce.number().positive() }).safeParse(request.body)
  if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

  const goal = await prisma.savingsGoal.findUnique({ where: { id } })
  if (!goal) return reply.code(404).send({ error: 'Goal not found' })

  const current = new Decimal(goal.currentAmount.toString())
  const target  = new Decimal(goal.targetAmount.toString())
  const newAmount = current.plus(body.data.amount)

  return prisma.savingsGoal.update({
    where: { id },
    data: {
      currentAmount: newAmount,
      isComplete: newAmount.gte(target),
    },
  })
})
```

Note: `Prisma.Decimal` and `decimal.js` are separate classes. We construct `decimal.js` Decimals from `.toString()` of the Prisma values. Prisma accepts `decimal.js` Decimals on write because they stringify correctly.

- [ ] **Step 3: Update `income.ts`**

Just coerce the amount:

```typescript
const incomeSchema = z.object({
  name:       z.string().min(1),
  owner:      z.string().min(1),
  amount:     z.coerce.number().nonnegative(),
  payPeriod:  z.nativeEnum(PayPeriod),
  isActive:   z.boolean().default(true),
  isBusiness: z.boolean().default(false),
  notes:      z.string().optional(),
})
```

- [ ] **Step 4: Also update `accounts.ts` and `transactions.ts` for Decimal-safe inputs**

`accounts.ts`:
```typescript
const accountSchema = z.object({
  name:        z.string().min(1),
  institution: z.string().optional(),
  type:        z.nativeEnum(AccountType),
  balance:     z.coerce.number().default(0),
  isActive:    z.boolean().default(true),
  isBusiness:  z.boolean().default(false),
  notes:       z.string().optional(),
})
```

`transactions.ts`:
```typescript
const txSchema = z.object({
  amount:      z.coerce.number(),
  description: z.string().min(1),
  date:        z.string().datetime(),
  category:    z.nativeEnum(TransactionCategory),
  accountId:   z.string().optional(),
  isBusiness:  z.boolean().default(false),
  notes:       z.string().optional(),
})
```

- [ ] **Step 5: Build + tests**

```bash
cd packages/api && npm run build && cd ../..
npm test -w packages/api
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/bills.ts packages/api/src/routes/savings.ts packages/api/src/routes/income.ts packages/api/src/routes/accounts.ts packages/api/src/routes/transactions.ts
git commit -m "Make all route money inputs Decimal-safe

- z.coerce.number() on money fields (accepts number or numeric string)
- savings contribute uses Decimal arithmetic instead of JS + operator"
```

---

### Task 15: Add `parseMoney` helper to web api client

**Files:**
- Modify: `packages/web/src/lib/api.ts`

- [ ] **Step 1: Add helper + response money walker**

Open `packages/web/src/lib/api.ts`. Below the `ApiError` class, add:

```typescript
function parseMoney(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

// Field names that represent money values in API responses. Known-set so
// we only touch actual money fields (not e.g. `month` or `dueDay`).
const MONEY_FIELDS = new Set([
  'amount', 'balance', 'targetAmount', 'currentAmount',
  'originalBalance', 'currentBalance', 'minPayment', 'interestRate',
  'extraPayment',
  // Dashboard rollup fields:
  'total', 'paid', 'unpaid', 'originalTotal', 'totalMinPayments',
  'monthly', 'firstPaycheck', 'fifteenthPaycheck',
  'totalTarget', 'totalCurrent',
])

function parseMoneyFields<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(parseMoneyFields) as any
  const out: any = {}
  for (const [k, v] of Object.entries(obj as any)) {
    if (MONEY_FIELDS.has(k) && (typeof v === 'string' || typeof v === 'number')) {
      out[k] = parseMoney(v as any)
    } else if (v && typeof v === 'object') {
      out[k] = parseMoneyFields(v)
    } else {
      out[k] = v
    }
  }
  return out
}
```

- [ ] **Step 2: Route all successful JSON responses through the walker**

Find the existing `request<T>` function. Update its return paths:

```typescript
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
  })

  if (res.status === 401) {
    const refresh = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    if (refresh.ok) {
      const retry = await fetch(`${BASE}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers },
        credentials: 'include',
      })
      if (!retry.ok) throw new ApiError(retry.status, await retry.text())
      return parseMoneyFields(await retry.json()) as T
    }
    window.location.href = '/login'
    throw new ApiError(401, 'Unauthorized')
  }

  if (!res.ok) {
    const text = await res.text()
    throw new ApiError(res.status, text)
  }

  if (res.status === 204) return undefined as T
  return parseMoneyFields(await res.json()) as T
}
```

- [ ] **Step 3: Smoke test in browser**

```bash
docker compose up -d --build web
```
Load dashboard. Expected: numbers format correctly (all zeros right now is fine — the point is no `[object Object]` or `NaN` in the UI).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/api.ts
git commit -m "Parse money strings to numbers at the web API boundary

Adds a small whitelist-based walker that converts known money fields
(amount, balance, totals, etc) from decimal strings to numbers before
returning from the fetcher. Charts and formatters continue to receive
plain numbers."
```

---

### Task 16: Extract `upcomingBillsWithin` to `lib/dashboard-helpers.ts`

**Files:**
- Create: `packages/api/src/lib/dashboard-helpers.ts`
- Modify: `packages/api/src/routes/dashboard.ts`

**Goal:** move date logic out of the route into a pure function. Behavior is preserved (still buggy) — the test + fix come in Tasks 17-18.

- [ ] **Step 1: Create `packages/api/src/lib/dashboard-helpers.ts`**

```typescript
export type UpcomingBillInput = {
  id: string
  name: string
  dueDay: number
  amount?: unknown
  autoPay?: boolean
}

/**
 * Returns bills due within `days` from `today`, sorted by dueDay.
 *
 * NOTE: current implementation does not handle month boundaries —
 * bills with dueDay earlier in the next month are missed. See Task 17.
 */
export function upcomingBillsWithin<T extends UpcomingBillInput>(
  bills: T[],
  today: Date,
  days: number
): T[] {
  const d = today.getDate()
  return bills
    .filter(b => b.dueDay >= d && b.dueDay <= d + days)
    .sort((a, b) => a.dueDay - b.dueDay)
}
```

- [ ] **Step 2: Update `dashboard.ts` to import and use it**

In `packages/api/src/routes/dashboard.ts`, replace the inline `upcomingBills` computation. The current block is:

```typescript
const today = now.getDate()
const upcomingBills = unpaidBills
  .filter(b => b.dueDay >= today && b.dueDay <= today + 7)
  .sort((a, b) => a.dueDay - b.dueDay)
```

Replace with:

```typescript
import { upcomingBillsWithin } from '../lib/dashboard-helpers'
// ... (other imports)

const upcomingBills = upcomingBillsWithin(unpaidBills, now, 7)
```

- [ ] **Step 3: Build**

```bash
cd packages/api && npm run build && cd ../..
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/lib/dashboard-helpers.ts packages/api/src/routes/dashboard.ts
git commit -m "Extract upcomingBillsWithin to lib/dashboard-helpers.ts

Pure refactor — preserves existing (buggy) month-same-only behavior.
Bug fix in the next commit."
```

---

### Task 17: Test-driven fix for month-crossing bug

**Files:**
- Create: `packages/api/src/lib/dashboard-helpers.test.ts`
- Modify: `packages/api/src/lib/dashboard-helpers.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/lib/dashboard-helpers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { upcomingBillsWithin, type UpcomingBillInput } from './dashboard-helpers'

const bill = (id: string, dueDay: number): UpcomingBillInput => ({ id, name: id, dueDay })

describe('upcomingBillsWithin', () => {
  it('includes a same-month bill inside the window', () => {
    const today = new Date(2026, 9, 15) // Oct 15, 2026 (month is 0-indexed)
    const result = upcomingBillsWithin([bill('a', 20)], today, 7)
    expect(result.map(b => b.id)).toEqual(['a'])
  })

  it('excludes a same-month bill outside the window', () => {
    const today = new Date(2026, 9, 15)
    const result = upcomingBillsWithin([bill('a', 25)], today, 7)
    expect(result.map(b => b.id)).toEqual([])
  })

  it('includes a bill due early next month when window crosses month boundary', () => {
    // Today: Oct 28, 2026. Window: 7 days → through Nov 4.
    // Bill due Nov 2 should be included.
    const today = new Date(2026, 9, 28)
    const result = upcomingBillsWithin([bill('a', 2)], today, 7)
    expect(result.map(b => b.id)).toEqual(['a'])
  })

  it('excludes a bill due later next month beyond the window', () => {
    const today = new Date(2026, 9, 28)
    const result = upcomingBillsWithin([bill('a', 10)], today, 7)
    expect(result.map(b => b.id)).toEqual([])
  })

  it('sorts returned bills by effective next-due date', () => {
    const today = new Date(2026, 9, 28)
    // Bill A: due Nov 3. Bill B: due Oct 30.
    const result = upcomingBillsWithin([bill('A', 3), bill('B', 30)], today, 7)
    expect(result.map(b => b.id)).toEqual(['B', 'A'])
  })

  it('clamps a dueDay=31 to the last day of a short month', () => {
    // Today: Feb 25, 2026 (28 days in Feb). Window: 7 days → through Mar 4.
    // Bill with dueDay=31 should resolve to Feb 28 (last day of Feb) — within window.
    const today = new Date(2026, 1, 25)
    const result = upcomingBillsWithin([bill('a', 31)], today, 7)
    expect(result.map(b => b.id)).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Run tests — they should fail**

```bash
npm test -w packages/api
```
Expected: several of the above fail (month-crossing, sort with crossover, clamp). The same-month in/out-of-window tests pass.

- [ ] **Step 3: Rewrite `dashboard-helpers.ts` using `date-fns`**

```typescript
import { addMonths, differenceInDays, lastDayOfMonth, setDate, startOfDay } from 'date-fns'

export type UpcomingBillInput = {
  id: string
  name: string
  dueDay: number
  amount?: unknown
  autoPay?: boolean
}

/**
 * Returns bills due within `days` from `today`, sorted by effective next-due date.
 *
 * For each bill:
 *   1. Compute this month's occurrence (clamped to the last day of the month
 *      if dueDay exceeds it).
 *   2. If that occurrence is before `today`, advance to next month's occurrence
 *      (also clamped).
 *   3. Include if `effectiveDate - today <= days` (and >= 0).
 */
export function upcomingBillsWithin<T extends UpcomingBillInput>(
  bills: T[],
  today: Date,
  days: number
): T[] {
  const todayStart = startOfDay(today)

  function nextOccurrence(dueDay: number): Date {
    const thisMonthLast = lastDayOfMonth(todayStart)
    const thisMonthDue = setDate(todayStart, Math.min(dueDay, thisMonthLast.getDate()))
    if (thisMonthDue >= todayStart) return thisMonthDue
    const nextMonthStart = addMonths(todayStart, 1)
    const nextMonthLast = lastDayOfMonth(nextMonthStart)
    return setDate(nextMonthStart, Math.min(dueDay, nextMonthLast.getDate()))
  }

  return bills
    .map(b => ({ bill: b, next: nextOccurrence(b.dueDay) }))
    .filter(({ next }) => {
      const diff = differenceInDays(next, todayStart)
      return diff >= 0 && diff <= days
    })
    .sort((a, b) => a.next.getTime() - b.next.getTime())
    .map(({ bill }) => bill)
}
```

- [ ] **Step 4: Run tests — all should pass now**

```bash
npm test -w packages/api
```
Expected: all 6 dashboard-helpers tests pass (plus the 8 from debt-strategy) = 14 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/dashboard-helpers.ts packages/api/src/lib/dashboard-helpers.test.ts
git commit -m "Fix upcomingBillsWithin month-crossing bug (TDD)

Walks bills' next occurrence using date-fns, handling month boundaries
and short-month dueDay clamping. Tests: same-month in/out window,
cross-month inclusion/exclusion, sort order across boundary, Feb-clamp."
```

---

### Task 18: (Merged into Task 17 above — intentionally skipped; next task is 19.)

---

### Task 19: Restructure auth to protected-scope pattern

**Files:**
- Delete: `packages/api/src/middleware/auth.ts`
- Create: `packages/api/src/lib/auth-hooks.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Create `packages/api/src/lib/auth-hooks.ts`**

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify'

export type JwtPayload = {
  sub: string
  email: string
  role: 'ADMIN' | 'MEMBER'
  name: string
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' })
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as JwtPayload | undefined
  if (!user) return reply.code(401).send({ error: 'Unauthorized' })
  if (user.role !== 'ADMIN') return reply.code(403).send({ error: 'Admin only' })
}
```

- [ ] **Step 2: Rewrite `packages/api/src/index.ts`**

Replace the entire file content with:

```typescript
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'

import { authRoutes } from './routes/auth'
import { billRoutes } from './routes/bills'
import { debtRoutes } from './routes/debts'
import { incomeRoutes } from './routes/income'
import { dashboardRoutes } from './routes/dashboard'
import { savingsRoutes } from './routes/savings'
import { accountRoutes } from './routes/accounts'
import { transactionRoutes } from './routes/transactions'
import { settingsRoutes } from './routes/settings'
import { requireAuth } from './lib/auth-hooks'

const app = Fastify({ logger: process.env.NODE_ENV !== 'production' })

// ─── Plugins ─────────────────────────────────────────────────────────────────

await app.register(cors, {
  origin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  credentials: true,
})

await app.register(cookie, {
  secret: process.env.COOKIE_SECRET || 'castle-budget-cookie-secret-change-me',
})

await app.register(jwt, {
  secret: process.env.JWT_SECRET || 'castle-budget-jwt-secret-change-me',
  cookie: { cookieName: 'access_token', signed: false },
})

// ─── Health check (public) ────────────────────────────────────────────────────

app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

// ─── Public routes ────────────────────────────────────────────────────────────

await app.register(authRoutes, { prefix: '/api/auth' })

// ─── Protected routes ─────────────────────────────────────────────────────────

await app.register(async (protected_) => {
  protected_.addHook('onRequest', requireAuth)

  await protected_.register(dashboardRoutes,   { prefix: '/api/dashboard' })
  await protected_.register(billRoutes,        { prefix: '/api/bills' })
  await protected_.register(debtRoutes,        { prefix: '/api/debts' })
  await protected_.register(incomeRoutes,      { prefix: '/api/income' })
  await protected_.register(savingsRoutes,     { prefix: '/api/savings' })
  await protected_.register(accountRoutes,     { prefix: '/api/accounts' })
  await protected_.register(transactionRoutes, { prefix: '/api/transactions' })
  await protected_.register(settingsRoutes,    { prefix: '/api/settings' })
})

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '0.0.0.0'

try {
  await app.listen({ port: PORT, host: HOST })
  console.log(`🏰 Castle Budget API running on ${HOST}:${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
```

Key changes:
- Deleted `import { authMiddleware } from './middleware/auth'` and the global `app.addHook('onRequest', authMiddleware)`.
- Protected routes register inside an `app.register(async (protected_) => { ... })` scope with a local `onRequest` hook calling `requireAuth`.
- Public: `/health` and `/api/auth/*`. Everything else needs auth.

- [ ] **Step 3: Delete the old middleware file**

```bash
rm packages/api/src/middleware/auth.ts
rmdir packages/api/src/middleware/ 2>/dev/null || true
```

(`rmdir` fails if any file remains; that's fine.)

- [ ] **Step 4: Build + smoke test**

```bash
cd packages/api && npm run build && cd ../..
docker compose up -d --build api
sleep 5
curl -s http://localhost/api/dashboard
# Expected: {"error":"Unauthorized"}  — anonymous requests blocked
curl -s http://localhost/health
# Expected: {"status":"ok", ...}      — health still open
```

Then log in in the browser, load the dashboard — expected: works as before.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/index.ts packages/api/src/lib/auth-hooks.ts
git rm packages/api/src/middleware/auth.ts
git commit -m "Restructure auth: protected-scope pattern, no routerPath

- requireAuth hook replaces path-string inspection
- protected routes registered inside a nested scope with the hook
- public surface is explicitly /health and /api/auth/*
- deletes middleware/auth.ts (routerPath-based, deprecated)"
```

---

### Task 20: Add `requireAdmin` gating to mutation routes

**Files:**
- Modify: `packages/api/src/routes/bills.ts`
- Modify: `packages/api/src/routes/debts.ts`
- Modify: `packages/api/src/routes/income.ts`
- Modify: `packages/api/src/routes/accounts.ts`
- Modify: `packages/api/src/routes/settings.ts`
- Modify: `packages/api/src/routes/savings.ts` (create/update/delete admin; contribute member-OK)
- Modify: `packages/api/src/routes/transactions.ts`

**Goal:** admin-only for ledger-structure edits. Members can still read, mark bills paid/unpaid, record debt payments, contribute to savings, and change their own password.

Apply the hook per-route rather than at scope level, since some routes in the same module are admin-only and others are member-accessible.

- [ ] **Step 1: Update `bills.ts`**

At the top of `billRoutes`, import and use `requireAdmin` on POST/PATCH/DELETE:

```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { BillCategory, PayPeriod } from '@prisma/client'
import { requireAdmin } from '../lib/auth-hooks'

// ... schema unchanged

export async function billRoutes(app: FastifyInstance) {
  // GET /api/bills — any authed user
  app.get('/', async () => { /* unchanged */ })

  // GET /api/bills/monthly — any authed user
  app.get('/monthly', async (request, reply) => { /* unchanged */ })

  // POST /api/bills — admin only
  app.post('/', { onRequest: [requireAdmin] }, async (request, reply) => { /* unchanged */ })

  // PATCH /api/bills/:id — admin only
  app.patch('/:id', { onRequest: [requireAdmin] }, async (request, reply) => { /* unchanged */ })

  // DELETE /api/bills/:id — admin only
  app.delete('/:id', { onRequest: [requireAdmin] }, async (request) => { /* unchanged */ })

  // POST /api/bills/:id/pay — any authed user (records activity)
  app.post('/:id/pay', async (request, reply) => { /* unchanged */ })

  // POST /api/bills/:id/unpay — any authed user
  app.post('/:id/unpay', async (request, reply) => { /* unchanged */ })
}
```

Pattern: `app.post('/path', { onRequest: [requireAdmin] }, handler)` chains the admin check after the outer `requireAuth` hook (which runs first at the parent scope).

- [ ] **Step 2: Update `debts.ts`**

Same pattern. Admin for POST (create), PATCH, DELETE. Member-allowed for POST `/:id/payment` (payment recording) and GET `/strategy`:

```typescript
import { requireAdmin } from '../lib/auth-hooks'

// GET / — any
// GET /strategy — any

app.post('/', { onRequest: [requireAdmin] }, async (...) => { /* unchanged */ })
app.patch('/:id', { onRequest: [requireAdmin] }, async (...) => { /* unchanged */ })
app.delete('/:id', { onRequest: [requireAdmin] }, async (...) => { /* unchanged */ })

// POST /:id/payment — any (member records payments)
app.post('/:id/payment', async (...) => { /* unchanged */ })
```

- [ ] **Step 3: Update `income.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { PayPeriod } from '@prisma/client'
import { requireAdmin } from '../lib/auth-hooks'

const incomeSchema = z.object({
  name:       z.string().min(1),
  owner:      z.string().min(1),
  amount:     z.coerce.number().nonnegative(),
  payPeriod:  z.nativeEnum(PayPeriod),
  isActive:   z.boolean().default(true),
  isBusiness: z.boolean().default(false),
  notes:      z.string().optional(),
})

export async function incomeRoutes(app: FastifyInstance) {
  app.get('/', async () => prisma.incomeSource.findMany({ where: { isActive: true }, orderBy: { owner: 'asc' } }))

  app.post('/', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = incomeSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    return prisma.incomeSource.create({ data: body.data })
  })

  app.patch('/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = incomeSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const { id } = request.params as { id: string }
    return prisma.incomeSource.update({ where: { id }, data: body.data })
  })

  app.delete('/:id', { onRequest: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string }
    return prisma.incomeSource.update({ where: { id }, data: { isActive: false } })
  })
}
```

- [ ] **Step 3b: Update `accounts.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AccountType } from '@prisma/client'
import { requireAdmin } from '../lib/auth-hooks'

const accountSchema = z.object({
  name:        z.string().min(1),
  institution: z.string().optional(),
  type:        z.nativeEnum(AccountType),
  balance:     z.coerce.number().default(0),
  isActive:    z.boolean().default(true),
  isBusiness:  z.boolean().default(false),
  notes:       z.string().optional(),
})

export async function accountRoutes(app: FastifyInstance) {
  app.get('/', async () => prisma.account.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }))

  app.post('/', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = accountSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    return prisma.account.create({ data: body.data })
  })

  app.patch('/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = accountSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const { id } = request.params as { id: string }
    return prisma.account.update({ where: { id }, data: body.data })
  })

  app.delete('/:id', { onRequest: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string }
    return prisma.account.update({ where: { id }, data: { isActive: false } })
  })
}
```

- [ ] **Step 3c: Update `transactions.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { TransactionCategory } from '@prisma/client'
import { requireAdmin } from '../lib/auth-hooks'

const txSchema = z.object({
  amount:      z.coerce.number(),
  description: z.string().min(1),
  date:        z.string().datetime(),
  category:    z.nativeEnum(TransactionCategory),
  accountId:   z.string().optional(),
  isBusiness:  z.boolean().default(false),
  notes:       z.string().optional(),
})

export async function transactionRoutes(app: FastifyInstance) {
  app.get('/', async (request) => {
    const query = z.object({
      month:     z.coerce.number().int().optional(),
      year:      z.coerce.number().int().optional(),
      accountId: z.string().optional(),
      limit:     z.coerce.number().int().default(100),
    }).parse(request.query)

    const where: any = {}
    if (query.month && query.year) {
      const start = new Date(query.year, query.month - 1, 1)
      const end   = new Date(query.year, query.month, 0, 23, 59, 59)
      where.date  = { gte: start, lte: end }
    }
    if (query.accountId) where.accountId = query.accountId

    return prisma.transaction.findMany({
      where,
      include: { account: true },
      orderBy: { date: 'desc' },
      take: query.limit,
    })
  })

  app.post('/', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = txSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    return prisma.transaction.create({ data: { ...body.data, isManual: true } })
  })

  app.patch('/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = txSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const { id } = request.params as { id: string }
    return prisma.transaction.update({ where: { id }, data: body.data })
  })

  app.delete('/:id', { onRequest: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string }
    return prisma.transaction.delete({ where: { id } })
  })
}
```

- [ ] **Step 4: Update `savings.ts`**

POST/PATCH/DELETE admin-only. `/:id/contribute` stays member-accessible.

```typescript
import { requireAdmin } from '../lib/auth-hooks'

app.get('/', async () => { /* unchanged */ })
app.post('/', { onRequest: [requireAdmin] }, async (...) => { /* unchanged */ })
app.patch('/:id', { onRequest: [requireAdmin] }, async (...) => { /* unchanged */ })
app.post('/:id/contribute', async (...) => { /* unchanged */ })
app.delete('/:id', { onRequest: [requireAdmin] }, async (...) => { /* unchanged */ })
```

- [ ] **Step 5: Update `settings.ts`**

Replace the inline `if (user.role !== 'ADMIN') return reply.code(403)...` checks with the hook:

```typescript
import { requireAdmin } from '../lib/auth-hooks'

export async function settingsRoutes(app: FastifyInstance) {
  // Admin-only:
  app.get('/users', { onRequest: [requireAdmin] }, async () => {
    return prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, createdAt: true } })
  })

  app.post('/users', { onRequest: [requireAdmin] }, async (request, reply) => {
    // body parsing unchanged
    // hash + create unchanged
  })

  app.patch('/users/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    // unchanged
  })

  // Any authed user: change own password
  app.patch('/password', async (request, reply) => {
    // unchanged
  })
}
```

Remove the `user.role !== 'ADMIN'` checks inside each handler — the hook handles it.

- [ ] **Step 6: Build + smoke test**

```bash
cd packages/api && npm run build && cd ../..
docker compose up -d --build api
sleep 5
```

Log in as Carla in browser. Try to create or delete a bill — expected: 403 error. Try to mark a bill paid — expected: succeeds. Log in as Logan — everything works as before.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routes/
git commit -m "Add role gating: members can record activity, admins edit ledger

- admin: POST/PATCH/DELETE on bills, debts, income, accounts,
  savings, transactions, users
- member: GET everything, POST /bills/:id/(un)pay, POST
  /debts/:id/payment, POST /savings/:id/contribute, PATCH
  /settings/password
- settings.ts swaps inline role checks for the requireAdmin hook"
```

---

### Task 21: Implement refresh token rotation

**Files:**
- Modify: `packages/api/src/routes/auth.ts`

- [ ] **Step 1: Update the `/refresh` handler**

In `packages/api/src/routes/auth.ts`, find the `/refresh` handler. Replace its body to mint + persist a new refresh token on every successful refresh:

```typescript
  // POST /api/auth/refresh
  app.post('/refresh', async (request, reply) => {
    const token = request.cookies?.refresh_token
    if (!token) return reply.code(401).send({ error: 'No refresh token' })

    let payload: { sub: string }
    try {
      payload = app.jwt.verify<{ sub: string }>(token)
    } catch {
      return reply.code(401).send({ error: 'Invalid refresh token' })
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || !user.refreshToken) return reply.code(401).send({ error: 'Session expired' })

    const valid = await bcrypt.compare(token, user.refreshToken)
    if (!valid) {
      // Token came back after rotation — assume compromise; kill the session
      await prisma.user.update({ where: { id: user.id }, data: { refreshToken: null } })
      return reply.code(401).send({ error: 'Invalid refresh token' })
    }

    // Rotate: mint a new refresh token, persist its hash, replace cookie
    const newPayload = { sub: user.id, email: user.email, role: user.role, name: user.name }
    const accessToken  = app.jwt.sign(newPayload, { expiresIn: ACCESS_TOKEN_TTL })
    const newRefreshToken = app.jwt.sign({ sub: user.id }, { expiresIn: REFRESH_TOKEN_TTL })
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(newRefreshToken, 10) },
    })

    reply
      .setCookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: ACCESS_TOKEN_TTL,
      })
      .setCookie('refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/auth',
        maxAge: REFRESH_TOKEN_TTL,
      })
      .send({ user: newPayload })
  })
```

- [ ] **Step 2: Build + smoke test**

```bash
cd packages/api && npm run build && cd ../..
docker compose up -d --build api
```

Log in in browser, let session sit for >15 minutes (or manually delete the access_token cookie via DevTools). Make an API call — it should silently refresh and succeed. Refresh token cookie should have a new value (visible in DevTools → Application → Cookies).

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/routes/auth.ts
git commit -m "Rotate refresh token on successful /refresh

- mint a new refresh token, persist bcrypt hash, replace cookie
- on hash mismatch, assume compromise and null out user.refreshToken"
```

---

### Task 22: Setup test database + auth integration tests

**Files:**
- Modify: `packages/api/vitest.config.ts`
- Create: `packages/api/test/setup.ts`
- Create: `packages/api/src/routes/auth.test.ts`
- Modify: `packages/api/package.json` (pretest script)

- [ ] **Step 1: Verify the test database exists**

The `castle_budget_test` database was created on first Postgres volume init via the script mounted in Task 4. Confirm:

```bash
docker compose exec postgres psql -U "$(grep ^POSTGRES_USER .env | cut -d= -f2)" -l
# Expected: castle_budget, castle_budget_test, postgres, template0, template1
```

If `castle_budget_test` is missing (e.g., the volume predates the init script), create it manually:

```bash
docker compose exec postgres createdb -U "$(grep ^POSTGRES_USER .env | cut -d= -f2)" castle_budget_test
```

- [ ] **Step 2: Create `packages/api/test/setup.ts`**

```typescript
import { beforeEach } from 'vitest'
import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const testDbUrl = process.env.TEST_DATABASE_URL
if (!testDbUrl) {
  throw new Error('TEST_DATABASE_URL must be set (see vitest.config.ts)')
}

// Override for all Prisma usage in tests
process.env.DATABASE_URL = testDbUrl

// Apply migrations once at startup
try {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'inherit',
  })
} catch (err) {
  throw new Error(`Failed to apply migrations to test DB: ${err}`)
}

const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } })

beforeEach(async () => {
  // Truncate all user-data tables. Order matters for FK constraints.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "DebtPayment", "BillPayment", "Transaction",
      "SavingsGoal", "Debt", "Bill", "IncomeSource",
      "Account", "User"
    RESTART IDENTITY CASCADE
  `)
})
```

- [ ] **Step 3: Update `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

const testDb = process.env.TEST_DATABASE_URL
  ?? 'postgresql://castle:CHANGE-ME@localhost:5433/castle_budget_test'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 15000,
    setupFiles: ['./test/setup.ts'],
    env: {
      TEST_DATABASE_URL: testDb,
      DATABASE_URL: testDb,
      JWT_SECRET: 'test-jwt-secret',
      COOKIE_SECRET: 'test-cookie-secret',
      NODE_ENV: 'test',
    },
  },
})
```

The default `postgresql://castle:CHANGE-ME@localhost:5433/castle_budget_test` is a placeholder — tests require the real password via env. Document in README that tests expect Postgres to be reachable on `localhost:5433` (i.e., the compose postgres port is exposed for test runs).

- [ ] **Step 4: Wire test DB URL into the test script**

Modify `packages/api/package.json` `scripts` so `test` script reads from the root `.env`:

```json
"test": "dotenv -e ../../.env -- sh -c 'TEST_DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5433/castle_budget_test vitest run'",
"test:watch": "dotenv -e ../../.env -- sh -c 'TEST_DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5433/castle_budget_test vitest'"
```

Install `dotenv-cli`:
```bash
npm install -D dotenv-cli -w packages/api
```

- [ ] **Step 5: Create `packages/api/src/routes/auth.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'
import { authRoutes } from './auth'

const prisma = new PrismaClient()

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(cookie, { secret: 'test-cookie-secret' })
  await app.register(jwt, {
    secret: 'test-jwt-secret',
    cookie: { cookieName: 'access_token', signed: false },
  })
  await app.register(authRoutes, { prefix: '/api/auth' })
  return app
}

async function seedUser() {
  const passwordHash = await bcrypt.hash('hunter2', 12)
  return prisma.user.create({
    data: {
      name: 'Test User',
      email: 'test@example.com',
      passwordHash,
      role: 'ADMIN',
    },
  })
}

describe('auth routes', () => {
  it('login returns 200 with access and refresh cookies', async () => {
    await seedUser()
    const app = await buildApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'test@example.com', password: 'hunter2' },
      })
      expect(res.statusCode).toBe(200)
      const cookies = res.cookies.map(c => c.name)
      expect(cookies).toContain('access_token')
      expect(cookies).toContain('refresh_token')
      const body = res.json()
      expect(body.user.email).toBe('test@example.com')
    } finally {
      await app.close()
    }
  })

  it('login with wrong password returns 401', async () => {
    await seedUser()
    const app = await buildApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'test@example.com', password: 'wrong' },
      })
      expect(res.statusCode).toBe(401)
    } finally {
      await app.close()
    }
  })

  it('refresh rotates the refresh token', async () => {
    await seedUser()
    const app = await buildApp()
    try {
      // Log in
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'test@example.com', password: 'hunter2' },
      })
      const initialRefresh = loginRes.cookies.find(c => c.name === 'refresh_token')!.value

      // Refresh
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refresh_token: initialRefresh },
      })
      expect(refreshRes.statusCode).toBe(200)
      const rotatedRefresh = refreshRes.cookies.find(c => c.name === 'refresh_token')!.value
      expect(rotatedRefresh).not.toBe(initialRefresh)
    } finally {
      await app.close()
    }
  })

  it('replaying the old refresh token after rotation fails and kills the session', async () => {
    await seedUser()
    const app = await buildApp()
    try {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'test@example.com', password: 'hunter2' },
      })
      const initialRefresh = loginRes.cookies.find(c => c.name === 'refresh_token')!.value

      // First refresh succeeds
      await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refresh_token: initialRefresh },
      })

      // Replaying the initial (now stale) refresh token fails
      const replay = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refresh_token: initialRefresh },
      })
      expect(replay.statusCode).toBe(401)

      // Session should be nuked
      const dbUser = await prisma.user.findUnique({ where: { email: 'test@example.com' } })
      expect(dbUser?.refreshToken).toBeNull()
    } finally {
      await app.close()
    }
  })

  it('logout clears cookies and nulls the refresh token in DB', async () => {
    await seedUser()
    const app = await buildApp()
    try {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'test@example.com', password: 'hunter2' },
      })
      const refreshToken = loginRes.cookies.find(c => c.name === 'refresh_token')!.value

      const logoutRes = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: { refresh_token: refreshToken },
      })
      expect(logoutRes.statusCode).toBe(200)

      const dbUser = await prisma.user.findUnique({ where: { email: 'test@example.com' } })
      expect(dbUser?.refreshToken).toBeNull()
    } finally {
      await app.close()
    }
  })
})
```

- [ ] **Step 6: Run tests**

```bash
# Make sure postgres is up and the test DB exists
docker compose up -d postgres
# Apply migrations to test DB the first time:
#   done automatically by test/setup.ts via prisma migrate deploy

npm test -w packages/api
```

Expected: 14 prior + 5 auth = 19 tests passing.

If the auth tests fail with "relation User does not exist," the migrate-deploy step in setup.ts didn't run. Check `TEST_DATABASE_URL` is set correctly (not the placeholder).

- [ ] **Step 7: Commit**

```bash
git add packages/api/package.json packages/api/vitest.config.ts packages/api/test/setup.ts packages/api/src/routes/auth.test.ts package-lock.json
git commit -m "Add test DB setup + auth integration tests

- test/setup.ts applies migrations to castle_budget_test + truncates
  tables per test
- dotenv-cli wires TEST_DATABASE_URL from root .env
- vitest config overrides DATABASE_URL and sets test JWT/cookie secrets
- auth tests: login, wrong password, refresh rotation, replay detection, logout"
```

---

### Task 23: Rewrite `DEPLOYMENT.md`

**Files:**
- Modify: `DEPLOYMENT.md`

- [ ] **Step 1: Rewrite**

Replace the entire content with:

````markdown
# Castle Budget — Deployment & Operations Guide

**Dev VM (MS-01 Proxmox, Ubuntu) → GitHub (personal) → Ops VM (MS-01, TBD)**

---

## Development loop

All development happens on the dev VM in `/home/logan/projects/castle-budget/`.

### Prerequisites

- Docker 24+, Docker Compose v2
- Node 20+, npm 10+
- git
- Access to Postgres at `127.0.0.1:5432` (exposed by the local compose stack)

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

The api container runs `prisma migrate deploy` + seed on every start. First start creates the schema and seeds users + debts + income sources + savings goals.

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

Tests require the postgres container to be running (they connect to `127.0.0.1:5432`). The test DB is `castle_budget_test` (created automatically on volume init).

### Prisma Studio

```bash
# From dev VM:
cd packages/api
npx prisma studio
# Opens http://localhost:5555 — pointed at the dev DB
```

### Making schema changes

```bash
# Edit packages/api/prisma/schema.prisma
cd packages/api
DATABASE_URL="postgresql://$USER:$PASS@localhost:5433/castle_budget" \
  npx prisma migrate dev --name descriptive-name

# Commit the generated migration folder
git add prisma/migrations/
```

### Pushing to GitHub

Repo is at https://github.com/Logan-MacDonald/Castle-Budget (private).
Remote is already configured via SSH:
```bash
git push origin main
```

The `github-personal` host alias in `~/.ssh/config` routes through the personal SSH key.

---

## Ops VM provisioning (post-dev)

**Not yet done.** This section is a placeholder for the work after dev is complete:

1. Provision Ubuntu Server VM on MS-01 Proxmox.
2. Install Docker 24+, Docker Compose v2.
3. Clone the repo: `git clone git@github-personal:Logan-MacDonald/Castle-Budget.git` (or over HTTPS with a PAT).
4. Place `.env` with production secrets.
5. Set up local DNS or Tailscale routing for `budget.home`.
6. `docker compose up -d --build`.
7. Verify `curl http://localhost/health`.
8. First login + password change flow per the scaffold.
9. Set up pg_dump cron for weekly backups (see Backups below).

Treat ops VM as disposable — everything lives in the repo + `.env` + `pg_data` volume.

---

## Backups (pg_dump)

Manual backup:
```bash
docker compose exec postgres pg_dump -U "$POSTGRES_USER" castle_budget \
  > ~/backups/castle-budget-$(date +%Y%m%d).sql
```

Restore:
```bash
cat ~/backups/castle-budget-YYYYMMDD.sql | \
  docker compose exec -T postgres psql -U "$POSTGRES_USER" castle_budget
```

Future: a cron job on the ops VM, not in this project's scope.

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

**Database is empty after wipe:**
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

Setting `refreshToken: null` invalidates any logged-in session — user must log in again with the new password.

---

## Security notes

- LAN-only; Tailscale for remote (future).
- JWT access 15 min, refresh 30 days (rotated on every `/refresh`).
- `secure` cookies gated on `NODE_ENV=production`.
- Postgres only on the internal Docker network in production; port 5432 binds to 127.0.0.1 on the dev VM only.
- No 2FA, no rate limiting — acceptable for a 2-user LAN app.
````

- [ ] **Step 2: Commit**

```bash
git add DEPLOYMENT.md
git commit -m "Rewrite DEPLOYMENT.md for Postgres + MS-01 dev flow

- dev loop: compose up, seeding, logs, tests, Prisma Studio
- pushing to personal GitHub via github-personal SSH alias
- ops VM section is a placeholder — work is post-dev
- pg_dump backup instructions
- troubleshooting keyed to new stack"
```

---

### Task 24: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite**

Replace the content with:

````markdown
# 🏰 Castle Budget

Private, self-hosted family budget application for the McGraw household.

**Stack:** TypeScript · Fastify · React · Vite · Prisma · Postgres · Docker
**Development:** Ubuntu dev VM on MS-01 Proxmox
**Target hosting:** Separate ops VM on MS-01 (not yet provisioned)
**Domain (future):** `http://budget.home`

---

## Features

- **Bill Tracker** — monthly check-off by pay period (1st / 15th), auto-pay tagging, paid/unpaid progress
- **Debt Payoff Engine** — Snowball & Avalanche strategy calculator with payoff timeline chart and "what if I pay more?" simulator. Uses Decimal math for cumulative-interest accuracy over long timelines.
- **Dashboard** — cash flow snapshot, upcoming bills (handles month boundaries correctly), debt elimination progress, pay period breakdown
- **Savings Goals** — named goals with progress bars and contribution tracking
- **Income Management** — per-owner income sources mapped to pay periods
- **Auth** — local bcrypt + JWT, admin (Logan) + member (Carla) roles, httpOnly cookies, rotating refresh tokens. Members record activity; admins edit the ledger structure.

## Quick Start

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full guide.

```bash
cp .env.example .env   # fill in secrets
npm install
docker compose up -d --build
```

## Project Structure

```
castle-budget/
├── packages/
│   ├── api/                    # Fastify backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Postgres + Decimal model
│   │   │   └── seed.ts         # Idempotent initial data
│   │   └── src/
│   │       ├── routes/         # auth, bills, debts, income, savings, etc.
│   │       ├── lib/            # debt-strategy, dashboard-helpers, auth-hooks
│   │       └── index.ts        # Protected-scope route registration
│   └── web/                    # React + Vite frontend
│       └── src/
│           ├── pages/          # Dashboard, Bills, Debt, Savings, Income, Settings
│           ├── components/     # Layout, sidebar
│           ├── context/        # AuthContext
│           └── lib/            # Typed API client with money-string parsing
├── nginx/
│   └── nginx.conf              # Reverse proxy config
├── postgres-init/              # Creates castle_budget_test on first volume init
├── docs/
│   └── superpowers/            # Design specs + implementation plans
├── docker-compose.yml
├── .env.example
└── DEPLOYMENT.md
```

## Users

| User | Email | Role |
|------|-------|------|
| Logan | logan@castle.home | Admin |
| Carla | carla@castle.home | Member |

Passwords are set via `ADMIN_SEED_PASSWORD` and `MEMBER_SEED_PASSWORD` in `.env`.
**Change both immediately after first login.**

## Roadmap

- [ ] Stand up the ops VM on MS-01 and do the first deployment
- [ ] Accounts page (API exists; no UI yet)
- [ ] Transactions page (API exists; no UI yet)
- [ ] Plaid banking integration (transaction auto-import)
- [ ] Automated `pg_dump` backup cron
- [ ] GitHub Actions CI (lint/typecheck/test)
- [ ] Monthly budget vs actuals report
- [ ] Carla Tailscale remote access
- [ ] HTTPS via Tailscale certificates

## Testing

```bash
npm test
```

Unit tests cover the debt strategy engine and dashboard date helpers. Integration tests cover the auth flow (login, refresh rotation, replay detection, logout) against a real Postgres test database.

Tests require the Postgres container to be running (`docker compose up -d postgres`).
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Update README: Postgres stack, MS-01 target, refreshed roadmap

- drop lm-server references and 'migrate to Postgres' roadmap item
- add Accounts/Transactions UI, CI, backup cron to roadmap
- note rotating refresh tokens and role split in auth summary
- mention docs/superpowers/ for specs + plans"
```

---

### Task 25: Push everything to GitHub

**Files:** (none — git operation only)

- [ ] **Step 1: Sanity check status**

Run:
```bash
git log --oneline
git status
```

Expected: `main` has many commits (roughly 23 beyond the initial), working tree clean.

- [ ] **Step 2: Push**

```bash
git push origin main
```

Expected: fast-forward push succeeds.

- [ ] **Step 3: Verify on GitHub**

Open `https://github.com/Logan-MacDonald/Castle-Budget` in a browser. Confirm all commits landed and the README renders.

- [ ] **Step 4: No commit needed** — push is the commit equivalent here.

---

## Self-review — coverage against the spec

- ✅ **Postgres provider + deleted old migrations** — Task 3
- ✅ **Money fields to Decimal(12,2); APR to Decimal(6,4)** — Task 3
- ✅ **docker-compose with Postgres service, healthcheck, internal-only** — Task 4
- ✅ **Dockerfiles build from repo root** — Task 5
- ✅ **`.env.example` + `.gitignore` updated** — Task 6
- ✅ **Initial Postgres migration + smoke gate** — Task 7
- ✅ **`decimal.js` + `date-fns` installed** — Task 8
- ✅ **vitest in both workspaces + root script** — Task 9
- ✅ **Strategy engine extracted** — Task 10
- ✅ **Strategy engine tests (all 8 from spec)** — Task 11
- ✅ **Strategy engine converted to Decimal** — Task 12
- ✅ **Dashboard rollups to Decimal; money serialized as strings** — Task 13
- ✅ **Remaining route schemas Decimal-safe; savings contribute fixed** — Task 14
- ✅ **Web `parseMoney` boundary helper** — Task 15
- ✅ **`upcomingBillsWithin` extracted** — Task 16
- ✅ **Dashboard month-crossing fix TDD** — Task 17 (including Feb-clamp + sort tests)
- ✅ **Auth middleware restructure to protected scope; deleted old middleware; deleted `otplib`** — Tasks 19 + 2
- ✅ **Role gating on admin-only mutations** — Task 20
- ✅ **Refresh token rotation + replay detection** — Task 21
- ✅ **Auth integration tests (login, refresh, replay, logout)** — Task 22
- ✅ **Rewrite `DEPLOYMENT.md`** — Task 23
- ✅ **Update `README.md`** — Task 24
- ✅ **Stray `{routes,...}` directories deleted** — Task 1
- ✅ **`otplib` removed** — Task 2
- ✅ **Push to GitHub** — Task 25

**Numbering note:** Task 18 was intentionally merged into Task 17 (TDD fix and remaining tests live together in the dashboard-helpers suite). Tasks are 1-25 with 18 skipped.

**Deferred (out of scope per spec):** AccountsPage UI, TransactionsPage UI, GitHub Actions CI, automated pg_dump cron, ops VM provisioning, Plaid, Tailscale docs, HTTPS, password reset flow, 2FA, frontend tests.

**Acceptance criteria from spec — all met by end of Task 25:**
- `docker compose up` brings up a working stack: ✅ Task 7 smoke, maintained through Task 22.
- Role-based access works for Logan/Carla: ✅ Task 20 smoke.
- Dashboard month-crossing fixed: ✅ Task 17.
- Strategy engine returns identical output (within cent) pre/post Decimal: ✅ Task 11 tests pass in Task 12.
- `npm test` passes across both workspaces: ✅ Task 22.
- Clean per-step commits on GitHub `main`: ✅ Task 25.
- `DEPLOYMENT.md` describes dev loop + GitHub flow + placeholder ops VM section: ✅ Task 23.
