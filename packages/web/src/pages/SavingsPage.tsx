import { useEffect, useState } from 'react'
import { savingsApi, type SavingsGoal } from '../lib/api'
import { Pencil, Plus, Trash2, X } from 'lucide-react'

function fmt(n: number) { return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) }

export function SavingsPage() {
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editGoal, setEditGoal] = useState<SavingsGoal | null>(null)

  async function load() {
    setLoading(true)
    setGoals(await savingsApi.list())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Pool totals roll up across every goal — a single goal that holds
  // both cash and investments contributes to both tiles.
  const cashTotal     = goals.reduce((s, g) => s + g.cashAmount,     0)
  const investedTotal = goals.reduce((s, g) => s + g.investedAmount, 0)
  const combined      = cashTotal + investedTotal

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Savings</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> New Goal
        </button>
      </div>
      <div className="page-body">
        <div className="stat-grid" style={{ marginBottom: 24 }}>
          <div className="stat-tile">
            <div className="stat-label">Cash</div>
            <div className="stat-value positive">{fmt(cashTotal)}</div>
            <div className="stat-sub">across {goals.length} {goals.length === 1 ? 'goal' : 'goals'}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Investments</div>
            <div className="stat-value">{fmt(investedTotal)}</div>
            <div className="stat-sub">{goals.filter(g => g.investedAmount > 0).length} with investments</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Combined</div>
            <div className="stat-value gold">{fmt(combined)}</div>
            <div className="stat-sub">total saved</div>
          </div>
        </div>

        {loading ? <div style={{ color: 'var(--neutral-400)' }}>Loading…</div> : goals.length === 0 ? (
          <div className="card card-pad" style={{ color: 'var(--neutral-400)', textAlign: 'center' }}>
            No savings goals yet. Add your first goal to get started.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {goals.map(g => {
              const total = g.cashAmount + g.investedAmount
              const pct = g.targetAmount > 0 ? Math.min(100, Math.round(total / g.targetAmount * 100)) : 0
              const showBreakdown = g.cashAmount > 0 && g.investedAmount > 0
              return (
                <div key={g.id} className="card card-pad">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{g.name}</div>
                      {g.targetDate && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', marginTop: 2 }}>
                          Target: {new Date(g.targetDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {g.isComplete && <span className="badge badge-green">Complete</span>}
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditGoal(g)} title="Edit goal"><Pencil size={12} /></button>
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--neutral-500)', marginBottom: 5 }}>
                      <span>{fmt(total)}</span>
                      <span>{fmt(g.targetAmount)}</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill gold" style={{ width: `${pct}%` }} />
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.72rem', color: 'var(--neutral-400)', marginTop: 3 }}>{pct}%</div>
                  </div>

                  {showBreakdown && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--neutral-200)', paddingTop: 8 }}>
                      <span>{fmt(g.cashAmount)} cash</span>
                      <span>{fmt(g.investedAmount)} invested</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showAdd && <SavingsModal onClose={() => setShowAdd(false)} onSaved={load} />}
      {editGoal && <SavingsModal goal={editGoal} onClose={() => setEditGoal(null)} onSaved={load} />}
    </>
  )
}

function SavingsModal({ goal, onClose, onSaved }: { goal?: SavingsGoal; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<SavingsGoal>>(goal ?? { name: '', targetAmount: 0, cashAmount: 0, investedAmount: 0 })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true); setError('')
    try {
      if (goal) await savingsApi.update(goal.id, form)
      else await savingsApi.create(form)
      onSaved(); onClose()
    } catch (e: any) {
      setError(`Save failed: ${e?.message ?? e}`)
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!goal) return
    if (!confirm(`Delete savings goal "${goal.name}"?`)) return
    setDeleting(true); setError('')
    try { await savingsApi.delete(goal.id); onSaved(); onClose() }
    catch (e: any) { setError(`Delete failed: ${e?.message ?? e}`) }
    finally { setDeleting(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{goal ? 'Edit Savings Goal' : 'New Savings Goal'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body">
          {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}
          <div className="form-group">
            <label className="form-label">Goal Name</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. E*Trade Brokerage" />
          </div>
          <div className="form-group">
            <label className="form-label">Target Amount</label>
            <input className="form-input" type="number" value={form.targetAmount} onChange={e => setForm(f => ({...f, targetAmount: parseFloat(e.target.value)}))} />
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Cash</label>
              <input
                className="form-input"
                type="number"
                value={form.cashAmount ?? 0}
                onChange={e => setForm(f => ({...f, cashAmount: parseFloat(e.target.value) || 0}))}
                placeholder="0"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Invested</label>
              <input
                className="form-input"
                type="number"
                value={form.investedAmount ?? 0}
                onChange={e => setForm(f => ({...f, investedAmount: parseFloat(e.target.value) || 0}))}
                placeholder="0"
              />
            </div>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--neutral-500)', marginTop: -4, marginBottom: 4 }}>
            Either or both can be zero. A pure-cash goal has Invested = 0; a brokerage account can hold both.
          </div>
          <div className="form-group">
            <label className="form-label">Target Date (optional)</label>
            <input className="form-input" type="date" value={form.targetDate?.split('T')[0] ?? ''} onChange={e => setForm(f => ({...f, targetDate: new Date(e.target.value).toISOString()}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <input className="form-input" value={form.notes ?? ''} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
          </div>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          {goal ? (
            <button className="btn btn-ghost" style={{ color: 'var(--red-500, #c0392b)' }} onClick={handleDelete} disabled={deleting || saving}>
              <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete'}
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-gold" onClick={handleSave} disabled={saving || !form.name}>
              {saving ? 'Saving…' : goal ? 'Update' : 'Create Goal'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
