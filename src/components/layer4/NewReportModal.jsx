import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { generateReportReference } from '../../lib/reportReference'
import { attachPendingBalances, poOptionLabel } from '../../lib/poBalance'

// `fixedPO` ({ id, po_number }) is passed when the report is started straight
// from a PO's "Submit Expense" flow: the PO answer is already known, so the PO
// question is skipped entirely.
//
// This popup only asks the two up-front questions (PO / advance, both
// defaulting to No) and creates the draft report. Everything else about the
// report (purpose, duration) is filled in on the report workspace itself,
// after the expenses have been chosen.
export default function NewReportModal({ user, onCreated, onClose, fixedPO = null }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [poRelated, setPoRelated] = useState(!!fixedPO)
  const [poOptions, setPoOptions] = useState([])
  const [selectedPOId, setSelectedPOId] = useState(fixedPO?.id || '')

  // Only relevant when poRelated is false — an expense can't be linked to
  // both a PO and an advance, so the advance question disappears once PO is Yes.
  const [advanceRelated, setAdvanceRelated] = useState(false)
  const [advanceOptions, setAdvanceOptions] = useState([])
  const [selectedAdvanceId, setSelectedAdvanceId] = useState('')

  useEffect(() => {
    if (poRelated !== true || poOptions.length) return
    // !inner turns the embedded relation into a real join filter, so only
    // POs whose underlying PR this person themselves raised come back —
    // otherwise someone else's issued PO would still show up here.
    supabase.from('purchase_orders')
      .select('id, po_number, amount, vendors(org_name), purchase_requests!inner(requested_by)')
      .eq('status', 'issued')
      .in('purchase_requests.requested_by', user?.ownEmails ?? [])
      .order('created_at', { ascending: false }).limit(200)
      .then(async ({ data }) => setPoOptions(await attachPendingBalances(data || [])))
  }, [poRelated, poOptions.length, user?.email])

  useEffect(() => {
    if (advanceRelated !== true || advanceOptions.length) return
    // Recorded (disbursed) advances only, and one-to-one with a report — an
    // advance already linked to any report (draft or submitted) drops out.
    Promise.all([
      supabase.from('advances').select('id, amount, description, expected_usage_date')
        .in('requested_by', user?.ownEmails ?? []).eq('status', 'recorded')
        .order('created_at', { ascending: false }),
      supabase.from('expense_reports').select('advance_id').not('advance_id', 'is', null),
    ]).then(([{ data: advances }, { data: linked }]) => {
      const linkedIds = new Set((linked || []).map(r => r.advance_id))
      setAdvanceOptions((advances || []).filter(a => !linkedIds.has(a.id)))
    })
  }, [advanceRelated, advanceOptions.length, user?.email])

  async function handleContinue() {
    if (poRelated === true && !selectedPOId) {
      setError('Please select which Purchase Order this report is related to.')
      return
    }
    if (poRelated === false && advanceRelated === true && !selectedAdvanceId) {
      setError('Please select which advance this report is related to.')
      return
    }
    setSaving(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('expense_reports')
      .insert({
        report_reference: generateReportReference(poRelated === true),
        employee_email: user?.email ?? null,
        status: 'draft',
        po_related: poRelated,
        po_id: poRelated ? selectedPOId : null,
        advance_related: poRelated ? false : advanceRelated === true,
        advance_id: (poRelated || advanceRelated !== true) ? null : selectedAdvanceId,
      })
      .select()
      .single()
    if (err) {
      setError(`Could not create report: ${err.message}`)
      setSaving(false)
      return
    }
    onCreated(data)
  }

  const inputStyle = {
    width: '100%', height: '44px', border: '1px solid var(--taupe-200)',
    borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: '14px',
    color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
    background: 'var(--surface-card)', fontFamily: 'inherit',
  }

  const labelStyle = { fontSize: '13px', color: 'var(--text)', fontWeight: 500, marginBottom: '8px', display: 'block' }
  const required = <span style={{ color: 'var(--clay-text)' }}> *</span>

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface-card)', width: '100%', maxWidth: '440px', maxHeight: '85vh',
          borderRadius: 'var(--radius-md)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ flexShrink: 0, padding: '18px 20px', borderBottom: '1px solid var(--taupe-200)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>New Report</div>
            <div
              onClick={onClose}
              style={{
                width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--taupe-200)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: '14px', color: 'var(--text-muted)',
              }}
            >
              ✕
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {fixedPO ? (
            <div style={{ fontSize: '12px', color: 'var(--moss-text)', background: 'var(--moss-bg)', border: '1px solid var(--moss-border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: '16px' }}>
              Linked to Purchase Order <strong style={{ fontFamily: 'monospace' }}>{fixedPO.po_number}</strong>
            </div>
          ) : null}

          {!fixedPO && (
            <div>
              <label style={labelStyle}>Related to a Purchase Order?{required}</label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <div
                  onClick={() => { setPoRelated(true); setAdvanceRelated(null); setSelectedAdvanceId('') }}
                  style={{
                    flex: 1, padding: '12px 14px', cursor: 'pointer',
                    border: `1.5px solid ${poRelated === true ? 'var(--text)' : 'var(--taupe-200)'}`,
                    background: poRelated === true ? 'var(--taupe-50)' : 'var(--surface-card)', borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>Yes</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Paying an invoice against an issued PO</div>
                </div>
                <div
                  onClick={() => { setPoRelated(false); setSelectedPOId('') }}
                  style={{
                    flex: 1, padding: '12px 14px', cursor: 'pointer',
                    border: `1.5px solid ${poRelated === false ? 'var(--text)' : 'var(--taupe-200)'}`,
                    background: poRelated === false ? 'var(--taupe-50)' : 'var(--surface-card)', borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>No</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>A normal expense claim</div>
                </div>
              </div>

              {poRelated === true && (
                <div style={{ marginTop: '10px' }}>
                  <select
                    value={selectedPOId}
                    onChange={e => setSelectedPOId(e.target.value)}
                    style={{ ...inputStyle, paddingLeft: '10px' }}
                  >
                    <option value="">Select a PO…</option>
                    {poOptions.map(po => (
                      <option key={po.id} value={po.id}>{poOptionLabel(po)}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Only asked once the PO question is answered "No" — an
                  expense can never be linked to both a PO and an advance. */}
              {poRelated === false && (
                <div style={{ marginTop: '18px' }}>
                  <label style={labelStyle}>Related to an advance?{required}</label>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <div
                      onClick={() => setAdvanceRelated(true)}
                      style={{
                        flex: 1, padding: '12px 14px', cursor: 'pointer',
                        border: `1.5px solid ${advanceRelated === true ? 'var(--text)' : 'var(--taupe-200)'}`,
                        background: advanceRelated === true ? 'var(--taupe-50)' : 'var(--surface-card)', borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>Yes</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Settling a disbursed advance</div>
                    </div>
                    <div
                      onClick={() => { setAdvanceRelated(false); setSelectedAdvanceId('') }}
                      style={{
                        flex: 1, padding: '12px 14px', cursor: 'pointer',
                        border: `1.5px solid ${advanceRelated === false ? 'var(--text)' : 'var(--taupe-200)'}`,
                        background: advanceRelated === false ? 'var(--taupe-50)' : 'var(--surface-card)', borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>No</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>A normal expense claim</div>
                    </div>
                  </div>

                  {advanceRelated === true && (
                    <div style={{ marginTop: '10px' }}>
                      <select
                        value={selectedAdvanceId}
                        onChange={e => setSelectedAdvanceId(e.target.value)}
                        style={{ ...inputStyle, paddingLeft: '10px' }}
                      >
                        <option value="">Select an advance…</option>
                        {advanceOptions.map(a => (
                          <option key={a.id} value={a.id}>₹{Number(a.amount).toLocaleString('en-IN')} — {a.description}</option>
                        ))}
                      </select>
                      {advanceOptions.length === 0 && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                          No disbursed advances available to settle.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ fontSize: '13px', color: 'var(--clay-text)', marginTop: '12px' }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, display: 'flex', gap: '10px', padding: '16px 20px', borderTop: '1px solid var(--taupe-200)' }}>
          <button
            onClick={handleContinue}
            disabled={saving}
            style={{
              height: '44px', padding: '0 24px',
              background: saving ? 'var(--text-muted)' : 'var(--action)', color: 'var(--surface-card)',
              border: 'none', fontSize: '14px', fontWeight: 500,
              cursor: saving ? 'default' : 'pointer', borderRadius: 'var(--radius-sm)',
            }}
          >
            {saving ? 'Creating…' : 'Continue'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              height: '44px', padding: '0 24px',
              background: 'var(--surface-card)', color: 'var(--text)',
              border: '1px solid var(--taupe-200)', fontSize: '14px', fontWeight: 500,
              cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
