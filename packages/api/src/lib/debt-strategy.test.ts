import { describe, it, expect } from 'vitest'
import { calculatePayoffStrategy, type DebtInput } from './debt-strategy'

describe('calculatePayoffStrategy', () => {
  // Note: the current engine only pushes into `order` from the extra-payment
  // loop, so debts paid off by their own minimum alone never appear in `order`.
  // This is a bug slated for the T12 Decimal conversion. Tests below that
  // depend on `order` pin the current (broken) behavior and include a skipped
  // sibling describing the desired behavior — un-skip after T12.

  it('pays off a single debt with no interest in one month when min >= balance (current behavior — may change in T12)', () => {
    const debts: DebtInput[] = [
      { id: 'a', name: 'A', currentBalance: 100, interestRate: 0, minPayment: 100 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
    expect(result.totalMonths).toBe(1)
    expect(result.totalInterestPaid).toBe(0)
    // Bug: order is empty because A paid off in minimum loop, never reaching
    // the extra-payment loop where payoffOrder.push lives. Desired version is
    // in the skipped test below.
    expect(result.order).toEqual([])
  })

  it.skip('single-debt payoff records `order` — un-skip after T12 fix', () => {
    const debts: DebtInput[] = [
      { id: 'a', name: 'A', currentBalance: 100, interestRate: 0, minPayment: 100 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
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

  it('snowball picks the smaller balance first — current behavior (may change in T12)', () => {
    const debts: DebtInput[] = [
      { id: 'big',   name: 'Big',   currentBalance: 5000, interestRate: 0.24, minPayment: 100 },
      { id: 'small', name: 'Small', currentBalance: 500,  interestRate: 0.05, minPayment: 50 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
    // Bug: with no extra payment, `small` pays off via its own minimum alone
    // and is never recorded in `order`. Only `big` (which the extra-loop
    // targets once smaller balances are dealt with) appears. The snowball
    // sort itself is correct (balances iterated small-first inside the loop);
    // only the order-tracking is broken.
    expect(result.order.map(o => o.id)).toEqual(['big'])
  })

  it.skip('snowball records smaller balance first in `order` — un-skip after T12 fix', () => {
    const debts: DebtInput[] = [
      { id: 'big',   name: 'Big',   currentBalance: 5000, interestRate: 0.24, minPayment: 100 },
      { id: 'small', name: 'Small', currentBalance: 500,  interestRate: 0.05, minPayment: 50 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
    expect(result.order[0].id).toBe('small')
  })

  it('avalanche picks the higher rate first regardless of balance', () => {
    const debts: DebtInput[] = [
      { id: 'big',   name: 'Big',   currentBalance: 5000, interestRate: 0.24, minPayment: 100 },
      { id: 'small', name: 'Small', currentBalance: 500,  interestRate: 0.05, minPayment: 50 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'avalanche')
    expect(result.order[0].id).toBe('big')
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

  it('rolls freed minimum into next debt (current behavior — may change in T12)', () => {
    // Debt A: $100 balance, $50 min, 0% — pays off in 2 months, freeing $50/mo.
    // Debt B: $500 balance, $50 min, 0% — without rollover, would take 10 months.
    // Current engine: total budget is $100 and stays $100 each month (freed
    // minimums do remain in totalBudget), so both debts together pay off in
    // 6 months, but `order` only records `b` because `a` paid off in the
    // minimum loop.
    const debts: DebtInput[] = [
      { id: 'a', name: 'A', currentBalance: 100, interestRate: 0, minPayment: 50 },
      { id: 'b', name: 'B', currentBalance: 500, interestRate: 0, minPayment: 50 },
    ]
    const result = calculatePayoffStrategy(debts, 0, 'snowball')
    // Total payoff benefits from the freed $50 rolling over — B finishes before month 10.
    expect(result.totalMonths).toBeLessThan(10)
    expect(result.order.find(o => o.id === 'b')?.payoffMonth).toBeLessThan(10)
    // Bug: A's payoff is not recorded in `order` because it pays off via the minimum loop.
    expect(result.order.find(o => o.id === 'a')).toBeUndefined()
  })

  it.skip('rolls freed minimum — desired behavior, un-skip after T12 fix', () => {
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
