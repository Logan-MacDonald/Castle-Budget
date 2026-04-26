import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAdmin } from '../lib/auth-hooks'

const savingsSchema = z.object({
  name:           z.string().min(1),
  targetAmount:   z.coerce.number().nonnegative(),
  cashAmount:     z.coerce.number().nonnegative().default(0),
  investedAmount: z.coerce.number().nonnegative().default(0),
  targetDate:     z.string().datetime().nullish(),
  accountId:      z.string().nullish(),
  isComplete:     z.boolean().optional(),
  notes:          z.string().nullish(),
})

export async function savingsRoutes(app: FastifyInstance) {
  app.get('/', async () => prisma.savingsGoal.findMany({ include: { account: true }, orderBy: { name: 'asc' } }))

  app.post('/', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = savingsSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    return prisma.savingsGoal.create({ data: body.data })
  })

  app.patch('/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = savingsSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const { id } = request.params as { id: string }
    return prisma.savingsGoal.update({ where: { id }, data: body.data })
  })

  app.delete('/:id', { onRequest: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string }
    return prisma.savingsGoal.delete({ where: { id } })
  })
}
