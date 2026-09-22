// Called by Nucleus's "intake-proxy" edge function (op: "submit_vendor").
// Builds the exact same `vendors` insert row VendorForm.jsx's buildPayload()
// does for an in-tool submission, so a Nucleus-originated vendor is
// indistinguishable from one entered directly here — same 'pending' status,
// same approval queue, same document-numbering sequence.
import { supabaseAdmin, requireIntakeAuth, nextDocNumber } from '../_lib/supabaseAdmin.js'
import { sendViaResend } from '../_lib/mailer.js'
import { buildEmail as buildVendorEmail } from '../send-vendor-email.js'

// Mirrors the regexes in src/components/vendor/VendorForm.jsx — duplicated
// rather than imported, since that file is a React component with browser-
// only dependencies (OCR, file inputs) that don't belong in a Node function.
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/
const PIN_RE = /^[0-9]{6}$/
const AADHAAR_RE = /^[0-9]{12}$/
const AADHAAR_REQUIRED_ORG_TYPES = ['Individual/Freelancer', 'Proprietorship']

// { bucket, storage_path, file_name } as produced by api/intake/upload-url.js
// and passed straight through by Nucleus's FileUploadField — this endpoint
// only ever needs the path.
function filePath(ref) {
  return ref?.storage_path || null
}

