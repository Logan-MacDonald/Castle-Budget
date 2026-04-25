import { describe, it, expect } from 'vitest'
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
      const cookieNames = res.cookies.map(c => c.name)
      expect(cookieNames).toContain('access_token')
      expect(cookieNames).toContain('refresh_token')
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
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'test@example.com', password: 'hunter2' },
      })
      const initialRefresh = loginRes.cookies.find(c => c.name === 'refresh_token')!.value

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

      // First refresh succeeds (rotates)
      await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refresh_token: initialRefresh },
      })

      // Replaying the initial (now stale) token fails
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
