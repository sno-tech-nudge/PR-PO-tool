import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { attachPendingBalances } from '../../lib/poBalance'
import VoiceInputButton from '../shared/VoiceInputButton'

const PURPOSE_OPTIONS = [
  { key: 'internal', label: 'Internal team work', placeholder: 'What was the meeting or work about' },
  { key: 'field', label: 'Field programme or beneficiary visit', placeholder: 'Which programme or location' },
  { key: 'donor', label: 'Donor or client engagement', placeholder: 'Who attended and what was covered' },
  { key: 'others', label: 'Others', placeholder: 'What was this for' },
]

function SectionLabel({ children, mt }) {
  return (
    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginTop: mt || 0, marginBottom: '12px' }}>
      {children}
    </div>
  )
}

function TapCard({ selected, onClick, main, sub, fullWidth, revealHint }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: fullWidth ? undefined : 1,
        width: fullWidth ? '100%' : undefined,
        padding: '12px 14px', cursor: 'pointer', marginBottom: fullWidth && !(selected && revealHint) ? '8px' : 0,
        border: `1.5px solid ${selected ? 'var(--action)' : 'var(--taupe-200)'}`,
        borderBottom: selected && revealHint ? '1.5px solid var(--action)' : undefined,
        background: selected ? 'var(--taupe-50)' : 'var(--surface-card)',
        borderRadius: revealHint && selected ? 'var(--radius-sm) var(--radius-sm) 0 0' : 'var(--radius-sm)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
      }}
    >
      <div>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>{main}</div>
        {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
      </div>
      {revealHint && selected && (
        <div style={{ fontSize: '13px', color: 'var(--action)', flexShrink: 0 }}>▾</div>
      )}
    </div>
  )
}

function PendingBalanceNote({ total, poPending, poLoading }) {
  if (poLoading) return <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>Checking pending balance…</div>
  if (!poPending) return null
  return (
    <div style={{ fontSize: '12px', color: total > poPending.pending ? 'var(--clay-text)' : 'var(--text-muted)', marginTop: '8px' }}>
      PO amount {fmtAmt(poPending.amount)} · pending {fmtAmt(poPending.pending)}
      {total > poPending.pending && ` — this report's ${fmtAmt(total)} exceeds what's still pending on this PO.`}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, label, connected }) {
  return (
    <div
      className={connected ? 'reveal-panel' : undefined}
      style={{
        marginTop: connected ? 0 : '8px', marginBottom: connected ? '8px' : 0,
        padding: connected ? '12px 14px' : 0,
        border: connected ? '1.5px solid var(--action)' : 'none',
        borderTop: connected ? 'none' : undefined,
        borderRadius: connected ? '0 0 var(--radius-sm) var(--radius-sm)' : 0,
        background: connected ? 'var(--taupe-50)' : 'transparent',
      }}
    >
      {label && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', height: '44px', border: '1px solid var(--taupe-200)',
            borderRadius: 'var(--radius-sm)', padding: '0 40px 0 12px', fontSize: '13px',
            color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
            background: 'var(--surface-card)', fontFamily: 'inherit',
          }}
        />
        <VoiceInputButton value={value} onChange={onChange} />
      </div>
    </div>
  )
}

function formatDuration(start, end) {
  if (!start && !end) return null
  const fmt = d => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  return `${fmt(start)} – ${fmt(end)}`
}

function fmtAmt(n) {
  if (n == null) return '—'
  return '₹' + Number(n).toLocaleString('en-IN')
}

// Every expense already states its own Entity (ExpenseDetails) — rather
// than ask again at the report level, pick whichever entity shows up most
// often across the included expenses. Still needed here (not just dropped)
// because it drives FCRA/TNF-US policy flagging and the report's own
// entity tag downstream in ReportPreview.jsx.
function mostCommonEntity(expenses) {
  const counts = {}
  for (const e of expenses || []) {
    if (!e.entity) continue
    counts[e.entity] = (counts[e.entity] || 0) + 1
  }
  const entries = Object.entries(counts)
  if (!entries.length) return null
  return entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0]
}

