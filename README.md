# 🏰 Castle Budget

Private, self-hosted family budget application for the McGraw household.

**Stack:** TypeScript · Fastify · React · Vite · Prisma · SQLite · Docker  
**Hosted:** lm-server (192.168.1.201) · Available at `http://budget.home`

---

## Features

- **Bill Tracker** — monthly check-off by pay period (1st / 15th), auto-pay tagging, paid/unpaid progress
- **Debt Payoff Engine** — Snowball & Avalanche strategy calculator with payoff timeline chart and "what if I pay more?" simulator
- **Dashboard** — cash flow snapshot, upcoming bills, debt elimination progress, pay period breakdown
- **Savings Goals** — named goals with progress bars and contribution tracking
- **Income Management** — per-owner income sources mapped to pay periods
- **Auth** — local bcrypt + JWT, admin (Logan) + member (Carla) roles, httpOnly cookies

## Quick Start

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full step-by-step guide.

```bash
cp .env.example .env   # fill in secrets
npm install
npm run db:migrate     # create database
npm run db:seed        # seed users + initial data
docker compose up -d --build
```

## Project Structure

```
castle-budget/
├── packages/
│   ├── api/                    # Fastify backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Full data model
│   │   │   └── seed.ts         # Initial data (debts, users, income)
│   │   └── src/
│   │       ├── routes/         # auth, bills, debts, income, savings...
│   │       ├── middleware/      # JWT auth guard
│   │       └── lib/            # Prisma client, helpers
│   └── web/                    # React + Vite frontend
│       └── src/
│           ├── pages/          # Dashboard, Bills, Debt, Savings, Income, Settings
│           ├── components/     # Layout, sidebar
│           ├── context/        # AuthContext
│           └── lib/            # Typed API client
├── nginx/
│   └── nginx.conf              # Reverse proxy config
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

- [ ] Plaid banking integration (transaction auto-import)
- [ ] PostgreSQL migration (when Proxmox MS-01 lab is ready)
- [ ] Monthly budget vs actuals report
- [ ] Carla Tailscale remote access setup
- [ ] HTTPS via Tailscale certificates
