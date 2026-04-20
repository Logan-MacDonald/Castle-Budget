import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'

export async function dashboardRoutes(app: FastifyInstance) {
  // GET /api/dashboard — main summary payload
  app.get('/', async () => {
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    // ── Bills this month ──
    const bills = await prisma.bill.findMany({
      where: { isActive: true },
      include: { payments: { where: { month, year } } },
    })

    const totalBills = bills.reduce((sum, b) => sum + b.amount, 0)
    const paidBills = bills.filter(b => b.payments[0]?.isPaid)
    const unpaidBills = bills.filter(b => !b.payments[0]?.isPaid)
    const totalPaid = paidBills.reduce((sum, b) => sum + b.amount, 0)
    const totalUnpaid = unpaidBills.reduce((sum, b) => sum + b.amount, 0)

    // Bills due in next 7 days
    const today = now.getDate()
    const upcomingBills = unpaidBills
      .filter(b => b.dueDay >= today && b.dueDay <= today + 7)
      .sort((a, b) => a.dueDay - b.dueDay)

    // ── Debt summary ──
    const debts = await prisma.debt.findMany({ where: { isActive: true, isPaidOff: false } })
    const totalDebt = debts.reduce((sum, d) => sum + d.currentBalance, 0)
    const totalOriginalDebt = debts.reduce((sum, d) => sum + d.originalBalance, 0)
    const totalMinPayments = debts.reduce((sum, d) => sum + d.minPayment, 0)
    const debtPaidPercent = totalOriginalDebt > 0
      ? Math.round(((totalOriginalDebt - totalDebt) / totalOriginalDebt) * 100)
      : 0

    // ── Income ──
    const incomeSources = await prisma.incomeSource.findMany({ where: { isActive: true } })
    const monthlyIncome = incomeSources.reduce((sum, i) => {
      if (i.payPeriod === 'FIRST' || i.payPeriod === 'FIFTEENTH') return sum + i.amount
      if (i.payPeriod === 'BOTH') return sum + (i.amount * 2)
      if (i.payPeriod === 'MONTHLY') return sum + i.amount
      return sum
    }, 0)

    // ── Savings ──
    const savingsGoals = await prisma.savingsGoal.findMany({ where: { isComplete: false } })
    const totalSavingsTarget = savingsGoals.reduce((sum, g) => sum + g.targetAmount, 0)
    const totalSavingsCurrent = savingsGoals.reduce((sum, g) => sum + g.currentAmount, 0)

    // ── Accounts ──
    const accounts = await prisma.account.findMany({ where: { isActive: true } })

    return {
      month,
      year,
      bills: {
        total: totalBills,
        paid: totalPaid,
        unpaid: totalUnpaid,
        paidCount: paidBills.length,
        unpaidCount: unpaidBills.length,
        totalCount: bills.length,
        upcoming: upcomingBills.map(b => ({ id: b.id, name: b.name, amount: b.amount, dueDay: b.dueDay, autoPay: b.autoPay })),
      },
      debt: {
        total: totalDebt,
        originalTotal: totalOriginalDebt,
        paidPercent: debtPaidPercent,
        totalMinPayments,
        activeCount: debts.length,
      },
      income: {
        monthly: monthlyIncome,
        firstPaycheck: incomeSources.filter(i => i.payPeriod === 'FIRST' || i.payPeriod === 'BOTH').reduce((s, i) => s + i.amount, 0),
        fifteenthPaycheck: incomeSources.filter(i => i.payPeriod === 'FIFTEENTH' || i.payPeriod === 'BOTH').reduce((s, i) => s + i.amount, 0),
      },
      savings: {
        totalTarget: totalSavingsTarget,
        totalCurrent: totalSavingsCurrent,
        goalCount: savingsGoals.length,
      },
      cashFlow: {
        monthly: monthlyIncome - totalBills - totalMinPayments,
      },
      accounts,
    }
  })
}
