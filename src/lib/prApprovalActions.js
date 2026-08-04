import { supabase } from './supabase'
import { generatePOPDF, uploadPDFToSupabase } from './pdfGenerator'
import { autoLinkPRToExpense } from './linkEngine'
import { getFiscalYearPrefix } from './formCalc'

// Shared by PRApproverView.jsx (full detail screen) and PRApproverDashboard.jsx
// (quick accept/reject icons in the list) so both act on a PR's approval chain
// identically.

export async function generatePONumber() {
  const fy = getFiscalYearPrefix()
  const { count } = await supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).like('po_number', `${fy}-PO-%`)
  return `${fy}-PO-07-${((count || 0) + 1).toString().padStart(4, '0')}`
}

// Approves whichever pr_approvals row is currently 'pending' for this PR.
// If another level is 'waiting', advances it to 'pending' and keeps the PR
// 'submitted'. Otherwise this was the final level — marks the PR 'approved'.
// Returns { isFinal, currentPending, nextWaiting } — callers should follow up
// with generatePRPurchaseOrder() when isFinal is true.
export async function approvePRLevel({ prId, approvals, user }) {
  const now = new Date().toISOString()
  const currentPending = approvals.find(a => a.status === 'pending')
  if (!currentPending) return { ok: false, error: 'No pending approval level found.' }

  await supabase.from('pr_approvals').update({
    status: 'approved', actioned_at: now, approver_email: user.email,
  }).eq('id', currentPending.id)

  const nextWaiting = approvals.find(a => a.status === 'waiting')
  if (nextWaiting) {
    await supabase.from('pr_approvals').update({ status: 'pending' }).eq('id', nextWaiting.id)
    await supabase.from('purchase_requests').update({ status: 'submitted' }).eq('id', prId)
    return { ok: true, isFinal: false, currentPending, nextWaiting }
  }

  await supabase.from('purchase_requests').update({ status: 'approved' }).eq('id', prId)
  return { ok: true, isFinal: true, currentPending, nextWaiting: null }
}

// Generates the Purchase Order for a fully-approved PR: creates the
// purchase_orders row, renders the hidden POTemplate (via setPOData, which
// the caller must render as <POTemplate po={poData} .../> for the
// html2canvas screenshot to work), uploads the PDF, links the PR to any
// matching expense report, and notifies the requester.
export async function generatePRPurchaseOrder({ prId, pr, setPOData }) {
  try {
    const poNumber = await generatePONumber()
    const { data: newPO } = await supabase.from('purchase_orders').insert({
      po_number: poNumber, pr_id: prId, vendor_id: pr.vendor_id,
      amount: pr.amount, entity: pr.entity, status: 'issued',
    }).select().single()

    if (!newPO) return null

    setPOData(newPO)
    // Give POTemplate time to render before screenshotting it.
    await new Promise(resolve => setTimeout(resolve, 500))
    const pdf = await generatePOPDF()
    if (pdf) {
      const path = await uploadPDFToSupabase(pdf, `${poNumber}.pdf`, supabase)
      if (path) await supabase.from('purchase_orders').update({ pdf_storage_path: path }).eq('id', newPO.id)
    }
    await supabase.from('purchase_requests').update({ status: 'po_generated' }).eq('id', prId)
    await autoLinkPRToExpense(prId, 'pr')
    await supabase.from('expense_notifications').insert({
      recipient_id: pr.requested_by,
      type: 'pr_approved',
      message: `Your purchase request ${pr.pr_number} has been fully approved. A Purchase Order has been generated.`,
    }).catch(() => {})

    return newPO
  } catch (err) {
    console.error('PO generation error:', err.message)
    return null
  }
}

// Rejects whichever pr_approvals row is currently 'pending', and rejects the PR.
export async function rejectPRLevel({ prId, approvals, pr, user, reason }) {
  const now = new Date().toISOString()
  const currentPending = approvals.find(a => a.status === 'pending')
  if (currentPending) {
    await supabase.from('pr_approvals').update({
      status: 'rejected', actioned_at: now, approver_email: user.email, rejection_reason: reason,
    }).eq('id', currentPending.id)
  }
  await supabase.from('purchase_requests').update({ status: 'rejected', rejection_reason: reason }).eq('id', prId)
  await supabase.from('expense_notifications').insert({
    recipient_id: pr.requested_by,
    type: 'pr_rejected',
    message: `Your purchase request ${pr.pr_number} was rejected. Reason: ${reason}. You can edit and resubmit.`,
  }).catch(() => {})
  return { ok: true }
}
