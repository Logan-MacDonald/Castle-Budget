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

async function main() {
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

  // Public
  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))
  await app.register(authRoutes, { prefix: '/api/auth' })

  // Protected — all /api/* except /api/auth
  await app.register(async (protectedScope) => {
    protectedScope.addHook('onRequest', requireAuth)

    await protectedScope.register(dashboardRoutes,   { prefix: '/api/dashboard' })
    await protectedScope.register(billRoutes,        { prefix: '/api/bills' })
    await protectedScope.register(debtRoutes,        { prefix: '/api/debts' })
    await protectedScope.register(incomeRoutes,      { prefix: '/api/income' })
    await protectedScope.register(savingsRoutes,     { prefix: '/api/savings' })
    await protectedScope.register(accountRoutes,     { prefix: '/api/accounts' })
    await protectedScope.register(transactionRoutes, { prefix: '/api/transactions' })
    await protectedScope.register(settingsRoutes,    { prefix: '/api/settings' })
  })

  const PORT = Number(process.env.PORT) || 3001
  const HOST = process.env.HOST || '0.0.0.0'

  try {
    await app.listen({ port: PORT, host: HOST })
    console.log(`🏰 Castle Budget API running on ${HOST}:${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
