import { useCallback, useEffect, useState } from 'react'
import { incomeApi, settingsApi, type IncomeSource, type AuthUser } from '../lib/api'
import { Plus, X, Pencil } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

function fmt(n: number) { return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) }

const PAY_PERIODS = ['FIRST','FIFTEENTH','BOTH','MONTHLY','ANNUAL','VARIABLE']
const PAY_PERIOD_LABEL: Record<string, string> = {
  FIRST: '1st', FIFTEENTH: '15th', BOTH: 'Both periods', MONTHLY: 'Monthly', ANNUAL: 'Annual', VARIABLE: 'Variable'
}

// ── Income Page ───────────────────────────────────────────────────────────────

export function IncomePage() {
  const [sources, setSources] = useState<IncomeSource[]>([])
  const [loading, setLoading] = useState(true)
  const [editSource, setEditSource] = useState<IncomeSource | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  async function load() {
    setLoading(true)
    setSources(await incomeApi.list())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const monthly = sources.reduce((s, i) => {
    if (i.payPeriod === 'BOTH') return s + i.amount * 2
    if (['FIRST','FIFTEENTH','MONTHLY'].includes(i.payPeriod)) return s + i.amount
    return s
  }, 0)

  const byOwner = sources.reduce<Record<string, IncomeSource[]>>((acc, s) => {
    acc[s.owner] = [...(acc[s.owner] ?? []), s]
    return acc
  }, {})

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Income Sources</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add Source
        </button>
      </div>
      <div className="page-body">
        <div className="stat-grid" style={{ marginBottom: 24 }}>
          <div className="stat-tile">
            <div className="stat-label">Monthly Income</div>
            <div className="stat-value gold">{fmt(monthly)}</div>
            <div className="stat-sub">{sources.length} sources</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">1st Paycheck</div>
            <div className="stat-value">{fmt(sources.filter(s => s.payPeriod === 'FIRST' || s.payPeriod === 'BOTH').reduce((a,s) => a + s.amount, 0))}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">15th Paycheck</div>
            <div className="stat-value">{fmt(sources.filter(s => s.payPeriod === 'FIFTEENTH' || s.payPeriod === 'BOTH').reduce((a,s) => a + s.amount, 0))}</div>
          </div>
        </div>

        {loading ? <div style={{ color: 'var(--neutral-400)' }}>Loading…</div> : (
          Object.entries(byOwner).map(([owner, items]) => (
            <div key={owner} style={{ marginBottom: 20 }}>
              <div className="paycheck-header" style={{ marginBottom: 4 }}>
                <span className="paycheck-label">{owner}</span>
                <span className="paycheck-total">{fmt(items.reduce((s,i) => s + i.amount, 0))} / period</span>
              </div>
              <div className="card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Amount</th>
                      <th>Pay Period</th>
                      <th>Type</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        <td style={{ fontFamily: 'var(--font-display)' }}>{fmt(s.amount)}</td>
                        <td><span className="badge badge-blue">{PAY_PERIOD_LABEL[s.payPeriod]}</span></td>
                        <td>{s.isBusiness ? <span className="badge badge-gray">RCS</span> : <span className="badge badge-green">Personal</span>}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditSource(s)}><Pencil size={12} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
      {showAdd && <IncomeModal onClose={() => setShowAdd(false)} onSaved={load} />}
      {editSource && <IncomeModal source={editSource} onClose={() => setEditSource(null)} onSaved={load} />}
    </>
  )
}

function IncomeModal({ source, onClose, onSaved }: { source?: IncomeSource; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<IncomeSource>>(source ?? { name: '', owner: 'Logan', amount: 0, payPeriod: 'FIRST', isBusiness: false })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      if (source) await incomeApi.update(source.id, form)
      else await incomeApi.create(form)
      onSaved(); onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{source ? 'Edit Income Source' : 'Add Income Source'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Logan CWS" />
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Owner</label>
              <select className="form-input" value={form.owner} onChange={e => setForm(f => ({...f, owner: e.target.value}))}>
                <option>Logan</option>
                <option>Carla</option>
                <option>Shared</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Amount (per period)</label>
              <input className="form-input" type="number" value={form.amount} onChange={e => setForm(f => ({...f, amount: parseFloat(e.target.value)}))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Pay Period</label>
            <select className="form-input" value={form.payPeriod} onChange={e => setForm(f => ({...f, payPeriod: e.target.value}))}>
              {PAY_PERIODS.map(p => <option key={p} value={p}>{PAY_PERIOD_LABEL[p]}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: '0.875rem' }}>
            <input type="checkbox" checked={form.isBusiness} onChange={e => setForm(f => ({...f, isBusiness: e.target.checked}))} />
            Red Castle Systems business income
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name}>{saving ? 'Saving…' : source ? 'Update' : 'Add'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Settings Page ─────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<AuthUser[]>([])
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState('')
  const [showAddUser, setShowAddUser] = useState(false)

  const loadUsers = useCallback(async () => {
    if (user?.role === 'ADMIN') setUsers(await settingsApi.users())
  }, [user?.role])

  useEffect(() => { loadUsers() }, [loadUsers])

  async function handlePwChange() {
    if (pwForm.newPassword !== pwForm.confirm) { setPwMsg('Passwords do not match'); return }
    try {
      await settingsApi.changePassword(pwForm.currentPassword, pwForm.newPassword)
      setPwMsg('Password changed successfully.')
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' })
    } catch {
      setPwMsg('Failed — check your current password.')
    }
  }

  return (
    <>
      <div className="page-header"><h1 className="page-title">Settings</h1></div>
      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 680 }}>
        {/* Change password */}
        <div className="card card-pad">
          <div className="card-header"><span className="card-title">Change Password</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(['currentPassword','newPassword','confirm'] as const).map(k => (
              <div className="form-group" key={k}>
                <label className="form-label">{k === 'currentPassword' ? 'Current Password' : k === 'newPassword' ? 'New Password' : 'Confirm New Password'}</label>
                <input className="form-input" type="password" value={pwForm[k]} onChange={e => setPwForm(f => ({...f, [k]: e.target.value}))} />
              </div>
            ))}
            {pwMsg && <div style={{ fontSize: '0.85rem', color: pwMsg.includes('success') ? 'var(--success)' : 'var(--danger)' }}>{pwMsg}</div>}
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={handlePwChange}>Update Password</button>
          </div>
        </div>

        {/* User management — admin only */}
        {user?.role === 'ADMIN' && (
          <div className="card card-pad">
            <div className="card-header">
              <span className="card-title">Users</span>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddUser(true)}><Plus size={14} /> Add User</button>
            </div>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.sub}>
                    <td>{u.name}</td>
                    <td style={{ color: 'var(--neutral-500)' }}>{u.email}</td>
                    <td><span className={`badge ${u.role === 'ADMIN' ? 'badge-gold' : 'badge-blue'}`}>{u.role}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showAddUser && <AddUserModal onClose={() => setShowAddUser(false)} onSaved={loadUsers} />}
    </>
  )
}

function AddUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'MEMBER' })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try { await settingsApi.createUser(form); onSaved(); onClose() }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add User</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body">
          {(['name','email','password'] as const).map(k => (
            <div className="form-group" key={k}>
              <label className="form-label">{k.charAt(0).toUpperCase() + k.slice(1)}</label>
              <input className="form-input" type={k === 'password' ? 'password' : 'text'} value={form[k]} onChange={e => setForm(f => ({...f, [k]: e.target.value}))} />
            </div>
          ))}
          <div className="form-group">
            <label className="form-label">Role</label>
            <select className="form-input" value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}>
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name || !form.email || !form.password}>
            {saving ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  )
}
