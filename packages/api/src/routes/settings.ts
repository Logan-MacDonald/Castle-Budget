import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAdmin } from '../lib/auth-hooks'

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/users', { onRequest: [requireAdmin] }, async () => {
    return prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    })
  })

  app.post('/users', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = z.object({
      name:     z.string().min(1),
      email:    z.string().email(),
      password: z.string().min(8),
      role:     z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
    }).safeParse(request.body)

    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const hash = await bcrypt.hash(body.data.password, 12)
    return prisma.user.create({
      data: { ...body.data, passwordHash: hash },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    })
  })

  app.patch('/password', async (request, reply) => {
    const user = request.user as any
    const body = z.object({
      currentPassword: z.string().min(1),
      newPassword:     z.string().min(8),
    }).safeParse(request.body)

    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const dbUser = await prisma.user.findUnique({ where: { id: user.sub } })
    if (!dbUser) return reply.code(404).send({ error: 'User not found' })

    const valid = await bcrypt.compare(body.data.currentPassword, dbUser.passwordHash)
    if (!valid) return reply.code(401).send({ error: 'Current password incorrect' })

    const hash = await bcrypt.hash(body.data.newPassword, 12)
    await prisma.user.update({
      where: { id: user.sub },
      data: { passwordHash: hash, refreshToken: null },
    })

    return { ok: true }
  })

  app.patch('/users/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = z.object({
      name:     z.string().min(1).optional(),
      email:    z.string().email().optional(),
      password: z.string().min(8).optional(),
      role:     z.enum(['ADMIN', 'MEMBER']).optional(),
    }).safeParse(request.body)

    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const { id } = request.params as { id: string }
    const data: any = { ...body.data }
    if (body.data.password) {
      data.passwordHash = await bcrypt.hash(body.data.password, 12)
      delete data.password
    }

    return prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true },
    })
  })
}
