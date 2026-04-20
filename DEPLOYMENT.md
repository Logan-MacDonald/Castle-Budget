# Castle Budget — Deployment & Operations Guide
**lm-server (192.168.1.201) · Ubuntu Server · Docker**

---

## Prerequisites

These should already be present on lm-server from the AuditFlow setup.
Verify with:

```bash
docker --version          # Docker 24+
docker compose version    # v2 (not v1 docker-compose)
node --version            # Node 20+
npm --version             # npm 10+
git --version
```

If Node is missing:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## Step 1 — Transfer the project to lm-server

From your Mac, unzip the downloaded archive and push it to lm-server:

```bash
# On your Mac (adjust path to wherever you unzipped it)
scp -r ~/Downloads/castle-budget lm@192.168.1.201:/home/lm/
```

Or if you're using Tailscale and have a hostname:
```bash
scp -r ~/Downloads/castle-budget lm@lm-server:/home/lm/
```

Then SSH in:
```bash
ssh lm@192.168.1.201
cd /home/lm/castle-budget
```

---

## Step 2 — Create the .env file

```bash
cp .env.example .env
nano .env
```

Generate real secrets (run each command and paste the output):

```bash
# Generate JWT_SECRET
openssl rand -hex 32

# Generate COOKIE_SECRET  
openssl rand -hex 32
```

Fill in your .env:
```
JWT_SECRET=<paste first output>
COOKIE_SECRET=<paste second output>
APP_DOMAIN=budget.home
ADMIN_SEED_PASSWORD=<strong password for Logan>
MEMBER_SEED_PASSWORD=<strong password for Carla>
```

Save and close (`Ctrl+X`, `Y`, `Enter`).

---

## Step 3 — Install dependencies and generate the database schema

```bash
# Install all workspace deps
npm install

# Generate Prisma client
npm run db:generate -w packages/api

# Create the initial migration
cd packages/api
npx prisma migrate dev --name init
cd ../..
```

---

## Step 4 — Seed the database with initial data

This creates Logan (admin) and Carla (member) accounts, pre-loads all 18
debt accounts from your spreadsheet, income sources, and savings goals.

```bash
npm run db:seed
```

You should see:
```
🌱 Seeding castle-budget database...
✅ Users: Logan (admin), Carla (member)
✅ Income sources seeded (8) — update amounts in Settings
✅ Debt accounts seeded (18) — update balances/rates in Debt Payoff
✅ Savings goals seeded
🏰 Castle Budget seed complete.
```

---

## Step 5 — Build and start all containers

```bash
docker compose up -d --build
```

This will:
1. Build the API image (TypeScript compile + Prisma)
2. Build the web image (Vite production build)
3. Start Nginx on port 80
4. Apply any pending Prisma migrations automatically on startup

Check that all three containers are running:
```bash
docker compose ps
```

Expected output:
```
NAME                    STATUS          PORTS
castle-budget-api-1     Up              3001/tcp
castle-budget-web-1     Up              80/tcp
castle-budget-nginx-1   Up              0.0.0.0:80->80/tcp
```

Test the health endpoint:
```bash
curl http://localhost/health
# {"status":"ok","ts":"2025-..."}
```

---

## Step 6 — Local DNS (LAN access at budget.home)

### Option A — Router DNS (Recommended)
Log into your router admin panel and add a local DNS entry:
```
budget.home  →  192.168.1.201
```

The exact setting varies by router:
- **Unifi/Ubiquiti**: Settings → Networks → DNS → Local DNS Records
- **TP-Link/Archer**: Advanced → Network → DNS → Local Domain Name
- **Asus**: LAN → DNS Filter → add static entry
- **Most others**: look for "Local DNS", "Custom DNS Records", or "Hosts"

### Option B — dnsmasq on lm-server (if router doesn't support it)
```bash
sudo apt install dnsmasq
echo "address=/budget.home/192.168.1.201" | sudo tee /etc/dnsmasq.d/castle-budget.conf
sudo systemctl restart dnsmasq
```

Then set your router's DHCP DNS server to 192.168.1.201.

Once DNS is set, any device on your home WiFi can reach:
```
http://budget.home
```

---

## Step 7 — First login

