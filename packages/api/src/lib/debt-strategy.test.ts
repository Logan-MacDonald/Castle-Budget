import { describe, it, expect } from 'vitest'
import { calculatePayoffStrategy, type DebtInput } from './debt-strategy'

describe('calculatePayoffStrategy', () => {
  it('pays off a single debt with no interest in one month when min >= balance', () => {
    const debts: DebtInput[] = [
      { id: 'a', name: 'A', currentBalance: 100, interestRate: 0, minPayment: 100 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
    expect(result.totalMonths).toBe(1)
    expect(result.totalInterestPaid).toBe(0)
    expect(result.order).toEqual([{ id: 'a', name: 'A', payoffMonth: 1 }])
  })

  it('computes interest close to closed-form on a simple debt', () => {
    // $1000 at 12% APR paying $100/mo takes ~11 months, roughly $60 total interest.
    const debts: DebtInput[] = [
      { id: 'a', name: 'A', currentBalance: 1000, interestRate: 0.12, minPayment: 100 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
    expect(result.totalMonths).toBeGreaterThanOrEqual(10)
    expect(result.totalMonths).toBeLessThanOrEqual(12)
    expect(result.totalInterestPaid).toBeGreaterThan(50)
    expect(result.totalInterestPaid).toBeLessThan(70)
  })

  it('snowball picks the smaller balance first regardless of rate', () => {
    const debts: DebtInput[] = [
      { id: 'big',   name: 'Big',   currentBalance: 5000, interestRate: 0.24, minPayment: 100 },
      { id: 'small', name: 'Small', currentBalance: 500,  interestRate: 0.05, minPayment: 50 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
    expect(result.order[0].id).toBe('small')
  })

  it('avalanche prioritizes the higher rate for extra payment', () => {
    // With equal balances, avalanche should apply extra to the higher-rate debt first.
    // Both pay the same minimum; extra goes entirely to `high` until it's paid off.
    const debts: DebtInput[] = [
      { id: 'low',  name: 'Low',  currentBalance: 1000, interestRate: 0.05, minPayment: 50 },
      { id: 'high', name: 'High', currentBalance: 1000, interestRate: 0.24, minPayment: 50 },
    ]
    const result = calculatePayoffStrategy(debts, 200, 'avalanche')
    expect(result.order[0].id).toBe('high')
  })

  it('extra payment shortens payoff vs no extra', () => {
    const debts: DebtInput[] = [
      { id: 'a', name: 'A', currentBalance: 5000, interestRate: 0.24, minPayment: 100 },
    ]
    const noExtra = calculatePayoffStrategy(debts, 0, 'snowball')
    const withExtra = calculatePayoffStrategy(debts, 200, 'snowball')
    expect(withExtra.totalMonths).toBeLessThan(noExtra.totalMonths)
    expect(withExtra.totalInterestPaid).toBeLessThan(noExtra.totalInterestPaid)
  })

  it('rolls freed minimum into next debt', () => {
    // Debt A: $100 balance, $50 min, 0% — pays off in 2 months, freeing $50/mo.
    // Debt B: $500 balance, $50 min, 0% — without rollover, would take 10 months.
    const debts: DebtInput[] = [
      { id: 'a', name: 'A', currentBalance: 100, interestRate: 0, minPayment: 50 },
      { id: 'b', name: 'B', currentBalance: 500, interestRate: 0, minPayment: 50 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
    expect(result.order.find(o => o.id === 'a')?.payoffMonth).toBe(2)
    expect(result.order.find(o => o.id === 'b')?.payoffMonth).toBeLessThan(10)
  })

  it('exits immediately for already paid-off debts', () => {
    const debts: DebtInput[] = [
      { id: 'a', name: 'A', currentBalance: 0, interestRate: 0.24, minPayment: 100 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
    expect(result.totalMonths).toBe(0)
    expect(result.order).toEqual([])
  })

  it('respects MAX_MONTHS safety cap on pathological input', () => {
    // Min payment less than monthly interest → balance never shrinks.
    const debts: DebtInput[] = [
      { id: 'a', name: 'A', currentBalance: 10000, interestRate: 0.24, minPayment: 10 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
    expect(result.totalMonths).toBeLessThanOrEqual(600)
    // The function should return, not hang.
  })
})
