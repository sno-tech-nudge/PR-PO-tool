import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function ExpenseSelector({ expenses: initialExpenses, results: initialResults, onPreview }) {
  const [expenses, setExpenses] = useState(initialExpenses || [])
  const [loading, setLoading] = useState(!initialExpenses || initialExpenses.length === 0)
  const [selected, setSelected] = useState(new Set())
  const [grouped, setGrouped] = useState(false)

  const results = initialResults || []

  useEffect(() => {
    if (!initialExpenses || initialExpenses.length === 0) {
      supabase
        .from('expense_details')
        .select('*')
        .in('status', ['saved', 'flagged'])
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          setExpenses(data || [])
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [])

  // Policy violations are advisory (see PolicyResult.jsx) — they never prevent
  // an expense from being selected. Only a persisted hard block from Finance
  // (policy_status === 'blocked') actually stops selection.
  const blockedIds = new Set()
  const violatedIds = new Set()
  expenses.forEach((exp, i) => {
    const r = results[i]
    if (r && r.violations && r.violations.length > 0) violatedIds.add(exp.id)
    if (exp.policy_status === 'blocked') blockedIds.add(exp.id)
  })

  function getViolationMessage(expId) {
    const idx = expenses.findIndex(e => e.id === expId)
    if (idx === -1) return null
    const r = results[idx]
    if (r && r.violations && r.violations.length > 0) return r.violations[0].message
    return null
  }

  function getPolicyBadge(exp, i) {
    if (blockedIds.has(exp.id) || violatedIds.has(exp.id)) return { label: 'Issue', color: '#DC2626', bg: '#FEF2F2' }
    const r = results[i]
    if (r && r.flags && r.flags.filter(f => !f.internalOnly).length > 0) {
      return { label: 'Flagged', color: '#CA8A04', bg: '#FEFCE8' }
    }
    if (exp.policy_status === 'flagged') return { label: 'Flagged', color: '#CA8A04', bg: '#FEFCE8' }
    return { label: 'Passed', color: '#16A34A', bg: '#F0FDF4' }
  }

  function toggleSelect(expId) {
    if (blockedIds.has(expId)) return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(expId)) next.delete(expId)
      else next.add(expId)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(expenses.filter(e => !blockedIds.has(e.id)).map(e => e.id)))
  }

  function clearAll() {
    setSelected(new Set())
  }

  function handlePreview() {
    if (selected.size === 0) return
    const sel = expenses.filter(e => selected.has(e.id))
    const selResults = sel.map(e => {
      const idx = expenses.findIndex(exp => exp.id === e.id)
      return results[idx] || { violations: [], flags: [] }
    })
    onPreview(sel, selResults)
  }

  const selectedExpenses = expenses.filter(e => selected.has(e.id))
  const selectedTotal = selectedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)

  function getGrouped() {
    const groups = {}
    expenses.forEach(exp => {
      const key = exp.trip_name || 'No trip associated'
      if (!groups[key]) groups[key] = []
      groups[key].push(exp)
    })
    return groups
  }

  function renderRow(exp, globalIndex) {
    const i = globalIndex !== undefined ? globalIndex : expenses.findIndex(e => e.id === exp.id)
    const isBlocked = blockedIds.has(exp.id)
    const hasViolation = violatedIds.has(exp.id)
    const isSelected = selected.has(exp.id)
    const badge = getPolicyBadge(exp, i)
    const violationMsg = (isBlocked || hasViolation) ? getViolationMessage(exp.id) : null

    return (
      <div key={exp.id}>
        <div
          onClick={() => toggleSelect(exp.id)}
          style={{
            display: 'flex', alignItems: 'center', padding: '16px', minHeight: '72px',
            borderBottom: '1px solid #E8E8E8',
            cursor: isBlocked ? 'default' : 'pointer',
            opacity: isBlocked ? 0.5 : 1,
            background: '#FFFFFF',
          }}
        >
          {/* Checkbox */}
          <div style={{
            width: '20px', height: '20px', flexShrink: 0,
            border: `1.5px solid ${isSelected ? '#1A1A1A' : '#E8E8E8'}`,
            background: isSelected ? '#1A1A1A' : '#FFFFFF',
            marginRight: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '2px',
            pointerEvents: isBlocked ? 'none' : 'auto',
          }}>
            {isSelected && (
              <div style={{
                width: '10px', height: '6px',
                borderLeft: '2px solid #FFFFFF', borderBottom: '2px solid #FFFFFF',
                transform: 'rotate(-45deg)', marginTop: '-3px',
              }} />
            )}
          </div>

          {/* Details */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '12px' }}>
                {exp.vendor || 'Unknown vendor'}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A', flexShrink: 0 }}>
                {exp.amount ? `₹${Number(exp.amount).toLocaleString('en-IN')}` : '—'}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: '#6B6B6B' }}>
                {[exp.category, exp.date].filter(Boolean).join(' · ')}
              </div>
              <div style={{
                fontSize: '11px', fontWeight: 500,
                padding: '2px 8px', borderRadius: '2px',
                background: badge.bg, color: badge.color, flexShrink: 0, marginLeft: '8px',
              }}>
                {badge.label}
              </div>
            </div>
          </div>
        </div>

        {violationMsg && (
          <div style={{
            fontSize: '11px', color: '#DC2626',
            padding: '6px 16px 8px 52px',
            background: '#FEF2F2',
            borderBottom: '1px solid #E8E8E8',
            lineHeight: '1.4',
          }}>
            {isBlocked ? 'Cannot be included — ' : 'Policy note — '}{violationMsg}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ fontSize: '13px', color: '#6B6B6B' }}>Loading expenses...</div>
      </div>
    )
  }

  const groupedData = grouped ? getGrouped() : null

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', width: '100%', paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '8px' }}>Create Report</div>
        <div style={{ fontSize: '20px', fontWeight: 500, color: '#1A1A1A', marginBottom: '8px' }}>
          Select expenses to include
        </div>
        <div style={{ fontSize: '13px', color: '#4A4A4A', marginBottom: '16px', lineHeight: '1.5' }}>
          Choose which expenses to include in this report. You can create multiple reports from your saved expenses.
        </div>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
          <span onClick={selectAll} style={{ fontSize: '13px', color: '#1A1A1A', textDecoration: 'underline', cursor: 'pointer' }}>
            Select all
          </span>
          <span onClick={clearAll} style={{ fontSize: '13px', color: '#4A4A4A', textDecoration: 'underline', cursor: 'pointer' }}>
            Clear all
          </span>
        </div>
      </div>

      {/* Expense list */}
      <div style={{ borderTop: '1px solid #E8E8E8', borderBottom: '1px solid #E8E8E8' }}>
        {!grouped && expenses.map((exp, i) => renderRow(exp, i))}
        {grouped && Object.entries(groupedData).map(([group, exps]) => (
          <div key={group}>
            <div style={{
              fontSize: '11px', fontWeight: 500, color: '#6B6B6B',
              background: '#F7F7F7', padding: '8px 16px',
              borderBottom: '1px solid #E8E8E8',
            }}>
              {group}
            </div>
            {exps.map(exp => renderRow(exp))}
          </div>
        ))}
      </div>

      {/* Group toggle */}
      <div style={{ padding: '16px 20px' }}>
        <div
          onClick={() => setGrouped(g => !g)}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
        >
          <div style={{
            width: '36px', height: '20px', borderRadius: '10px',
            background: grouped ? '#1A1A1A' : '#E8E8E8',
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          }}>
            <div style={{
              width: '16px', height: '16px', borderRadius: '50%', background: '#FFFFFF',
              position: 'absolute', top: '2px',
              left: grouped ? '18px' : '2px',
              transition: 'left 0.2s',
            }} />
          </div>
          <span style={{ fontSize: '13px', color: '#4A4A4A' }}>Group by trip or project</span>
        </div>
      </div>

      {/* Multiple reports note */}
      {expenses.length > 5 && (
        <div style={{ margin: '0 20px 16px', padding: '12px', background: '#F7F7F7', border: '1px solid #E8E8E8' }}>
          <div style={{ fontSize: '12px', color: '#4A4A4A', lineHeight: '1.6' }}>
            You have {expenses.length} saved expenses. You can create multiple reports — select a subset now and create another report later for the rest.
          </div>
        </div>
      )}

      {/* Fixed bottom bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 10,
      }}>
        <div style={{
          maxWidth: '480px', margin: '0 auto',
          background: '#FFFFFF', borderTop: '1px solid #E8E8E8',
          padding: '16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: '13px', color: '#4A4A4A' }}>
            {selected.size} selected · ₹{selectedTotal.toLocaleString('en-IN')}
          </div>
          <div
            onClick={handlePreview}
            style={{
              fontSize: '14px', fontWeight: 500,
              color: selected.size > 0 ? '#1A1A1A' : '#E8E8E8',
              cursor: selected.size > 0 ? 'pointer' : 'default',
            }}
          >
            Preview report →
          </div>
        </div>
      </div>
    </div>
  )
}
