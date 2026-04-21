export type UpcomingBillInput = {
  id: string
  name: string
  dueDay: number
  amount?: unknown
  autoPay?: boolean
}

/**
 * Returns bills due within `days` from `today`, sorted by dueDay.
 *
 * NOTE: current implementation does not handle month boundaries —
 * bills with dueDay earlier in the next month are missed. See Task T17.
 */
export function upcomingBillsWithin<T extends UpcomingBillInput>(
  bills: T[],
  today: Date,
  days: number
): T[] {
  const d = today.getDate()
  return bills
    .filter(b => b.dueDay >= d && b.dueDay <= d + days)
    .sort((a, b) => a.dueDay - b.dueDay)
}
