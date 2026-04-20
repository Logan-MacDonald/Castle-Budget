import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Decimal } from 'decimal.js'
import { prisma } from '../lib/prisma'
import { DebtType } from '@prisma/client'
import { calculatePayoffStrategy } from '../lib/debt-strategy'

const debtSchema = z.object({
  name:            z.string().min(1),
  institution:     z.string().optional(),
  type:            z.nativeEnum(DebtType),
  originalBalance: z.number().nonnegative(),
  currentBalance:  z.number().nonnegative(),
  interestRate:    z.number().nonnegative(),  // decimal e.g. 0.2399
  minPayment:      z.number().nonnegative(),
  dueDay:          z.number().int().min(1).max(31).optional(),
  accountId:       z.string().optional(),
  notes:           z.string().optional(),
})

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function debtRoutes(app: FastifyInstance) {
  // GET /api/debts
  app.get('/', async () => {
    return prisma.debt.findMany({
      where: { isActive: true },
      include: { account: true },
      orderBy: { currentBalance: 'asc' },
    })
  })

  // GET /api/debts/strategy?method=snowball&extra=200
  app.get('/strategy', async (request, reply) => {
    const query = z.object({
      method: z.enum(['snowball', 'avalanche']).default('snowball'),
      extra:  z.coerce.number().nonnegative().default(0),
    }).safeParse(request.query)

    if (!query.success) return reply.code(400).send({ error: query.error.flatten() })

    const debts = await prisma.debt.findMany({
      where: { isActive: true, isPaidOff: false },
    })

    if (debts.length === 0) return { message: 'No active debts', schedule: [] }

    const result = calculatePayoffStrategy(
      debts.map(d => ({
        id: d.id,
        name: d.name,
        currentBalance: d.currentBalance.toString(),
        interestRate: d.interestRate.toString(),
        minPayment: d.minPayment.toString(),
      })),
      query.data.extra,
      query.data.method
    )

    return result
  })

  // POST /api/debts
  app.post('/', async (request, reply) => {
    const body = debtSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    return prisma.debt.create({ data: body.data })
  })

  // PATCH /api/debts/:id
  app.patch('/:id', async (request, reply) => {
    const body = debtSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const { id } = request.params as { id: string }
    return prisma.debt.update({ where: { id }, data: body.data })
  })

  // POST /api/debts/:id/payment — record a payment
  app.post('/:id/payment', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      amount:       z.number().positive(),
      extraPayment: z.number().nonnegative().default(0),
      month:        z.number().int().min(1).max(12),
      year:         z.number().int(),
      notes:        z.string().optional(),
    }).safeParse(request.body)

    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const user = (request.user as any)
    const debt = await prisma.debt.findUnique({ where: { id } })
    if (!debt) return reply.code(404).send({ error: 'Debt not found' })

    const payment = await prisma.debtPayment.create({
      data: { debtId: id, paidById: user.sub, ...body.data },
    })

    // Update current balance
    const newBalance = Decimal.max(
      0,
      new Decimal(debt.currentBalance.toString()).minus(body.data.amount)
    )
    await prisma.debt.update({
      where: { id },
      data: { currentBalance: newBalance, isPaidOff: newBalance.eq(0) },
    })

    return payment
  })

  // DELETE /api/debts/:id — soft delete
  app.delete('/:id', async (request) => {
    const { id } = request.params as { id: string }
    return prisma.debt.update({ where: { id }, data: { isActive: false } })
  })
}
