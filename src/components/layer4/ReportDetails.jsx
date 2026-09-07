import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { attachPendingBalances, poOptionLabel } from '../../lib/poBalance'

const PURPOSE_OPTIONS = [
  { key: 'internal', label: 'Internal team work', placeholder: 'What was the meeting or work about' },
  { key: 'field', label: 'Field programme or beneficiary visit', placeholder: 'Which programme or location' },
  { key: 'donor', label: 'Donor or client engagement', placeholder: 'Who attended and what was covered' },
  { key: 'office', label: 'Office or admin', placeholder: 'What was this for' },
]

function SectionLabel({ children, mt }) {
  return (
    <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A1A1A', marginTop: mt || 0, marginBottom: '12px' }}>
      {children}
    </div>
  )
}

function TapCard({ selected, onClick, main, sub, fullWidth }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: fullWidth ? undefined : 1,
        width: fullWidth ? '100%' : undefined,
        padding: '12px 14px', cursor: 'pointer', marginBottom: fullWidth ? '8px' : 0,
        border: `1.5px solid ${selected ? '#1A1A1A' : '#E8E8E8'}`,
        background: selected ? '#F7F7F7' : '#FFFFFF',
        borderRadius: '4px',
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A1A1A' }}>{main}</div>
      {sub && <div style={{ fontSize: '11px', color: '#6B6B6B', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

function PendingBalanceNote({ total, poPending, poLoading }) {
  if (poLoading) return <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '6px' }}>Checking pending balance…</div>
  if (!poPending) return null
  return (
    <div style={{ fontSize: '12px', color: total > poPending.pending ? '#DC2626' : '#4A4A4A', marginTop: '8px' }}>
      PO amount {fmtAmt(poPending.amount)} · pending {fmtAmt(poPending.pending)}
      {total > poPending.pending && ` — this report's ${fmtAmt(total)} exceeds what's still pending on this PO.`}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, label }) {
  return (
    <div style={{ marginTop: '8px' }}>
      {label && <div style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>{label}</div>}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', height: '44px', border: '1px solid #E8E8E8',
          borderRadius: '4px', padding: '0 12px', fontSize: '13px',
          color: '#1A1A1A', outline: 'none', boxSizing: 'border-box',
          background: '#FFFFFF', fontFamily: 'inherit',
        }}
      />
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

  // Section 0 — PO relation. This question now gets asked up front, when
  // the report is first created (NewReportModal), so for a report created
  // through that flow poRelated/selectedPOId arrive here already answered
  // — shown as a read-only summary with a "Change" option rather than
  // asked again. A report created before this question moved (po_related
  // still null on its row) falls back to asking it here instead, exactly
  // as this section used to work unconditionally.
  const [poRelated, setPoRelated] = useState(reportMeta?.po_related ?? null) // true | false
  const [poOptions, setPoOptions] = useState([])
  const [selectedPOId, setSelectedPOId] = useState(reportMeta?.po_id || '')
  const [poPending, setPoPending] = useState(null) // { amount, pending } once a PO is picked
  const [poLoading, setPoLoading] = useState(false)
  const [poError, setPoError] = useState(null)
  const [editingPO, setEditingPO] = useState(reportMeta?.po_related == null)

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
    setPoError(null)
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

  const poSectionValid = poRelated === false || (poRelated === true && !!selectedPOId && !!poPending && total <= poPending.pending)

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

  const inputStyle = {
    width: '100%', height: '44px', border: '1px solid #E8E8E8',
    borderRadius: '4px', padding: '0 12px', fontSize: '13px',
    color: '#1A1A1A', outline: 'none', boxSizing: 'border-box',
    background: '#FFFFFF', fontFamily: 'inherit',
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', width: '100%', paddingBottom: '100px' }}>
      {/* Back */}
      <div
        onClick={onBack}
        style={{ fontSize: '13px', color: '#4A4A4A', cursor: 'pointer', textDecoration: 'underline', marginBottom: '20px' }}
      >
        ← Back
      </div>

      {/* Header */}
      <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '4px' }}>Report Details</div>
      <div style={{ fontSize: '20px', fontWeight: 500, color: '#1A1A1A', marginBottom: '4px' }}>
        Tell us about this report
      </div>
      <div style={{ fontSize: '13px', color: '#4A4A4A', marginBottom: '6px' }}>
        These details apply to all {count} selected expense{count !== 1 ? 's' : ''}.
      </div>
      <div style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '20px' }}>Step 2 of 3 · Everything below is required</div>

      {reportMeta && (
        <div style={{ border: '1px solid #E8E8E8', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #E8E8E8' }}>
            <span style={{ fontSize: '12px', color: '#6B6B6B' }}>Report Name</span>
            <span style={{ fontSize: '13px', color: '#1A1A1A', fontFamily: 'monospace' }}>{reportMeta.report_reference}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #E8E8E8', background: '#F7F7F7' }}>
            <span style={{ fontSize: '12px', color: '#6B6B6B' }}>Business Purpose</span>
            <span style={{ fontSize: '13px', color: '#1A1A1A', textAlign: 'right', maxWidth: '65%' }}>{reportMeta.business_purpose || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px' }}>
            <span style={{ fontSize: '12px', color: '#6B6B6B' }}>Duration</span>
            <span style={{ fontSize: '13px', color: '#1A1A1A' }}>{formatDuration(reportMeta.duration_start, reportMeta.duration_end)}</span>
          </div>
        </div>
      )}

      <div style={{ height: '1px', background: '#E8E8E8', marginBottom: '24px' }} />

      {/* SECTION 0 — PO relation. Answered already at report creation for
          any report made through NewReportModal — shown read-only with a
          "Change" option; only genuinely asked here for an older report
          that never got asked (po_related still null). */}
      <SectionLabel>Purchase Order{editingPO && <span style={{ color: '#DC2626' }}> *</span>}</SectionLabel>

      {!editingPO ? (
        <div style={{ border: '1px solid #E8E8E8', borderRadius: '4px', padding: '12px 14px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
            <div>
              {poRelated ? (
                <>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A1A1A' }}>
                    Related to {poOptions.find(p => p.id === selectedPOId)?.po_number || 'a Purchase Order'}
                  </div>
                  {poOptions.find(p => p.id === selectedPOId)?.vendors?.org_name && (
                    <div style={{ fontSize: '11px', color: '#6B6B6B', marginTop: '2px' }}>
                      {poOptions.find(p => p.id === selectedPOId).vendors.org_name}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A1A1A' }}>Not related to a Purchase Order</div>
              )}
            </div>
            <span
              onClick={() => setEditingPO(true)}
              style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}
            >
              Change
            </span>
          </div>
          {poRelated && <PendingBalanceNote total={total} poPending={poPending} poLoading={poLoading} />}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <TapCard selected={poRelated === true} onClick={() => setPoRelated(true)} main="Yes" sub="Paying an invoice against an issued PO" />
            <TapCard selected={poRelated === false} onClick={() => { setPoRelated(false); setSelectedPOId(''); setPoPending(null) }} main="No" sub="A normal expense claim" />
          </div>

          {poRelated === true && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '8px' }}>Which Purchase Order</div>
              <select
                value={selectedPOId}
                onChange={e => handleSelectPO(e.target.value)}
                style={{ ...inputStyle, paddingLeft: '10px' }}
              >
                <option value="">Select a PO…</option>
                {poOptions.map(po => (
                  <option key={po.id} value={po.id}>{poOptionLabel(po)}</option>
                ))}
              </select>

              <PendingBalanceNote total={total} poPending={poPending} poLoading={poLoading} />

              {poError && <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '8px' }}>{poError}</div>}
            </div>
          )}
        </>
      )}

      <div style={{ height: '1px', background: '#E8E8E8', marginBottom: '24px' }} />

      {/* SECTION B — Purpose (required) */}
      <SectionLabel>What were these expenses for<span style={{ color: '#DC2626' }}> *</span></SectionLabel>
      {PURPOSE_OPTIONS.map(opt => (
        <div key={opt.key}>
          <TapCard
            selected={purposeKey === opt.key}
            onClick={() => setPurposeKey(purposeKey === opt.key ? null : opt.key)}
            main={opt.label}
            fullWidth
          />
          {purposeKey === opt.key && (
            <TextInput
              value={purposeDescription}
              onChange={setPurposeDescription}
              placeholder={opt.placeholder}
              label="Brief description"
            />
          )}
        </div>
      ))}

      {/* SECTION F — Reimbursement (required) */}
      <SectionLabel mt={24}>How would you like to be reimbursed<span style={{ color: '#DC2626' }}> *</span></SectionLabel>
      <TapCard selected={reimbType === 'bank_transfer'} onClick={() => setReimbType(reimbType === 'bank_transfer' ? null : 'bank_transfer')} main="Bank transfer" sub="Transferred to your registered account" fullWidth />
      <TapCard selected={reimbType === 'petty_cash'} onClick={() => setReimbType(reimbType === 'petty_cash' ? null : 'petty_cash')} main="Petty cash" sub="Collected from finance team in person" fullWidth />

      {/* Fixed bottom bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10 }}>
        <div style={{
          maxWidth: '480px', margin: '0 auto',
          background: '#FFFFFF', borderTop: '1px solid #E8E8E8', padding: '16px',
        }}>
          {poRelated === null && (
            <div style={{ fontSize: '12px', color: '#DC2626', marginBottom: '8px' }}>
              Answer whether this report is related to a Purchase Order before continuing.
            </div>
          )}
          {poRelated === true && !selectedPOId && (
            <div style={{ fontSize: '12px', color: '#DC2626', marginBottom: '8px' }}>
              Select which Purchase Order this report is related to before continuing.
            </div>
          )}
          {poSectionValid && !purposeValid && (
            <div style={{ fontSize: '12px', color: '#DC2626', marginBottom: '8px' }}>
              Answer what these expenses were for before continuing.
            </div>
          )}
          {poSectionValid && purposeValid && !reimbValid && (
            <div style={{ fontSize: '12px', color: '#DC2626', marginBottom: '8px' }}>
              Choose how you'd like to be reimbursed before continuing.
            </div>
          )}
          <button
            onClick={handleContinue}
            disabled={!allValid}
            style={{
              width: '100%', height: '48px',
              background: allValid ? '#8C3225' : '#E8E8E8',
              color: allValid ? '#FFFFFF' : '#9CA3AF',
              border: 'none', fontSize: '14px', fontWeight: 500,
              cursor: allValid ? 'pointer' : 'default', borderRadius: '4px',
            }}
          >
            Continue to preview
          </button>
        </div>
      </div>
    </div>
  )
}
