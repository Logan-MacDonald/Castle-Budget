import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard, Receipt, CreditCard, PiggyBank,
  Wallet, Settings, LogOut
} from 'lucide-react'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const now = new Date()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">🏰</span>
          <div>
            <div className="sidebar-logo-text">Castle Budget</div>
            <div className="sidebar-logo-sub">{MONTH_NAMES[now.getMonth()]} {now.getFullYear()}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section-label">Overview</span>
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <LayoutDashboard size={16} /> Dashboard
          </NavLink>

          <span className="nav-section-label">Money</span>
          <NavLink to="/bills" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Receipt size={16} /> Bills
          </NavLink>
          <NavLink to="/debt" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <CreditCard size={16} /> Debt Payoff
          </NavLink>
          <NavLink to="/savings" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <PiggyBank size={16} /> Savings
          </NavLink>
          <NavLink to="/income" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Wallet size={16} /> Income
          </NavLink>

          {user?.role === 'ADMIN' && (
            <>
              <span className="nav-section-label">Admin</span>
              <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                <Settings size={16} /> Settings
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <button className="user-chip" onClick={handleLogout}>
            <div className="user-avatar">{user?.name?.[0] ?? '?'}</div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{user?.name}</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>{user?.role === 'ADMIN' ? 'Admin' : 'Member'}</div>
            </div>
            <LogOut size={14} style={{ opacity: 0.5 }} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
