import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch {
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="login-logo">🏰 Castle Budget</div>
        <div className="login-tagline">Private family finance — hosted at home.</div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@castle.home"
              required
              autoComplete="email"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ marginTop: 8, justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', marginTop: 32, textAlign: 'center' }}>
          Castle Budget · Private · lm-server
        </p>
      </div>

      <div className="login-art">
        <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '5rem', marginBottom: 24, filter: 'drop-shadow(0 4px 24px rgba(0,0,0,.4))' }}>🏰</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'rgba(255,255,255,.9)', lineHeight: 1.3 }}>
            Your finances,<br />your fortress.
          </div>
          <div style={{ marginTop: 16, color: 'rgba(255,255,255,.4)', fontSize: '0.85rem', letterSpacing: '0.06em' }}>
            PRIVATE · SELF-HOSTED · FAMILY
          </div>
        </div>
      </div>
    </div>
  )
}
