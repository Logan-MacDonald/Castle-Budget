import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { DebtType } from '@prisma/client'

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

// ─── Strategy Engine ──────────────────────────────────────────────────────────

type DebtInput = {
  id: string
  name: string
  currentBalance: number
  interestRate: number
  minPayment: number
}

type PayoffMonth = {
  month: number
  year: number
  debtId: string
  payment: number
  interestCharge: number
  principal: number
  remainingBalance: number
}

type StrategyResult = {
  method: 'snowball' | 'avalanche'
  totalMonths: number
  totalInterestPaid: number
  payoffDate: string
  order: { id: string; name: string; payoffMonth: number }[]
  schedule: PayoffMonth[]
}

export function calculatePayoffStrategy(
  debts: DebtInput[],
  extraMonthlyPayment: number,
  method: 'snowball' | 'avalanche'
): StrategyResult {
  // Sort by method
  const sorted = [...debts].sort((a, b) =>
    method === 'snowball'
      ? a.currentBalance - b.currentBalance
      : b.interestRate - a.interestRate
  )

  // Working copy of balances
  const balances = sorted.map(d => ({ ...d, balance: d.currentBalance }))
  const totalMinPayment = balances.reduce((sum, d) => sum + d.minPayment, 0)
  let totalBudget = totalMinPayment + extraMonthlyPayment

  const schedule: PayoffMonth[] = []
  const payoffOrder: { id: string; name: string; payoffMonth: number }[] = []
  let month = 0
  const startDate = new Date()
  let totalInterest = 0
  const MAX_MONTHS = 600 // 50 year safety cap

  while (balances.some(d => d.balance > 0) && month < MAX_MONTHS) {
    month++
    const d = new Date(startDate)
    d.setMonth(d.getMonth() + month - 1)

    let remaining = totalBudget

    // Pay minimums on all active debts first
    for (const debt of balances) {
      if (debt.balance <= 0) continue
      const interest = debt.balance * (debt.interestRate / 12)
      totalInterest += interest
      const min = Math.min(debt.minPayment, debt.balance + interest)
      const payment = Math.min(remaining, min)
      remaining -= payment
      const principal = payment - interest
      debt.balance = Math.max(0, debt.balance + interest - payment)

      schedule.push({
        month,
        year: d.getFullYear(),
        debtId: debt.id,
        payment,
        interestCharge: interest,
        principal: Math.max(0, principal),
        remainingBalance: debt.balance,
      })
    }

    // Apply extra payment to first non-zero debt (snowball/avalanche order)
    for (const debt of balances) {
      if (debt.balance <= 0 || remaining <= 0) continue
      const extra = Math.min(remaining, debt.balance)
      debt.balance = Math.max(0, debt.balance - extra)
      // Update last schedule entry for this debt
      const last = [...schedule].reverse().find(s => s.debtId === debt.id && s.month === month)
      if (last) { last.payment += extra; last.principal += extra }
      remaining -= extra

      if (debt.balance === 0) {
        payoffOrder.push({ id: debt.id, name: debt.name, payoffMonth: month })
        // Freed minimum rolls into next debt
        totalBudget = totalBudget // budget stays same, min freed but already counted
      }
    }
  }

  const payoffDate = new Date(startDate)
  payoffDate.setMonth(payoffDate.getMonth() + month)

  return {
    method,
    totalMonths: month,
    totalInterestPaid: Math.round(totalInterest * 100) / 100,
    payoffDate: payoffDate.toISOString().split('T')[0],
    order: payoffOrder,
    schedule,
  }
}

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
        currentBalance: d.currentBalance,
        interestRate: d.interestRate,
        minPayment: d.minPayment,
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
    const newBalance = Math.max(0, debt.currentBalance - body.data.amount)
    await prisma.debt.update({
      where: { id },
      data: { currentBalance: newBalance, isPaidOff: newBalance === 0 },
    })

    return payment
  })

  // DELETE /api/debts/:id — soft delete
  app.delete('/:id', async (request) => {
    const { id } = request.params as { id: string }
    return prisma.debt.update({ where: { id }, data: { isActive: false } })
  })
}
