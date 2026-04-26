import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Decimal } from 'decimal.js'
import { prisma } from '../lib/prisma'
import { BillCategory, PayPeriod } from '@prisma/client'
import { requireAdmin } from '../lib/auth-hooks'

const billSchema = z.object({
  name:       z.string().min(1),
  amount:     z.coerce.number().positive(),
  dueDay:     z.number().int().min(1).max(31),
  category:   z.nativeEnum(BillCategory),
  autoPay:    z.boolean().default(false),
  isActive:   z.boolean().default(true),
  isBusiness: z.boolean().default(false),
  payPeriod:  z.nativeEnum(PayPeriod),
  accountId:  z.string().nullish(),
  notes:      z.string().nullish(),
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

    return bills.map(b => ({
      ...b,
      payment: b.payments[0] ?? null,
      isPaid: b.payments[0]?.isPaid ?? false,
    }))
  })

  // POST /api/bills
  app.post('/', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = billSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    return prisma.bill.create({ data: body.data })
  })

  // PATCH /api/bills/:id
  app.patch('/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = billSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const { id } = request.params as { id: string }
    return prisma.bill.update({ where: { id }, data: body.data })
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

    const paidAmount = body.data.amount ?? Number(bill.amount)

    const payment = await prisma.billPayment.upsert({
      where: { billId_month_year: { billId: id, month: body.data.month, year: body.data.year } },
      update: { isPaid: true, paidAt: new Date(), paidById: user.sub, amount: paidAmount, notes: body.data.notes },
      create: { billId: id, month: body.data.month, year: body.data.year, isPaid: true, paidAt: new Date(), paidById: user.sub, amount: paidAmount, notes: body.data.notes },
    })

    if (bill.debtId) {
      await applyDebtPayment(bill.debtId, paidAmount)
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
