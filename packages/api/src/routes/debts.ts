import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Decimal } from 'decimal.js'
import { prisma } from '../lib/prisma'
import { DebtType } from '@prisma/client'
import { calculatePayoffStrategy, MAX_MONTHS } from '../lib/debt-strategy'
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

  // GET /api/debts/strategy?method=snowball&extra=200&excludeTypes=MORTGAGE,AUTO_LOAN
  // excludeTypes lets the caller drop whole categories from the
  // simulation (e.g. don't stretch the snowball plan over a 30-year
  // mortgage). Excluded debts still exist in the ledger; they're just
  // not in this run.
  app.get('/strategy', async (request, reply) => {
    const query = z.object({
      method: z.enum(['snowball', 'avalanche']).default('snowball'),
      extra:  z.coerce.number().nonnegative().default(0),
      excludeTypes: z.string().optional(),
    }).safeParse(request.query)

    if (!query.success) return reply.code(400).send({ error: query.error.flatten() })

    const excluded = new Set(
      (query.data.excludeTypes ?? '').split(',').map(s => s.trim()).filter(Boolean)
    )

    // Pull each debt's linked Bill alongside it. The bill's `amount`
    // (when present) is the actual monthly contribution the user
    // makes — typically what they've put on auto-pay. It can be more
    // than `debt.minPayment`, so using it makes the simulation match
    // reality.
    const debts = (await prisma.debt.findMany({
      where: { isActive: true, isPaidOff: false },
      include: { bill: true },
    })).filter(d => !excluded.has(d.type))

    // No special-case for empty: calculatePayoffStrategy handles []
    // and returns a well-shaped StrategyResult with empty order/schedule.

    // Effective monthly contribution per debt: linked bill's amount
    // wins over debt.minPayment when present and active.
    const effectiveMin = (d: typeof debts[number]) => {
      const linked = d.bill?.isActive ? d.bill : null
      return linked ? linked.amount.toString() : d.minPayment.toString()
    }

    const result = calculatePayoffStrategy(
      debts.map(d => ({
        id: d.id,
        name: d.name,
        currentBalance: d.currentBalance.toString(),
        interestRate: d.interestRate.toString(),
        minPayment: effectiveMin(d),
      })),
      query.data.extra,
      query.data.method
    )

    // Warnings come from the simulation OUTCOME, not the initial-state
    // check. A debt with min < interest is only a problem if the rest
    // of the plan can't bail it out via rollover. If the sim hit
    // MAX_MONTHS, any debt whose payoff month is at the cap never
    // actually paid off — that's the runaway case worth surfacing.
    const warnings: string[] = []
    let anyRunaway = false
    if (result.totalMonths >= MAX_MONTHS) {
      const debtById = new Map(debts.map(d => [d.id, d]))
      for (const o of result.order) {
        if (o.payoffMonth < MAX_MONTHS) continue
        anyRunaway = true
        const d = debtById.get(o.id)
        if (!d) continue
        const bal  = Number(d.currentBalance)
        const rate = Number(d.interestRate)
        const min  = Number(effectiveMin(d))
        const monthlyInterest = bal * rate / 12
        warnings.push(
          `${d.name}: payment of $${Math.round(min)}/mo is below its monthly interest (~$${Math.round(monthlyInterest)}). With this filter and method, the balance grows faster than it's paid down.`
        )
      }
    }

    // If snowball is producing runaway debts, avalanche (highest rate
    // first) would head them off — surface the suggestion.
    const methodSuggestion =
      query.data.method === 'snowball' && anyRunaway ? 'avalanche' : undefined

    return { ...result, warnings, methodSuggestion }
  })

  // POST /api/debts
  // No bill is auto-created. The user explicitly links an existing bill
  // to this debt (or doesn't) via the bill edit modal. That keeps the
  // bills page from accumulating duplicates of bills the user already
  // tracks manually.
  app.post('/', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = debtSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    return prisma.debt.create({ data: body.data })
  })

  // PATCH /api/debts/:id — if a bill happens to be linked to this debt,
  // keep its name/amount/dueDay/isBusiness in sync so the user doesn't
  // edit them in two places. Never creates a bill.
  app.patch('/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const body = debtSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    const { id } = request.params as { id: string }
    const debt = await prisma.debt.update({ where: { id }, data: body.data })

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
