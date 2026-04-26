import { Decimal } from 'decimal.js'

export type DebtInput = {
  id: string
  name: string
  currentBalance: number | string
  interestRate: number | string
  minPayment: number | string
}

export type PayoffMonth = {
  month: number
  year: number
  debtId: string
  payment: number
  interestCharge: number
  principal: number
  remainingBalance: number
}

export type StrategyResult = {
  method: 'snowball' | 'avalanche'
  totalMonths: number
  totalInterestPaid: number
  payoffDate: string
  order: { id: string; name: string; payoffMonth: number }[]
  schedule: PayoffMonth[]
  warnings?: string[]
  methodSuggestion?: 'snowball' | 'avalanche'
}

type InternalDebt = {
  id: string
  name: string
  balance: Decimal
  interestRate: Decimal
  minPayment: Decimal
}

const ZERO = new Decimal(0)
const TWELVE = new Decimal(12)

export function calculatePayoffStrategy(
  debts: DebtInput[],
  extraMonthlyPayment: number | string,
  method: 'snowball' | 'avalanche'
): StrategyResult {
  const working: InternalDebt[] = debts
    .map(d => ({
      id: d.id,
      name: d.name,
      balance: new Decimal(d.currentBalance),
      interestRate: new Decimal(d.interestRate),
      minPayment: new Decimal(d.minPayment),
    }))
    // Already-paid debts (balance 0) get no badge and no schedule rows.
    .filter(d => d.balance.gt(0))

  // Target order — the sequence to focus extra payments on. For
  // snowball this is smallest balance first; for avalanche it's highest
  // interest rate first. This is what the UI surfaces as the "payoff
  // order" badge on each debt card. (Actual completion order can differ
  // when a large-balance debt has a large mandatory minimum.)
  working.sort((a, b) =>
    method === 'snowball'
      ? a.balance.cmp(b.balance)
      : b.interestRate.cmp(a.interestRate)
  )
  const targetOrder = working.map(d => ({ id: d.id, name: d.name }))
  const payoffMonths = new Map<string, number>()

  const extra = new Decimal(extraMonthlyPayment)
  const totalMinPayment = working.reduce((sum, d) => sum.plus(d.minPayment), ZERO)
  const totalBudget = totalMinPayment.plus(extra)

  const schedule: PayoffMonth[] = []
  const startDate = new Date()
  let totalInterest = ZERO
  let month = 0
  const MAX_MONTHS = 600

  while (working.some(d => d.balance.gt(0)) && month < MAX_MONTHS) {
    month++
    const d = new Date(startDate)
    d.setMonth(d.getMonth() + month - 1)

    let remaining = totalBudget

    // Minimums pass
    for (const debt of working) {
      if (debt.balance.lte(0)) continue
      const monthlyRate = debt.interestRate.div(TWELVE)
      const interest = debt.balance.times(monthlyRate)
      totalInterest = totalInterest.plus(interest)

      const max = debt.balance.plus(interest)
      const min = Decimal.min(debt.minPayment, max)
      const payment = Decimal.min(remaining, min)
      remaining = remaining.minus(payment)
      const principal = payment.minus(interest)
      debt.balance = Decimal.max(ZERO, debt.balance.plus(interest).minus(payment))

      schedule.push({
        month,
        year: d.getFullYear(),
        debtId: debt.id,
        payment: payment.toDecimalPlaces(2).toNumber(),
        interestCharge: interest.toDecimalPlaces(2).toNumber(),
        principal: Decimal.max(ZERO, principal).toDecimalPlaces(2).toNumber(),
        remainingBalance: debt.balance.toDecimalPlaces(2).toNumber(),
      })

      if (debt.balance.eq(0) && !payoffMonths.has(debt.id)) payoffMonths.set(debt.id, month)
    }

    // Extra (or rolled-over minimums) pass — apply remaining budget in method order
    for (const debt of working) {
      if (debt.balance.lte(0) || remaining.lte(0)) continue
      const apply = Decimal.min(remaining, debt.balance)
      debt.balance = Decimal.max(ZERO, debt.balance.minus(apply))

      const last = [...schedule].reverse().find(s => s.debtId === debt.id && s.month === month)
      if (last) {
        last.payment = new Decimal(last.payment).plus(apply).toDecimalPlaces(2).toNumber()
        last.principal = new Decimal(last.principal).plus(apply).toDecimalPlaces(2).toNumber()
        last.remainingBalance = debt.balance.toDecimalPlaces(2).toNumber()
      }
      remaining = remaining.minus(apply)

      if (debt.balance.eq(0) && !payoffMonths.has(debt.id)) payoffMonths.set(debt.id, month)
    }
  }

  const payoffDate = new Date(startDate)
  payoffDate.setMonth(payoffDate.getMonth() + month)

  // Order entries follow the *target* sequence (snowball: smallest
  // balance first; avalanche: highest rate first), with each debt's
  // simulated completion month attached. The badge index = attack
  // priority; payoffMonth = when the simulation says it actually
  // finishes (which can be earlier than the badge suggests for debts
  // with large minimums).
  const order = targetOrder.map(t => ({
    id: t.id,
    name: t.name,
    payoffMonth: payoffMonths.get(t.id) ?? month,
  }))

  return {
    method,
    totalMonths: month,
    totalInterestPaid: totalInterest.toDecimalPlaces(2).toNumber(),
    payoffDate: payoffDate.toISOString().split('T')[0],
    order,
    schedule,
  }
}
