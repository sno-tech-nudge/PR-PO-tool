import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { determineApprovalRoute } from '../../lib/policyEngine'
import PolicyViolation from './PolicyViolation'
import PolicyFlag from './PolicyFlag'
import ApprovalRoute from './ApprovalRoute'

function generateReference() {
  const year = new Date().getFullYear()
  return 'TNI' + year + Math.floor(1000 + Math.random() * 9000)
}

function SummaryBar({ expenses }) {
  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 16px', background: '#F9FAFB', borderRadius: '8px',
      border: '1px solid #E8E8E8', marginBottom: '16px',
    }}>
      <div>
        <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '2px' }}>
          {expenses.length} expense{expenses.length !== 1 ? 's' : ''}
        </div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#1A1A1A' }}>
          ₹{total.toLocaleString('en-IN')}
        </div>
      </div>
      <div style={{ fontSize: '11px', color: '#6B6B6B', textAlign: 'right' }}>
        {expenses[0]?.brand && <div style={{ fontWeight: 500, color: '#1A1A1A' }}>{expenses[0].brand}</div>}
        <div>{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
      </div>
    </div>
  )
}

async function saveReport(expenses, approvalRoute, reference, statusOverride, userEmail) {
  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
  const { data: report, error } = await supabase
    .from('expense_reports')
    .insert({
      report_reference: reference,
      brand: expenses[0]?.brand || null,
      total_amount: total,
      expense_count: expenses.length,
      approval_route: approvalRoute.route,
      status: 'submitted',
      employee_email: userEmail || null,
    })
    .select()
    .single()

  if (error) throw error

  const links = expenses.map(e => ({ report_id: report.id, expense_id: e.id }))
  await supabase.from('report_expenses').insert(links)

  await supabase
    .from('expense_details')
    .update({ policy_status: statusOverride || 'submitted', approval_route: approvalRoute.route })
    .in('id', expenses.map(e => e.id))

  return report
}

export default function PolicyResult({ results, expenses, onSubmitted, onProceedToReport, onBack }) {
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const approvalRoute = determineApprovalRoute(expenses)

  // Map results to expenses
  const expenseResults = expenses.map((exp, i) => ({
    expense: exp,
    ...(results[i] || { violations: [], flags: [] }),
  }))

  const allViolations = expenseResults.flatMap(r =>
    r.violations.map(v => ({ ...v, expense: r.expense }))
  )
  const allFlags = expenseResults.flatMap(r =>
    r.flags.map(f => ({ ...f, expense: r.expense }))
  )

  const hasViolations = allViolations.length > 0
  const hasFlags = allFlags.length > 0

  // Policy checks are ADVISORY ONLY — never block submission
  function handleProceed() {
    if (onProceedToReport) {
      const resultsForLayer4 = expenses.map(exp => {
        const r = expenseResults.find(er => er.expense.id === exp.id)
        return { violations: r?.violations || [], flags: r?.flags || [] }
      })
      onProceedToReport({ expenses, results: resultsForLayer4 })
    } else {
      handleSubmit(expenses)
    }
  }

  async function handleSubmit(expensesToSubmit) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const ref = generateReference()
      await saveReport(expensesToSubmit, approvalRoute, ref, 'submitted')
      onSubmitted({ reference: ref, approvalRoute, expenseCount: expensesToSubmit.length, total: expensesToSubmit.reduce((s, e) => s + (e.amount || 0), 0) })
    } catch {
      setSubmitError('Could not submit. Please try again.')
      setSubmitting(false)
    }
  }

  // Single unified render — policy checks are advisory, never blocking
  const visibleFlags = allFlags.filter(f => !f.internalOnly)

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', width: '100%' }}>

      {/* Header */}
      {!hasViolations && !hasFlags ? (
        <div style={{ textAlign: 'center', padding: '20px 0 16px' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: '#F0FDF4', border: '2px solid #86EFAC',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 10px', fontSize: '18px',
          }}>
            ✓
          </div>
          <div style={{ fontSize: '17px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>All clear</div>
          <div style={{ fontSize: '13px', color: '#6B7280' }}>All expenses passed policy checks.</div>
        </div>
      ) : (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '17px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
            Policy review
          </div>
          <div style={{ fontSize: '13px', color: '#6B7280' }}>
            {hasViolations
              ? `${allViolations.length} item${allViolations.length !== 1 ? 's' : ''} flagged for your attention. These are advisory — you can still submit.`
              : 'A few advisory notes. You can still submit.'}
          </div>
        </div>
      )}

      <SummaryBar expenses={expenses} />

      {/* Violations — shown as warnings, not blockers */}
      {hasViolations && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{
            fontSize: '11px', fontWeight: 600, color: '#B45309',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px',
          }}>
            Policy flags — for your awareness
          </div>
          {allViolations.map((v, i) => (
            <PolicyViolation key={i} violation={v} expense={v.expense} />
          ))}
        </div>
      )}

      {/* Advisory flags */}
      {visibleFlags.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{
            fontSize: '11px', fontWeight: 600, color: '#6B7280',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px',
          }}>
            Notes
          </div>
          {visibleFlags.map((flag, i) => (
            <PolicyFlag key={i} flag={flag} expense={flag.expense} />
          ))}
        </div>
      )}

      <ApprovalRoute route={approvalRoute} />

      {submitError && (
        <div style={{ fontSize: '12px', color: '#DC2626', marginBottom: '12px', textAlign: 'center' }}>{submitError}</div>
      )}

      {/* Single always-enabled continue button */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
        <button
          onClick={handleProceed}
          disabled={submitting}
          style={{
            width: '100%', height: '48px',
            background: submitting ? '#9CA3AF' : '#111827',
            color: '#FFFFFF', border: 'none',
            fontSize: '14px', fontWeight: 600,
            cursor: submitting ? 'default' : 'pointer', borderRadius: '6px',
          }}
        >
          {submitting ? 'Submitting…' : onProceedToReport ? 'Continue to report' : 'Submit for approval'}
        </button>

        {onBack && (
          <button
            onClick={onBack}
            style={{
              width: '100%', height: '40px', background: '#FFFFFF', color: '#6B7280',
              border: '1px solid #E5E7EB', fontSize: '13px',
              cursor: 'pointer', borderRadius: '6px',
            }}
          >
            Back to expenses
          </button>
        )}
      </div>
    </div>
  )
}