export default function ReportDetails({ expenses, reportMeta, user, onContinue, onBack }) {
  const total = (expenses || []).reduce((s, e) => s + (e.amount || 0), 0)
  const count = (expenses || []).length
  const derivedEntity = mostCommonEntity(expenses)

  // Section 0 — PO relation. This is answered once, up front, when the
  // report is first created (NewReportModal's own step 1) — it is never
  // re-asked here, only displayed read-only below. A report created before
  // this question existed (po_related still null on its row) is treated as
  // "not related to a PO", same as an explicit "No" would be.
  const poRelated = reportMeta?.po_related ?? false // true | false
  const [poOptions, setPoOptions] = useState([])
  const [selectedPOId, setSelectedPOId] = useState(reportMeta?.po_id || '')
  const [poPending, setPoPending] = useState(null) // { amount, pending } once a PO is picked
  const [poLoading, setPoLoading] = useState(false)

  useEffect(() => {
    if (poRelated !== true || poOptions.length) return
    // !inner turns the embedded relation into a real join filter, so only
    // POs whose underlying PR this person themselves raised come back —
    // otherwise someone else's issued PO would still show up here.
    supabase.from('purchase_orders')
      .select('id, po_number, amount, vendors(org_name), purchase_requests!inner(requested_by)')
      .eq('status', 'issued')
      .eq('purchase_requests.requested_by', user?.email ?? '')
      .order('created_at', { ascending: false }).limit(200)
      .then(async ({ data }) => setPoOptions(await attachPendingBalances(data || [])))
  }, [poRelated, poOptions.length, user?.email])

  // A PO answered at report-creation time only has its id — run the same
  // pending-balance check used when picking one here, once the option
  // list (needed to look up its po_number) has loaded.
  useEffect(() => {
    if (poRelated === true && selectedPOId && poOptions.length && !poPending && !poLoading) {
      handleSelectPO(selectedPOId)
    }
  }, [poOptions, poRelated, selectedPOId, poPending, poLoading])

  async function handleSelectPO(id) {
    setSelectedPOId(id)
    setPoPending(null)
    if (!id) return
    setPoLoading(true)
    const po = poOptions.find(p => p.id === id)
    const [{ data: linkedReports }, { data: savedExpenses }] = await Promise.all([
      supabase.from('expense_reports').select('total_amount, status').eq('po_id', id),
      supabase.from('expense_details').select('amount').eq('po_number', po?.po_number || '').eq('status', 'saved'),
    ])
    const reportsTotal = (linkedReports || []).filter(r => r.status !== 'rejected').reduce((s, r) => s + (Number(r.total_amount) || 0), 0)
    const savedTotal = (savedExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const claimed = reportsTotal + savedTotal
    const pending = Math.max(0, (Number(po?.amount) || 0) - claimed)
    setPoPending({ amount: po?.amount, pending })
    setPoLoading(false)
  }

  const poSectionValid = !poRelated || (!!selectedPOId && !!poPending && total <= poPending.pending)

  // Section B — Purpose (required — the one substantive question left
  // here once PO/Who/Trip/Prior-approval/Entity all moved to being
  // answered per-expense or derived automatically)
  const [purposeKey, setPurposeKey] = useState(null)
  const [purposeDescription, setPurposeDescription] = useState('')

  // Section F — Reimbursement (required)
  const [reimbType, setReimbType] = useState(null) // 'bank_transfer' | 'petty_cash'

  const purposeValid = !!purposeKey && !!purposeDescription.trim()
  const reimbValid = !!reimbType
  const allValid = poSectionValid && purposeValid && reimbValid

  function handleContinue() {
    if (!allValid) return
    onContinue({
      report_id: reportMeta?.id || null,
      report_reference: reportMeta?.report_reference || null,
      business_purpose: reportMeta?.business_purpose || null,
      duration_start: reportMeta?.duration_start || null,
      duration_end: reportMeta?.duration_end || null,
      po_related: poRelated,
      linked_po_id: poRelated ? selectedPOId : null,
      entity: derivedEntity,
      purpose_type: purposeKey,
      description: purposeDescription,
      reimbursement_type: reimbType,
    })
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', width: '100%', paddingBottom: '100px' }}>
      {/* Back */}
      <div
        onClick={onBack}
        style={{ fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline', marginBottom: '20px' }}
      >
        ← Back
      </div>

      {/* Header */}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Report Details</div>
      <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text)', marginBottom: '4px' }}>
        Tell us about this report
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>
        These details apply to all {count} selected expense{count !== 1 ? 's' : ''}.
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>Step 2 of 3 · Everything below is required</div>

      {reportMeta && (
        <div style={{ border: '1px solid var(--taupe-200)', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--taupe-200)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Report Name</span>
            <span style={{ fontSize: '13px', color: 'var(--text)', fontFamily: 'monospace' }}>{reportMeta.report_reference}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--taupe-200)', background: 'var(--taupe-50)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Business Purpose</span>
            <span style={{ fontSize: '13px', color: 'var(--text)', textAlign: 'right', maxWidth: '65%' }}>{reportMeta.business_purpose || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Duration</span>
            <span style={{ fontSize: '13px', color: 'var(--text)' }}>{formatDuration(reportMeta.duration_start, reportMeta.duration_end)}</span>
          </div>
        </div>
      )}

      <div style={{ height: '1px', background: 'var(--taupe-200)', marginBottom: '24px' }} />

      {/* SECTION 0 — PO relation. Answered once, up front, in NewReportModal
          when the report was created — shown here read-only, never re-asked. */}
      <SectionLabel>Purchase Order</SectionLabel>
      <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: '12px' }}>
        {poRelated ? (
          <>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
              Related to {poOptions.find(p => p.id === selectedPOId)?.po_number || 'a Purchase Order'}
            </div>
            {poOptions.find(p => p.id === selectedPOId)?.vendors?.org_name && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {poOptions.find(p => p.id === selectedPOId).vendors.org_name}
              </div>
            )}
            <PendingBalanceNote total={total} poPending={poPending} poLoading={poLoading} />
          </>
        ) : (
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>Not related to a Purchase Order</div>
        )}
      </div>

      <div style={{ height: '1px', background: 'var(--taupe-200)', marginBottom: '24px' }} />

      {/* SECTION B — Purpose (required) */}
      <SectionLabel>What were these expenses for<span style={{ color: 'var(--clay-text)' }}> *</span></SectionLabel>
      {PURPOSE_OPTIONS.map(opt => (
        <div key={opt.key} style={{ marginBottom: '8px' }}>
          <TapCard
            selected={purposeKey === opt.key}
            onClick={() => setPurposeKey(purposeKey === opt.key ? null : opt.key)}
            main={opt.label}
            fullWidth
            revealHint
          />
          {purposeKey === opt.key && (
            <TextInput
              value={purposeDescription}
              onChange={setPurposeDescription}
              placeholder={opt.placeholder}
              label="Brief description"
              connected
            />
          )}
        </div>
      ))}

      {/* SECTION F — Reimbursement (required) — bank transfer only, the org
          never pays out in petty cash */}
      <SectionLabel mt={24}>How would you like to be reimbursed<span style={{ color: 'var(--clay-text)' }}> *</span></SectionLabel>
      <TapCard selected={reimbType === 'bank_transfer'} onClick={() => setReimbType(reimbType === 'bank_transfer' ? null : 'bank_transfer')} main="Bank transfer" sub="Transferred to your registered account" fullWidth />

      {/* Fixed bottom bar */}
      <div style={{ position: 'fixed', bottom: 0, left: '220px', right: 0, zIndex: 10 }}>
        <div style={{
          maxWidth: '480px', margin: '0 auto',
          background: 'var(--surface-card)', borderTop: '1px solid var(--taupe-200)', padding: '16px',
        }}>
          {poSectionValid && !purposeValid && (
            <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginBottom: '8px' }}>
              Answer what these expenses were for before continuing.
            </div>
          )}
          {poSectionValid && purposeValid && !reimbValid && (
            <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginBottom: '8px' }}>
              Choose how you'd like to be reimbursed before continuing.
            </div>
          )}
          <button
            onClick={handleContinue}
            disabled={!allValid}
            style={{
              width: '100%', height: '48px',
              background: allValid ? 'var(--action)' : 'var(--taupe-200)',
              color: allValid ? 'var(--surface-card)' : 'var(--text-muted)',
              border: 'none', fontSize: '14px', fontWeight: 500,
              cursor: allValid ? 'pointer' : 'default', borderRadius: 'var(--radius-sm)',
            }}
          >
            Continue to preview
          </button>
        </div>
      </div>
    </div>
  )
}
