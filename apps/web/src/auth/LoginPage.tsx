import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
      navigate('/app/inspection')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 18 }}>
          <span className="brand-logo" aria-hidden>◈</span>
          <div className="brand-text">
            <span className="brand-title">PatchGuard ERP</span>
            <span className="brand-sub">Road maintenance management</span>
          </div>
        </div>
        <label className="form-label">Email
          <input
            type="email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@patchguard.local"
          />
        </label>
        <label className="form-label">Password
          <input
            type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        {error && <div className="error-text">{error}</div>}
        <button className="job-panel-submit" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
