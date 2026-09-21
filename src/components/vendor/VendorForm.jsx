import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { getFiscalYearPrefix } from '../../lib/formCalc'
import { NATURE_OF_BUSINESS_OPTIONS } from '../../lib/vendorData'
import { extractChequeDetails } from '../../lib/claude'
import { imageFileToJpegBase64, pdfPageToBase64 } from '../../lib/receiptImage'
import PanDuplicateModal from './PanDuplicateModal'
import { sendVendorEmail } from '../../lib/vendorEmail'
import { getFinanceEmails } from '../../lib/auth'

const ORG_TYPES = [
  'Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Proprietorship', 'HUF',
  'Trust/NGO', 'Section 8 Company', 'Producer Company', 'Individual/Freelancer',
  'Co-operative Society / AOP / SHG', 'Government Entity', 'Local Authority', 'Other',
]

// Per "Vendor Document Requirements.xlsx" (Finance-provided): PAN and Bank
// Details are mandatory for every org type, and GST/MSME certs are already
// conditionally required via their own toggles regardless of type — the one
// thing that genuinely varies by org type is which incorporation-style
// document is needed. Sole Proprietorship and Individual/Freelancer share a
// row in that sheet (both just need an Aadhaar copy — see
// AADHAAR_REQUIRED_ORG_TYPES below), so neither appears here.
const INCORPORATION_DOC_LABELS = {
  'HUF': 'HUF Deed',
  'Partnership': 'Partnership Deed',
  'LLP': 'Partnership Deed of Signing Partner + LLP Incorporation Certificate (MCA)',
  'Private Limited': 'Certificate of Incorporation (MCA)',
  'Public Limited': 'Certificate of Incorporation (MCA)',
  'Section 8 Company': 'Certificate of Incorporation + Section 8 License (MCA) — combine into one file if needed',
  'Trust/NGO': 'Trust Deed',
  'Co-operative Society / AOP / SHG': 'Certificate of Registration (Societies Act) or equivalent AOP/SHG registration',
  'Government Entity': 'Certificate of registration establishing incorporation',
  'Local Authority': 'Certificate of registration establishing incorporation',
  'Producer Company': 'Certificate of Incorporation (MCA)',
  'Other': 'Any certificate of registration establishing incorporation',
}
function incorporationDocLabel(orgType) {
  return INCORPORATION_DOC_LABELS[orgType] || 'Registration Certificate'
}
const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana',
  'Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur',
  'Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry',
]

const PAN_RE     = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
const GSTIN_RE   = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
const IFSC_RE    = /^[A-Z]{4}0[A-Z0-9]{6}$/
const PIN_RE     = /^[0-9]{6}$/
const PHONE_RE   = /^[0-9]{10}$/
// Landline entry includes an STD code (and sometimes an extension), so it
// can't be pinned to exactly 10 digits like a mobile number — just a sane
// length range.
const LANDLINE_RE = /^[0-9]{6,15}$/
const AADHAAR_RE = /^[0-9]{12}$/
// Contact person is a human name — letters and spaces only, no digits or
// symbols, everywhere else in the form stays unrestricted.
const NAME_RE = /^[A-Za-z ]+$/
// Per the Finance-provided requirements sheet, Sole Proprietorship and
// Individual/Freelancer share identical document requirements (PAN, Bank
// Details, and a soft copy of Aadhaar in place of an incorporation cert).
const AADHAAR_REQUIRED_ORG_TYPES = ['Individual/Freelancer', 'Proprietorship']

const GST_STATE_CODES = {
  '01':'Jammu & Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh',
  '05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh',
  '10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur',
  '15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal',
  '20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh','24':'Gujarat',
  '26':'Dadra & NH / Daman & Diu','27':'Maharashtra','28':'Andhra Pradesh (old)',
  '29':'Karnataka','30':'Goa','31':'Lakshadweep','32':'Kerala','33':'Tamil Nadu',
  '34':'Puducherry','35':'Andaman & Nicobar Islands','36':'Telangana','37':'Andhra Pradesh',
  '38':'Ladakh','97':'Other Territory','99':'Centre Jurisdiction',
}

function parseGSTIN(gstin) {
  const g = gstin.toUpperCase().trim()
  if (!GSTIN_RE.test(g)) return null
  const stateCode = g.slice(0, 2)
  const embeddedPan = g.slice(2, 12)
  return { stateCode, stateName: GST_STATE_CODES[stateCode] || `State code ${stateCode}`, embeddedPan }
}

// ─── primitives ────────────────────────────────────────────────────────────────
// Scrolls a field (matched by the `id` Field/FileUpload wrapper divs carry,
// keyed to the same string as its entry in `errors`) into view and focuses
// its input — used by the error-summary banner so each listed problem is a
// direct link to where it needs fixing, not just a static message.
function scrollToField(key) {
  const el = document.getElementById(key)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.querySelector('input, select, textarea, button')?.focus({ preventScroll: true })
}

function Field({ id, label, error, required, hint, children }) {
  return (
    <div id={id} style={{ marginBottom: '18px', scrollMarginTop: '80px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginBottom: hint ? '2px' : '5px' }}>
        {label}{required && <span style={{ color: 'var(--clay-text)', marginLeft: '2px' }}>*</span>}
      </label>
      {hint && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>{hint}</div>}
      {children}
      {error && <div style={{ fontSize: '11px', color: 'var(--clay-text)', marginTop: '4px' }}>{error}</div>}
    </div>
  )
}

const inputStyle = (err, extra = {}) => ({
  width: '100%', height: '38px', border: `1px solid ${err ? 'var(--clay-text)' : 'var(--taupe-400)'}`,
  borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: '13px', color: 'var(--ink)',
  background: 'var(--surface-card)', outline: 'none', boxSizing: 'border-box', ...extra,
})
const disabledStyle = { ...inputStyle(false), background: 'var(--taupe-100)', color: 'var(--text-muted)', cursor: 'not-allowed' }

function Inp({ field, f, setF, placeholder, type = 'text', disabled, mono, err, upper, maxLength }) {
  return (
    <input
      type={type}
      value={f[field]}
      onChange={e => !disabled && setF(prev => ({ ...prev, [field]: upper ? e.target.value.toUpperCase() : e.target.value }))}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      style={disabled ? disabledStyle : inputStyle(err, mono ? { fontFamily: 'monospace' } : {})}
    />
  )
}

function Sel({ field, f, setF, options, placeholder, err }) {
  return (
    <select
      value={f[field]}
      onChange={e => setF(prev => ({ ...prev, [field]: e.target.value }))}
      style={{ ...inputStyle(err), color: f[field] ? 'var(--ink)' : 'var(--text-muted)' }}
    >
      <option value="">{placeholder || 'Select…'}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function Toggle({ label, checked, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      cursor: 'pointer', padding: '12px 16px',
      background: checked ? 'var(--action-bg)' : 'var(--taupe-50)',
      border: `1px solid ${checked ? 'var(--taupe-300)' : 'var(--taupe-200)'}`,
      borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: 500,
      color: checked ? 'var(--action)' : 'var(--ink)', userSelect: 'none', transition: '0.15s',
    }}>
      <div style={{
        width: '36px', height: '20px', borderRadius: 'var(--radius-lg)',
        background: checked ? 'var(--action)' : 'var(--taupe-400)',
        position: 'relative', transition: '0.2s', flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: '2px',
          left: checked ? '18px' : '2px',
          width: '16px', height: '16px', borderRadius: '50%',
          background: 'var(--surface-card)', transition: '0.2s',
        }} />
      </div>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ display: 'none' }} />
      {label}
    </label>
  )
}