function validate(v) {
  const isIndividual = AADHAAR_REQUIRED_ORG_TYPES.includes(v.org_type)
  const errors = []
  if (!v.org_name?.trim()) errors.push('org_name is required')
  if (!v.org_type) errors.push('org_type is required')
  if (!v.nature_of_business) errors.push('nature_of_business is required')
  if (!v.address_line1?.trim()) errors.push('address_line1 is required')
  if (!PIN_RE.test(v.pincode || '')) errors.push('pincode must be a 6-digit pincode')
  if (!v.city?.trim()) errors.push('city is required')
  if (!v.state) errors.push('state is required')
  if (!v.date_of_incorporation) errors.push('date_of_incorporation is required')
  if (!PAN_RE.test((v.pan_number || '').toUpperCase().trim())) errors.push('pan_number is invalid (e.g. ABCDE1234F)')
  if (v.is_msme && !v.msme_details?.trim()) errors.push('msme_details is required when is_msme is true')
  if (v.is_msme && !filePath(v.msme_certificate)) errors.push('msme_certificate is required when is_msme is true')
  if (v.is_gstin_registered && !GSTIN_RE.test((v.gstin || '').toUpperCase().trim())) errors.push('gstin is invalid')
  if (v.is_gstin_registered && !filePath(v.gst_certificate)) errors.push('gst_certificate is required when is_gstin_registered is true')
  if (isIndividual) {
    if (!AADHAAR_RE.test((v.aadhaar_number || '').trim())) errors.push('aadhaar_number must be a 12-digit number')
    if (!filePath(v.aadhaar_copy)) errors.push('aadhaar_copy is required')
    if (v.aadhaar_pan_linked !== true) errors.push('aadhaar_pan_linked must be true — an individual/proprietor vendor cannot be registered with an unlinked Aadhaar/PAN')
    if (!filePath(v.aadhaar_pan_link_proof)) errors.push('aadhaar_pan_link_proof is required')
  } else {
    if (!v.org_registration_number?.trim()) errors.push('org_registration_number is required')
    if (!filePath(v.registration_certificate)) errors.push('registration_certificate is required')
  }
  if (v.is_related_to_org === true && !v.related_org_description?.trim()) errors.push('related_org_description is required when is_related_to_org is true')
  if (!v.contact_person?.trim()) errors.push('contact_person is required')
  if (!v.phone?.trim()) errors.push('phone is required')
  if (!v.email?.trim() || !v.email.includes('@')) errors.push('email is invalid')
  if (!v.beneficiary_name?.trim()) errors.push('beneficiary_name is required')
  if (!v.account_number?.trim() || v.account_number.length < 9 || v.account_number.length > 18) errors.push('account_number must be 9-18 digits')
  if (!IFSC_RE.test((v.ifsc_code || '').toUpperCase().trim())) errors.push('ifsc_code is invalid (e.g. SBIN0001234)')
  if (!v.bank_name?.trim()) errors.push('bank_name is required')
  if (!v.branch?.trim()) errors.push('branch is required')
  if (!filePath(v.cancelled_cheque)) errors.push('cancelled_cheque is required')
  if (!filePath(v.pan_copy)) errors.push('pan_copy is required')
  return errors
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!requireIntakeAuth(req, res)) return

  const v = req.body || {}
  if (!v.submitted_by) {
    res.status(400).json({ error: 'submitted_by is required' })
    return
  }

  const errors = validate(v)
  if (errors.length) {
    res.status(400).json({ error: errors.join('; ') })
    return
  }

  const isIndividual = AADHAAR_REQUIRED_ORG_TYPES.includes(v.org_type)

  try {
    const vendorId = await nextDocNumber('VR')

    const payload = {
      vendor_id: vendorId,
      org_name: v.org_name.trim(),
      org_type: v.org_type,
      nature_of_business: v.nature_of_business,
      address_line1: v.address_line1.trim(),
      address_line2: v.address_line2?.trim() || null,
      pincode: v.pincode.trim(),
      city: v.city.trim(),
      state: v.state,
      country: v.country?.trim() || 'India',
      date_of_incorporation: v.date_of_incorporation,
      pan_number: v.pan_number.toUpperCase().trim(),
      is_msme: !!v.is_msme,
      msme_details: v.is_msme ? v.msme_details.trim() : null,
      msme_certificate_path: v.is_msme ? filePath(v.msme_certificate) : null,
      is_gstin_registered: !!v.is_gstin_registered,
      gstin: v.is_gstin_registered ? v.gstin.toUpperCase().trim() : null,
      gst_certificate_path: v.is_gstin_registered ? filePath(v.gst_certificate) : null,
      aadhaar_number: isIndividual ? (v.aadhaar_number?.trim() || null) : null,
      aadhaar_copy_path: isIndividual ? filePath(v.aadhaar_copy) : null,
      aadhaar_pan_linked: isIndividual ? !!v.aadhaar_pan_linked : false,
      aadhaar_pan_link_proof_path: isIndividual && v.aadhaar_pan_linked ? filePath(v.aadhaar_pan_link_proof) : null,
      is_related_to_org: !!v.is_related_to_org,
      related_org_description: v.is_related_to_org ? v.related_org_description.trim() : null,
      contact_person: v.contact_person.trim(),
      phone: v.phone.trim(),
      email: v.email.trim().toLowerCase(),
      website: v.website?.trim() || null,
      org_registration_number: isIndividual ? null : v.org_registration_number.trim(),
      org_registration_state: isIndividual ? null : (v.org_registration_state || null),
      beneficiary_name: v.beneficiary_name.trim(),
      account_number: v.account_number.trim(),
      ifsc_code: v.ifsc_code.toUpperCase().trim(),
      bank_name: v.bank_name.trim(),
      branch: v.branch.trim(),
      cancelled_cheque_path: filePath(v.cancelled_cheque),
      pan_copy_path: filePath(v.pan_copy),
      registration_certificate_path: isIndividual ? null : filePath(v.registration_certificate),
      submitted_by: v.submitted_by,
      status: 'pending',
      rejection_reason: null,
    }

    const { data: vendorRow, error: insertError } = await supabaseAdmin.from('vendors').insert(payload).select().single()
    if (insertError) throw insertError

    // Informational only — Finance's explicit requirement is that a
    // duplicate PAN never blocks a submission (same as the in-tool form's
    // checkPanDuplicates), so this is surfaced in the response but the
    // vendor row above is already committed regardless.
    const { data: panDuplicates } = await supabaseAdmin
      .from('vendors')
      .select('id, vendor_id, org_name, status')
      .eq('pan_number', payload.pan_number)
      .neq('id', vendorRow.id)

    // Best-effort notifications — must never fail the submission itself.
    try {
      const apiKey = process.env.RESEND_API_KEY
      if (apiKey) {
        const { subject, html, text } = buildVendorEmail({
          type: 'submitted',
          vendorOrgName: vendorRow.org_name,
          vendorId: vendorRow.vendor_id,
        })
        await sendViaResend({
          apiKey,
          from: process.env.RESEND_FROM_EMAIL || 'The Nudge Institute <onboarding@resend.dev>',
          to: [v.submitted_by],
          subject,
          html,
          text,
        })
      }
    } catch (err) {
      console.error('intake/vendor: submitted email failed (non-blocking):', err)
    }

    try {
      const slackUrl = process.env.SLACK_WEBHOOK_URL
      if (slackUrl) {
        await fetch(slackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `🏢 New vendor registered via Nucleus: *${vendorRow.org_name}* (${vendorRow.vendor_id}) by ${v.submitted_by}. Awaiting Finance approval.` }),
        })
      }
    } catch (err) {
      console.error('intake/vendor: Slack notify failed (non-blocking):', err)
    }

    // Unlike an in-tool vendor submission, this is the one bell notification
    // for a Nucleus-originated vendor — "Raised via Nucleus" lets the team
    // gauge Nucleus adoption straight from the notification feed, per an
    // explicit ask.
    try {
      const { data: financeMembers } = await supabaseAdmin.from('team_members').select('email').eq('role', 'finance')
      await Promise.all((financeMembers || []).map(m => supabaseAdmin.from('expense_notifications').insert({
        recipient_id: m.email,
        type: 'vendor_submitted',
        message: `New vendor "${vendorRow.org_name}" (${vendorRow.vendor_id}) submitted by ${v.submitted_by} is awaiting approval. Raised via Nucleus.`,
        related_type: 'vendor',
        related_id: vendorRow.id,
      })))
    } catch (err) {
      console.error('intake/vendor: notification insert failed (non-blocking):', err)
    }

    res.status(200).json({
      id: vendorRow.id,
      reference: vendorRow.vendor_id,
      pan_duplicates: panDuplicates || [],
    })
  } catch (err) {
    console.error('intake/vendor failed:', err)
    res.status(502).json({ error: err.message || 'Could not create vendor' })
  }
}
