import { useEffect, useState } from 'react'
import { dashboardApi, type DashboardData } from '../lib/api'
import { TrendingDown, TrendingUp, AlertCircle } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dashboardApi.get().then(setData).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="page-body" style={{ color: 'var(--neutral-400)' }}>Loading…</div>
  if (!data) return null

  const billPct = data.bills.totalCount > 0 ? Math.round((data.bills.paidCount / data.bills.totalCount) * 100) : 0
  const cashFlowPositive = data.cashFlow.monthly >= 0

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <span style={{ fontSize: '0.85rem', color: 'var(--neutral-500)' }}>
          {MONTHS[data.month - 1]} {data.year}
        </span>
      </div>

      <div className="page-body">
        {/* ── Stat tiles ── */}
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat-label">Monthly Income</div>
            <div className="stat-value gold">{fmt(data.income.monthly)}</div>
            <div className="stat-sub">
              {fmt(data.income.firstPaycheck)} · {fmt(data.income.fifteenthPaycheck)}
            </div>
          </div>

          <div className="stat-tile">
            <div className="stat-label">Cash Flow</div>
            <div className={`stat-value ${cashFlowPositive ? 'positive' : 'negative'}`}>
              {fmt(data.cashFlow.monthly)}
            </div>
            <div className="stat-sub">
              after bills &amp; debt minimums
            </div>
          </div>

          <div className="stat-tile">
            <div className="stat-label">Total Debt</div>
            <div className="stat-value negative">{fmt(data.debt.total)}</div>
            <div className="stat-sub">{data.debt.paidPercent}% paid off · {data.debt.activeCount} accounts</div>
          </div>

          <div className="stat-tile">
            <div className="stat-label">Bills This Month</div>
            <div className="stat-value">{data.bills.paidCount} / {data.bills.totalCount}</div>
            <div className="stat-sub">{fmt(data.bills.paid)} paid · {fmt(data.bills.unpaid)} remaining</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* ── Bill progress ── */}
          <div className="card card-pad">
            <div className="card-header">
              <span className="card-title">Bills Progress</span>
              <span className="badge badge-blue">{MONTHS[data.month - 1]}</span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--neutral-500)', marginBottom: 6 }}>
                <span>{billPct}% paid</span>
                <span>{data.bills.paidCount} of {data.bills.totalCount} bills</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill green" style={{ width: `${billPct}%` }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <div style={{ flex: 1, textAlign: 'center', padding: '10px', background: 'var(--success-bg)', borderRadius: 8 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--success)' }}>{data.bills.paidCount}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--success)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paid</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: '10px', background: 'var(--danger-bg)', borderRadius: 8 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--danger)' }}>{data.bills.unpaidCount}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Remaining</div>
              </div>
            </div>
          </div>

          {/* ── Debt progress ── */}
          <div className="card card-pad">
            <div className="card-header">
              <span className="card-title">Debt Payoff Progress</span>
              <TrendingDown size={16} style={{ color: 'var(--success)' }} />
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--neutral-500)', marginBottom: 6 }}>
                <span>{data.debt.paidPercent}% eliminated</span>
                <span>{fmt(data.debt.total)} remaining</span>
              </div>
              <div className="progress-track" style={{ height: 12 }}>
                <div className="progress-fill green" style={{ width: `${data.debt.paidPercent}%` }} />
              </div>
            </div>

            <div style={{ marginTop: 16, fontSize: '0.82rem', color: 'var(--neutral-500)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Original Total</span>
                <span style={{ fontWeight: 600, color: 'var(--neutral-700)' }}>{fmt(data.debt.originalTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Min Payments / mo</span>
                <span style={{ fontWeight: 600, color: 'var(--neutral-700)' }}>{fmt(data.debt.totalMinPayments)}</span>
              </div>
            </div>
          </div>

          {/* ── Upcoming bills ── */}
          <div className="card card-pad" style={{ gridColumn: '1 / -1' }}>
            <div className="card-header">
              <span className="card-title">Due in Next 7 Days</span>
              {data.bills.upcoming.length > 0 && (
                <AlertCircle size={16} style={{ color: 'var(--warning)' }} />
              )}
            </div>

            {data.bills.upcoming.length === 0 ? (
              <div style={{ color: 'var(--neutral-400)', fontSize: '0.875rem', padding: '8px 0' }}>
                🎉 No bills due in the next 7 days.
              </div>
            ) : (
              <div className="bill-list">
                {data.bills.upcoming.map(b => (
                  <div key={b.id} className="bill-row">
                    <div className="bill-info">
                      <div className="bill-name">{b.name}</div>
                      <div className="bill-meta">Due the {b.dueDay}{ordinal(b.dueDay!)} {b.autoPay ? '· Auto-pay' : '· Manual'}</div>
                    </div>
                    <div className="bill-amount">{fmt(b.amount!)}</div>
                    {b.autoPay
                      ? <span className="badge badge-green">Auto</span>
                      : <span className="badge badge-gold">Manual</span>
                    }
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Pay period breakdown ── */}
          <div className="card card-pad" style={{ gridColumn: '1 / -1' }}>
            <div className="card-header">
              <span className="card-title">Pay Period Snapshot</span>
              <TrendingUp size={16} style={{ color: 'var(--castle-400)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { label: '1st Paycheck', income: data.income.firstPaycheck },
                { label: '15th Paycheck', income: data.income.fifteenthPaycheck },
              ].map(p => (
                <div key={p.label} style={{ background: 'var(--neutral-50)', borderRadius: 10, padding: '16px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--neutral-500)', marginBottom: 4 }}>{p.label}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--castle-700)' }}>{fmt(p.income)}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--neutral-400)', marginTop: 2 }}>income this period</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function ordinal(n?: number) {
  if (!n) return ''
  const s = ['th','st','nd','rd'], v = n % 100
  return s[(v - 20) % 10] ?? s[v] ?? s[0]
}
