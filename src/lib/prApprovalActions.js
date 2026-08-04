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
// with createPendingPO() when isFinal is true.
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

// Creates the Purchase Order row for a fully-approved PR, in a
// 'pending_approval' state — it still needs a Finance user to review vendor
// legitimacy/documentation and explicitly Approve PO before it's issued
// (see approvePO below). `amount` defaults to the PR's full amount for the
// first PO against a PR; pass a smaller sub-amount for additional POs when
// a PR is being split across multiple purchase orders.
export async function createPendingPO({ prId, pr, amount }) {
  try {
    const poNumber = await generatePONumber()
    const { data: newPO, error } = await supabase.from('purchase_orders').insert({
      po_number: poNumber, pr_id: prId, vendor_id: pr.vendor_id,
      amount: amount != null ? amount : pr.amount, entity: pr.entity, status: 'pending_approval',
    }).select().single()
    if (error) throw error
    return newPO
  } catch (err) {
    console.error('PO creation error:', err.message)
    return null
  }
}

// Finance approves a pending PO: renders the hidden POTemplate (via
// setPOData, which the caller must render as <POTemplate po={poData} .../>
// for the html2canvas screenshot to work), generates + uploads the PDF,
// flips the PO to 'issued', links the PR to any matching expense report,
// and notifies the requester.
export async function approvePO({ po, pr, user, setPOData }) {
  try {
    setPOData(po)
    // Give POTemplate time to render before screenshotting it.
    await new Promise(resolve => setTimeout(resolve, 500))
    const pdf = await generatePOPDF()
    let pdfPath = null
    if (pdf) pdfPath = await uploadPDFToSupabase(pdf, `${po.po_number}.pdf`, supabase)

    const now = new Date().toISOString()
    await supabase.from('purchase_orders').update({
      status: 'issued', pdf_storage_path: pdfPath || null, approved_by: user.email, approved_at: now,
    }).eq('id', po.id)
    await supabase.from('purchase_requests').update({ status: 'po_generated' }).eq('id', pr.id)
    await autoLinkPRToExpense(pr.id, 'pr')
    await supabase.from('expense_notifications').insert({
      recipient_id: pr.requested_by,
      type: 'pr_approved',
      message: `Purchase Order ${po.po_number} for your request ${pr.pr_number} has been approved and issued.`,
    }).catch(() => {})

    return true
  } catch (err) {
    console.error('PO approval error:', err.message)
    return false
  }
}

// Finance rejects a pending PO — it's cancelled with a reason, but the
// underlying PR stays approved so Finance can create a corrected
// replacement PO against the same PR without re-running PR approval.
export async function rejectPO({ poId, reason }) {
  await supabase.from('purchase_orders').update({ status: 'rejected', rejection_reason: reason }).eq('id', poId)
  return { ok: true }
}

// Sum of amounts across a PR's purchase_orders, excluding cancelled/rejected
// ones — those don't count against the PR's approved total, so Finance can
// create a corrected replacement PO for the freed-up amount.
export async function getAllocatedPOTotal(prId) {
  const { data } = await supabase.from('purchase_orders').select('amount, status').eq('pr_id', prId)
  return (data || [])
    .filter(po => po.status !== 'cancelled' && po.status !== 'rejected')
    .reduce((sum, po) => sum + (Number(po.amount) || 0), 0)
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
