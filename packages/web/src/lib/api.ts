const BASE = '/api'

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function parseMoney(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

// Field names that represent money values in API responses. Known-set so
// we only touch actual money fields (not e.g. `month` or `dueDay`).
const MONEY_FIELDS = new Set([
  'amount', 'balance', 'targetAmount', 'currentAmount',
  'cashAmount', 'investedAmount',
  'originalBalance', 'currentBalance', 'minPayment', 'interestRate',
  'extraPayment',
  // Dashboard rollup fields:
  'total', 'paid', 'unpaid', 'originalTotal', 'totalMinPayments',
  'monthly', 'firstPaycheck', 'fifteenthPaycheck',
  'totalTarget', 'totalCurrent',
])

function parseMoneyFields<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(parseMoneyFields) as any
  const out: any = {}
  for (const [k, v] of Object.entries(obj as any)) {
    if (MONEY_FIELDS.has(k) && (typeof v === 'string' || typeof v === 'number')) {
      out[k] = parseMoney(v as any)
    } else if (v && typeof v === 'object') {
      out[k] = parseMoneyFields(v)
    } else {
      out[k] = v
    }
  }
  return out
}

function buildInit(options: RequestInit): RequestInit {
  // Only set Content-Type when we actually have a body — Fastify 5
  // rejects requests that claim application/json with an empty body
  // (FST_ERR_CTP_EMPTY_JSON_BODY). DELETE and POST-without-body would
  // otherwise trip on it.
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) }
  if (options.body && !('Content-Type' in headers)) {
    headers['Content-Type'] = 'application/json'
  }
  return { ...options, headers, credentials: 'include' }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, buildInit(options))

  if (res.status === 401) {
    // Try refresh once. Don't navigate from here — let AuthContext catch
    // the throw, set user=null, and React Router redirect to /login via
    // <RequireAuth>. A `window.location.href` here causes a full page
    // reload, which re-mounts AuthContext and re-fires /auth/me, which
    // 401s again → infinite reload loop.
    const refresh = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    if (refresh.ok) {
      const retry = await fetch(`${BASE}${path}`, buildInit(options))
      if (!retry.ok) throw new ApiError(retry.status, await retry.text())
      return parseMoneyFields(await retry.json()) as T
    }
    throw new ApiError(401, 'Unauthorized')
  }

  if (!res.ok) {
    const text = await res.text()
    throw new ApiError(res.status, text)
  }

  if (res.status === 204) return undefined as T
  return parseMoneyFields(await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ user: AuthUser }>('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<{ user: AuthUser }>('/auth/me'),
}

// Dashboard
export const dashboardApi = {
  get: () => api.get<DashboardData>('/dashboard'),
}

// Bills
export const billsApi = {
  list: () => api.get<Bill[]>('/bills'),
  monthly: (month: number, year: number) =>
    api.get<BillWithPayment[]>(`/bills/monthly?month=${month}&year=${year}`),
  create: (data: Partial<Bill>) => api.post<Bill>('/bills', data),
  update: (id: string, data: Partial<Bill>) => api.patch<Bill>(`/bills/${id}`, data),
  delete: (id: string) => api.delete(`/bills/${id}`),
  pay: (id: string, month: number, year: number, amount?: number) =>
    api.post(`/bills/${id}/pay`, { month, year, amount }),
  unpay: (id: string, month: number, year: number) =>
    api.post(`/bills/${id}/unpay`, { month, year }),
  record: (id: string, month: number, year: number, amount: number, isPaid: boolean) =>
    api.post(`/bills/${id}/record`, { month, year, amount, isPaid }),
}

// Debts
export const debtsApi = {
  list: () => api.get<Debt[]>('/debts'),
  strategy: (method: 'snowball' | 'avalanche', extra: number, excludeTypes: string[] = []) => {
    const params = new URLSearchParams({ method, extra: String(extra) })
    if (excludeTypes.length) params.set('excludeTypes', excludeTypes.join(','))
    return api.get<StrategyResult>(`/debts/strategy?${params.toString()}`)
  },
  create: (data: Partial<Debt>) => api.post<Debt>('/debts', data),
  update: (id: string, data: Partial<Debt>) => api.patch<Debt>(`/debts/${id}`, data),
  payment: (id: string, data: DebtPaymentInput) =>
    api.post(`/debts/${id}/payment`, data),
  delete: (id: string) => api.delete(`/debts/${id}`),
}

