import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { Decimal } from 'decimal.js'
import { SavingsKind } from '@prisma/client'
import { requireAdmin } from '../lib/auth-hooks'

const savingsSchema = z.object({
  name:            z.string().min(1),
  kind:            z.nativeEnum(SavingsKind).default(SavingsKind.CASH),
  targetAmount:    z.coerce.number().nonnegative(),
  startingBalance: z.coerce.number().nonnegative().default(0),
  currentAmount:   z.coerce.number().nonnegative().optional(),
  targetDate:      z.string().datetime().nullish(),
  accountId:       z.string().nullish(),
  notes:           z.string().nullish(),
})

export async function savingsRoutes(app: FastifyInstance) {
  app.get('/', async () => prisma.savingsGoal.findMany({ include: { account: true }, orderBy: { createdAt: 'asc' } }))

  app.post('/', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = savingsSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    // currentAmount defaults to startingBalance — a new goal where the
    // user already has $X is at $X today, not $0.
    const data = {
      ...body.data,
      currentAmount: body.data.currentAmount ?? body.data.startingBalance,
    }
    return prisma.savingsGoal.create({ data })
  })

  app.patch('/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = savingsSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const { id } = request.params as { id: string }
    return prisma.savingsGoal.update({ where: { id }, data: body.data })
  })

  // POST /api/savings/:id/contribute
  app.post('/:id/contribute', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ amount: z.coerce.number().positive() }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const goal = await prisma.savingsGoal.findUnique({ where: { id } })
    if (!goal) return reply.code(404).send({ error: 'Goal not found' })

    const current = new Decimal(goal.currentAmount.toString())
    const target  = new Decimal(goal.targetAmount.toString())
    const newAmount = current.plus(body.data.amount)

    return prisma.savingsGoal.update({
      where: { id },
      data: {
        currentAmount: newAmount,
        isComplete: newAmount.gte(target),
      },
    })
  })

  app.delete('/:id', { onRequest: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string }
    return prisma.savingsGoal.delete({ where: { id } })
  })
}
