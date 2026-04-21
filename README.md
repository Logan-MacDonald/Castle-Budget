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
- **Auth** — local bcrypt + JWT, admin (Logan) + member (Carla) roles, httpOnly cookies, rotating refresh tokens with replay detection. Members record activity; admins edit the ledger structure.

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
