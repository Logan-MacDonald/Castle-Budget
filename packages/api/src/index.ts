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
import { authMiddleware } from './middleware/auth'

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

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

// ─── Routes ───────────────────────────────────────────────────────────────────

// Public
await app.register(authRoutes, { prefix: '/api/auth' })

// Protected — attach auth middleware to all /api/* routes except /api/auth
app.addHook('onRequest', authMiddleware)

await app.register(dashboardRoutes,   { prefix: '/api/dashboard' })
await app.register(billRoutes,        { prefix: '/api/bills' })
await app.register(debtRoutes,        { prefix: '/api/debts' })
await app.register(incomeRoutes,      { prefix: '/api/income' })
await app.register(savingsRoutes,     { prefix: '/api/savings' })
await app.register(accountRoutes,     { prefix: '/api/accounts' })
await app.register(transactionRoutes, { prefix: '/api/transactions' })
await app.register(settingsRoutes,    { prefix: '/api/settings' })

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
