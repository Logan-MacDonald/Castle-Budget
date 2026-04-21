import { addMonths, differenceInDays, lastDayOfMonth, setDate, startOfDay } from 'date-fns'

export type UpcomingBillInput = {
  id: string
  name: string
  dueDay: number
  amount?: unknown
  autoPay?: boolean
}

/**
 * Returns bills due within `days` from `today`, sorted by effective next-due date.
 *
 * For each bill:
 *   1. Compute this month's occurrence (clamped to the last day of the month
 *      if dueDay exceeds it).
 *   2. If that occurrence is before `today`, advance to next month's occurrence
 *      (also clamped).
 *   3. Include if `effectiveDate - today <= days` (and >= 0).
 */
export function upcomingBillsWithin<T extends UpcomingBillInput>(
  bills: T[],
  today: Date,
  days: number
): T[] {
  const todayStart = startOfDay(today)

  function nextOccurrence(dueDay: number): Date {
    const thisMonthLast = lastDayOfMonth(todayStart)
    const thisMonthDue = setDate(todayStart, Math.min(dueDay, thisMonthLast.getDate()))
    if (thisMonthDue >= todayStart) return thisMonthDue
    const nextMonthStart = addMonths(todayStart, 1)
    const nextMonthLast = lastDayOfMonth(nextMonthStart)
    return setDate(nextMonthStart, Math.min(dueDay, nextMonthLast.getDate()))
  }

  return bills
    .map(b => ({ bill: b, next: nextOccurrence(b.dueDay) }))
    .filter(({ next }) => {
      const diff = differenceInDays(next, todayStart)
      return diff >= 0 && diff <= days
    })
    .sort((a, b) => a.next.getTime() - b.next.getTime())
    .map(({ bill }) => bill)
}
