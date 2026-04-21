import { describe, it, expect } from 'vitest'
import { upcomingBillsWithin, type UpcomingBillInput } from './dashboard-helpers'

const bill = (id: string, dueDay: number): UpcomingBillInput => ({ id, name: id, dueDay })

describe('upcomingBillsWithin', () => {
  it('includes a same-month bill inside the window', () => {
    const today = new Date(2026, 9, 15) // Oct 15, 2026 (month is 0-indexed)
    const result = upcomingBillsWithin([bill('a', 20)], today, 7)
    expect(result.map(b => b.id)).toEqual(['a'])
  })

  it('excludes a same-month bill outside the window', () => {
    const today = new Date(2026, 9, 15)
    const result = upcomingBillsWithin([bill('a', 25)], today, 7)
    expect(result.map(b => b.id)).toEqual([])
  })

  it('includes a bill due early next month when window crosses month boundary', () => {
    // Today: Oct 28, 2026. Window: 7 days → through Nov 4.
    // Bill due Nov 2 should be included.
    const today = new Date(2026, 9, 28)
    const result = upcomingBillsWithin([bill('a', 2)], today, 7)
    expect(result.map(b => b.id)).toEqual(['a'])
  })

  it('excludes a bill due later next month beyond the window', () => {
    const today = new Date(2026, 9, 28)
    const result = upcomingBillsWithin([bill('a', 10)], today, 7)
    expect(result.map(b => b.id)).toEqual([])
  })

  it('sorts returned bills by effective next-due date', () => {
    const today = new Date(2026, 9, 28)
    // Bill A: due Nov 3. Bill B: due Oct 30.
    const result = upcomingBillsWithin([bill('A', 3), bill('B', 30)], today, 7)
    expect(result.map(b => b.id)).toEqual(['B', 'A'])
  })

  it('clamps a dueDay=31 to the last day of a short month', () => {
    // Today: Feb 25, 2026 (28 days in Feb). Window: 7 days → through Mar 4.
    // Bill with dueDay=31 should resolve to Feb 28 (last day of Feb) — within window.
    const today = new Date(2026, 1, 25)
    const result = upcomingBillsWithin([bill('a', 31)], today, 7)
    expect(result.map(b => b.id)).toEqual(['a'])
  })
})
