import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import VendorForm from './VendorForm'

// No-login public entry point — reached at /vendor-register/:token (see the
// pathname check in App.jsx, before the session/login gate runs at all).
// Reuses VendorForm unchanged: it only ever touches `user.email`/`user.name`
// (for submitted_by and the "submitted" notification email), so a synthetic
// user built from the invite row makes a guest submission behave exactly
// like one the inviting employee typed in themselves — same approval queue,
// same notifications, zero special-casing needed downstream.
export default function PublicVendorRegister({ token }) {
  const [state, setState] = useState('loading') // loading | invalid | ready | done
  const [invite, setInvite] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase.from('vendor_invites').select('*').eq('token', token).maybeSingle()
      if (cancelled) return
      if (!data || data.used_at || new Date(data.expires_at) < new Date()) {
        setState('invalid')
        setInvite(data || null)
        return
      }
      setInvite(data)
      setState('ready')
    }
    load()
    return () => { cancelled = true }
  }, [token])

  async function handleSubmitted(vendorRow) {
    await supabase.from('vendor_invites').update({ used_at: new Date().toISOString(), vendor_id: vendorRow.id }).eq('id', invite.id)
    setState('done')
  }

  const shellStyle = {
    minHeight: '100vh', background: 'var(--taupe-50)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
  }
  const cardStyle = {
    width: '100%', maxWidth: '440px', background: 'var(--surface-card)', border: '1px solid var(--taupe-200)',
    borderRadius: 'var(--radius-xl)', padding: '40px', textAlign: 'center',
  }

  if (state === 'loading') {
    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</div>
        </div>
      </div>
    )
  }

  if (state === 'invalid') {
    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', marginBottom: '10px' }}>
            This link is no longer valid
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {invite?.used_at
              ? 'This registration link has already been used.'
              : invite
                ? 'This registration link has expired.'
                : "This registration link isn't valid."}
            {' '}Please ask{invite?.created_by_name ? ` ${invite.created_by_name}` : ' the person who sent it'} for a new one.
          </div>
        </div>
      </div>
    )
  }

  if (state === 'done') {
    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', marginBottom: '10px' }}>
            Thanks — you're all set
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Your registration has been submitted and is now under review. You don't need to do
            anything else — the team will be in touch if they need more information.
          </div>
        </div>
      </div>
    )
  }

  const guestUser = { email: invite.created_by_email, name: invite.created_by_name || '', role: 'employee' }
  return (
    <div style={{ background: 'var(--taupe-50)', minHeight: '100vh' }}>
      <div style={{ background: 'var(--surface-card)', borderBottom: '1px solid var(--taupe-200)', padding: '18px 20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          The Nudge Institute
        </div>
        <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>Vendor Registration</div>
      </div>
      <VendorForm user={guestUser} onSaved={handleSubmitted} hideBack isGuestSubmission />
    </div>
  )
}
