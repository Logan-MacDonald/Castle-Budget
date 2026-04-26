import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AccountType } from '@prisma/client'
import { requireAdmin } from '../lib/auth-hooks'

const accountSchema = z.object({
  name:        z.string().min(1),
  institution: z.string().nullish(),
  type:        z.nativeEnum(AccountType),
  balance:     z.coerce.number().default(0),
  isActive:    z.boolean().default(true),
  isBusiness:  z.boolean().default(false),
  notes:       z.string().nullish(),
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
