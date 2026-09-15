import { useState } from 'react'
import { signIn } from '../../lib/auth'

export default function LoginScreen({ onLogin }) {
  const [email, setEmail]   = useState('')
  const [error, setError]   = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { user, error: err } = await signIn(email)
    setLoading(false)
    if (err) { setError(err); return }
    if (onLogin) onLogin(user)
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--taupe-50)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '380px',
        background: 'var(--surface-card)', border: '1px solid var(--taupe-200)',
        borderRadius: 'var(--radius-xl)', padding: '40px',
        boxShadow: '0 1px 4px rgba(54, 32, 26,0.06)',
      }}>
        {/* Brand */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
            The Nudge Institute
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink)' }}>
            Expense Tracker
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Work email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null) }}
              placeholder="you@thenudge.org"
              required
              autoFocus
              style={{
                width: '100%', height: '44px',
                border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)',
                padding: '0 14px', fontSize: '14px', color: 'var(--ink)',
                outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          </div>

          {error && (
            <div style={{
              fontSize: '12px', color: 'var(--clay-text)',
              background: 'var(--clay-bg)', border: '1px solid var(--clay-border)',
              borderRadius: 'var(--radius-md)', padding: '10px 12px', marginBottom: '16px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!email.includes('@') || loading}
            style={{
              width: '100%', height: '44px',
              background: !email.includes('@') || loading ? 'var(--taupe-200)' : 'var(--ink)',
              color: !email.includes('@') || loading ? 'var(--text-muted)' : 'var(--surface-card)',
              border: 'none', borderRadius: 'var(--radius-lg)',
              fontSize: '14px', fontWeight: 600,
              cursor: !email.includes('@') || loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Checking…' : 'Continue'}
          </button>
        </form>

        <div style={{ marginTop: '20px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
          Access restricted to authorised TNI staff only.
        </div>
      </div>
    </div>
  )
}
