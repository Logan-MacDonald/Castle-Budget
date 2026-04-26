import type { FastifyInstance } from 'fastify'
import { Decimal } from 'decimal.js'
import { prisma } from '../lib/prisma'
import { upcomingBillsWithin } from '../lib/dashboard-helpers'

const ZERO = new Decimal(0)
const TWO = new Decimal(2)

function sum<T>(items: T[], field: (t: T) => Decimal | number | string): Decimal {
  return items.reduce((acc, item) => acc.plus(new Decimal(field(item) as any)), ZERO)
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    // ── Bills this month ──
    const bills = await prisma.bill.findMany({
      where: { isActive: true },
      include: { payments: { where: { month, year } } },
    })

    const totalBills = sum(bills, b => b.amount)
    // autoPay bills count as paid for cash-flow purposes — they're already
    // deducted from available funds without needing an explicit payment.
    const isEffectivelyPaid = (b: typeof bills[number]) => b.autoPay || !!b.payments[0]?.isPaid
    const paidBills = bills.filter(isEffectivelyPaid)
    const unpaidBills = bills.filter(b => !isEffectivelyPaid(b))
    const totalPaid = sum(paidBills, b => b.amount)
    const totalUnpaid = sum(unpaidBills, b => b.amount)

    // Bills due in next 7 days — fixed month-crossing in T17.
    const upcomingBills = upcomingBillsWithin(unpaidBills, now, 7)

    // ── Debt summary ──
    const debts = await prisma.debt.findMany({ where: { isActive: true, isPaidOff: false } })
    const totalDebt = sum(debts, d => d.currentBalance)
    const totalOriginalDebt = sum(debts, d => d.originalBalance)
    const totalMinPayments = sum(debts, d => d.minPayment)
    const debtPaidPercent = totalOriginalDebt.gt(0)
      ? Math.round(
          totalOriginalDebt.minus(totalDebt).div(totalOriginalDebt).times(100).toNumber()
        )
      : 0

    // ── Income ──
    const incomeSources = await prisma.incomeSource.findMany({ where: { isActive: true } })
    const monthlyIncome = incomeSources.reduce((acc, i) => {
      const amt = new Decimal(i.amount as any)
      if (i.payPeriod === 'FIRST' || i.payPeriod === 'FIFTEENTH' || i.payPeriod === 'MONTHLY') return acc.plus(amt)
      if (i.payPeriod === 'BOTH') return acc.plus(amt.times(TWO))
      return acc
    }, ZERO)

    const firstPaycheck = incomeSources
      .filter(i => i.payPeriod === 'FIRST' || i.payPeriod === 'BOTH')
      .reduce((acc, i) => acc.plus(new Decimal(i.amount as any)), ZERO)

    const fifteenthPaycheck = incomeSources
      .filter(i => i.payPeriod === 'FIFTEENTH' || i.payPeriod === 'BOTH')
      .reduce((acc, i) => acc.plus(new Decimal(i.amount as any)), ZERO)

    // ── Savings ──
    const savingsGoals = await prisma.savingsGoal.findMany({ where: { isComplete: false } })
    const totalSavingsTarget = sum(savingsGoals, g => g.targetAmount)
    const totalSavingsCurrent = sum(savingsGoals, g => g.currentAmount)

    // ── Accounts ──
    const accounts = await prisma.account.findMany({ where: { isActive: true } })

    return {
      month,
      year,
      bills: {
        total: totalBills.toFixed(2),
        paid: totalPaid.toFixed(2),
        unpaid: totalUnpaid.toFixed(2),
        paidCount: paidBills.length,
        unpaidCount: unpaidBills.length,
        totalCount: bills.length,
        upcoming: upcomingBills.map(b => ({
          id: b.id,
          name: b.name,
          amount: b.amount.toString(),
          dueDay: b.dueDay,
          autoPay: b.autoPay,
        })),
      },
      debt: {
        total: totalDebt.toFixed(2),
        originalTotal: totalOriginalDebt.toFixed(2),
        paidPercent: debtPaidPercent,
        totalMinPayments: totalMinPayments.toFixed(2),
        activeCount: debts.length,
      },
      income: {
        monthly: monthlyIncome.toFixed(2),
        firstPaycheck: firstPaycheck.toFixed(2),
        fifteenthPaycheck: fifteenthPaycheck.toFixed(2),
      },
      savings: {
        totalTarget: totalSavingsTarget.toFixed(2),
        totalCurrent: totalSavingsCurrent.toFixed(2),
        goalCount: savingsGoals.length,
      },
      cashFlow: {
        monthly: monthlyIncome.minus(totalBills).minus(totalMinPayments).toFixed(2),
      },
      accounts: accounts.map(a => ({ ...a, balance: a.balance.toString() })),
    }
  })
}