// Income
export const incomeApi = {
  list: () => api.get<IncomeSource[]>('/income'),
  create: (data: Partial<IncomeSource>) => api.post<IncomeSource>('/income', data),
  update: (id: string, data: Partial<IncomeSource>) => api.patch<IncomeSource>(`/income/${id}`, data),
  delete: (id: string) => api.delete(`/income/${id}`),
}

// Savings
export const savingsApi = {
  list: () => api.get<SavingsGoal[]>('/savings'),
  create: (data: Partial<SavingsGoal>) => api.post<SavingsGoal>('/savings', data),
  update: (id: string, data: Partial<SavingsGoal>) => api.patch<SavingsGoal>(`/savings/${id}`, data),
  delete: (id: string) => api.delete(`/savings/${id}`),
}

// Accounts
export const accountsApi = {
  list: () => api.get<Account[]>('/accounts'),
  create: (data: Partial<Account>) => api.post<Account>('/accounts', data),
  update: (id: string, data: Partial<Account>) => api.patch<Account>(`/accounts/${id}`, data),
  delete: (id: string) => api.delete(`/accounts/${id}`),
}

// Settings
export const settingsApi = {
  users: () => api.get<AuthUser[]>('/settings/users'),
  createUser: (data: { name: string; email: string; password: string; role: string }) =>
    api.post<AuthUser>('/settings/users', data),
  updateUser: (id: string, data: Partial<AuthUser & { password: string }>) =>
    api.patch<AuthUser>(`/settings/users/${id}`, data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.patch('/settings/password', { currentPassword, newPassword }),
}

// ── Types ───────────────────────────────────────────────────────────────────

export type AuthUser = { sub: string; name: string; email: string; role: 'ADMIN' | 'MEMBER' }

export type Bill = {
  id: string; name: string; amount: number; dueDay: number
  category: string; autoPay: boolean; isActive: boolean
  isBusiness: boolean; payPeriod: string
  accountId?: string; debtId?: string; savingsGoalId?: string; notes?: string
}

export type BillWithPayment = Bill & {
  payment: { id: string; isPaid: boolean; paidAt?: string; amount?: number } | null
  isPaid: boolean
}

export type Debt = {
  id: string; name: string; institution?: string; type: string
  originalBalance: number; currentBalance: number; interestRate: number
  minPayment: number; dueDay?: number; isActive: boolean; isPaidOff: boolean
  accountId?: string; notes?: string
}

export type DebtPaymentInput = {
  amount: number; extraPayment?: number; month: number; year: number; notes?: string
}

export type StrategyResult = {
  method: string; totalMonths: number; totalInterestPaid: number; payoffDate: string
  order: { id: string; name: string; payoffMonth: number }[]
  schedule: { month: number; year: number; debtId: string; payment: number; remainingBalance: number }[]
  warnings?: string[]
  methodSuggestion?: 'snowball' | 'avalanche'
}

export type IncomeSource = {
  id: string; name: string; owner: string; amount: number
  payPeriod: string; isActive: boolean; isBusiness: boolean; notes?: string
}

export type SavingsGoal = {
  id: string; name: string
  targetAmount: number; cashAmount: number; investedAmount: number
  targetDate?: string; isComplete: boolean; accountId?: string; notes?: string
}

export type Account = {
  id: string; name: string; institution?: string; type: string
  balance: number; isActive: boolean; isBusiness: boolean; notes?: string
}

export type DashboardData = {
  month: number; year: number
  bills: { total: number; paid: number; unpaid: number; paidCount: number; unpaidCount: number; totalCount: number; upcoming: Partial<Bill>[] }
  debt: { total: number; originalTotal: number; paidPercent: number; totalMinPayments: number; activeCount: number }
  income: { monthly: number; firstPaycheck: number; fifteenthPaycheck: number }
  savings: { totalTarget: number; totalCurrent: number; goalCount: number }
  cashFlow: { monthly: number }
  accounts: Account[]
}
