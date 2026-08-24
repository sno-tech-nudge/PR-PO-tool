import { supabase } from './supabase'
import { generatePOPDF, uploadPDFToSupabase } from './pdfGenerator'
import { autoLinkPRToExpense } from './linkEngine'
import { getFiscalYearPrefix } from './formCalc'
import { getEmailsByRole } from './auth'

// Shared by PRDetail.jsx (full detail screen, including the action panel) and
// PRApproverDashboard.jsx (quick accept/reject icons in the list) so both act
// on a PR's approval chain identically.

export async function generatePONumber() {
  const fy = getFiscalYearPrefix()
  const { count } = await supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).like('po_number', `${fy}-PO-%`)
  return `${fy}-PO-07-${((count || 0) + 1).toString().padStart(4, '0')}`
}

// Notifies every team member holding `role` that a PR/PO needs their
// review — best-effort, must never block the approval action that
// triggered it. Without this, the next approver in the chain has no way to
// know it's their turn short of manually checking the Approvals page.
async function notifyRole(role, { type, message, relatedType, relatedId }) {
  try {
    const emails = await getEmailsByRole(role)
    await Promise.all(emails.map(email => supabase.from('expense_notifications').insert({
      recipient_id: email, type, message, related_type: relatedType, related_id: relatedId,
    })))
  } catch { /* non-blocking */ }
}

// Approves whichever pr_approvals row is currently 'pending' for this PR.
// If another level is 'waiting', advances it to 'pending', keeps the PR
// 'submitted', and notifies whoever holds that level's required_role that
// it's now their turn. Otherwise this was the final level — marks the PR
// 'approved'. Returns { isFinal, currentPending, nextWaiting } — callers
// should follow up with createPendingPO() when isFinal is true.
export async function approvePRLevel({ prId, approvals, user, pr }) {
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
    if (nextWaiting.required_role) {
      notifyRole(nextWaiting.required_role, {
        type: 'pr_pending_review',
        message: `PR ${pr?.pr_number || ''} for ₹${Number(pr?.amount || 0).toLocaleString('en-IN')} is now pending your review as ${nextWaiting.approver_name}.`,
        relatedType: 'pr',
        relatedId: prId,
      })
    }
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
// a PR is being split across multiple purchase orders. Notifies the Finance
// (PO Approver) role that a new PO is waiting on them.
export async function createPendingPO({ prId, pr, amount }) {
  try {
    const poNumber = await generatePONumber()
    const poAmount = amount != null ? amount : pr.amount
    const { data: newPO, error } = await supabase.from('purchase_orders').insert({
      po_number: poNumber, pr_id: prId, vendor_id: pr.vendor_id,
      amount: poAmount, entity: pr.entity, status: 'pending_approval',
    }).select().single()
    if (error) throw error
    notifyRole('finance', {
      type: 'po_pending_review',
      message: `Purchase Order ${poNumber} for ₹${Number(poAmount || 0).toLocaleString('en-IN')} (PR ${pr?.pr_number || ''}) is pending your approval.`,
      relatedType: 'po',
      relatedId: newPO.id,
    })
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
//
// The PDF step is best-effort and isolated in its own try/catch — a flaky
// html2canvas render or a storage hiccup must never block the actual
// approval (the status flip below), only mean this PO issues without a PDF
// attached (pdf_storage_path stays null, retried on nothing since there's no
// re-approve action once issued).
export async function approvePO({ po, pr, user, setPOData }) {
  let pdfPath = null
  try {
    setPOData(po)
    // Give POTemplate time to render before screenshotting it.
    await new Promise(resolve => setTimeout(resolve, 500))
    const pdf = await generatePOPDF()
    if (pdf) pdfPath = await uploadPDFToSupabase(pdf, `${po.po_number}.pdf`, supabase, 'po-pdfs', { upsert: true })
  } catch (err) {
    console.error('PO PDF generation/upload failed (non-blocking):', err.message)
  }

  try {
    const now = new Date().toISOString()
    await supabase.from('purchase_orders').update({
      status: 'issued', pdf_storage_path: pdfPath || null, approved_by: user.email, approved_at: now,
    }).eq('id', po.id)
    await supabase.from('purchase_requests').update({ status: 'po_generated' }).eq('id', pr.id)
    await autoLinkPRToExpense(pr.id, 'pr')
    try {
      await supabase.from('expense_notifications').insert({
        recipient_id: pr.requested_by,
        type: 'pr_approved',
        message: `Purchase Order ${po.po_number} for your request ${pr.pr_number} has been approved and issued.`,
        related_type: 'pr',
        related_id: pr.id,
      })
    } catch { /* non-blocking — the PO is already approved above */ }

    return true
  } catch (err) {
    console.error('PO approval error:', err.message)
    return { error: err.message }
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
  try {
    await supabase.from('expense_notifications').insert({
      recipient_id: pr.requested_by,
      type: 'pr_rejected',
      message: `Your purchase request ${pr.pr_number} was rejected. Reason: ${reason}. You can edit and resubmit.`,
      related_type: 'pr',
      related_id: prId,
    })
  } catch { /* non-blocking — the PR is already rejected above */ }
  return { ok: true }
}
