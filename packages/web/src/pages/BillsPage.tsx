import { useEffect, useState, useCallback } from 'react'
import { billsApi, debtsApi, type BillWithPayment, type Bill, type Debt } from '../lib/api'
import { Check, ChevronLeft, ChevronRight, Link2, Plus, Trash2, X } from 'lucide-react'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const PAY_PERIODS = ['FIRST','FIFTEENTH','BOTH','MONTHLY','ANNUAL','VARIABLE']
const CATEGORIES = ['HOUSING','UTILITIES','INSURANCE','DEBT_PAYMENT','SUBSCRIPTION','AUTO','HEALTHCARE','CHILDCARE','SAVINGS_TRANSFER','BUSINESS','OTHER']

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

const PAY_PERIOD_LABEL: Record<string, string> = {
  FIRST: '1st', FIFTEENTH: '15th', BOTH: 'Both', MONTHLY: 'Monthly', ANNUAL: 'Annual', VARIABLE: 'Variable'
}

export function BillsPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [bills, setBills] = useState<BillWithPayment[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editBill, setEditBill] = useState<Bill | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [b, d] = await Promise.all([
      billsApi.monthly(month, year),
      debtsApi.list(),
    ])
    setBills(b)
    setDebts(d)
    setLoading(false)
  }, [month, year])

  useEffect(() => { load() }, [load])

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  async function togglePaid(bill: BillWithPayment) {
    if (bill.isPaid) {
      await billsApi.unpay(bill.id, month, year)
    } else {
      await billsApi.pay(bill.id, month, year)
    }
    load()
  }

  const firstBills  = bills.filter(b => b.payPeriod === 'FIRST'  || b.payPeriod === 'BOTH')
  const otherBills  = bills.filter(b => !['FIRST','FIFTEENTH','BOTH'].includes(b.payPeriod))

  // Deduplicate BOTH bills — show under 1st only
  const fifteenthBills = bills.filter(b => b.payPeriod === 'FIFTEENTH')

  // For the displayed month/year, has the bill's dueDay already passed?
  // Past months: yes. Future months: no. Current month: only if today's
  // calendar day >= dueDay. autoPay bills then count as effectively paid
  // — green check + strikethrough — without needing a manual click.
  const today = new Date()
  const todayMonth = today.getMonth() + 1
  const todayYear  = today.getFullYear()
  const monthInPast    = year < todayYear || (year === todayYear && month < todayMonth)
  const isCurrentMonth = year === todayYear && month === todayMonth
  function dueDayPassed(dueDay: number): boolean {
    if (monthInPast) return true
    if (isCurrentMonth) return today.getDate() >= dueDay
    return false
  }
  const isEffectivelyPaid = (b: BillWithPayment) => b.isPaid || (b.autoPay && dueDayPassed(b.dueDay))

  const totalBills = bills.reduce((s, b) => s + b.amount, 0)
  // autoPay bills count as paid for the running total *once their due
  // day has passed in this view* — until then they're still upcoming.
  const totalPaid  = bills.filter(isEffectivelyPaid).reduce((s, b) => s + b.amount, 0)

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Bills</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="month-nav">
            <button className="btn btn-ghost btn-sm" onClick={prevMonth}><ChevronLeft size={14} /></button>
            <span className="month-label">{MONTHS[month - 1]} {year}</span>
            <button className="btn btn-ghost btn-sm" onClick={nextMonth}><ChevronRight size={14} /></button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add Bill
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Summary bar */}
        <div style={{ background: 'var(--castle-900)', borderRadius: 12, padding: '16px 24px', marginBottom: 24, display: 'flex', gap: 32, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--castle-300)', fontWeight: 600 }}>Total Bills</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: '#fff' }}>{fmt(totalBills)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--castle-300)', fontWeight: 600 }}>Paid</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--gold-300)' }}>{fmt(totalPaid)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--castle-300)', fontWeight: 600 }}>Remaining</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--castle-200)' }}>{fmt(totalBills - totalPaid)}</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ minWidth: 160 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--castle-300)', marginBottom: 6 }}>
              {bills.filter(isEffectivelyPaid).length} of {bills.length} paid
            </div>
            <div className="progress-track" style={{ height: 6, background: 'rgba(255,255,255,.1)' }}>
              <div className="progress-fill green" style={{ width: `${bills.length ? (bills.filter(isEffectivelyPaid).length/bills.length)*100 : 0}%` }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ color: 'var(--neutral-400)', padding: '24px 0' }}>Loading bills…</div>
          ) : bills.length === 0 ? (
            <div className="card card-pad" style={{ color: 'var(--neutral-400)', textAlign: 'center' }}>
              No bills set up yet. Add your first bill to get started.
            </div>
          ) : (
            <>
              <BillSection title="1st Paycheck Bills" bills={firstBills} onToggle={togglePaid} onEdit={setEditBill} isEffectivelyPaid={isEffectivelyPaid} />
              <BillSection title="15th Paycheck Bills" bills={fifteenthBills} onToggle={togglePaid} onEdit={setEditBill} isEffectivelyPaid={isEffectivelyPaid} />
              {otherBills.length > 0 && <BillSection title="Other" bills={otherBills} onToggle={togglePaid} onEdit={setEditBill} isEffectivelyPaid={isEffectivelyPaid} />}
            </>
          )}
        </div>
      </div>

      {showAdd && <BillModal debts={debts} onClose={() => setShowAdd(false)} onSaved={load} />}
      {editBill && <BillModal bill={editBill} debts={debts} onClose={() => setEditBill(null)} onSaved={load} />}
    </>
  )
}

