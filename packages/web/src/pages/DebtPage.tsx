import { useCallback, useEffect, useState } from 'react'
import { debtsApi, type Debt, type StrategyResult } from '../lib/api'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Plus, Trash2, X, TrendingDown, Zap } from 'lucide-react'

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: decimals })
}
function pct(n: number) { return (n * 100).toFixed(2) + '%' }

const DEBT_TYPES = ['CREDIT_CARD','MORTGAGE','AUTO_LOAN','PERSONAL_LOAN','STUDENT_LOAN','MEDICAL','OTHER']

// Display order for the grouped sections on the Debt Payoff page (the
// modal still uses DEBT_TYPES order for the dropdown).
const DEBT_TYPE_ORDER = ['MORTGAGE','AUTO_LOAN','CREDIT_CARD','PERSONAL_LOAN','STUDENT_LOAN','MEDICAL','OTHER']
const DEBT_TYPE_LABEL: Record<string, string> = {
  MORTGAGE: 'Mortgage',
  AUTO_LOAN: 'Auto Loan',
  CREDIT_CARD: 'Credit Card',
  PERSONAL_LOAN: 'Personal Loan',
  STUDENT_LOAN: 'Student Loan',
  MEDICAL: 'Medical',
  OTHER: 'Other',
}

export function DebtPage() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [strategy, setStrategy] = useState<StrategyResult | null>(null)
  const [method, setMethod] = useState<'snowball' | 'avalanche'>('snowball')
  const [extra, setExtra] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editDebt, setEditDebt] = useState<Debt | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [d, s] = await Promise.all([
      debtsApi.list(),
      debtsApi.strategy(method, extra),
    ])
    setDebts(d)
    setStrategy(s)
    setLoading(false)
  }, [method, extra])

  useEffect(() => { load() }, [load])

  const totalDebt = debts.reduce((s, d) => s + d.currentBalance, 0)
  const totalOriginal = debts.reduce((s, d) => s + d.originalBalance, 0)
  const totalMin = debts.reduce((s, d) => s + d.minPayment, 0)
  const paidPct = totalOriginal > 0 ? ((totalOriginal - totalDebt) / totalOriginal * 100) : 0

  // Build chart data — remaining balance over time (sampled every 6 months).
  // Each point also carries the calendar label/full date so the tooltip can
  // show e.g. "October 2026" instead of just "Mo 6". Simulation month N
  // corresponds to today + (N - 1) calendar months.
  const chartData = strategy?.schedule
    ? (() => {
        const today = new Date()
        const byMonth: Record<number, Record<string, number>> = {}
        for (const s of strategy.schedule) {
          if (!byMonth[s.month]) byMonth[s.month] = { month: s.month }
          byMonth[s.month][s.debtId] = (byMonth[s.month][s.debtId] ?? 0) + s.remainingBalance
        }
        const months = Object.values(byMonth).filter(m => m.month % 6 === 0 || m.month === 1)
        return months.map(m => {
          const total = Object.entries(m).filter(([k]) => k !== 'month').reduce((s, [,v]) => s + (v as number), 0)
          const date = new Date(today)
          date.setMonth(today.getMonth() + (m.month as number) - 1)
          return {
            label:    date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), // "Oct '26"
            fullDate: date.toLocaleDateString('en-US', { month: 'long',  year: 'numeric'  }), // "October 2026"
            total:    Math.round(total),
          }
        })
      })()
    : []

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Debt Payoff</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add Debt
        </button>
      </div>

      <div className="page-body">
        {/* Summary */}
        <div className="stat-grid" style={{ marginBottom: 24 }}>
          <div className="stat-tile">
            <div className="stat-label">Total Remaining</div>
            <div className="stat-value negative">{fmt(totalDebt)}</div>
            <div className="stat-sub">{paidPct.toFixed(1)}% paid off</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Min Payments / mo</div>
            <div className="stat-value">{fmt(totalMin)}</div>
            <div className="stat-sub">{debts.length} active accounts</div>
          </div>
          {strategy && (
            <>
              <div className="stat-tile">
                <div className="stat-label">Payoff Date</div>
                <div className="stat-value" style={{ fontSize: '1.3rem' }}>
                  {new Date(strategy.payoffDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </div>
                <div className="stat-sub">{strategy.totalMonths} months</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Total Interest</div>
                <div className="stat-value negative" style={{ fontSize: '1.4rem' }}>{fmt(strategy.totalInterestPaid)}</div>
                <div className="stat-sub">at current minimums + extra</div>
              </div>
            </>
          )}
        </div>

        {/* Strategy controls */}
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">Payoff Strategy</span>
            <Zap size={16} style={{ color: 'var(--gold-400)' }} />
          </div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <div className="form-label" style={{ marginBottom: 8 }}>Method</div>
              <div className="tabs" style={{ width: 280 }}>
                <button className={`tab-btn${method === 'snowball' ? ' active' : ''}`} onClick={() => setMethod('snowball')}>
                  ❄️ Snowball
                </button>
                <button className={`tab-btn${method === 'avalanche' ? ' active' : ''}`} onClick={() => setMethod('avalanche')}>
                  🌊 Avalanche
                </button>
              </div>
            </div>
            <div className="form-group" style={{ minWidth: 200 }}>
              <label className="form-label">Extra Monthly Payment</label>
              <input
                className="form-input"
                type="number"
                min={0}
                value={extra}
                onChange={e => setExtra(Number(e.target.value))}
                placeholder="0"
                style={{ maxWidth: 160 }}
              />
            </div>
            {strategy && extra > 0 && (
              <div style={{ background: 'var(--success-bg)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', color: 'var(--success)' }}>
                💡 +{fmt(extra)}/mo saves you time &amp; interest. Nice.
              </div>
            )}
          </div>
          <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--neutral-500)' }}>
            {method === 'snowball'
              ? '❄️ Snowball: Pay off smallest balances first. Faster wins, great for motivation.'
              : '🌊 Avalanche: Pay off highest interest rates first. Mathematically optimal, saves more money.'}
          </div>
        </div>

        {/* Payoff order */}
        {strategy && strategy.order.length > 0 && (
          <div className="card card-pad" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title">Payoff Order</span>
              <TrendingDown size={16} style={{ color: 'var(--success)' }} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {strategy.order.map((o, i) => (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--neutral-50)', borderRadius: 8, padding: '8px 12px', border: '1px solid var(--neutral-200)' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--castle-700)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{o.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--neutral-500)' }}>Month {o.payoffMonth}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Balance chart */}
        {chartData.length > 1 && (
          <div className="card card-pad" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title">Debt Elimination Curve</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="debtGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--castle-500)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--castle-500)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => fmt(v)}
                  labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullDate ?? ''}
                />
                <Area type="monotone" dataKey="total" stroke="var(--castle-500)" fill="url(#debtGrad)" strokeWidth={2} name="Total Debt" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Debt cards, grouped by type and alphabetised within each group */}
        {loading ? (
          <div style={{ color: 'var(--neutral-400)' }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {DEBT_TYPE_ORDER.map(type => {
              const group = debts
                .filter(d => d.type === type)
                .sort((a, b) => a.name.localeCompare(b.name))
              if (group.length === 0) return null
              const groupTotal = group.reduce((s, d) => s + d.currentBalance, 0)
              return (
                <div key={type} className="paycheck-section">
                  <div className="paycheck-header">
                    <span className="paycheck-label">{DEBT_TYPE_LABEL[type] ?? type}</span>
                    <span className="paycheck-total">{fmt(groupTotal)}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {group.map(debt => {
                      const payoffOrder = strategy?.order.findIndex(o => o.id === debt.id)
                      const paidPct = debt.originalBalance > 0 ? ((debt.originalBalance - debt.currentBalance) / debt.originalBalance * 100) : 0
                      return (
                        <div key={debt.id} className="debt-card" onClick={() => setEditDebt(debt)} style={{ cursor: 'pointer' }}>
                          <div className="debt-card-header">
                            <div>
                              <div className="debt-name">{debt.name}</div>
                              <div className="debt-institution">{debt.institution}</div>
                            </div>
                            {payoffOrder !== undefined && payoffOrder >= 0 && (
                              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--castle-700)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>
                                {payoffOrder + 1}
                              </div>
                            )}
                          </div>

                          <div style={{ marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--neutral-500)', marginBottom: 4 }}>
                              <span>{paidPct.toFixed(0)}% paid</span>
                              <span>{fmt(debt.currentBalance)}</span>
                            </div>
                            <div className="progress-track">
                              <div className="progress-fill green" style={{ width: `${paidPct}%` }} />
                            </div>
                          </div>

                          <div className="debt-stats">
                            <div>
                              <div className="debt-stat-label">Balance</div>
                              <div className="debt-stat-value">{fmt(debt.currentBalance)}</div>
                            </div>
                            <div>
                              <div className="debt-stat-label">Rate</div>
                              <div className="debt-stat-value">{pct(debt.interestRate)}</div>
                            </div>
                            <div>
                              <div className="debt-stat-label">Min Payment</div>
                              <div className="debt-stat-value">{fmt(debt.minPayment)}</div>
                            </div>
                            <div>
                              <div className="debt-stat-label">Type</div>
                              <div className="debt-stat-value" style={{ fontSize: '0.8rem' }}>{debt.type.replace('_',' ')}</div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showAdd && <DebtModal onClose={() => setShowAdd(false)} onSaved={load} />}
      {editDebt && <DebtModal debt={editDebt} onClose={() => setEditDebt(null)} onSaved={load} />}
    </>
  )
}

function DebtModal({ debt, onClose, onSaved }: { debt?: Debt; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<Debt>>(debt ?? {
    name: '', type: 'CREDIT_CARD', institution: '', originalBalance: 0,
    currentBalance: 0, interestRate: 0, minPayment: 0,
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  function set(k: keyof Debt, v: unknown) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    setSaving(true); setError('')
    try {
      if (debt) {
        await debtsApi.update(debt.id, form)
      } else {
        await debtsApi.create(form)
      }
      onSaved(); onClose()
    } catch (e: any) {
      setError(`Save failed: ${e?.message ?? e}`)
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!debt) return
    if (!confirm(`Delete debt "${debt.name}"? Any linked monthly bill will also be removed.`)) return
    setDeleting(true); setError('')
    try {
      await debtsApi.delete(debt.id)
      onSaved(); onClose()
    } catch (e: any) {
      setError(`Delete failed: ${e?.message ?? e}`)
    } finally { setDeleting(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{debt ? 'Edit Debt' : 'Add Debt'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body">
          {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}
          <div className="form-grid">
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Name</label>
              <input className="form-input" value={form.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="e.g. Chase Southwest" />
            </div>
            <div className="form-group">
              <label className="form-label">Institution</label>
              <input className="form-input" value={form.institution ?? ''} onChange={e => set('institution', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-input" value={form.type} onChange={e => set('type', e.target.value)}>
                {DEBT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Original Balance</label>
              <input className="form-input" type="number" value={form.originalBalance ?? 0} onChange={e => set('originalBalance', parseFloat(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Current Balance</label>
              <input className="form-input" type="number" value={form.currentBalance ?? 0} onChange={e => set('currentBalance', parseFloat(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Interest Rate (APR %)</label>
              <input className="form-input" type="number" step="0.01" value={form.interestRate ? (form.interestRate * 100).toFixed(2) : ''} onChange={e => set('interestRate', parseFloat(e.target.value) / 100)} placeholder="e.g. 24.99" />
            </div>
            <div className="form-group">
              <label className="form-label">Min Payment</label>
              <input className="form-input" type="number" value={form.minPayment ?? 0} onChange={e => set('minPayment', parseFloat(e.target.value))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <input className="form-input" value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          {debt ? (
            <button className="btn btn-ghost" style={{ color: 'var(--red-500, #c0392b)' }} onClick={handleDelete} disabled={deleting || saving}>
              <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete'}
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name}>
              {saving ? 'Saving…' : debt ? 'Update' : 'Add Debt'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
