# Castle Budget — Port & Hardening Design

**Date:** 2026-04-20
**Status:** Approved for planning

## Context

Castle Budget is a self-hosted family budget app for the McGraw household.
The project was drafted in a Claude web session, producing a substantial
first-pass scaffold: Fastify API with 9 route modules, Prisma schema,
JWT+cookie auth, React/Vite frontend with 7 pages, Docker Compose + nginx.
No implementation work has been done beyond that scaffold.

Two things have changed since the scaffold was written:

- **Hosting target changed.** Originally targeted at `lm-server`
  (192.168.1.201) running Ubuntu on bare metal. The new target is a
  dedicated "ops" VM on the MS-01 Proxmox host (not yet provisioned).
  Development happens on a separate Ubuntu dev VM, also on MS-01.
- **Database choice.** The scaffold uses SQLite with a "migrate to
  Postgres later" roadmap item. Given the new host supports multiple VMs
  and additional projects (AuditFlow, thinkretain) will likely share a
  Postgres host eventually, we're starting on Postgres.

This project prepares the scaffold for that new environment and fixes
correctness issues worth fixing before the code starts carrying real
financial data.

## Scope

### In scope

- Port from SQLite to Postgres 16.
- Convert all monetary fields from `Float` to `Decimal(12,2)` (and
  `Decimal(6,4)` for APR). Use `decimal.js` in the strategy engine.
- Fix the broken / fragile pieces found during review: auth middleware,
  refresh token rotation, role gating on mutation routes, dashboard
  upcoming-bills month-crossing bug, stray `{routes,...}` brace-artifact
  directories, unused `otplib` dependency.
- Extract the debt strategy engine and dashboard date helper into
  testable library files.
- Add unit and integration tests with `vitest`, scoped to the load-bearing
  math and auth flow.
- Overhaul `docker-compose.yml`, `.env.example`, and both Dockerfiles for
  Postgres and workspace-root builds.
- Rewrite `DEPLOYMENT.md` for the new dev → GitHub → ops VM flow. Update
  `README.md` roadmap.
- Initialize a git repository and push to a private GitHub repo (personal
  account).

### Out of scope (deferred to roadmap)

- AccountsPage and TransactionsPage UI. The API routes and Prisma models
  stay as-is.
- GitHub Actions CI.
- Automated `pg_dump` backup (documented, not automated).
- Ops VM provisioning and first deploy.
- Plaid banking integration.
- Tailscale setup documentation and remote access for Carla.
- HTTPS.
- Password reset / self-service UI.
- Two-factor authentication.
- Frontend tests.

## Architecture

### Dev → prod flow (target state)

```
[dev VM on MS-01] --git push--> [GitHub (personal, private)]
                                        |
                                        v
                                [ops VM on MS-01 — future]
                                git clone + docker compose up
```

- Dev VM: Postgres via docker-compose, `npm run dev` for hot reload, or
  full stack via `docker compose up --build` for pre-push smoke test.
- GitHub repo: private, single `main` branch.
- Ops VM (future, not this project): clones repo, `.env` placed
  out-of-band, runs `docker compose up -d --build`.

### Runtime stack

```
                       nginx (:80)
                         |
            +------------+------------+
            |                         |
         /api/*                      /*
            |                         |
         fastify              web container (nginx)
         (api service)        static Vite build
            |
            v
         postgres (new)
         volume: pg_data
```

Postgres is not exposed on the host — only reachable from the `api`
service over the internal Docker network.

### Tech choices

- Postgres 16 (alpine image).
- Prisma `Decimal @db.Decimal(12,2)` for money, `Decimal @db.Decimal(6,4)`
  for APR.
- `decimal.js` in the strategy engine.
- `vitest` for tests.

## Changes by area

### Database and schema

`packages/api/prisma/schema.prisma`:
- `provider = "sqlite"` → `"postgresql"`.
- Money fields become `Decimal @db.Decimal(12,2)`:
  - `Account.balance`
  - `IncomeSource.amount`
  - `Bill.amount`, `BillPayment.amount`
  - `Debt.originalBalance`, `Debt.currentBalance`, `Debt.minPayment`
  - `DebtPayment.amount`, `DebtPayment.extraPayment`
  - `SavingsGoal.targetAmount`, `SavingsGoal.currentAmount`
  - `Transaction.amount`
- `Debt.interestRate` becomes `Decimal @db.Decimal(6,4)`.
- Drop existing `packages/api/prisma/migrations/` content — regenerate a
  clean initial migration against Postgres.

### Containers and environment

`docker-compose.yml`:
- Add `postgres` service with `postgres:16-alpine`, a `pg_data` named
  volume, healthcheck, and credentials from env.
