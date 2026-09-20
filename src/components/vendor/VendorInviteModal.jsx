import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const EXPIRY_DAYS = 14

// Lets an employee generate a one-time, no-login link a vendor can open
// themselves to fill in and submit the exact same registration form —
// see src/components/vendor/PublicVendorRegister.jsx for the public side,
// and VendorForm.jsx's hideBack prop for how the same form renders there.
export default function VendorInviteModal({ user, onClose }) {
  const [link, setLink] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function create() {
      const token = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
      const { error: err } = await supabase.from('vendor_invites').insert({
        token,
        created_by_email: user.email,
        created_by_name: user.name || null,
        expires_at: expiresAt,
      })
      if (cancelled) return
      if (err) { setError(err.message); return }
      setLink(`${window.location.origin}/vendor-register/${token}`)
    }
    create()
    return () => { cancelled = true }
  }, [user])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy automatically — select and copy the link manually.')
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface-card)', width: '100%', maxWidth: '480px', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--taupe-200)' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Invite a vendor to register</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Share this link with the vendor — they'll see the same registration form and can fill it
            in and submit it themselves, no login needed. The link expires in {EXPIRY_DAYS} days or
            once it's used, whichever comes first.
          </div>
        </div>

        <div style={{ padding: '20px' }}>
          {error && (
            <div style={{ fontSize: '12px', color: 'var(--clay-text)', background: 'var(--clay-bg)', border: '1px solid var(--clay-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: '14px' }}>
              {error}
            </div>
          )}

          {!link && !error ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>Generating link…</div>
          ) : link ? (
            <>
              <div style={{
                display: 'flex', gap: '8px', alignItems: 'center', border: '1px solid var(--taupe-200)',
                borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--taupe-50)', marginBottom: '14px',
              }}>
                <div style={{ fontSize: '12px', color: 'var(--ink)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {link}
                </div>
              </div>
              <button
                onClick={handleCopy}
                style={{
                  width: '100%', height: '40px', background: copied ? 'var(--moss)' : 'var(--action)', color: 'var(--surface-card)',
                  border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </>
          ) : null}
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--taupe-200)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ height: '34px', padding: '0 16px', background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', fontSize: '13px', cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