function YesNo({ value, onChange, error }) {
  const pill = selected => ({
    flex: 1, textAlign: 'center', padding: '10px 12px', cursor: 'pointer',
    borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: 600,
    border: `1px solid ${selected ? 'var(--action)' : 'var(--taupe-400)'}`,
    background: selected ? 'var(--action-bg)' : 'var(--surface-card)',
    color: selected ? 'var(--action)' : 'var(--ink)',
  })
  return (
    <div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={pill(value === true)} onClick={() => onChange(true)}>Yes</div>
        <div style={pill(value === false)} onClick={() => onChange(false)}>No</div>
      </div>
      {error && <div style={{ fontSize: '11px', color: 'var(--clay-text)', marginTop: '4px' }}>{error}</div>}
    </div>
  )
}

function SectionHeader({ number, title, subtitle }) {
  return (
    <div style={{ marginBottom: '22px', paddingBottom: '14px', borderBottom: '2px solid var(--taupe-100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '30px', height: '30px', borderRadius: '50%', background: 'var(--action)',
          color: 'var(--surface-card)', fontSize: '13px', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{number}</div>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{subtitle}</div>}
        </div>
      </div>
    </div>
  )
}

function FileUpload({ id, label, required, error, existing, file, onChange, accept = 'image/*,.pdf' }) {
  return (
    <Field id={id} label={label} required={required} error={error}>
      <div style={{
        border: `2px dashed ${error ? 'var(--clay-text)' : file ? 'var(--moss-text)' : 'var(--taupe-400)'}`,
        borderRadius: 'var(--radius-md)', padding: '16px', background: file ? 'var(--moss-bg)' : 'var(--taupe-50)',
        cursor: 'pointer', transition: '0.15s',
      }}>
        <label style={{ cursor: 'pointer', display: 'block' }}>
          <div style={{ fontSize: '12px', color: file ? 'var(--moss-text)' : 'var(--text-muted)', textAlign: 'center', marginBottom: '6px' }}>
            {file ? `✓ ${file.name}` : existing ? '✓ File already uploaded — click to replace' : 'Click to select file (PDF or image)'}
          </div>
          <input
            type="file"
            accept={accept}
            onChange={e => onChange(e.target.files?.[0] || null)}
            style={{ display: 'none' }}
          />
          {!file && (
            <div style={{ textAlign: 'center' }}>
              <span style={{
                display: 'inline-block', padding: '5px 14px',
                background: 'var(--surface-card)', border: '1px solid var(--taupe-400)',
                borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--ink)', fontWeight: 500,
              }}>
                Select File
              </span>
            </div>
          )}
        </label>
      </div>
      {existing && !file && (
        <div style={{ fontSize: '11px', color: 'var(--moss-text)', marginTop: '4px' }}>File on record — re-upload to replace.</div>
      )}
    </Field>
  )
}

// Atomic — see generatePRNumber's comment in PRForm.jsx; same fix, same reason.
async function generateVendorId() {
  const fy = getFiscalYearPrefix()
  const { data, error } = await supabase.rpc('next_doc_number', { kind: 'VR', fy_prefix: fy })
  if (error) throw error
  return data
}

