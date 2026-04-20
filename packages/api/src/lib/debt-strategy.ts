export type DebtInput = {
  id: string
  name: string
  currentBalance: number
  interestRate: number
  minPayment: number
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
}

export function calculatePayoffStrategy(
  debts: DebtInput[],
  extraMonthlyPayment: number,
  method: 'snowball' | 'avalanche'
): StrategyResult {
  const sorted = [...debts].sort((a, b) =>
    method === 'snowball'
      ? a.currentBalance - b.currentBalance
      : b.interestRate - a.interestRate
  )

  const balances = sorted.map(d => ({ ...d, balance: d.currentBalance }))
  const totalMinPayment = balances.reduce((sum, d) => sum + d.minPayment, 0)
  let totalBudget = totalMinPayment + extraMonthlyPayment

  const schedule: PayoffMonth[] = []
  const payoffOrder: { id: string; name: string; payoffMonth: number }[] = []
  let month = 0
  const startDate = new Date()
  let totalInterest = 0
  const MAX_MONTHS = 600

  while (balances.some(d => d.balance > 0) && month < MAX_MONTHS) {
    month++
    const d = new Date(startDate)
    d.setMonth(d.getMonth() + month - 1)

    let remaining = totalBudget

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

    for (const debt of balances) {
      if (debt.balance <= 0 || remaining <= 0) continue
      const extra = Math.min(remaining, debt.balance)
      debt.balance = Math.max(0, debt.balance - extra)
      const last = [...schedule].reverse().find(s => s.debtId === debt.id && s.month === month)
      if (last) { last.payment += extra; last.principal += extra }
      remaining -= extra

      if (debt.balance === 0) {
        payoffOrder.push({ id: debt.id, name: debt.name, payoffMonth: month })
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
