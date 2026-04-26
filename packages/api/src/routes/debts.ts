import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Decimal } from 'decimal.js'
import { prisma } from '../lib/prisma'
import { DebtType } from '@prisma/client'
import { calculatePayoffStrategy } from '../lib/debt-strategy'
import { requireAdmin } from '../lib/auth-hooks'

const debtSchema = z.object({
  name:            z.string().min(1),
  institution:     z.string().nullish(),
  type:            z.nativeEnum(DebtType),
  originalBalance: z.number().nonnegative(),
  currentBalance:  z.number().nonnegative(),
  interestRate:    z.number().nonnegative(),  // decimal e.g. 0.2399
  minPayment:      z.number().nonnegative(),
  dueDay:          z.number().int().min(1).max(31).nullish(),
  accountId:       z.string().nullish(),
  notes:           z.string().nullish(),
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
  // Side-effect: when minPayment > 0, also create a linked monthly Bill
  // in the DEBT_PAYMENT category. Toggling that bill paid then draws
  // down the debt balance (see bills.ts /:id/pay).
  app.post('/', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = debtSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const debt = await prisma.debt.create({ data: body.data })
    if (Number(debt.minPayment) > 0) {
      await prisma.bill.create({
        data: {
          name:       debt.name,
          amount:     debt.minPayment,
          dueDay:     debt.dueDay ?? 1,
          category:   'DEBT_PAYMENT',
          payPeriod:  'MONTHLY',
          autoPay:    false,
          isActive:   true,
          isBusiness: debt.isBusiness,
          debtId:     debt.id,
        },
      })
    }
    return debt
  })

  // PATCH /api/debts/:id — keep the linked Bill in sync.
  app.patch('/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = debtSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const { id } = request.params as { id: string }
    const debt = await prisma.debt.update({ where: { id }, data: body.data })

    // Sync the linked bill's user-visible fields. If the debt didn't
    // have a bill yet (created when minPayment was 0) and now has one,
    // create it; if minPayment dropped to 0 we leave the bill at $0
    // rather than orphan its payment history.
    const linked = await prisma.bill.findFirst({ where: { debtId: id, isActive: true } })
    if (linked) {
      await prisma.bill.update({
        where: { id: linked.id },
        data: {
          name:       debt.name,
          amount:     debt.minPayment,
          dueDay:     debt.dueDay ?? linked.dueDay,
          isBusiness: debt.isBusiness,
        },
      })
    } else if (Number(debt.minPayment) > 0) {
      await prisma.bill.create({
        data: {
          name:       debt.name,
          amount:     debt.minPayment,
          dueDay:     debt.dueDay ?? 1,
          category:   'DEBT_PAYMENT',
          payPeriod:  'MONTHLY',
          autoPay:    false,
          isActive:   true,
          isBusiness: debt.isBusiness,
          debtId:     debt.id,
        },
      })
    }
    return debt
  })

  // POST /api/debts/:id/payment — record a payment
  app.post('/:id/payment', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      amount:       z.number().positive(),
      extraPayment: z.number().nonnegative().default(0),
      month:        z.number().int().min(1).max(12),
      year:         z.number().int(),
      notes:        z.string().nullish(),
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

  // DELETE /api/debts/:id — soft delete; also soft-deletes the linked Bill.
  app.delete('/:id', { onRequest: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string }
    await prisma.bill.updateMany({ where: { debtId: id }, data: { isActive: false } })
    return prisma.debt.update({ where: { id }, data: { isActive: false } })
  })
}
