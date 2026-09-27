// Called by Nucleus's "intake-proxy" edge function (op: "get_status").
// Read-only status lookup so Nucleus can render a compact phase timeline on
// its own "My Submissions" page — mirrors the stage logic PRStatusModal.jsx
// / VendorStatusModal.jsx already use for the in-tool "View Status" popups,
// just returning plain step data instead of JSX. Never mutates anything.
import { supabaseAdmin, requireIntakeAuth } from '../_lib/supabaseAdmin.js'

function prSteps(pr, approvals, po) {
  const isDraft = pr.status === 'draft'
  const rejectedApproval = approvals.find(a => a.status === 'rejected')

  const levelStep = (level, label) => {
    const a = approvals.find(x => x.approver_level === level)
    if (!a) return { key: `level-${level}`, label, state: 'waiting', date: null }
    const state = a.status === 'approved' ? 'done'
      : a.status === 'rejected' ? 'rejected'
      : a.status === 'pending' ? 'current'
      : 'waiting'
    return { key: `level-${level}`, label, state, date: a.actioned_at || null }
  }

  const poState = po
    ? po.status === 'issued' ? 'done' : po.status === 'rejected' ? 'rejected' : 'current'
    : (pr.status === 'approved' || pr.status === 'po_generated') ? 'current' : 'waiting'

  return [
    { key: 'submitted', label: 'Submitted', state: isDraft ? 'waiting' : 'done', date: pr.submitted_at },
    isDraft
      ? { key: 'level-1', label: 'Functional Leader', state: 'waiting', date: null }
      : levelStep(1, 'Functional Leader'),
    isDraft || (rejectedApproval && rejectedApproval.approver_level === 1)
      ? { key: 'level-2', label: 'PR Approver', state: 'waiting', date: null }
      : levelStep(2, 'PR Approver'),
    {
      key: 'po',
      label: po?.status === 'issued' ? 'PO Issued' : po?.status === 'rejected' ? 'PO Rejected' : 'PO / Finance',
      state: pr.status === 'rejected' && !po ? 'waiting' : poState,
      date: po?.approved_at || po?.generated_at || null,
    },
  ]
}

function vendorSteps(vendor) {
  const isDraft = vendor.status === 'draft'
  const isPending = vendor.status === 'pending'
  const isRejected = vendor.status === 'rejected'
  const finalLabel = isRejected ? 'Rejected' : 'Approved'
  const finalDate = isRejected ? vendor.rejected_at : vendor.approved_at

  return [
    { key: 'submitted', label: 'Submitted', state: isDraft ? 'waiting' : 'done', date: vendor.submitted_at },
    { key: 'accepted', label: 'Accepted by Finance', state: isDraft ? 'waiting' : 'done', date: vendor.submitted_at },
    {
      key: 'final',
      label: isPending || isDraft ? 'Approved / Rejected' : finalLabel,
      state: isDraft ? 'waiting' : isPending ? 'current' : isRejected ? 'rejected' : 'done',
      date: finalDate,
    },
  ]
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!requireIntakeAuth(req, res)) return

  const { type, reference } = req.query || {}
  if (!type || !reference) {
    res.status(400).json({ error: 'type and reference are required' })
    return
  }

  try {
    if (type === 'pr') {
      const { data: pr } = await supabaseAdmin
        .from('purchase_requests')
        .select('id, status, submitted_at, rejection_reason')
        .eq('pr_number', reference)
        .maybeSingle()
      if (!pr) { res.status(404).json({ error: 'Not found' }); return }

      const [{ data: approvals }, { data: po }] = await Promise.all([
        supabaseAdmin.from('pr_approvals').select('approver_level, status, actioned_at').eq('pr_id', pr.id).order('approver_level'),
        supabaseAdmin.from('purchase_orders').select('status, approved_at, generated_at').eq('pr_id', pr.id).order('generated_at', { ascending: true }).limit(1).maybeSingle(),
      ])

      res.status(200).json({
        type: 'pr',
        status: pr.status,
        rejection_reason: pr.rejection_reason,
        steps: prSteps(pr, approvals || [], po),
      })
      return
    }

    if (type === 'vendor') {
      const { data: vendor } = await supabaseAdmin
        .from('vendors')
        .select('status, submitted_at, approved_at, rejected_at, rejection_reason')
        .eq('vendor_id', reference)
        .maybeSingle()
      if (!vendor) { res.status(404).json({ error: 'Not found' }); return }

      res.status(200).json({
        type: 'vendor',
        status: vendor.status,
        rejection_reason: vendor.rejection_reason,
        steps: vendorSteps(vendor),
      })
      return
    }

    res.status(400).json({ error: 'type must be "pr" or "vendor"' })
  } catch (err) {
    console.error('intake/status failed:', err)
    res.status(502).json({ error: err.message || 'Could not load status' })
  }
}
