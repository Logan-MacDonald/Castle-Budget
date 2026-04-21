import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcrypt'
import { createHash, randomUUID } from 'crypto'
import { z } from 'zod'
import { prisma } from '../lib/prisma'

// bcrypt silently truncates inputs at 72 bytes — JWTs are ~170-250 bytes and
// share a common prefix (header + start of payload), so hashing them directly
// makes distinct tokens collide. Pre-hash with SHA-256 so bcrypt sees the full
// token entropy as a fixed-length 64-char hex string.
const digest = (token: string) => createHash('sha256').update(token).digest('hex')

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const ACCESS_TOKEN_TTL  = 60 * 15        // 15 minutes
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30 // 30 days

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid request' })

    const user = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(body.data.password, user.passwordHash)
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' })

    const payload = { sub: user.id, email: user.email, role: user.role, name: user.name }

    const accessToken = app.jwt.sign(payload, { expiresIn: ACCESS_TOKEN_TTL })
    const refreshToken = app.jwt.sign({ sub: user.id, jti: randomUUID() }, { expiresIn: REFRESH_TOKEN_TTL })

    // Persist refresh token hash
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(digest(refreshToken), 10) },
    })

    reply
      .setCookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: ACCESS_TOKEN_TTL,
      })
      .setCookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/auth',
        maxAge: REFRESH_TOKEN_TTL,
      })
      .send({ user: payload })
  })

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

    const valid = await bcrypt.compare(digest(token), user.refreshToken)
    if (!valid) {
      // Stale token presented after rotation — assume compromise, kill the session
      await prisma.user.update({ where: { id: user.id }, data: { refreshToken: null } })
      return reply.code(401).send({ error: 'Invalid refresh token' })
    }

    // Rotate: mint a new refresh token, persist its hash, replace cookie
    const newPayload = { sub: user.id, email: user.email, role: user.role, name: user.name }
    const accessToken = app.jwt.sign(newPayload, { expiresIn: ACCESS_TOKEN_TTL })
    const newRefreshToken = app.jwt.sign({ sub: user.id }, { expiresIn: REFRESH_TOKEN_TTL })
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(digest(newRefreshToken), 10) },
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

  // POST /api/auth/logout
  app.post('/logout', async (request, reply) => {
    const token = request.cookies?.refresh_token
    if (token) {
      try {
        const payload = app.jwt.verify<{ sub: string }>(token)
        await prisma.user.update({
          where: { id: payload.sub },
          data: { refreshToken: null },
        })
      } catch { /* ignore */ }
    }

    reply
      .clearCookie('access_token', { path: '/' })
      .clearCookie('refresh_token', { path: '/api/auth' })
      .send({ ok: true })
  })

  // GET /api/auth/me — requires valid access token
  app.get('/me', async (request, reply) => {
    try {
      await request.jwtVerify()
      return { user: request.user }
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  })
}