function BillSection({ title, bills, onToggle, onEdit, isEffectivelyPaid }: {
  title: string
  bills: BillWithPayment[]
  onToggle: (b: BillWithPayment) => void
  onEdit: (b: Bill) => void
  isEffectivelyPaid: (b: BillWithPayment) => boolean
}) {
  if (bills.length === 0) return null
  const total = bills.reduce((s, b) => s + b.amount, 0)

  return (
    <div className="paycheck-section">
      <div className="paycheck-header">
        <span className="paycheck-label">{title}</span>
        <span className="paycheck-total">{fmt(total)}</span>
      </div>
      <div className="card">
        <div className="bill-list" style={{ padding: '8px 0' }}>
          {bills.sort((a,b) => a.dueDay - b.dueDay).map(bill => {
            const paid = isEffectivelyPaid(bill)
            return (
              <div
                key={bill.id}
                className={`bill-row${paid ? ' paid' : ''}`}
                onClick={() => onEdit(bill)}
                style={{ cursor: 'pointer' }}
              >
                <button
                  className={`check-btn${paid ? ' paid' : ''}`}
                  onClick={e => { e.stopPropagation(); onToggle(bill) }}
                >
                  {paid && <Check size={14} />}
                </button>
                <div className="bill-info">
                  <div className="bill-name">
                    {bill.name}
                    {bill.debtId && (
                      <Link2 size={11} style={{ marginLeft: 6, opacity: 0.5 }} aria-label="Linked to a debt" />
                    )}
                  </div>
                  <div className="bill-meta">
                    Due {bill.dueDay}{ordinal(bill.dueDay)}
                    {bill.autoPay && ' · Auto-pay'}
                    {bill.isBusiness && ' · RCS'}
                    {bill.debtId && ' · Linked to debt'}
                    {bill.isPaid && bill.payment?.paidAt && ` · Paid ${new Date(bill.payment.paidAt).toLocaleDateString()}`}
                  </div>
                </div>
                <div className="bill-amount">{fmt(bill.amount)}</div>
                {bill.autoPay && paid
                  ? <span className="badge badge-blue">Auto-paid</span>
                  : bill.autoPay
                  ? <span className="badge badge-blue">Auto</span>
                  : bill.isPaid
                  ? <span className="badge badge-green">✓ Paid</span>
                  : <span className="badge badge-gold">Due</span>
                }
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BillModal({ bill, debts, onClose, onSaved }: { bill?: Bill; debts: Debt[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<Bill>>(bill ?? {
    name: '', amount: 0, dueDay: 1, category: 'OTHER', autoPay: false,
    isBusiness: false, payPeriod: 'FIRST', isActive: true,
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function set(key: keyof Bill, val: unknown) {
    setForm(f => ({ ...f, [key]: val }))
  }

  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      if (bill) await billsApi.update(bill.id, form)
      else await billsApi.create(form)
      onSaved()
      onClose()
    } catch (e: any) {
      setError(`Save failed: ${e?.message ?? e}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!bill) return
    if (!confirm(`Delete bill "${bill.name}"? This will also remove its payment history.`)) return
    setDeleting(true)
    setError('')
    try {
      await billsApi.delete(bill.id)
      onSaved()
      onClose()
    } catch (e: any) {
      setError(`Delete failed: ${e?.message ?? e}`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{bill ? 'Edit Bill' : 'Add Bill'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body">
          {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}
          <div className="form-group">
            <label className="form-label">Bill Name</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Netflix" />
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Amount</label>
              <input className="form-input" type="number" value={form.amount} onChange={e => set('amount', parseFloat(e.target.value))} placeholder="0.00" />
            </div>
            <div className="form-group">
              <label className="form-label">Due Day</label>
              <input className="form-input" type="number" min={1} max={31} value={form.dueDay} onChange={e => set('dueDay', parseInt(e.target.value))} />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_',' ')}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Pay Period</label>
              <select className="form-input" value={form.payPeriod} onChange={e => set('payPeriod', e.target.value)}>
                {PAY_PERIODS.map(p => <option key={p} value={p}>{PAY_PERIOD_LABEL[p]}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: '0.875rem' }}>
              <input type="checkbox" checked={form.autoPay} onChange={e => set('autoPay', e.target.checked)} />
              Auto-pay
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: '0.875rem' }}>
              <input type="checkbox" checked={form.isBusiness} onChange={e => set('isBusiness', e.target.checked)} />
              Red Castle Systems (Business)
            </label>
          </div>
          <div className="form-group">
            <label className="form-label">Linked debt (optional)</label>
            <select
              className="form-input"
              value={form.debtId ?? ''}
              onChange={e => set('debtId', e.target.value || null)}
            >
              <option value="">— None —</option>
              {debts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <div style={{ fontSize: '0.7rem', color: 'var(--neutral-500)', marginTop: 4 }}>
              When linked, marking this bill paid draws the amount from the debt's balance.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes (optional)</label>
            <input className="form-input" value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} placeholder="Any notes…" />
          </div>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          {bill ? (
            <button className="btn btn-ghost" style={{ color: 'var(--red-500, #c0392b)' }} onClick={handleDelete} disabled={deleting || saving}>
              <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete'}
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name}>
              {saving ? 'Saving…' : bill ? 'Update' : 'Add Bill'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ordinal(n?: number) {
  if (!n) return ''
  const s = ['th','st','nd','rd'], v = n % 100
  return s[(v - 20) % 10] ?? s[v] ?? s[0]
}
