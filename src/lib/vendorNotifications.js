import { supabase } from './supabase'
import { notifyEmails } from './approverRecipients'
import { notifySlack } from './slack'

// In-app (bell) + Slack notice when a vendor is submitted for approval.
// Until now a submission only emailed the submitter, so the people who
// actually approve vendors never heard about it unless they went looking.
//  - Approvers (Finance members flagged can_approve_vendors, plus admins —
//    the same people canApproveVendor() lets act) get "awaiting approval".
//  - The submitter gets a confirmation. For an invite-link registration the
//    "submitter" is the employee who sent the link, so this is how they learn
//    the vendor completed it.
// Best-effort: never throws, never blocks the submission.
export async function notifyVendorSubmitted({ vendor, submitter, viaInviteLink = false, resubmitted = false }) {
  try {
    const label = vendor.vendor_id ? `"${vendor.org_name}" (${vendor.vendor_id})` : `"${vendor.org_name}"`
    const submitterName = submitter?.name || submitter?.email || 'a team member'
    const submitterEmail = String(submitter?.email || '').toLowerCase()

    const { data: approvers } = await supabase
      .from('team_members')
      .select('email')
      .or('role.eq.admin,and(role.eq.finance,can_approve_vendors.eq.true)')
    // An employee submitting for themselves doesn't need a "please approve"
    // copy of their own submission; an invite-link vendor's inviter might
    // genuinely be an approver, so keep them in that case.
    const approverEmails = (approvers || [])
      .map(a => a.email)
      .filter(e => viaInviteLink || String(e).toLowerCase() !== submitterEmail)

    const who = viaInviteLink ? `the vendor (invite link from ${submitterName})` : submitterName
    await notifyEmails(approverEmails, {
      type: 'vendor_submitted',
      message: `${resubmitted ? 'Vendor' : 'New vendor'} ${label} ${resubmitted ? 'resubmitted' : 'submitted'} by ${who} — awaiting approval.`,
      relatedType: 'vendor', relatedId: vendor.id,
    })

    if (submitterEmail) {
      await notifyEmails([submitter.email], {
        type: 'vendor_raised',
        message: viaInviteLink
          ? `${label} finished registering through your invite link and is now awaiting Finance approval.`
          : `Your vendor ${label} was ${resubmitted ? 'resubmitted' : 'submitted'} and is awaiting approval.`,
        relatedType: 'vendor', relatedId: vendor.id,
      })
    }

    notifySlack(`🏢 ${resubmitted ? 'Vendor resubmitted' : 'New vendor'}: *${vendor.org_name}*${vendor.vendor_id ? ` (${vendor.vendor_id})` : ''} by ${who}. Awaiting *Finance* approval.`)
  } catch (err) {
    console.error('Vendor submission notification failed (non-blocking):', err)
  }
}