// ─── main component ─────────────────────────────────────────────────────────────
export default function VendorForm({ user, existingVendor = null, onSaved, onBack, hideBack = false }) {
  const isEdit = !!existingVendor && existingVendor.status !== 'draft'

  const [vendorId, setVendorId]     = useState(existingVendor?.status === 'draft' ? '' : (existingVendor?.vendor_id || ''))
  const [draftId, setDraftId]       = useState(existingVendor?.id || null)
  const [errors, setErrors]         = useState({})
  // null before any Save/Submit attempt (gates the error-summary banner so
  // it only appears once someone has actually tried), otherwise 'draft' or
  // 'submit' — which validate() mode to keep re-running live so a fixed
  // field's warning clears immediately instead of waiting for another click.
  const [attemptedMode, setAttemptedMode] = useState(null)
  const [saving, setSaving]         = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [saveError, setSaveError]   = useState(null)
  const [draftSavedAt, setDraftSavedAt] = useState(null)
  const [ifscLooking, setIfscLooking]       = useState(false)
  const [ifscLookupFailed, setIfscLookupFailed] = useState(false)
  const [chequeOcrLoading, setChequeOcrLoading] = useState(false)
  const [pincodeLooking, setPincodeLooking] = useState(false)
  const [branchLocked, setBranchLocked]     = useState(false)
  const [gstinValidated, setGstinValidated] = useState(null) // null | {ok, stateCode, stateName, embeddedPan, panMatch}
  // '+91' for a mobile number, '' for a landline/other number entered as-is
  // (with STD code). Not persisted separately — derived from the stored
  // phone value on edit, since a 10-digit number is unambiguously a mobile.
  const [phonePrefix, setPhonePrefix] = useState(
    existingVendor?.phone && !PHONE_RE.test(existingVendor.phone.replace(/[\s-]/g, '')) ? '' : '+91'
  )

  const [panDuplicates, setPanDuplicates]     = useState([])
  const [showPanDupModal, setShowPanDupModal] = useState(false)
  const [panDupAcknowledged, setPanDupAcknowledged] = useState(false)
  // Guards against re-alerting Finance on every repeated Submit click while
  // the form is stuck in the "not linked" state — resets once the answer changes.
  const financeAlertSentRef = useRef(false)

  const [f, setF] = useState({
    org_name: '', org_type: '', nature_of_business: '',
    address_line1: '', address_line2: '', pincode: '', city: '', state: '', country: 'India',
    date_of_incorporation: '', pan_number: '',
    is_msme: false, msme_details: '',
    is_gstin_registered: false, gstin: '',
    aadhaar_number: '', aadhaar_pan_linked: null,
    is_related_to_org: null, related_org_description: '',
    contact_person: '', phone: '', email: '', website: '',
    org_registration_number: '', org_registration_state: '',
    beneficiary_name: '', account_number: '', ifsc_code: '', bank_name: '', branch: '',
  })

  // files
  const [chequeFile,   setChequeFile]   = useState(null)
  const [panFile,      setPanFile]      = useState(null)
  const [regCertFile,  setRegCertFile]  = useState(null)
  const [msmeCertFile, setMsmeCertFile] = useState(null)
  const [gstCertFile,  setGstCertFile]  = useState(null)
  const [aadhaarFile,      setAadhaarFile]      = useState(null)
  const [aadhaarProofFile, setAadhaarProofFile] = useState(null)

  // existing paths (edit mode)
  const [chequePath]   = useState(existingVendor?.cancelled_cheque_path || null)
  const [panPath]      = useState(existingVendor?.pan_copy_path || null)
  const [regCertPath]  = useState(existingVendor?.registration_certificate_path || null)
  const [msmeCertPath] = useState(existingVendor?.msme_certificate_path || null)
  const [gstCertPath]  = useState(existingVendor?.gst_certificate_path || null)
  const [aadhaarPath]      = useState(existingVendor?.aadhaar_copy_path || null)
  const [aadhaarProofPath] = useState(existingVendor?.aadhaar_pan_link_proof_path || null)

  // derived: GSTIN field enabled only when org state + valid PAN are filled
  const gstinEnabled = !!f.org_registration_state && PAN_RE.test(f.pan_number.toUpperCase().trim())
  const isIndividual = AADHAAR_REQUIRED_ORG_TYPES.includes(f.org_type)

  // Individuals don't have a company registration number — show "0" instead
  // of asking them to type one. Switching back to a non-individual type
  // clears the auto-set "0" so a real number can be entered.
  useEffect(() => {
    if (isIndividual) {
      setF(prev => prev.org_registration_number === '0' ? prev : { ...prev, org_registration_number: '0' })
    } else {
      setF(prev => prev.org_registration_number === '0' ? { ...prev, org_registration_number: '' } : prev)
    }
  }, [isIndividual])

  useEffect(() => { financeAlertSentRef.current = false }, [f.aadhaar_pan_linked])

  useEffect(() => {
    if (existingVendor) {
      setF({
        org_name: existingVendor.org_name || '',
        org_type: existingVendor.org_type || '',
        nature_of_business: existingVendor.nature_of_business || '',
        address_line1: existingVendor.address_line1 || '',
        address_line2: existingVendor.address_line2 || '',
        pincode: existingVendor.pincode || '',
        city: existingVendor.city || '',
        state: existingVendor.state || '',
        country: existingVendor.country || 'India',
        date_of_incorporation: existingVendor.date_of_incorporation || '',
        pan_number: existingVendor.pan_number || '',
        is_msme: existingVendor.is_msme || false,
        msme_details: existingVendor.msme_details || '',
        is_gstin_registered: existingVendor.is_gstin_registered || false,
        gstin: existingVendor.gstin || '',
        aadhaar_number: existingVendor.aadhaar_number || '',
        aadhaar_pan_linked: existingVendor.aadhaar_pan_linked ?? null,
        is_related_to_org: existingVendor.is_related_to_org ?? null,
        related_org_description: existingVendor.related_org_description || '',
        contact_person: existingVendor.contact_person || '',
        phone: existingVendor.phone || '',
        email: existingVendor.email || '',
        website: existingVendor.website || '',
        org_registration_number: existingVendor.org_registration_number || '',
        org_registration_state: existingVendor.org_registration_state || '',
        beneficiary_name: existingVendor.beneficiary_name || '',
        account_number: existingVendor.account_number || '',
        ifsc_code: existingVendor.ifsc_code || '',
        bank_name: existingVendor.bank_name || '',
        branch: existingVendor.branch || '',
      })
    }
  }, [existingVendor])

  // Auto-fills city/state from a 6-digit pincode via India Post's public
  // pincode API — same "never override what's already there" rule as the
  // cheque OCR auto-fill below.
  async function lookupPincode(codeOverride) {
    const code = (typeof codeOverride === 'string' ? codeOverride : f.pincode).trim()
    if (!PIN_RE.test(code)) return
    setPincodeLooking(true)
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${code}`)
      if (res.ok) {
        const data = await res.json()
        const po = data?.[0]?.Status === 'Success' ? data[0].PostOffice?.[0] : null
        if (po) {
          const matchedState = INDIAN_STATES.find(s => s.toLowerCase() === (po.State || '').toLowerCase()) || null
          setF(prev => ({
            ...prev,
            city: prev.city || po.District || prev.city,
            state: prev.state || matchedState || prev.state,
          }))
        }
      }
    } catch (err) {
      console.error('Pincode lookup failed:', err)
    }
    setPincodeLooking(false)
  }

  async function lookupIFSC(codeOverride) {
    const code = (typeof codeOverride === 'string' ? codeOverride : f.ifsc_code).toUpperCase().trim()
    if (!IFSC_RE.test(code)) return
    setIfscLooking(true)
    setIfscLookupFailed(false)
    try {
      const res = await fetch(`https://ifsc.razorpay.com/${code}`)
      if (res.ok) {
        const d = await res.json()
        setF(prev => ({ ...prev, ifsc_code: code, bank_name: d.BANK || prev.bank_name, branch: d.BRANCH || prev.branch }))
        setBranchLocked(true)
      } else {
        setBranchLocked(false)
        setIfscLookupFailed(true)
      }
    } catch (err) {
      console.error('IFSC lookup failed:', err)
      setBranchLocked(false)
      setIfscLookupFailed(true)
    }
    setIfscLooking(false)
  }

  // OCR the cancelled cheque / bank statement to auto-fill the bank section —
  // same "fill once from a document" pattern already used for expense
  // receipts. Never overrides a field the user already filled in.
  async function handleChequeFile(file) {
    setChequeFile(file)
    if (!file) return
    setChequeOcrLoading(true)
    try {
      const { base64 } = file.type === 'application/pdf'
        ? await pdfPageToBase64(file)
        : await imageFileToJpegBase64(file)
      const extracted = await extractChequeDetails(base64)
      if (extracted) {
        const hadIfsc = !!f.ifsc_code
        const matchedState = extracted.state
          ? INDIAN_STATES.find(s =>
              s.toLowerCase() === extracted.state.toLowerCase() ||
              s.toLowerCase().includes(extracted.state.toLowerCase()) ||
              extracted.state.toLowerCase().includes(s.toLowerCase().split(' ')[0])
            )
          : null
        // Address fields are a convenience fill only — always left freely
        // editable, never locked like bank name/branch above.
        setF(prev => ({
          ...prev,
          beneficiary_name: prev.beneficiary_name || extracted.beneficiary_name || prev.beneficiary_name,
          account_number: prev.account_number || extracted.account_number || prev.account_number,
          address_line1: prev.address_line1 || extracted.address_line1 || prev.address_line1,
          city: prev.city || extracted.city || prev.city,
          state: prev.state || matchedState || prev.state,
          pincode: prev.pincode || extracted.pincode || prev.pincode,
        }))
        if (!hadIfsc && extracted.ifsc_code) {
          await lookupIFSC(extracted.ifsc_code)
        } else if (!f.bank_name && !f.branch && (extracted.bank_name || extracted.branch)) {
          setF(prev => ({
            ...prev,
            bank_name: prev.bank_name || extracted.bank_name || prev.bank_name,
            branch: prev.branch || extracted.branch || prev.branch,
          }))
        }
      }
    } catch (err) {
      console.error('Cheque OCR failed:', err)
    }
    setChequeOcrLoading(false)
  }

  // Duplicate PAN is a warning, never a blocker (Finance's explicit
  // requirement — PAN/GST must not gate a submission). This state is
  // deliberately separate from `errors`, which does gate submission.
  async function checkPanDuplicates(pan) {
    const cleaned = pan.toUpperCase().trim()
    if (!PAN_RE.test(cleaned)) return
    const currentRowId = existingVendor?.id || draftId
    let q = supabase.from('vendors').select('id, vendor_id, org_name, status, submitted_by').eq('pan_number', cleaned)
    if (currentRowId) q = q.neq('id', currentRowId)
    const { data } = await q
    if (data && data.length > 0) {
      setPanDuplicates(data)
      setShowPanDupModal(true)
      setPanDupAcknowledged(false)
    } else {
      setPanDuplicates([])
    }
  }

  function validate(mode) {
    const e = {}
    const submit = mode === 'submit'
    if (submit && !f.org_name.trim())              e.org_name = 'Required'
    if (submit && !f.org_type)                     e.org_type = 'Required'
    if (submit && !f.nature_of_business)           e.nature_of_business = 'Required'
    if (submit && !f.address_line1.trim())         e.address_line1 = 'Required'
    if (submit) {
      if (!PIN_RE.test(f.pincode))                 e.pincode = 'Enter 6-digit pincode'
    } else if (f.pincode && !PIN_RE.test(f.pincode)) {
      e.pincode = 'Enter 6-digit pincode'
    }
    if (submit && !f.city.trim())                  e.city = 'Required'
    if (submit && !f.state)                        e.state = 'Required'
    if (submit && !f.date_of_incorporation)        e.date_of_incorporation = 'Required'
    if (submit) {
      if (!PAN_RE.test(f.pan_number.toUpperCase().trim())) e.pan_number = 'Invalid PAN (e.g. ABCDE1234F)'
    } else if (f.pan_number && !PAN_RE.test(f.pan_number.toUpperCase().trim())) {
      e.pan_number = 'Invalid PAN (e.g. ABCDE1234F)'
    }
    if (f.is_msme && !f.msme_details.trim() && submit) e.msme_details = 'Please provide MSME registration details'
    if (submit && f.is_msme && !isEdit && !msmeCertPath && !msmeCertFile) e.msme_cert = 'MSME certificate is required'
    if (f.is_gstin_registered) {
      if (submit) {
        if (!GSTIN_RE.test(f.gstin.toUpperCase().trim())) e.gstin = 'Invalid GSTIN (15 characters)'
        if (!isEdit && !gstCertPath && !gstCertFile) e.gst_cert = 'GST registration certificate is required'
      } else if (f.gstin && !GSTIN_RE.test(f.gstin.toUpperCase().trim())) {
        e.gstin = 'Invalid GSTIN (15 characters)'
      }
    }
    if (isIndividual && submit) {
      if (!AADHAAR_RE.test(f.aadhaar_number.trim())) e.aadhaar_number = 'Enter 12-digit Aadhaar number'
      if (!isEdit && !aadhaarPath && !aadhaarFile)    e.aadhaar_copy = 'Aadhaar copy is required'
      if (f.aadhaar_pan_linked === null) {
        e.aadhaar_pan_linked = 'Please disclose whether your Aadhaar and PAN are linked'
      } else if (f.aadhaar_pan_linked === false) {
        e.aadhaar_pan_linked = 'Aadhaar and PAN must be linked to register an individual vendor. Please link them and try again.'
      } else if (!isEdit && !aadhaarProofPath && !aadhaarProofFile) {
        e.aadhaar_pan_proof = 'Proof of Aadhaar-PAN linkage is required'
      }
    } else if (isIndividual && f.aadhaar_number && !AADHAAR_RE.test(f.aadhaar_number.trim())) {
      e.aadhaar_number = 'Enter 12-digit Aadhaar number'
    }
    if (submit && f.is_related_to_org === null)     e.is_related_to_org = 'Please select Yes or No'
    if (submit && f.is_related_to_org === true && !f.related_org_description.trim()) {
      e.related_org_description = 'Please describe the relationship'
    }
    if (submit && !f.contact_person.trim())        e.contact_person = 'Required'
    else if (f.contact_person && !NAME_RE.test(f.contact_person.trim())) e.contact_person = 'Only letters and spaces allowed'
    {
      const cleanedPhone = f.phone.replace(/[\s-]/g, '')
      const phoneRe = phonePrefix === '+91' ? PHONE_RE : LANDLINE_RE
      const phoneMsg = phonePrefix === '+91' ? 'Enter a 10-digit mobile number' : 'Enter a valid telephone number, STD code included'
      if (submit) {
        if (!phoneRe.test(cleanedPhone)) e.phone = phoneMsg
      } else if (f.phone && !phoneRe.test(cleanedPhone)) {
        e.phone = phoneMsg
      }
    }
    if (submit && (!f.email.trim() || !f.email.includes('@'))) e.email = 'Enter valid email'
    if (submit && !f.org_registration_number.trim()) e.org_registration_number = 'Required'
    if (submit && !f.beneficiary_name.trim())      e.beneficiary_name = 'Required'
    if (submit && !f.account_number.trim())        e.account_number = 'Required'
    if (submit) {
      if (!IFSC_RE.test(f.ifsc_code.toUpperCase().trim())) e.ifsc_code = 'Invalid IFSC (e.g. SBIN0001234)'
    } else if (f.ifsc_code && !IFSC_RE.test(f.ifsc_code.toUpperCase().trim())) {
      e.ifsc_code = 'Invalid IFSC (e.g. SBIN0001234)'
    }
    if (submit && !f.bank_name.trim())             e.bank_name = 'Required'
    if (submit && !f.branch.trim())                e.branch = 'Required'
    if (submit && !isEdit) {
      if (!chequePath && !chequeFile)  e.cheque   = 'Cancelled cheque or bank statement is required'
      if (!panPath    && !panFile)     e.pan_copy = 'PAN copy is required'
      if (!isIndividual && !regCertPath && !regCertFile) e.reg_cert = 'Registration certificate is required'
    }
    return e
  }

  async function uploadFile(file, folder) {
    const ext  = file.name.split('.').pop()
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('vendor-documents').upload(path, file)
    if (error) throw error
    return path
  }

  async function buildPayload({ status, vendor_id }) {
    let cPath  = chequePath,  pPath = panPath,   rPath = regCertPath
    let mPath  = msmeCertPath, gPath = gstCertPath
    let aPath  = aadhaarPath, apPath = aadhaarProofPath
    if (chequeFile)        cPath  = await uploadFile(chequeFile,        'cheques')
    if (panFile)            pPath  = await uploadFile(panFile,           'pan')
    if (regCertFile)        rPath  = await uploadFile(regCertFile,       'reg-cert')
    if (msmeCertFile)       mPath  = await uploadFile(msmeCertFile,      'msme-cert')
    if (gstCertFile)        gPath  = await uploadFile(gstCertFile,       'gst-cert')
    if (aadhaarFile)        aPath  = await uploadFile(aadhaarFile,       'aadhaar')
    if (aadhaarProofFile)   apPath = await uploadFile(aadhaarProofFile,  'aadhaar-pan-proof')

    return {
      vendor_id,
      org_name:                       f.org_name.trim(),
      org_type:                       f.org_type,
      nature_of_business:             f.nature_of_business || null,
      address_line1:                  f.address_line1.trim(),
      address_line2:                  f.address_line2.trim() || null,
      pincode:                        f.pincode.trim(),
      city:                           f.city.trim(),
      state:                          f.state,
      country:                        f.country,
      date_of_incorporation:          f.date_of_incorporation || null,
      pan_number:                     f.pan_number.toUpperCase().trim(),
      is_msme:                        f.is_msme,
      msme_details:                   f.is_msme ? f.msme_details.trim() : null,
      msme_certificate_path:          f.is_msme ? (mPath || null) : null,
      is_gstin_registered:            f.is_gstin_registered,
      gstin:                          f.is_gstin_registered ? f.gstin.toUpperCase().trim() : null,
      gst_certificate_path:           f.is_gstin_registered ? (gPath || null) : null,
      aadhaar_number:                 isIndividual ? (f.aadhaar_number.trim() || null) : null,
      aadhaar_copy_path:              isIndividual ? (aPath || null) : null,
      aadhaar_pan_linked:             isIndividual ? f.aadhaar_pan_linked : false,
      aadhaar_pan_link_proof_path:    isIndividual && f.aadhaar_pan_linked ? (apPath || null) : null,
      is_related_to_org:              f.is_related_to_org,
      related_org_description:        f.is_related_to_org ? f.related_org_description.trim() : null,
      contact_person:                 f.contact_person.trim(),
      phone:                          f.phone.trim(),
      email:                          f.email.trim().toLowerCase(),
      website:                        f.website.trim() || null,
      org_registration_number:        f.org_registration_number.trim(),
      org_registration_state:         f.org_registration_state || null,
      beneficiary_name:               f.beneficiary_name.trim(),
      account_number:                 f.account_number.trim(),
      ifsc_code:                      f.ifsc_code.toUpperCase().trim(),
      bank_name:                      f.bank_name.trim(),
      branch:                         f.branch.trim(),
      cancelled_cheque_path:          cPath,
      pan_copy_path:                  pPath,
      registration_certificate_path:  rPath,
      submitted_by:                   user.email,
      status,
      rejection_reason:               null,
    }
  }

  // `silent === true` only for the background autosave interval below —
  // never shows the error banner or scrolls, so a periodic autosave firing
  // while a field is mid-edit doesn't yank the page around. A real button
  // click always shows it, even though the click event itself gets passed
  // as this same argument (hence the strict `=== true` check).
  async function handleSaveDraft(silent) {
    const e = validate('draft')
    setErrors(e)
    if (Object.keys(e).length) {
      if (silent === true) return
      // Stay put — the warning list renders right above the buttons,
      // where the person already is, instead of jumping them to the top.
      setAttemptedMode('draft')
      return
    }
    setAttemptedMode(null)
    setSavingDraft(true); setSaveError(null)
    try {
      const payload = await buildPayload({ status: 'draft', vendor_id: null })
      let result
      if (draftId) {
        result = await supabase.from('vendors').update(payload).eq('id', draftId).select().single()
      } else {
        result = await supabase.from('vendors').insert(payload).select().single()
      }
      if (result.error) throw result.error
      if (!draftId) setDraftId(result.data.id)
      setDraftSavedAt(new Date())
    } catch (err) {
      setSaveError(err.message || 'Failed to save draft.')
    }
    setSavingDraft(false)
  }

  // Periodic autosave — every 45s, silently save a draft if there's enough
  // filled in to be worth keeping and nothing else is already saving. Uses
  // a ref so the interval always calls the latest handleSaveDraft (which
  // closes over current form state) without needing to be torn down and
  // recreated on every keystroke. validate('draft') never actually blocks
  // this (every check inside it is gated on submit mode), so it's safe to
  // fire in the background without risking the scroll-to-error side effect.
  // Skips the write if org_name/pan_number haven't changed since the last
  // autosave (an approximation, not a full-form diff, but it stops
  // re-saving an identical draft every 45s while idle).
  const saveDraftRef = useRef(handleSaveDraft)
  useEffect(() => { saveDraftRef.current = handleSaveDraft })
  const lastAutosaveKeyRef = useRef(null)
  useEffect(() => {
    if (isEdit) return
    const hasContent = !!(f.org_name.trim() || f.pan_number.trim())
    if (!hasContent) return
    const key = `${f.org_name}|${f.pan_number}`
    const interval = setInterval(() => {
      if (saving || savingDraft) return
      if (key === lastAutosaveKeyRef.current) return
      lastAutosaveKeyRef.current = key
      saveDraftRef.current(true)
    }, 45000)
    return () => clearInterval(interval)
  }, [isEdit, f.org_name, f.pan_number, saving, savingDraft])

  async function handleSubmit() {
    const e = validate('submit')
    setErrors(e)
    if (Object.keys(e).length) {
      // Flag Finance when a submission is blocked specifically because the
      // vendor disclosed their Aadhaar and PAN aren't linked — otherwise this
      // never surfaces anywhere, since no vendor record gets created.
      if (isIndividual && f.aadhaar_pan_linked === false && !financeAlertSentRef.current) {
        financeAlertSentRef.current = true
        sendVendorEmail({
          type: 'aadhaar_pan_not_linked',
          vendorOrgName: f.org_name.trim() || '(organisation name not entered)',
          recipientEmail: await getFinanceEmails(),
          panNumber: f.pan_number.toUpperCase().trim() || null,
          submitterEmail: user.email,
        })
      }
      setAttemptedMode('submit')
      return
    }
    setAttemptedMode(null)
    if (panDuplicates.length > 0 && !panDupAcknowledged) {
      setShowPanDupModal(true)
      return
    }
    setSaving(true); setSaveError(null)
    try {
      const vid = vendorId || await generateVendorId()
      if (!vendorId) setVendorId(vid)
      const payload = await buildPayload({ status: 'pending', vendor_id: vid })
      payload.submitted_at = new Date().toISOString()

      let result
      if (isEdit) {
        result = await supabase.from('vendors').update(payload).eq('id', existingVendor.id).select().single()
      } else if (draftId) {
        result = await supabase.from('vendors').update(payload).eq('id', draftId).select().single()
      } else {
        result = await supabase.from('vendors').insert(payload).select().single()
      }
      if (result.error) throw result.error
      sendVendorEmail({
        type: 'submitted', vendorOrgName: result.data.org_name, vendorId: result.data.vendor_id,
        recipientEmail: result.data.submitted_by,
      })
      onSaved(result.data)
    } catch (err) {
      setSaveError(err.message || 'Save failed. Please try again.')
    }
    setSaving(false)
  }

  // Live checklist — same "before you submit" pattern as PRForm.jsx, so
  // whoever is filling this out can see what's still missing at a glance.
  const checklist = [
    { label: 'Documents attached', done: isEdit || !!((chequePath || chequeFile) && (panPath || panFile) && (isIndividual || (regCertPath || regCertFile))) },
    { label: 'Organisation details filled', done: !!(f.org_name && f.org_type && f.nature_of_business && f.address_line1 && f.pincode && f.city && f.state && f.date_of_incorporation && f.pan_number) },
    { label: 'Contact details filled', done: !!(f.contact_person && f.phone && f.email && f.org_registration_number) },
    { label: 'Bank details filled', done: !!(f.beneficiary_name && f.account_number && f.ifsc_code && f.bank_name && f.branch) },
    ...(isIndividual ? [{ label: 'Aadhaar verified', done: !!(f.aadhaar_number && (aadhaarPath || aadhaarFile) && f.aadhaar_pan_linked && (aadhaarProofPath || aadhaarProofFile)) }] : []),
  ]

  const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }
  const full  = { gridColumn: '1 / -1' }
  const card  = {
    background: 'var(--surface-card)', border: '1px solid var(--taupe-200)',
    borderRadius: 'var(--radius-lg)', padding: '28px', marginBottom: '16px',
  }

  // Once a Save-draft/Submit attempt has failed, recompute validation fresh on
  // every render (not just on the next click) so a warning clears the instant
  // its field is actually fixed. Before any attempt, falls back to the real
  // `errors` state (only ever touched by per-field onBlur checks).
  const liveErrors = attemptedMode ? validate(attemptedMode) : errors

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 20px 80px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        {!hideBack && (
          <>
            <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '13px', color: 'var(--action)', cursor: 'pointer', padding: 0 }}>
              ← Back
            </button>
            <span style={{ color: 'var(--taupe-400)' }}>/</span>
          </>
        )}
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
          {isEdit ? 'Edit Vendor' : existingVendor?.status === 'draft' ? 'Continue Vendor Draft' : 'Vendor Registration'}
        </h2>
      </div>

      {/* Vendor ID badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between',
        background: 'var(--action-bg)', border: '1px solid var(--taupe-300)', borderRadius: 'var(--radius-md)',
        padding: '12px 18px', marginBottom: '24px',
      }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vendor ID</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--action)', fontFamily: 'monospace', marginTop: '2px' }}>
            {vendorId || 'Will be assigned on submission'}
          </div>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Auto-assigned</div>
      </div>

      {/* ══════════════════════════════════════
          SECTION 1 — Organisation Details (comes first so Type of
          Organisation is known before Attachments, which tailors exactly
          which documents it asks for based on that selection)
      ══════════════════════════════════════ */}
      <div style={card}>
        <SectionHeader number="1" title="Organisation Details" subtitle="Legal identity and registered address" />

        <div style={grid2}>
          <div style={full}>
            <Field id="org_name" label="Name of Organisation" required error={liveErrors.org_name}>
              <Inp field="org_name" f={f} setF={setF} placeholder="e.g. Acme Solutions Pvt Ltd" err={!!liveErrors.org_name} />
            </Field>
          </div>
          <Field id="org_type" label="Type of Organisation" required error={liveErrors.org_type}
            hint="Determines which documents Attachments will ask for below">
            <Sel field="org_type" f={f} setF={setF} options={ORG_TYPES} placeholder="Select type…" err={!!liveErrors.org_type} />
          </Field>
          <Field id="nature_of_business" label="Nature of Business" required error={liveErrors.nature_of_business}>
            <Sel field="nature_of_business" f={f} setF={setF} options={NATURE_OF_BUSINESS_OPTIONS} placeholder="Select nature of business…" err={!!liveErrors.nature_of_business} />
          </Field>
          <Field id="date_of_incorporation" label="Date of Incorporation" required error={liveErrors.date_of_incorporation}>
            <input
              type="date"
              value={f.date_of_incorporation}
              onChange={e => setF(p => ({ ...p, date_of_incorporation: e.target.value }))}
              style={inputStyle(!!liveErrors.date_of_incorporation)}
            />
          </Field>
          <div style={full}>
            <Field id="address_line1" label="Address Line 1" required error={liveErrors.address_line1}>
              <Inp field="address_line1" f={f} setF={setF} placeholder="Building / Street name" err={!!liveErrors.address_line1} />
            </Field>
          </div>
          <div style={full}>
            <Field label="Address Line 2">
              <Inp field="address_line2" f={f} setF={setF} placeholder="Area, landmark (optional)" />
            </Field>
          </div>
          <Field id="pincode" label="Pincode" required error={liveErrors.pincode} hint="City and state auto-fill from a valid pincode">
            <input
              type="text"
              value={f.pincode}
              onChange={e => {
                const digits = e.target.value.replace(/\D/g, '')
                setF(p => ({ ...p, pincode: digits }))
                if (digits.length === 6) lookupPincode(digits)
              }}
              onBlur={() => lookupPincode()}
              placeholder="560001"
              maxLength={6}
              style={inputStyle(!!liveErrors.pincode)}
            />
            {pincodeLooking && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>Looking up…</div>}
          </Field>
          <Field id="city" label="City / District" required error={liveErrors.city}>
            <Inp field="city" f={f} setF={setF} placeholder="Bangalore" err={!!liveErrors.city} />
          </Field>
          <Field id="state" label="State / Province" required error={liveErrors.state}>
            <Sel field="state" f={f} setF={setF} options={INDIAN_STATES} placeholder="Select state…" err={!!liveErrors.state} />
          </Field>
          <Field label="Country">
            <Inp field="country" f={f} setF={setF} placeholder="India" />
          </Field>
          <Field id="pan_number" label="PAN Number" required error={liveErrors.pan_number}>
            <input
              type="text"
              value={f.pan_number}
              onChange={e => { setF(p => ({ ...p, pan_number: e.target.value.toUpperCase() })); setPanDupAcknowledged(false) }}
              onBlur={e => checkPanDuplicates(e.target.value)}
              placeholder="ABCDE1234F"
              maxLength={10}
              style={inputStyle(!!liveErrors.pan_number, { fontFamily: 'monospace', letterSpacing: '0.1em' })}
            />
            {PAN_RE.test(f.pan_number.toUpperCase().trim()) && (
              <button
                type="button"
                onClick={() => checkPanDuplicates(f.pan_number)}
                style={{
                  background: 'none', border: 'none', padding: '4px 0', fontSize: '11px', color: 'var(--action)',
                  cursor: 'pointer', fontWeight: 600, display: 'block', marginTop: '4px', textDecoration: 'underline',
                }}
              >
                Verify Again
              </button>
            )}
            {panDuplicates.length > 0 && (
              <div
                onClick={() => setShowPanDupModal(true)}
                style={{
                  marginTop: '6px', fontSize: '11px', color: 'var(--gold-text)', cursor: 'pointer',
                  background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)', padding: '6px 10px',
                }}
              >
                ⚠ {panDuplicates.length} other vendor{panDuplicates.length !== 1 ? 's' : ''} already registered with this PAN — click to view
              </div>
            )}
          </Field>
        </div>

        {/* Individual/Proprietorship vendor — Aadhaar (per the Finance
            requirements sheet, both share the same document requirements) */}
        {isIndividual && (
          <div style={{ background: 'var(--gold-bg)', border: '1px solid #DDD6FE', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#5B21B6', marginBottom: '12px' }}>Aadhaar Details (Individual Vendor)</div>
            <Field id="aadhaar_number" label="Aadhaar Number" required error={liveErrors.aadhaar_number}>
              <input
                type="text"
                value={f.aadhaar_number}
                onChange={e => setF(p => ({ ...p, aadhaar_number: e.target.value.replace(/\D/g, '') }))}
                placeholder="123412341234"
                maxLength={12}
                style={inputStyle(!!liveErrors.aadhaar_number, { fontFamily: 'monospace', letterSpacing: '0.08em' })}
              />
            </Field>
            <FileUpload id="aadhaar_copy"
              label="Aadhaar Copy"
              required
              error={liveErrors.aadhaar_copy}
              existing={aadhaarPath}
              file={aadhaarFile}
              onChange={setAadhaarFile}
            />
            <div style={{ marginTop: '4px' }}>
              <Field id="aadhaar_pan_linked" label="Are your Aadhaar and PAN linked?" required error={liveErrors.aadhaar_pan_linked}>
                <YesNo
                  value={f.aadhaar_pan_linked}
                  onChange={v => setF(p => ({ ...p, aadhaar_pan_linked: v }))}
                />
              </Field>
            </div>
            {f.aadhaar_pan_linked === true && (
              <div style={{ marginTop: '14px' }}>
                <FileUpload id="aadhaar_pan_proof"
                  label="Proof of Aadhaar-PAN Link"
                  required
                  error={liveErrors.aadhaar_pan_proof}
                  existing={aadhaarProofPath}
                  file={aadhaarProofFile}
                  onChange={setAadhaarProofFile}
                />
              </div>
            )}
          </div>
        )}

        {/* MSME toggle + conditional */}
        <div style={{ marginBottom: '14px' }}>
          <Toggle
            label="MSME Registration Present?"
            checked={f.is_msme}
            onChange={e => setF(p => ({ ...p, is_msme: e.target.checked }))}
          />
        </div>
        {f.is_msme && (
          <div style={{ background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gold-text)', marginBottom: '12px' }}>MSME Registration Details</div>
            <Field id="msme_details" label="MSME Registration Details" required error={liveErrors.msme_details}
              hint="If MSME is yes, please provide the registration details">
              <textarea
                value={f.msme_details}
                onChange={e => setF(p => ({ ...p, msme_details: e.target.value }))}
                placeholder="MSME Udyam Registration Number, category (Micro/Small/Medium), etc."
                rows={3}
                style={{
                  width: '100%', border: `1px solid ${liveErrors.msme_details ? 'var(--clay-text)' : 'var(--gold-border)'}`,
                  borderRadius: 'var(--radius-sm)', padding: '10px', fontSize: '13px', color: 'var(--ink)',
                  outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
                  background: 'var(--surface-card)',
                }}
              />
            </Field>
            <FileUpload id="msme_cert"
              label="MSME Registration Certificate"
              required
              error={liveErrors.msme_cert}
              existing={msmeCertPath}
              file={msmeCertFile}
              onChange={setMsmeCertFile}
            />
          </div>
        )}

        {/* GSTIN toggle + conditional */}
        <div style={{ marginBottom: '14px' }}>
          <Toggle
            label="GSTIN Registration Present?"
            checked={f.is_gstin_registered}
            onChange={e => { setF(p => ({ ...p, is_gstin_registered: e.target.checked, gstin: '' })); setGstinValidated(null) }}
          />
        </div>
        {f.is_gstin_registered && (
          <div style={{ background: '#EFF6FF', border: '1px solid var(--action-bg)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--action)', marginBottom: '12px' }}>GST Registration Detail</div>
            {!gstinEnabled && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'var(--taupe-100)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: '12px' }}>
                ℹ In order to fill GST Registration Detail, first fill <strong>Organisation Registration State</strong> (below) and a valid <strong>PAN Number</strong> (above).
              </div>
            )}
            {(() => {
              const parsed = parseGSTIN(f.gstin)
              const canValidate = !!parsed
              const borderColor = !f.gstin ? 'var(--action-bg)'
                : gstinValidated ? (gstinValidated.ok ? 'var(--moss-text)' : 'var(--clay-text)')
                : canValidate ? 'var(--moss-text)' : (f.gstin.length === 15 ? 'var(--clay-text)' : 'var(--action-bg)')

              function handleValidate() {
                if (!parsed) {
                  setGstinValidated({ ok: false, msg: 'Invalid GSTIN format. Check and re-enter.' })
                  return
                }
                const panUpper = f.pan_number.toUpperCase().trim()
                const panMatch = PAN_RE.test(panUpper) ? parsed.embeddedPan === panUpper : null
                const result = { ok: true, ...parsed, panMatch }
                setGstinValidated(result)
                // auto-fill org_registration_state if blank
                if (!f.org_registration_state) {
                  const matched = INDIAN_STATES.find(s =>
                    s.toLowerCase().includes(parsed.stateName.toLowerCase()) ||
                    parsed.stateName.toLowerCase().includes(s.toLowerCase().split(' ')[0])
                  )
                  if (matched) setF(p => ({ ...p, org_registration_state: matched }))
                }
              }

              return (
                <Field id="gstin" label="GSTIN / UIN" required error={liveErrors.gstin}>
                  <input
                    type="text"
                    value={f.gstin}
                    onChange={e => {
                      if (!gstinEnabled) return
                      setGstinValidated(null)
                      setF(p => ({ ...p, gstin: e.target.value.toUpperCase() }))
                    }}
                    placeholder={gstinEnabled ? '29ABCDE1234F1Z5' : 'Fill state and PAN first…'}
                    maxLength={15}
                    disabled={!gstinEnabled}
                    style={gstinEnabled
                      ? { ...inputStyle(!!liveErrors.gstin, { fontFamily: 'monospace', letterSpacing: '0.08em' }), borderColor }
                      : disabledStyle}
                  />
                  {/* Validate link — shows once 15 chars entered, hides after validation */}
                  {gstinEnabled && f.gstin && !gstinValidated && (
                    <button
                      type="button"
                      onClick={handleValidate}
                      style={{
                        background: 'none', border: 'none', padding: '4px 0',
                        fontSize: '12px', color: 'var(--action)', cursor: 'pointer',
                        fontWeight: 600, display: 'block', marginTop: '4px',
                        textDecoration: 'underline',
                      }}
                    >
                      Validate
                    </button>
                  )}
                  {/* Validation result card */}
                  {gstinValidated && (
                    <div style={{
                      marginTop: '8px', borderRadius: 'var(--radius-md)', padding: '12px 14px',
                      background: gstinValidated.ok ? 'var(--moss-bg)' : 'var(--clay-bg)',
                      border: `1px solid ${gstinValidated.ok ? 'var(--moss-border)' : 'var(--clay-border)'}`,
                      fontSize: '12px',
                    }}>
                      {gstinValidated.ok ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--moss-text)', fontSize: '13px' }}>✓ Valid GSTIN</div>
                          <div style={{ color: 'var(--ink)' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Place of Supply: </span>
                            <strong>[{gstinValidated.stateCode}] – {gstinValidated.stateName}</strong>
                          </div>
                          <div style={{ color: 'var(--ink)' }}>
                            <span style={{ color: 'var(--text-muted)' }}>PAN: </span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{gstinValidated.embeddedPan}</span>
                            {gstinValidated.panMatch === true && (
                              <span style={{ color: 'var(--moss-text)', marginLeft: '6px' }}>✓ matches PAN field</span>
                            )}
                            {gstinValidated.panMatch === false && (
                              <span style={{ color: 'var(--clay-text)', marginLeft: '6px' }}>✗ mismatch — PAN field has {f.pan_number.toUpperCase()}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ color: 'var(--clay-text)', fontWeight: 600 }}>✗ {gstinValidated.msg}</div>
                      )}
                      <button
                        type="button"
                        onClick={handleValidate}
                        style={{
                          background: 'none', border: 'none', padding: '6px 0 0',
                          fontSize: '11px', color: 'var(--action)', cursor: 'pointer',
                          fontWeight: 600, display: 'block', textDecoration: 'underline',
                        }}
                      >
                        Verify Again
                      </button>
                    </div>
                  )}
                </Field>
              )
            })()}
            <FileUpload id="gst_cert"
              label="GST Registration Certificate"
              required
              error={liveErrors.gst_cert}
              existing={gstCertPath}
              file={gstCertFile}
              onChange={setGstCertFile}
            />
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════
          SECTION 2 — Attachments (tailored per Type of Organisation, per
          Finance's Vendor Document Requirements sheet)
      ══════════════════════════════════════ */}
      <div style={card}>
        <SectionHeader
          number="2"
          title="Attachments"
          subtitle={f.org_type ? `Documents required for ${f.org_type}` : 'Select Type of Organisation above to see exactly what’s needed'}
        />

        <div style={grid2}>
          <div style={full}>
            <FileUpload id="cheque"
              label="Cancelled Cheque or Bank Statement / Passbook"
              required={!isEdit}
              error={liveErrors.cheque}
              existing={chequePath}
              file={chequeFile}
              onChange={handleChequeFile}
            />
            {chequeOcrLoading && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '-10px', marginBottom: '14px' }}>
                Reading document — auto-filling bank and address details…
              </div>
            )}
          </div>
          <div style={full}>
            <FileUpload id="pan_copy"
              label="PAN Copy"
              required={!isEdit}
              error={liveErrors.pan_copy}
              existing={panPath}
              file={panFile}
              onChange={setPanFile}
            />
          </div>
          {!isIndividual && (
            <div style={full}>
              <FileUpload id="reg_cert"
                label={incorporationDocLabel(f.org_type)}
                required={!isEdit}
                error={liveErrors.reg_cert}
                existing={regCertPath}
                file={regCertFile}
                onChange={setRegCertFile}
              />
            </div>
          )}
        </div>

        {isIndividual && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'var(--taupe-100)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: '4px' }}>
            No separate registration document is needed for {f.org_type} — the Aadhaar copy above (in Organisation Details) covers this per Finance's requirements.
          </div>
        )}

        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Accepted formats: PDF, JPG, PNG, JPEG · Max 10 MB per file
        </div>
      </div>

      {/* ══════════════════════════════════════
          SECTION 3 — Contact & Registration
      ══════════════════════════════════════ */}
      <div style={card}>
        <SectionHeader number="3" title="Contact & Registration" subtitle="Point of contact and legal registration" />
        <div style={grid2}>
          <div style={full}>
            <Field id="contact_person" label="Contact Person" required error={liveErrors.contact_person} hint="Letters and spaces only">
              <input
                type="text"
                value={f.contact_person}
                onChange={e => setF(p => ({ ...p, contact_person: e.target.value.replace(/[^A-Za-z ]/g, '') }))}
                placeholder="Full name"
                style={inputStyle(!!liveErrors.contact_person)}
              />
            </Field>
          </div>
          <Field id="phone" label="Telephone Number" required error={liveErrors.phone}
            hint={phonePrefix === '+91' ? 'Mobile number' : 'Landline — include STD code'}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <div style={{ display: 'flex', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', flexShrink: 0 }}>
                {['+91', ''].map(p => (
                  <div
                    key={p || 'other'}
                    onClick={() => { setPhonePrefix(p); setF(prev => ({ ...prev, phone: '' })) }}
                    style={{
                      height: '36px', padding: '0 10px', display: 'flex', alignItems: 'center', cursor: 'pointer',
                      fontSize: '13px', fontWeight: 600,
                      background: phonePrefix === p ? 'var(--action)' : 'var(--taupe-50)',
                      color: phonePrefix === p ? 'var(--surface-card)' : 'var(--ink)',
                    }}
                  >
                    {p || 'Landline'}
                  </div>
                ))}
              </div>
              <input
                type="tel"
                value={f.phone}
                onChange={e => setF(p => ({
                  ...p,
                  phone: phonePrefix === '+91' ? e.target.value.replace(/\D/g, '') : e.target.value.replace(/[^0-9\- ]/g, ''),
                }))}
                placeholder={phonePrefix === '+91' ? '9876543210' : 'e.g. 080-12345678'}
                maxLength={phonePrefix === '+91' ? 10 : 15}
                style={{ flex: 1, ...inputStyle(!!liveErrors.phone) }}
              />
            </div>
          </Field>
          <Field id="email" label="PoC Email ID" required error={liveErrors.email}>
            <Inp field="email" f={f} setF={setF} placeholder="contact@organisation.com" type="email" err={!!liveErrors.email} />
          </Field>
          <Field label="Organisation Website">
            <Inp field="website" f={f} setF={setF} placeholder="https://organisation.com" />
          </Field>
          <Field id="org_registration_number" label="Organisation Registration Number" required error={liveErrors.org_registration_number}
            hint={isIndividual ? 'Individual vendors do not have a registration number' : undefined}>
            <Inp field="org_registration_number" f={f} setF={setF} placeholder="e.g. U74999KA2020PTC…" err={!!liveErrors.org_registration_number} mono disabled={isIndividual} />
          </Field>
          <Field label="Organisation Registration State"
            hint="Fill this to unlock the GSTIN field">
            <Sel field="org_registration_state" f={f} setF={setF} options={INDIAN_STATES} placeholder="Select state…" />
          </Field>
          <div style={full}>
            <Field id="is_related_to_org" label="Is this vendor you are creating related to or connected with you personally?" required error={liveErrors.is_related_to_org}>
              <YesNo
                value={f.is_related_to_org}
                onChange={v => setF(p => ({ ...p, is_related_to_org: v }))}
              />
            </Field>
          </div>
          {f.is_related_to_org === true && (
            <div style={full}>
              <Field id="related_org_description" label="Describe the relationship / connection" required error={liveErrors.related_org_description}>
                <textarea
                  value={f.related_org_description}
                  onChange={e => setF(p => ({ ...p, related_org_description: e.target.value }))}
                  placeholder="e.g. Vendor is owned by a family member of an employee"
                  rows={3}
                  style={{
                    width: '100%', border: `1px solid ${liveErrors.related_org_description ? 'var(--clay-text)' : 'var(--taupe-400)'}`,
                    borderRadius: 'var(--radius-sm)', padding: '10px', fontSize: '13px', color: 'var(--ink)',
                    outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
                    background: 'var(--surface-card)',
                  }}
                />
              </Field>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════
          SECTION 4 — Bank Account Details
      ══════════════════════════════════════ */}
      <div style={card}>
        <SectionHeader number="4" title="Bank Account Details" subtitle="Beneficiary details for payment processing" />
        <div style={grid2}>
          <div style={full}>
            <Field id="beneficiary_name" label="Beneficiary Name" required error={liveErrors.beneficiary_name}>
              <Inp field="beneficiary_name" f={f} setF={setF} placeholder="Name as on bank account" err={!!liveErrors.beneficiary_name} />
            </Field>
          </div>
          <Field id="account_number" label="Account Number" required error={liveErrors.account_number}>
            <Inp field="account_number" f={f} setF={setF} placeholder="" mono err={!!liveErrors.account_number} />
          </Field>
          <Field id="ifsc_code" label="IFSC Code" required error={liveErrors.ifsc_code}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                value={f.ifsc_code}
                onChange={e => {
                  const code = e.target.value.toUpperCase()
                  setF(p => ({ ...p, ifsc_code: code }))
                  // Auto-fill the moment a valid 11-character IFSC is typed
                  // (or pasted) — no blur/button needed. Re-fires the same
                  // way if the code is later changed to a different valid
                  // one, so bank/branch stay in sync with whatever's typed.
                  if (IFSC_RE.test(code)) lookupIFSC(code)
                }}
                placeholder="SBIN0001234"
                maxLength={11}
                style={{ flex: 1, ...inputStyle(!!liveErrors.ifsc_code, { fontFamily: 'monospace' }) }}
              />
              {ifscLooking && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', alignSelf: 'center', flexShrink: 0 }}>Looking up…</div>
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>Bank and branch auto-fill on valid IFSC</div>
            {ifscLookupFailed && (
              <div style={{ fontSize: '11px', color: 'var(--gold-text)', marginTop: '3px' }}>
                Auto lookup unavailable — please enter bank name and branch manually.
              </div>
            )}
          </Field>
          <Field id="bank_name" label="Bank Name" required error={liveErrors.bank_name}>
            <Inp field="bank_name" f={f} setF={setF} placeholder="e.g. State Bank of India" disabled={branchLocked} err={!!liveErrors.bank_name} />
            {branchLocked && (
              <span
                onClick={() => setBranchLocked(false)}
                style={{ fontSize: '11px', color: 'var(--action)', cursor: 'pointer', textDecoration: 'underline', display: 'inline-block', marginTop: '4px' }}
              >
                Edit manually
              </span>
            )}
          </Field>
          <div style={full}>
            <Field id="branch" label="Branch" required error={liveErrors.branch}>
              <Inp field="branch" f={f} setF={setF} placeholder="e.g. MG Road, Bangalore" disabled={branchLocked} err={!!liveErrors.branch} />
              {branchLocked && (
                <span
                  onClick={() => setBranchLocked(false)}
                  style={{ fontSize: '11px', color: 'var(--action)', cursor: 'pointer', textDecoration: 'underline', display: 'inline-block', marginTop: '4px' }}
                >
                  Edit manually
                </span>
              )}
            </Field>
          </div>
        </div>
      </div>

      {/* Error summary */}
      {saveError && (
        <div style={{ background: 'var(--clay-bg)', border: '1px solid var(--clay-border)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: 'var(--clay-text)' }}>
          {saveError}
        </div>
      )}
      {draftSavedAt && (
        <div style={{ background: 'var(--moss-bg)', border: '1px solid var(--moss-border)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: 'var(--moss-text)' }}>
          Draft saved ✓ {draftSavedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      {attemptedMode && Object.values(liveErrors).some(v => typeof v === 'string') && (
        <div style={{ background: 'var(--clay-bg)', border: '1px solid var(--clay-border)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--clay-text)', marginBottom: '6px' }}>Please fix the following before submitting:</div>
          <ul style={{ margin: 0, paddingLeft: '16px' }}>
            {Object.entries(liveErrors).filter(([, v]) => typeof v === 'string').map(([key, msg]) => (
              <li
                key={key}
                onClick={() => scrollToField(key)}
                style={{ fontSize: '12px', color: 'var(--clay-text)', marginBottom: '2px', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
        <button
          onClick={handleSubmit}
          disabled={saving || savingDraft}
          style={{
            height: '46px', padding: '0 36px',
            background: saving ? 'var(--text-muted)' : 'var(--action)',
            color: 'var(--surface-card)', border: 'none', borderRadius: 'var(--radius-md)',
            fontSize: '14px', fontWeight: 700, cursor: saving ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Submitting…' : isEdit ? 'Resubmit for Approval' : 'Submit for Approval'}
        </button>
        {(!isEdit) && (
          <button
            onClick={handleSaveDraft}
            disabled={saving || savingDraft}
            style={{
              height: '46px', padding: '0 24px',
              background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-md)',
              fontSize: '14px', fontWeight: 600, cursor: savingDraft ? 'default' : 'pointer',
            }}
          >
            {savingDraft ? 'Saving…' : 'Save as Draft'}
          </button>
        )}
        {!hideBack && (
          <button
            onClick={onBack}
            style={{ height: '46px', padding: '0 24px', background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-md)', fontSize: '14px', cursor: 'pointer' }}
          >
            Cancel
          </button>
        )}
      </div>

      {showPanDupModal && (
        <PanDuplicateModal
          vendors={panDuplicates}
          onAcknowledge={() => { setPanDupAcknowledged(true); setShowPanDupModal(false) }}
          onClose={() => setShowPanDupModal(false)}
        />
      )}

      {/* Live checklist — lets the submitter see what's still missing before they hit Submit */}
      <div style={{
        position: 'fixed', bottom: '24px', right: '24px', zIndex: 40,
        background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)',
        padding: '14px 16px', boxShadow: '0 4px 16px rgba(54, 32, 26,0.12)', minWidth: '190px',
      }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          Before you submit
        </div>
        {checklist.map(c => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginBottom: '6px', color: c.done ? 'var(--moss-text)' : 'var(--text-muted)' }}>
            <span>{c.done ? '✓' : '○'}</span>
            <span>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
