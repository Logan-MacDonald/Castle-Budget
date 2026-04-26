import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { PayPeriod } from '@prisma/client'
import { requireAdmin } from '../lib/auth-hooks'

const incomeSchema = z.object({
  name:       z.string().min(1),
  owner:      z.string().min(1),
  amount:     z.coerce.number().nonnegative(),
  payPeriod:  z.nativeEnum(PayPeriod),
  isActive:   z.boolean().default(true),
  isBusiness: z.boolean().default(false),
  notes:      z.string().nullish(),
})

export async function incomeRoutes(app: FastifyInstance) {
  app.get('/', async () => prisma.incomeSource.findMany({ where: { isActive: true }, orderBy: { owner: 'asc' } }))

  app.post('/', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = incomeSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    return prisma.incomeSource.create({ data: body.data })
  })

  app.patch('/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = incomeSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const { id } = request.params as { id: string }
    return prisma.incomeSource.update({ where: { id }, data: body.data })
  })

  app.delete('/:id', { onRequest: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string }
    return prisma.incomeSource.update({ where: { id }, data: { isActive: false } })
  })
}
