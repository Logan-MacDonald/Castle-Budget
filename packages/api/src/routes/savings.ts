import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'

const savingsSchema = z.object({
  name:          z.string().min(1),
  targetAmount:  z.number().nonnegative(),
  currentAmount: z.number().nonnegative().default(0),
  targetDate:    z.string().datetime().optional(),
  accountId:     z.string().optional(),
  notes:         z.string().optional(),
})

export async function savingsRoutes(app: FastifyInstance) {
  app.get('/', async () => prisma.savingsGoal.findMany({ include: { account: true }, orderBy: { createdAt: 'asc' } }))

  app.post('/', async (request, reply) => {
    const body = savingsSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    return prisma.savingsGoal.create({ data: body.data })
  })

  app.patch('/:id', async (request, reply) => {
    const body = savingsSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const { id } = request.params as { id: string }
    return prisma.savingsGoal.update({ where: { id }, data: body.data })
  })

  // POST /api/savings/:id/contribute
  app.post('/:id/contribute', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ amount: z.number().positive() }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const goal = await prisma.savingsGoal.findUnique({ where: { id } })
    if (!goal) return reply.code(404).send({ error: 'Goal not found' })

    const newAmount = goal.currentAmount + body.data.amount
    return prisma.savingsGoal.update({
      where: { id },
      data: { currentAmount: newAmount, isComplete: newAmount >= goal.targetAmount },
    })
  })

  app.delete('/:id', async (request) => {
    const { id } = request.params as { id: string }
    return prisma.savingsGoal.delete({ where: { id } })
  })
}