- `api` service gets `DATABASE_URL` built from env, `depends_on: postgres`
  with `condition: service_healthy`.
- Remove `db_data` volume.
- Change `api` and `web` build contexts to the repo root to support
  npm workspace resolution; update Dockerfiles accordingly.

`.env.example`:
- Remove SQLite `DATABASE_URL`.
- Add `POSTGRES_USER`, `POSTGRES_PASSWORD`, new `DATABASE_URL` pointing
  at the `postgres` service host.

`packages/api/Dockerfile`:
- Build from repo root, using workspace-aware `npm ci -w packages/api
  --include-workspace-root`.
- Remove the SQLite-era `mkdir -p /data` line.
- Entrypoint keeps `npx prisma migrate deploy && node dist/index.js`.

`packages/web/Dockerfile`:
- Same repo-root build context treatment.

`.gitignore`:
- Remove SQLite-era entries (`*.db`, `*.db-journal`, etc.).

### Money conversion (numbers on the web)

**Server is source of truth for all money math.** Engine and route
rollups use `Decimal`. API client on the web parses money strings to
`number` at the boundary; TS types on the web stay `number`. Chart
libraries (`recharts`) and existing `fmt()` helpers need no change.

**Strategy engine extraction.** Move `calculatePayoffStrategy` from
`packages/api/src/routes/debts.ts` to
`packages/api/src/lib/debt-strategy.ts`. Internals switch to `Decimal`
for balance, rate, interest, payment, principal, and total interest
accumulator. Return type shape unchanged except money fields become
strings on the wire.

**Route rollups.** Every `reduce((sum, x) => sum + x.amount, 0)` in
`dashboard.ts`, `debts.ts`, `savings.ts`, `bills.ts` becomes
`reduce((sum, x) => sum.plus(x.amount), new Decimal(0))`. Results are
serialized as strings.

**Web-side API client.** Small `parseMoney(value: string | number):
number` helper in `packages/web/src/lib/api.ts`. The fetcher walks
known money fields on API responses and converts them to `number`
before returning.

**Zod schemas.** Money inputs use `z.coerce.number()` at the boundary;
Prisma accepts `number | string | Decimal` for `Decimal` columns.

### Auth hardening

**Middleware restructure.** Delete `packages/api/src/middleware/auth.ts`.
In `index.ts`, register `authRoutes` without any global hook, then wrap
all other `/api/*` route registrations inside an
`app.register(async (protected) => { ... })` scope that adds an
`onRequest` hook calling `request.jwtVerify()`. This removes dependence
on `request.routerPath` (deprecated in Fastify 4) and makes the
protected-vs-public boundary explicit in the registration structure.

**Role gating.** Introduce a `requireAdmin` hook inside the protected
scope (or ad-hoc per-route). Admin-only endpoints:
- `POST/PATCH/DELETE /api/bills`
- `POST/PATCH/DELETE /api/debts` (but NOT `POST /:id/payment` —
  Carla records payments)
- `POST/PATCH/DELETE /api/income`
- `POST/PATCH/DELETE /api/accounts`
- `POST/PATCH/DELETE /api/settings/users`

Members can read everything, mark bills paid/unpaid, record debt
payments, contribute to savings, and change their own password. The
distinction: **members record activity, admins edit the ledger
structure.**

**Refresh token rotation.** `/api/auth/refresh` issues a new refresh
token on every successful refresh, bcrypt-hashes it, replaces
`user.refreshToken`, and sets the new cookie. If a stale refresh token
comes back after rotation (hash mismatch), treat as compromise: nuke
the session by setting `refreshToken = null`.

**Removed.** Delete `otplib` from `packages/api/package.json` (unused).

### Bug fixes

**Dashboard upcoming-bills month-crossing.** Extract date logic to
`packages/api/src/lib/dashboard-helpers.ts` as
`upcomingBillsWithin(bills, today, days)`. Compute an actual `Date` for
each bill's next occurrence (current month if `dueDay >= today`, else
next month). Filter by `differenceInDays(nextDue, today) <= days`. Use
`date-fns` (add to api deps).

Edge case: bill with `dueDay = 31` in a 30-day or February month —
clamp to last day of month.

**Stray directories.** Delete:
- `packages/api/src/{routes,plugins,lib,middleware}`
- `packages/web/src/{pages,components,hooks,lib,context}`

Both are shell brace-expansion artifacts.

### Tests

**Framework:** `vitest` added to both `packages/api` and `packages/web`
devDeps (web is pre-wired in case we add tests there later; this
project adds zero web tests).

