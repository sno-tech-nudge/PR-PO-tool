import ReasonChips from './ReasonChips'
import { POLICY_REASONS, PO_REASONS, PO_LIMIT } from '../../lib/policyPrompt'

const box = {
  background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)',
  padding: '10px 12px', marginBottom: '16px', fontSize: '12px', lineHeight: 1.5, color: 'var(--ink)',
}
const title = { fontWeight: 700, color: 'var(--gold-text)', marginBottom: '2px' }
const link = { fontWeight: 600, color: 'var(--action)', cursor: 'pointer', textDecoration: 'underline' }

// Shown only when an expense is over a policy limit: what it is, and a tap to
// say why. Optional, so it never holds anyone up; Accounts sees the answer.
export function PolicyReasonPrompt({ issues, value, onChange }) {
  if (!issues.length) return null
  return (
    <div style={box}>
      <div style={title}>This is out of policy</div>
      {issues.map(i => <div key={i.rule} style={{ marginBottom: '2px' }}>{i.message}</div>)}
      <div style={{ margin: '8px 0 6px', color: 'var(--text-muted)' }}>Why? One tap is enough.</div>
      <ReasonChips options={POLICY_REASONS} value={value} onChange={onChange} />
    </div>
  )
}

// Above the PR/PO limit with no PR/PO linked: offer the matching PO first, and
// only if there is none ask for a reason.
export function PoLinkPrompt({ amount, suggestion, onLink, value, onChange }) {
  return (
    <div style={box}>
      <div style={title}>Purchases over ₹{PO_LIMIT.toLocaleString('en-IN')} need a PR/PO</div>
      {suggestion ? (
        <div>
          This looks like PO <strong style={{ fontFamily: 'monospace' }}>{suggestion.po_number}</strong>
          {suggestion.vendors?.org_name ? ` for ${suggestion.vendors.org_name}` : ''}.{' '}
          <span role="button" onClick={() => onLink(suggestion.id)} style={link}>Link it</span>
        </div>
      ) : (
        <>
          <div>No matching PO was found for this ₹{Number(amount).toLocaleString('en-IN')} invoice. If there is a reason, tap it. Accounts will see it.</div>
          <div style={{ marginTop: '8px' }}>
            <ReasonChips options={PO_REASONS} value={value} onChange={onChange} />
          </div>
        </>
      )}
    </div>
  )
}

// The invoice and the proof of payment disagree with what was typed: the lower
// figure is the one to claim, and a tap puts it in.
export function LowerAmountNote({ lower, entered, source, onUse }) {
  return (
    <div style={{ ...box, marginTop: '8px', marginBottom: 0 }}>
      The {source} shows ₹{Number(lower).toLocaleString('en-IN')}, lower than the ₹{Number(entered).toLocaleString('en-IN')} entered.{' '}
      <span role="button" onClick={onUse} style={link}>Use ₹{Number(lower).toLocaleString('en-IN')}</span>
    </div>
  )
}
