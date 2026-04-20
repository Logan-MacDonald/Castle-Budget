import { useEffect, useState } from 'react'
import { savingsApi, type SavingsGoal } from '../lib/api'
import { Plus, X, Target } from 'lucide-react'

function fmt(n: number) { return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) }

export function SavingsPage() {
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [contribute, setContribute] = useState<SavingsGoal | null>(null)
  const [amount, setAmount] = useState('')

  async function load() {
    setLoading(true)
    setGoals(await savingsApi.list())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleContribute() {
    if (!contribute || !amount) return
    await savingsApi.contribute(contribute.id, parseFloat(amount))
    setContribute(null)
    setAmount('')
    load()
  }

  const totalTarget  = goals.reduce((s, g) => s + g.targetAmount, 0)
  const totalCurrent = goals.reduce((s, g) => s + g.currentAmount, 0)

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Savings Goals</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> New Goal
        </button>
      </div>
      <div className="page-body">
        {totalTarget > 0 && (
          <div className="card card-pad" style={{ marginBottom: 20, display: 'flex', gap: 32 }}>
            <div>
              <div className="stat-label">Total Saved</div>
              <div className="stat-value positive">{fmt(totalCurrent)}</div>
            </div>
            <div>
              <div className="stat-label">Total Target</div>
              <div className="stat-value">{fmt(totalTarget)}</div>
            </div>
            <div>
              <div className="stat-label">Overall Progress</div>
              <div className="stat-value gold">{totalTarget ? Math.round(totalCurrent/totalTarget*100) : 0}%</div>
            </div>
          </div>
        )}

        {loading ? <div style={{ color: 'var(--neutral-400)' }}>Loading…</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {goals.map(g => {
              const pct = g.targetAmount > 0 ? Math.min(100, Math.round(g.currentAmount / g.targetAmount * 100)) : 0
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
                    {g.isComplete && <span className="badge badge-green">Complete</span>}
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--neutral-500)', marginBottom: 5 }}>
                      <span>{fmt(g.currentAmount)}</span>
                      <span>{fmt(g.targetAmount)}</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill gold" style={{ width: `${pct}%` }} />
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.72rem', color: 'var(--neutral-400)', marginTop: 3 }}>{pct}%</div>
                  </div>

                  {!g.isComplete && (
                    <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setContribute(g)}>
                      + Add Contribution
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showAdd && <SavingsModal onClose={() => setShowAdd(false)} onSaved={load} />}

      {contribute && (
        <div className="modal-overlay" onClick={() => setContribute(null)}>
          <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add to {contribute.name}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setContribute(null)}><X size={14} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Amount</label>
                <input className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setContribute(null)}>Cancel</button>
              <button className="btn btn-gold" onClick={handleContribute} disabled={!amount}>Add</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function SavingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<SavingsGoal>>({ name: '', targetAmount: 0, currentAmount: 0 })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try { await savingsApi.create(form); onSaved(); onClose() }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">New Savings Goal</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Goal Name</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Emergency Fund" />
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Target Amount</label>
              <input className="form-input" type="number" value={form.targetAmount} onChange={e => setForm(f => ({...f, targetAmount: parseFloat(e.target.value)}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Current Amount</label>
              <input className="form-input" type="number" value={form.currentAmount} onChange={e => setForm(f => ({...f, currentAmount: parseFloat(e.target.value)}))} />
            </div>
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
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" onClick={handleSave} disabled={saving || !form.name}>
            {saving ? 'Saving…' : 'Create Goal'}
          </button>
        </div>
      </div>
    </div>
  )
}