**Test database:** separate `castle_budget_test` database on the same
Postgres container. Tests wipe tables in `beforeEach`. Requires dev
docker-compose to be running.

**`packages/api/src/lib/debt-strategy.test.ts`:**
- Single debt, min payment equals balance → pays off in 1 month, zero
  interest.
- Single debt with interest → total interest matches closed-form
  calculation within a cent.
- Two debts, snowball picks the smaller balance first regardless of
  rate.
- Two debts, avalanche picks the higher rate first regardless of
  balance.
- Extra payment shortens payoff date vs. no extra.
- Rolling effect: after debt 1 pays off, its minimum rolls into debt 2.
  (If this test fails, we have a real bug — the current code has a
  TODO-shaped comment about this.)
- Paid-off debt with `balance = 0` exits immediately.
- `MAX_MONTHS` safety cap returns without throwing on pathological
  input (min payment less than monthly interest).

**`packages/api/src/lib/dashboard-helpers.test.ts`:**
- Same-month bill within window → included.
- Same-month bill outside window → excluded.
- Month-crossing: today = Oct 28, bill `dueDay = 2` → included
  (shows Nov 2).
- Feb 30 edge case: bill with `dueDay = 31` in February → clamped to
  Feb 28/29.

**Cashflow Decimal canary** (in `dashboard-helpers.test.ts` or a
separate file): exact-output assertion to confirm the Decimal
conversion stuck (e.g., `1000.10 + 2000.20 - 1500.30 = "1500.00"`).

**Auth integration test** (in `packages/api/src/routes/auth.test.ts`):
spin up the Fastify app with `app.inject`, seed a user, log in,
confirm access token cookie, call `/refresh` and confirm refresh
rotation (old cookie no longer valid), confirm expired access tokens
require refresh.

**Running:** `npm test` at repo root runs both workspaces' vitest.

## Execution order

Each step ends with a smoke-test gate. If something is broken, stop and
fix before moving on. The implementation plan (to be written next) will
produce per-step tasks.

1. Git init + initial commit of current scaffold. Create GitHub repo
   (private) and push.
2. Delete the dead `{routes,...}` brace-artifact directories. Own commit.
3. Postgres migration and docker-compose overhaul. Smoke:
   `docker compose up` starts all services, Prisma migrations apply
   clean, seed runs, login page loads, log in as Logan succeeds.
4. Money → Decimal conversion. New Prisma migration, strategy engine
   rewrite, dashboard and route rollups, web client parse helper.
   Smoke: dashboard loads with zeroed values, numbers format correctly.
5. Auth hardening and dashboard bug. Middleware rewrite, role gating,
   refresh rotation, upcoming-bills fix, remove `otplib`. Smoke: log
   in as Logan vs Carla and confirm Carla cannot edit bills.
6. Tests. Extract `debt-strategy.ts` and `dashboard-helpers.ts` first
   (verifiable as a no-op refactor), then add vitest suites and wire
   `npm test`. Separate commits.
7. Rewrite `DEPLOYMENT.md` and update `README.md`.

## Risks

- **Workspace-root Dockerfile build context.** Single most likely place
  for something to break. Verify the repo-root context actually builds
  before declaring step 3 done.
- **Fastify middleware current behavior.** `request.routerPath` is
  deprecated in Fastify 4.27. If it's returning `undefined`, the
  existing auth guard may already be open on some routes. Verify actual
  behavior before writing the replacement — may reveal a more urgent
  situation.
- **Prisma `Decimal` JSON serialization.** Prisma returns `Decimal`
  objects, not strings, unless `.toString()` is called explicitly. If
  Fastify's default serializer trips, we add a custom serializer.
  Low probability, easy fix.

## Acceptance criteria

- `docker compose up` on the dev VM brings up a working stack with
  Postgres, API, web, and nginx. Migrations apply. Seed runs.
- Login works for both Logan (admin) and Carla (member) roles. Carla
  cannot edit bills, debts, income, accounts, or users, but can record
  payments and mark bills paid.
- Dashboard loads without errors for a fresh seed. "Due in next 7
  days" correctly includes month-crossing bills.
- The debt strategy engine returns identical output for a fixed input
  before and after the Decimal conversion, modulo rounding at the
  cent level.
- `npm test` passes at the repo root, running both workspaces'
  vitest suites. The critical tests listed in the Tests section are
  present and passing.
- `git log` shows a clean sequence of per-step commits. The
  repository exists on GitHub (private) with `main` branch pushed.
- `DEPLOYMENT.md` describes the dev loop and GitHub push flow. A
  placeholder section notes that ops VM provisioning is a post-dev
  task.
