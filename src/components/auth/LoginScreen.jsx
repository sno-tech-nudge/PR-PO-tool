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
      minHeight: '100vh', background: '#F9FAFB',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '380px',
        background: '#FFFFFF', border: '1px solid #E5E7EB',
        borderRadius: '12px', padding: '40px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        {/* Brand */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
            The Nudge Institute
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#111827' }}>
            Expense Tracker
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                border: '1px solid #E5E7EB', borderRadius: '8px',
                padding: '0 14px', fontSize: '14px', color: '#111827',
                outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          </div>

          {error && (
            <div style={{
              fontSize: '12px', color: '#DC2626',
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: '6px', padding: '10px 12px', marginBottom: '16px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!email.includes('@') || loading}
            style={{
              width: '100%', height: '44px',
              background: !email.includes('@') || loading ? '#E5E7EB' : '#111827',
              color: !email.includes('@') || loading ? '#9CA3AF' : '#FFFFFF',
              border: 'none', borderRadius: '8px',
              fontSize: '14px', fontWeight: 600,
              cursor: !email.includes('@') || loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Checking…' : 'Continue'}
          </button>
        </form>

        <div style={{ marginTop: '20px', fontSize: '11px', color: '#9CA3AF', textAlign: 'center' }}>
          Access restricted to authorised TNI staff only.
        </div>
      </div>
    </div>
  )
}
