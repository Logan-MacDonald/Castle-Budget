import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Decimal } from 'decimal.js'
import { prisma } from '../lib/prisma'
import { BillCategory, PayPeriod } from '@prisma/client'
import { requireAdmin } from '../lib/auth-hooks'

const billSchema = z.object({
  name:           z.string().min(1),
  amount:         z.coerce.number().positive(),
  dueDay:         z.number().int().min(1).max(31),
  category:       z.nativeEnum(BillCategory),
  autoPay:        z.boolean().default(false),
  isActive:       z.boolean().default(true),
  isBusiness:     z.boolean().default(false),
  payPeriod:      z.nativeEnum(PayPeriod),
  accountId:      z.string().nullish(),
  debtId:         z.string().nullish(),
  savingsGoalId:  z.string().nullish(),
  notes:          z.string().nullish(),
})

export async function billRoutes(app: FastifyInstance) {
  // GET /api/bills — all active bills
  app.get('/', async () => {
    return prisma.bill.findMany({
      where: { isActive: true },
      include: { account: true },
      orderBy: { dueDay: 'asc' },
    })
  })

  // GET /api/bills/monthly?month=10&year=2024
  // Returns all bills with their payment status for a given month
  app.get('/monthly', async (request, reply) => {
    const query = z.object({
      month: z.coerce.number().int().min(1).max(12),
      year:  z.coerce.number().int().min(2020).max(2100),
    }).safeParse((request.query as any))

    if (!query.success) return reply.code(400).send({ error: 'month and year required' })

    const { month, year } = query.data

    const bills = await prisma.bill.findMany({
      where: { isActive: true },
      include: {
        account: true,
        payments: {
          where: { month, year },
        },
      },
      orderBy: { dueDay: 'asc' },
    })

    // VARIABLE bills (Orkin, lawn service, anything that only charges
    // when work is performed) only appear for months where we've
    // actually recorded a BillPayment. Keeps the list clean for months
    // with no service, without losing the bill record or its history.
    return bills
      .filter(b => b.payPeriod !== 'VARIABLE' || b.payments.length > 0)
      .map(b => ({
        ...b,
        payment: b.payments[0] ?? null,
        isPaid: b.payments[0]?.isPaid ?? false,
      }))
  })

  // POST /api/bills
  // Bill.debtId still carries a unique constraint (one bill represents
  // one debt's monthly payment); if the new bill claims a debtId that
  // another bill currently holds, transparently transfer it in a
  // transaction instead of returning P2002. savingsGoalId has no
  // unique constraint — a goal can have many incoming contributions
  // (recurring transfer + occasional gifts) — so it just creates.
  app.post('/', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = billSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    return prisma.$transaction(async (tx) => {
      if (body.data.debtId) {
        await tx.bill.updateMany({
          where: { debtId: body.data.debtId },
          data:  { debtId: null },
        })
      }
      return tx.bill.create({ data: body.data })
    })
  })

  // PATCH /api/bills/:id
  // Bill.debtId has a unique constraint (one bill per debt). If the
  // caller is setting debtId to a value that another bill currently
  // owns, transparently clear the other bill's link first so the swap
  // works without a P2002 error.
  app.patch('/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = billSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const { id } = request.params as { id: string }

    return prisma.$transaction(async (tx) => {
      if (body.data.debtId) {
        await tx.bill.updateMany({
          where: { debtId: body.data.debtId, id: { not: id } },
          data:  { debtId: null },
        })
      }
      return tx.bill.update({ where: { id }, data: body.data })
    })
  })

  // DELETE /api/bills/:id — soft delete
  app.delete('/:id', { onRequest: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string }
    return prisma.bill.update({ where: { id }, data: { isActive: false } })
  })

  // POST /api/bills/:id/pay — mark a bill as paid for a given month.
  // If the bill is linked to a debt (DEBT_PAYMENT bills auto-created
  // by /api/debts), the paid amount is also drawn down from the debt's
  // currentBalance.
  app.post('/:id/pay', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      month:   z.number().int().min(1).max(12),
      year:    z.number().int(),
      amount:  z.coerce.number().optional(),
      notes:   z.string().nullish(),
    }).safeParse(request.body)

    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const user = (request.user as any)
    const bill = await prisma.bill.findUnique({ where: { id } })
    if (!bill) return reply.code(404).send({ error: 'Bill not found' })

    // Preserve a previously-recorded amount (e.g. from a variable
    // charge) unless the caller explicitly supplies a new one.
    const existingPayment = await prisma.billPayment.findUnique({
      where: { billId_month_year: { billId: id, month: body.data.month, year: body.data.year } },
    })
    const paidAmount = body.data.amount ?? Number(existingPayment?.amount ?? bill.amount)

    const payment = await prisma.billPayment.upsert({
      where: { billId_month_year: { billId: id, month: body.data.month, year: body.data.year } },
      update: { isPaid: true, paidAt: new Date(), paidById: user.sub, amount: paidAmount, notes: body.data.notes },
      create: { billId: id, month: body.data.month, year: body.data.year, isPaid: true, paidAt: new Date(), paidById: user.sub, amount: paidAmount, notes: body.data.notes },
    })

    if (bill.debtId) {
      await applyDebtPayment(bill.debtId, paidAmount)
    }
    if (bill.savingsGoalId) {
      await applySavingsContribution(bill.savingsGoalId, paidAmount)
    }

    return payment
  })

  // POST /api/bills/:id/unpay — mark a bill as unpaid. If linked to a
  // debt, the previously-paid amount is added back to the debt balance.
  app.post('/:id/unpay', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ month: z.number().int(), year: z.number().int() }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const bill = await prisma.bill.findUnique({ where: { id } })
    if (!bill) return reply.code(404).send({ error: 'Bill not found' })

    const existing = await prisma.billPayment.findUnique({
      where: { billId_month_year: { billId: id, month: body.data.month, year: body.data.year } },
    })

    const result = await prisma.billPayment.upsert({
      where: { billId_month_year: { billId: id, month: body.data.month, year: body.data.year } },
      update: { isPaid: false, paidAt: null },
      create: { billId: id, month: body.data.month, year: body.data.year, isPaid: false },
    })

    if (bill.debtId && existing?.isPaid) {
      await applyDebtPayment(bill.debtId, -Number(existing.amount ?? bill.amount))
    }
    if (bill.savingsGoalId && existing?.isPaid) {
      await applySavingsContribution(bill.savingsGoalId, -Number(existing.amount ?? bill.amount))
    }

    return result
  })

  // POST /api/bills/:id/record — record a charge for a given month
  // (used for VARIABLE-payPeriod bills like Orkin: only invoiced when
  // service is performed). Creates a BillPayment with the given amount;
  // isPaid lets the caller record either an unpaid or already-paid
  // charge in one step.
  app.post('/:id/record', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      month:  z.number().int().min(1).max(12),
      year:   z.number().int(),
      amount: z.coerce.number().positive(),
      isPaid: z.boolean().default(false),
      notes:  z.string().nullish(),
    }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const user = (request.user as any)
    const bill = await prisma.bill.findUnique({ where: { id } })
    if (!bill) return reply.code(404).send({ error: 'Bill not found' })

    const result = await prisma.billPayment.upsert({
      where: { billId_month_year: { billId: id, month: body.data.month, year: body.data.year } },
      update: {
        amount: body.data.amount,
        isPaid: body.data.isPaid,
        paidAt: body.data.isPaid ? new Date() : null,
        paidById: body.data.isPaid ? user.sub : null,
        notes: body.data.notes,
      },
      create: {
        billId: id,
        month: body.data.month,
        year:  body.data.year,
        amount: body.data.amount,
        isPaid: body.data.isPaid,
        paidAt: body.data.isPaid ? new Date() : null,
        paidById: body.data.isPaid ? user.sub : null,
        notes: body.data.notes,
      },
    })

    if (bill.debtId && body.data.isPaid) {
      await applyDebtPayment(bill.debtId, body.data.amount)
    }
    if (bill.savingsGoalId && body.data.isPaid) {
      await applySavingsContribution(bill.savingsGoalId, body.data.amount)
    }

    return result
  })
}

// Adjust a debt's currentBalance by `delta` (positive draws down, negative
// returns funds — used when unpaying). Clamps at zero and updates isPaidOff.
async function applyDebtPayment(debtId: string, delta: number) {
  const debt = await prisma.debt.findUnique({ where: { id: debtId } })
  if (!debt) return
  const newBalance = Decimal.max(
    0,
    new Decimal(debt.currentBalance.toString()).minus(delta)
  )
  await prisma.debt.update({
    where: { id: debtId },
    data:  { currentBalance: newBalance, isPaidOff: newBalance.eq(0) },
  })
}

// Increment a savings goal's cashAmount by `delta` (positive when a
// linked auto-transfer bill is paid, negative on unpay). Cash is the
// natural landing place for an auto-transfer; the user can rebalance
// into investedAmount via the goal edit modal.
async function applySavingsContribution(goalId: string, delta: number) {
  const goal = await prisma.savingsGoal.findUnique({ where: { id: goalId } })
  if (!goal) return
  const newCash = Decimal.max(
    0,
    new Decimal(goal.cashAmount.toString()).plus(delta)
  )
  await prisma.savingsGoal.update({
    where: { id: goalId },
    data:  { cashAmount: newCash },
  })
}