1. Open `http://budget.home` in your browser
2. Log in as `logan@castle.home` with the ADMIN_SEED_PASSWORD you set
3. Navigate to **Settings** → change your password immediately
4. Go to **Income** → update all income amounts (they're seeded as $0)
5. Go to **Debt Payoff** → update all 18 debt balances, rates, and min payments
6. Go to **Bills** → add your recurring bills (they weren't in the spreadsheet data)
7. Log out and log back in as `carla@castle.home` to verify her access works

---

## Step 8 — Set up Carla's access (Remote / Tailscale)

**At home (LAN):** She can use `http://budget.home` on any device connected to your WiFi once DNS is set up.

**Remote access:**
1. Install Tailscale on Carla's phone (iOS or Android — free account)
2. On your Mac/server, run: `tailscale share` or invite her via the Tailscale admin console
3. Once connected, she accesses: `http://192.168.1.201` via Tailscale
4. Or set up a Tailscale MagicDNS alias so it stays `budget.home` even remotely

---

## Day-to-Day Operations

### View logs
```bash
# All services
docker compose logs -f

# API only
docker compose logs -f api

# Last 50 lines
docker compose logs --tail=50 api
```

### Restart services
```bash
docker compose restart api
docker compose restart         # all services
```

### Stop everything
```bash
docker compose down
```

### Update after code changes
```bash
git pull                        # if using git
docker compose up -d --build   # rebuild and restart
```

### Backup the database
The SQLite database lives in the `castle-budget_db_data` Docker volume.

```bash
# Backup to home directory
docker run --rm \
  -v castle-budget_db_data:/data \
  -v /home/lm/backups:/backup \
  alpine tar czf /backup/castle-budget-$(date +%Y%m%d).db.tar.gz /data

# List backups
ls -lh ~/backups/
```

Set up automatic weekly backup with cron:
```bash
crontab -e
# Add this line (runs every Sunday at 2am):
0 2 * * 0 docker run --rm -v castle-budget_db_data:/data -v /home/lm/backups:/backup alpine tar czf /backup/castle-budget-$(date +\%Y\%m\%d).db.tar.gz /data
```

### Prisma Studio (admin DB viewer)
```bash
# From your Mac via SSH tunnel
ssh -L 5555:localhost:5555 lm@192.168.1.201 \
  "cd /home/lm/castle-budget && npm run db:studio"

# Then open: http://localhost:5555
```

---

## Future: PostgreSQL Migration

When the Minisforum MS-01 Proxmox lab is ready, migrating from SQLite to
PostgreSQL is a one-step schema change:

1. In `packages/api/prisma/schema.prisma`, change:
   ```prisma
   datasource db {
     provider = "postgresql"    # was "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

2. Export SQLite data, import to Postgres.

3. Update `.env`:
   ```
   DATABASE_URL=postgresql://user:pass@postgres-host:5432/castle_budget
   ```

4. Run `npx prisma migrate dev` to regenerate migrations for Postgres.

---

## Future: Plaid Banking Integration

The `Transaction` model already has a `plaidId` field reserved. When ready:

1. Sign up at https://dashboard.plaid.com (free dev tier)
2. Add `PLAID_CLIENT_ID` and `PLAID_SECRET` to `.env`
3. Install: `npm install plaid -w packages/api`
4. Add `/api/plaid/link` and `/api/plaid/sync` routes
5. Transactions auto-import to the existing `Transaction` table

---

## Security Notes

- The app is only accessible on your LAN and via Tailscale — no public exposure
- JWT tokens are short-lived (15 min) with httpOnly cookies — not accessible to JavaScript
- Refresh tokens are bcrypt-hashed in the database
- All passwords are bcrypt with 12 rounds
- SQLite database is stored in a named Docker volume, not a bind mount
- Add HTTPS via Tailscale HTTPS certificates when ready (zero config)

---

## Troubleshooting

**Can't reach http://budget.home:**
```bash
# Verify nginx is up and on port 80
docker compose ps
curl http://192.168.1.201/health   # use IP instead of hostname
# If that works, the issue is DNS — re-check router settings
```

**API returning 500 errors:**
```bash
docker compose logs api
# Look for Prisma connection errors or migration issues
```

**Database is empty after restart:**
```bash
# Volumes should persist — verify volume exists
docker volume ls | grep castle-budget
# Re-run seed if needed (safe to run multiple times — uses upsert)
npm run db:seed
```

**Forgot Logan's password:**
```bash
# From lm-server in the project directory
cd /home/lm/castle-budget
# Start a temporary prisma studio session, or reset via:
docker compose exec api node -e "
  const bcrypt = require('bcrypt');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  bcrypt.hash('NewPassword123!', 12).then(h =>
    prisma.user.update({ where: { email: 'logan@castle.home' }, data: { passwordHash: h } })
      .then(() => { console.log('Password reset.'); process.exit(0); })
  );
"
```
