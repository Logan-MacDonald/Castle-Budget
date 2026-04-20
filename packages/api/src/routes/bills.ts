import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { BillCategory, PayPeriod } from '@prisma/client'

const billSchema = z.object({
  name:       z.string().min(1),
  amount:     z.coerce.number().positive(),
  dueDay:     z.number().int().min(1).max(31),
  category:   z.nativeEnum(BillCategory),
  autoPay:    z.boolean().default(false),
  isActive:   z.boolean().default(true),
  isBusiness: z.boolean().default(false),
  payPeriod:  z.nativeEnum(PayPeriod),
  accountId:  z.string().optional(),
  notes:      z.string().optional(),
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
  app.post('/', async (request, reply) => {
    const body = billSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    return prisma.bill.create({ data: body.data })
  })

  // PATCH /api/bills/:id
  app.patch('/:id', async (request, reply) => {
    const body = billSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const { id } = request.params as { id: string }
    return prisma.bill.update({ where: { id }, data: body.data })
  })

  // DELETE /api/bills/:id — soft delete
  app.delete('/:id', async (request) => {
    const { id } = request.params as { id: string }
    return prisma.bill.update({ where: { id }, data: { isActive: false } })
  })

  // POST /api/bills/:id/pay — mark a bill as paid for a given month
  app.post('/:id/pay', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      month:   z.number().int().min(1).max(12),
      year:    z.number().int(),
      amount:  z.coerce.number().optional(),
      notes:   z.string().optional(),
    }).safeParse(request.body)

    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    const user = (request.user as any)

    return prisma.billPayment.upsert({
      where: { billId_month_year: { billId: id, month: body.data.month, year: body.data.year } },
      update: { isPaid: true, paidAt: new Date(), paidById: user.sub, amount: body.data.amount, notes: body.data.notes },
      create: { billId: id, month: body.data.month, year: body.data.year, isPaid: true, paidAt: new Date(), paidById: user.sub, amount: body.data.amount, notes: body.data.notes },
    })
  })

  // POST /api/bills/:id/unpay — mark a bill as unpaid
  app.post('/:id/unpay', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ month: z.number().int(), year: z.number().int() }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })

    return prisma.billPayment.upsert({
      where: { billId_month_year: { billId: id, month: body.data.month, year: body.data.year } },
      update: { isPaid: false, paidAt: null },
      create: { billId: id, month: body.data.month, year: body.data.year, isPaid: false },
    })
  })
}
