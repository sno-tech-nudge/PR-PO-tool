import { useState, useEffect, useLayoutEffect, useRef, createContext, useContext } from 'react'
import { supabase } from '../../lib/supabase'
import { getFiscalYearPrefix, PAN_FORMAT_RE, GSTIN_FORMAT_RE } from '../../lib/formCalc'
import { NATURE_OF_BUSINESS_OPTIONS } from '../../lib/vendorData'
import { extractChequeDetails, extractPanCardDetails, extractGstCertDetails, extractMsmeCertDetails, extractRegistrationCertDetails } from '../../lib/claude'
import { toInputDate } from '../../lib/dateFormat'
import { imageFileToJpegBase64, pdfPageToBase64 } from '../../lib/receiptImage'
import PanDuplicateModal from './PanDuplicateModal'
import { sendVendorEmail } from '../../lib/vendorEmail'
import { getFinanceEmails } from '../../lib/auth'
import { logActivity } from '../../lib/activityLog'
import { notifyVendorSubmitted } from '../../lib/vendorNotifications'
import { useFileDrop } from '../../hooks/useFileDrop'
import { useFormTour } from '../../hooks/useFormTour'
import GuidedTour, { TourButton } from '../shared/GuidedTour'
import { VENDOR_TOUR } from '../../lib/tours'
import InfoTip from '../shared/InfoTip'
import VoiceInputButton from '../shared/VoiceInputButton'

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

// PAN/GSTIN patterns now live in formCalc.js (shared with ExpenseDetails.jsx's
// own GSTIN field) — kept as same-named local aliases so every existing
// reference below (PAN_RE/GSTIN_RE) needs no further change.
const PAN_RE     = PAN_FORMAT_RE
const GSTIN_RE   = GSTIN_FORMAT_RE
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

// Hint text renders AFTER the input, not between the label and input — two
// Fields sitting side by side in the same grid row (e.g. Type of
// Organisation next to Nature of Business) must have their inputs line up
// regardless of which one happens to carry a hint, and a hint wrapping to
// two lines used to shove that field's input down past its neighbour's.
// Which document (if any) filled a field in — the label renders a small
// "from PAN card" tag next to it, for as long as the value is still the one
// the document supplied (editing it by hand removes the tag).
const AutoFillContext = createContext(null)

function Field({ id, label, error, required, hint, info, children, tight }) {
  const autoFrom = useContext(AutoFillContext)?.(id)
  return (
    <div id={id} style={{ marginBottom: tight ? '6px' : '18px', scrollMarginTop: '80px' }}>
      {label && (
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginBottom: '5px' }}>
        <span>{label}{required && <span style={{ color: 'var(--clay-text)', marginLeft: '2px' }}>*</span>}</span>
        {info && <InfoTip text={info} />}
        {autoFrom && (
          <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 600, color: 'var(--moss-text)', background: 'var(--moss-bg)', border: '1px solid var(--moss-border)', borderRadius: 'var(--radius-sm)', padding: '1px 6px', whiteSpace: 'nowrap' }}>
            ✓ from {autoFrom}
          </span>
        )}
      </label>
      )}
      {children}
      {hint && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{hint}</div>}
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

// `filter` strips characters live as the person types (e.g. digits-only for
// an account number) — the same guardrail pattern as phone/Aadhaar below,
// pulled onto the shared input so any field can opt in with one prop
// instead of hand-rolling its own onChange.
function Inp({ field, f, setF, placeholder, type = 'text', disabled, mono, err, upper, maxLength, filter, onBlur }) {
  return (
    <input
      type={type}
      value={f[field]}
      onChange={e => {
        if (disabled) return
        let v = filter ? filter(e.target.value) : e.target.value
        if (upper) v = v.toUpperCase()
        setF(prev => ({ ...prev, [field]: v }))
      }}
      onBlur={onBlur}
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

// `disabled` + `hint` let a toggle be visible but not clickable yet — used
// by GSTIN below so the person sees the option exists (rather than it just
// not being there) but can't turn it on until its real prerequisites are
// filled, with the hint explaining exactly what's still needed instead of
// letting them flip it on into a half-broken, disabled-input card.
function Toggle({ label, checked, onChange, disabled, hint }) {
  return (
    <div>
      <label style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        cursor: disabled ? 'not-allowed' : 'pointer', padding: '12px 16px',
        background: disabled ? 'var(--taupe-100)' : (checked ? 'var(--action-bg)' : 'var(--taupe-50)'),
        border: `1px solid ${checked ? 'var(--taupe-300)' : 'var(--taupe-200)'}`,
        borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: 500,
        color: disabled ? 'var(--text-muted)' : (checked ? 'var(--action)' : 'var(--ink)'),
        userSelect: 'none', transition: '0.15s',
      }}>
        <div style={{
          width: '36px', height: '20px', borderRadius: 'var(--radius-lg)',
          background: disabled ? 'var(--taupe-300)' : (checked ? 'var(--action)' : 'var(--taupe-400)'),
          position: 'relative', transition: '0.2s', flexShrink: 0,
        }}>
          <div style={{
            position: 'absolute', top: '2px',
            left: checked ? '18px' : '2px',
            width: '16px', height: '16px', borderRadius: '50%',
            background: 'var(--surface-card)', transition: '0.2s',
          }} />
        </div>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} style={{ display: 'none' }} />
        {label}
      </label>
      {disabled && hint && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', paddingLeft: '2px' }}>{hint}</div>
      )}
    </div>
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

function SectionHeader({ number, title, subtitle, info }) {
  return (
    <div style={{ marginBottom: '22px', paddingBottom: '14px', borderBottom: '2px solid var(--taupe-100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '30px', height: '30px', borderRadius: '50%', background: 'var(--action)',
          color: 'var(--surface-card)', fontSize: '13px', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{number}</div>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center' }}>
            {title}
            {info && <InfoTip text={info} />}
          </div>
          {subtitle && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{subtitle}</div>}
        </div>
      </div>
    </div>
  )
}

function FileUpload({ id, label, required, error, existing, file, onChange, accept = 'image/*,.pdf', compact }) {
  const { dragging, dropProps } = useFileDrop({ accept, onFiles: files => onChange(files[0] || null) })
  const hasFile = !!file
  const status = dragging
    ? 'Drop the file here'
    : file ? `✓ ${file.name}`
    : existing ? '✓ File on record' + (compact ? '' : ' — click to replace or drag & drop')
    : compact ? 'Drag & drop or' : 'Click to select file (PDF or image) or drag & drop'
  return (
    <Field id={id} label={label} required={required} error={error} tight={compact}>
      <div {...dropProps} style={{
        border: `${compact ? 1.5 : 2}px dashed ${dragging ? 'var(--action)' : error ? 'var(--clay-text)' : file ? 'var(--moss-text)' : 'var(--taupe-400)'}`,
        borderRadius: 'var(--radius-md)', padding: compact ? '9px 12px' : '16px', background: dragging ? 'var(--action-bg)' : file ? 'var(--moss-bg)' : 'var(--taupe-50)',
        cursor: 'pointer', transition: '0.15s',
      }}>
        <label style={compact
          ? { cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }
          : { cursor: 'pointer', display: 'block' }}>
          <div style={{
            fontSize: compact ? '12px' : '12px', color: file ? 'var(--moss-text)' : 'var(--text-muted)',
            ...(compact
              ? { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
              : { textAlign: 'center', marginBottom: '6px' }),
          }}>
            {status}
          </div>
          <input
            type="file"
            accept={accept}
            onChange={e => onChange(e.target.files?.[0] || null)}
            style={{ display: 'none' }}
          />
          {(!hasFile || compact) && (
            <div style={compact ? { flexShrink: 0 } : { textAlign: 'center' }}>
              <span style={{
                display: 'inline-block', padding: compact ? '4px 12px' : '5px 14px',
                background: 'var(--surface-card)', border: '1px solid var(--taupe-400)',
                borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--ink)', fontWeight: 500,
              }}>
                {hasFile || existing ? 'Replace' : 'Select file'}
              </span>
            </div>
          )}
        </label>
      </div>
      {existing && !file && !compact && (
        <div style={{ fontSize: '11px', color: 'var(--moss-text)', marginTop: '4px' }}>File on record — re-upload to replace.</div>
      )}
    </Field>
  )
}

// "Review before submitting" — shown once validation and every duplicate
// check above has already passed, so this is purely a last plain-English
// recap before the real insert fires (from "Confirm & Submit" only). Same
// hand-rolled modal-shell recipe as PanDuplicateModal (translucent fixed
// backdrop + a centered card, closed by clicking outside or the back link).
function VendorReviewModal({ f, attachmentCount, onConfirm, onClose }) {
  const maskedAccount = f.account_number
    ? `••••${f.account_number.slice(-4)}`
    : '—'
  const rows = [
    ['Organisation', f.org_name || '—'],
    ['PAN', f.pan_number || '—'],
    ...(f.is_gstin_registered ? [['GSTIN', f.gstin || '—']] : []),
    ['Beneficiary Name', f.beneficiary_name || '—'],
    ['Account Number', maskedAccount],
    ['IFSC / Bank / Branch', [f.ifsc_code, f.bank_name, f.branch].filter(Boolean).join(' · ') || '—'],
    ['Attachments', `${attachmentCount} file${attachmentCount === 1 ? '' : 's'} attached`],
  ]
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface-card)', width: '100%', maxWidth: '480px', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--taupe-200)' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Review before submitting</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Double-check these details — once submitted, this goes to Finance for approval.
          </div>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {rows.map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--taupe-100)' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 600, textAlign: 'right' }}>{val}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', padding: '16px 20px', borderTop: '1px solid var(--taupe-200)' }}>
          <button
            onClick={onConfirm}
            style={{
              height: '42px', padding: '0 20px',
              background: 'var(--action)', color: 'var(--surface-card)', border: 'none', borderRadius: 'var(--radius-md)',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Confirm & Submit
          </button>
          <button
            onClick={onClose}
            style={{
              height: '42px', padding: '0 20px',
              background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-md)',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Go Back and Edit
          </button>
        </div>
      </div>
    </div>
  )
}

// Atomic — see generatePRNumber's comment in PRForm.jsx; same fix, same reason.
async function generateVendorId() {
  const fy = getFiscalYearPrefix()
  const { data, error } = await supabase.rpc('next_doc_number', { kind: 'VR', fy_prefix: fy })
  if (error) throw error
  return data
}

// "Documents you'll need" — a live checklist at the top of the form so
// nobody gets halfway through and then discovers a missing document. Items
// tick off as each one is attached; conditional ones (GST / MSME) only count
// once the vendor says they have that registration.
function DocsChecklist({ items, open, onToggle }) {
  const needed = items.filter(it => it.applies)
  const got = needed.filter(it => it.have).length
  return (
    <div data-tour-anchor="vendor-docs" style={{
      background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)',
      padding: open ? '18px 22px' : '12px 22px', marginBottom: '16px',
    }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Documents you&apos;ll need</span>
        <span style={{ fontSize: '12px', color: got === needed.length && needed.length ? 'var(--moss-text)' : 'var(--text-muted)' }}>
          {got} of {needed.length} attached
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>{open ? 'Hide ▴' : 'Show ▾'}</span>
      </button>
      {open && (
        <>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '8px 0 14px', lineHeight: 1.5 }}>
            Keep these ready. Attach them in the Documents panel and we&apos;ll read each one and fill in the form for you. If something can&apos;t be read,
            you&apos;ll be told exactly which detail to type in yourself.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {items.map(it => (
              <div key={it.key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', opacity: it.have || it.applies ? 1 : 0.65 }}>
                <span style={{
                  width: '20px', height: '20px', flexShrink: 0, marginTop: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 700, borderRadius: 'var(--radius-sm)',
                  background: it.have ? 'var(--moss-bg)' : 'var(--taupe-50)', color: it.have ? 'var(--moss-text)' : 'var(--taupe-400)',
                  border: `1px solid ${it.have ? 'var(--moss-border)' : 'var(--taupe-200)'}`,
                }}>{it.have ? '✓' : ''}</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                    {it.label}
                    {!it.applies && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> — {it.when}</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>Fills in: {it.fills}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '14px' }}>
            Accepted formats: PDF, JPG, PNG, JPEG · Max 10 MB per file · You can also drag &amp; drop a file onto any upload box.
          </div>
        </>
      )}
    </div>
  )
}

// Broad panel-toggle icon (a window with a side panel and an arrow) for
// folding the Documents panel; up/down chevron when it stacks above the form.
function PanelToggleIcon({ open, stacked }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (stacked) {
    return (
      <svg width="26" height="16" viewBox="0 0 26 16" aria-hidden="true">
        <path {...common} d={open ? 'M6 11 L13 4 L20 11' : 'M6 5 L13 12 L20 5'} />
      </svg>
    )
  }
  return (
    <svg width="30" height="20" viewBox="0 0 30 20" aria-hidden="true">
      <rect {...common} x="1.5" y="1.5" width="27" height="17" rx="3" />
      <line {...common} x1="11" y1="1.5" x2="11" y2="18.5" />
      <path {...common} d={open ? 'M20 6.5 L16 10 L20 13.5' : 'M16 6.5 L20 10 L16 13.5'} />
    </svg>
  )
}

// One document in the Documents panel: its upload, what it filled in (or
// couldn't), and a shortcut to the part of the form it feeds.
const SLOT_CHIP = {
  empty:    { label: 'Not attached',      bg: 'var(--taupe-100)', color: 'var(--text-muted)' },
  reading:  { label: 'Reading…',          bg: 'var(--action-bg)', color: 'var(--action)' },
  attached: { label: 'Attached',          bg: 'var(--moss-bg)',   color: 'var(--moss-text)' },
  read:     { label: 'Read ✓',            bg: 'var(--moss-bg)',   color: 'var(--moss-text)' },
  partial:  { label: 'Check ⚠',           bg: 'var(--gold-bg)',   color: 'var(--gold-text)' },
  manual:   { label: 'Enter manually ⚠',  bg: 'var(--gold-bg)',   color: 'var(--gold-text)' },
}

function slotStatus(have, loading, note) {
  if (loading) return 'reading'
  if (!have) return 'empty'
  if (!note) return 'attached'
  if (note.missing.length === 0) return 'read'
  return note.read.length === 0 ? 'manual' : 'partial'
}

function DocSlot({ title, required, fills, status, onGoTo, goLabel = 'Show in form', children }) {
  const chip = SLOT_CHIP[status]
  return (
    <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', padding: '11px 12px', marginBottom: '10px', background: 'var(--surface-card)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '2px' }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: '13px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.35 }}>
          {title}{required && <span style={{ color: 'var(--clay-text)', marginLeft: '2px' }}>*</span>}
        </div>
        <span style={{ flexShrink: 0, fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--radius-sm)', background: chip.bg, color: chip.color, whiteSpace: 'nowrap' }}>
          {chip.label}
        </span>
      </div>
      {fills && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.4 }}>Fills in: {fills}</div>}
      {children}
      {status !== 'empty' && status !== 'reading' && onGoTo && (
        <button
          type="button"
          onClick={onGoTo}
          style={{ background: 'none', border: 'none', padding: 0, fontSize: '12px', fontWeight: 600, color: 'var(--action)', cursor: 'pointer', textDecoration: 'underline' }}
        >
          {goLabel} →
        </button>
      )}
    </div>
  )
}

function MutedSlot({ title, text }) {
  return (
    <div style={{ border: '1px dashed var(--taupe-200)', borderRadius: 'var(--radius-md)', padding: '9px 12px', marginBottom: '10px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>{title}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{text}</div>
    </div>
  )
}

// Scrolls a form section or field into view and flashes it briefly, so it is
// obvious where a document's details landed.
function jumpTo(id) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const prev = el.style.boxShadow
  el.style.transition = 'box-shadow 0.3s'
  el.style.boxShadow = '0 0 0 3px var(--action)'
  setTimeout(() => { el.style.boxShadow = prev }, 1600)
}

// A company's CIN carries its state of registration as two letters at
// positions 7-8 (e.g. U74999KA2020PTC123456 -> KA). Used as a fallback when
// the certificate's own "state" couldn't be read.
const CIN_STATE_CODES = {
  AN: 'Andaman and Nicobar Islands', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar',
  CH: 'Chandigarh', CT: 'Chhattisgarh', CG: 'Chhattisgarh', DL: 'Delhi', DN: 'Dadra and Nagar Haveli and Daman and Diu',
  DD: 'Dadra and Nagar Haveli and Daman and Diu', GA: 'Goa', GJ: 'Gujarat', HP: 'Himachal Pradesh', HR: 'Haryana',
  JH: 'Jharkhand', JK: 'Jammu and Kashmir', KA: 'Karnataka', KL: 'Kerala', LD: 'Lakshadweep', MH: 'Maharashtra',
  ML: 'Meghalaya', MN: 'Manipur', MP: 'Madhya Pradesh', MZ: 'Mizoram', NL: 'Nagaland', OR: 'Odisha', OD: 'Odisha',
  PB: 'Punjab', PY: 'Puducherry', RJ: 'Rajasthan', SK: 'Sikkim', TG: 'Telangana', TS: 'Telangana', TN: 'Tamil Nadu',
  TR: 'Tripura', UP: 'Uttar Pradesh', UK: 'Uttarakhand', UR: 'Uttarakhand', WB: 'West Bengal', LA: 'Ladakh',
}

// Maps a state name read off a document ("Karnataka", "KARNATAKA ") onto the
// exact option text this form's state dropdowns use.
function matchIndianState(name) {
  if (!name) return null
  const n = String(name).toLowerCase().trim()
  return INDIAN_STATES.find(s => s.toLowerCase() === n)
    || INDIAN_STATES.find(s => s.toLowerCase().includes(n) || n.includes(s.toLowerCase().split(' ')[0])) || null
}

// What a document upload managed (or failed) to read — shown right under the
// upload so nobody has to guess whether auto-fill worked. `read` / `missing`
// are human labels; `where` says which section to fill in by hand.
function DocNote({ note, where }) {
  if (!note) return null
  const { read, missing } = note
  const box = (tone, children) => (
    <div style={{
      fontSize: '11px', lineHeight: 1.5, marginTop: '4px', marginBottom: '8px', padding: '7px 10px',
      borderRadius: 'var(--radius-sm)', fontWeight: 600,
      color: `var(--${tone}-text)`, background: `var(--${tone}-bg)`, border: `1px solid var(--${tone}-border)`,
    }}>{children}</div>
  )
  if (read.length === 0) {
    return box('gold', <>⚠ We couldn't read this document automatically (the photo may be unclear or cropped). Please enter {missing.join(', ')} manually {where}, or re-upload a clearer copy.</>)
  }
  if (missing.length === 0) {
    return box('moss', <>✓ Read from this document: {read.join(', ')}. Please double-check {read.length === 1 ? 'it' : 'them'} {where}.</>)
  }
  return box('gold', <>✓ Read: {read.join(', ')}. ⚠ Couldn't read: {missing.join(', ')} — please enter {missing.length === 1 ? 'it' : 'them'} manually {where}.</>)
}

// ─── main component ─────────────────────────────────────────────────────────────
export default function VendorForm({ user, existingVendor = null, onSaved, onBack, hideBack = false, isGuestSubmission = false }) {
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
  const [panOcrLoading, setPanOcrLoading] = useState(false)
  // The PAN string OCR'd off the uploaded PAN copy, or null before a file is
  // uploaded / if extraction found nothing readable. Kept separately from
  // `f.pan_number` (rather than collapsed into a one-time decision at upload
  // time) so the match/mismatch indicator stays live no matter which of the
  // two — the typed number or the uploaded file — changes second.
  const [panExtracted, setPanExtracted] = useState(null)
  const [pincodeLooking, setPincodeLooking] = useState(false)
  const [branchLocked, setBranchLocked]     = useState(false)
  const [gstCertOcrLoading, setGstCertOcrLoading] = useState(false)
  const [msmeCertOcrLoading, setMsmeCertOcrLoading] = useState(false)
  // Same "extracted once, compared live every render" pattern as panExtracted
  // above, for the other three document uploads — each re-upload (including
  // replacing an already-uploaded file) re-runs OCR and refreshes these, so
  // swapping in a different document always re-checks it against whatever is
  // currently typed, instead of silently doing nothing because a value was
  // already filled in. Cheque/bank isn't part of this — see handleChequeFile,
  // which always overwrites from whichever cheque was uploaded last instead,
  // since the cheque is the sole source for those fields.
  const [gstExtracted, setGstExtracted] = useState(null) // string | null
  // Per-document result of the auto-read: { read: [labels], missing: [labels] }
  const [docNotes, setDocNotes] = useState({})
  const setDocNote = (key, read, missing) => setDocNotes(p => ({ ...p, [key]: { read, missing } }))
  const clearDocNote = key => setDocNotes(p => { const n = { ...p }; delete n[key]; return n })
  const [regCertOcrLoading, setRegCertOcrLoading] = useState(false)
  const [regNoExtracted, setRegNoExtracted] = useState(null) // registration number read off the certificate
  const [msmeExtracted, setMsmeExtracted] = useState(null) // {registration_number, category} | null
  // '+91' for a mobile number, '' for a landline/other number entered as-is
  // (with STD code). Not persisted separately — derived from the stored
  // phone value on edit, since a 10-digit number is unambiguously a mobile.
  const [phonePrefix, setPhonePrefix] = useState(
    existingVendor?.phone && !PHONE_RE.test(existingVendor.phone.replace(/[\s-]/g, '')) ? '' : '+91'
  )

  const [panDuplicates, setPanDuplicates]     = useState([])
  const [showPanDupModal, setShowPanDupModal] = useState(false)
  const [panDupAcknowledged, setPanDupAcknowledged] = useState(false)

  // Same "warn, never block" duplicate pattern as PAN above, run independently
  // against organisation name (loose/partial match) and account number (exact)
  // — each with its own state so acknowledging one never dismisses another.
  const [orgNameDuplicates, setOrgNameDuplicates] = useState([])
  const [showOrgNameDupModal, setShowOrgNameDupModal] = useState(false)
  const [orgNameDupAcknowledged, setOrgNameDupAcknowledged] = useState(false)
  const [acctNumDuplicates, setAcctNumDuplicates] = useState([])
  const [showAcctNumDupModal, setShowAcctNumDupModal] = useState(false)
  const [acctNumDupAcknowledged, setAcctNumDupAcknowledged] = useState(false)

  // Lets the PAN format error show the moment someone leaves the field,
  // instead of only after a first Save/Submit attempt (attemptedMode below).
  // GSTIN already has its own always-live validity banner (gstinValidation,
  // see below) so it doesn't need this same treatment.
  const [panTouched, setPanTouched] = useState(false)

  // Gate for the new "Review before submitting" confirm step — shown only
  // once every validation/duplicate check already passes; the real insert
  // fires from its own "Confirm & Submit" button, not from the form's Submit.
  const [showReviewModal, setShowReviewModal] = useState(false)
  const tour = useFormTour('vendor')
  // The "Documents you'll need" list is collapsed unless the guided tour is on
  // it; the Documents panel (attachments + what each one filled in) can be
  // collapsed too.
  const [docsOpen, setDocsOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  // Viewport width from which the panel sits beside the form: panel + form
  // + the 220px sidebar (not present on the public vendor link).
  const wideNeeded = isGuestSubmission ? 960 : 1180
  const [wide, setWide] = useState(() => window.innerWidth >= wideNeeded)
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= wideNeeded)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [wideNeeded])

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
  // derived: live match/mismatch between the typed PAN Number and whatever
  // the uploaded PAN copy OCR'd to — recomputed every render (not a one-time
  // check at upload time) so it stays right no matter which field changes
  // after the other.
  // Shows the moment the PAN field is blurred with something non-empty and
  // malformed in it — independent of attemptedMode/liveErrors above, so this
  // doesn't wait for a Save/Submit click first.
  const panFormatError = panTouched && f.pan_number && !PAN_RE.test(f.pan_number.toUpperCase().trim())
    ? 'Invalid PAN (e.g. ABCDE1234F)'
    : null
  const panMatchStatus = panExtracted && PAN_RE.test(f.pan_number.toUpperCase().trim())
    ? (panExtracted === f.pan_number.toUpperCase().trim() ? 'match' : 'mismatch')
    : null
  // derived: GSTIN validation recomputed live from whatever's typed — no
  // button, no stale result left over from a previous value. parseGSTIN is a
  // pure regex check (no network call), so this is cheap to run every
  // render. Only surfaces an "invalid" result once all 15 characters are in,
  // so it doesn't flash an error while the person is still mid-typing.
  const gstinParsed = parseGSTIN(f.gstin)
  const gstinValidation = !f.gstin ? null
    : gstinParsed
      ? { ok: true, ...gstinParsed, panMatch: PAN_RE.test(f.pan_number.toUpperCase().trim()) ? gstinParsed.embeddedPan === f.pan_number.toUpperCase().trim() : null }
      : (f.gstin.length === 15 ? { ok: false, msg: 'Invalid GSTIN format. Check and re-enter.' } : null)
  // derived: live match/mismatch between the typed GSTIN and whatever the
  // uploaded GST certificate OCR'd to — same pattern as panMatchStatus above.
  const gstCertMatchStatus = gstExtracted && f.gstin.trim()
    ? (gstExtracted === f.gstin.toUpperCase().trim() ? 'match' : 'mismatch')
    : null
  // derived: whether the MSME certificate's extracted registration number
  // shows up anywhere in the (free-text) details field — a substring check
  // rather than an exact-match, since that field also holds whatever else
  // the person has typed alongside the auto-filled lines.
  const msmeMismatch = !!(msmeExtracted?.registration_number && f.msme_details.trim()
    && !f.msme_details.toUpperCase().includes(msmeExtracted.registration_number.toUpperCase()))
  const isIndividual = AADHAAR_REQUIRED_ORG_TYPES.includes(f.org_type)
  const norm = v => String(v || '').toUpperCase().replace(/\s+/g, '')
  const regNoMismatch = !!(regNoExtracted && f.org_registration_number.trim() && norm(f.org_registration_number) !== norm(regNoExtracted))

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

  // Once the GSTIN parses successfully, its embedded state code can fill
  // Organisation Registration State when that's still blank — same
  // auto-fill this used to do inside the (now removed) manual Validate
  // button, just running automatically as soon as validation succeeds.
  useEffect(() => {
    if (!gstinParsed || f.org_registration_state) return
    const matched = INDIAN_STATES.find(s =>
      s.toLowerCase().includes(gstinParsed.stateName.toLowerCase()) ||
      gstinParsed.stateName.toLowerCase().includes(s.toLowerCase().split(' ')[0])
    )
    if (matched) setF(p => ({ ...p, org_registration_state: matched }))
  }, [gstinParsed, f.org_registration_state])

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

  // Which document filled which field: each OCR handler snapshots the form
  // just before applying what it read, and a moment later every field whose
  // value changed is credited to that document. The tag next to the field
  // lasts only while the value is unchanged.
  const fRef = useRef(f)
  useLayoutEffect(() => { fRef.current = f })
  const [autoFilled, setAutoFilled] = useState({}) // field -> { doc, value }
  function trackFill(docLabel, before, delays = [150]) {
    delays.forEach(ms => setTimeout(() => {
      const after = fRef.current
      setAutoFilled(prev => {
        const next = { ...prev }
        for (const k of Object.keys(after)) {
          if (after[k] !== before[k] && typeof after[k] === 'string' && after[k].trim()) next[k] = { doc: docLabel, value: after[k] }
        }
        return next
      })
    }, ms))
  }
  const autoTag = key => {
    const a = autoFilled[key]
    return a && f[key] === a.value ? a.doc : null
  }

  // OCR the cancelled cheque / bank statement to auto-fill the bank section —
  // same "fill once from a document" pattern already used for expense
  // receipts. Never overrides a field the user already filled in.
  async function handleChequeFile(file) {
    setChequeFile(file)
    clearDocNote('cheque')
    if (!file) return
    setChequeOcrLoading(true)
    try {
      const { base64 } = file.type === 'application/pdf'
        ? await pdfPageToBase64(file)
        : await imageFileToJpegBase64(file)
      const extracted = await extractChequeDetails(base64)
      if (extracted) {
        const before = fRef.current
        const matchedState = extracted.state
          ? INDIAN_STATES.find(s =>
              s.toLowerCase() === extracted.state.toLowerCase() ||
              s.toLowerCase().includes(extracted.state.toLowerCase()) ||
              extracted.state.toLowerCase().includes(s.toLowerCase().split(' ')[0])
            )
          : null
        // The cheque/bank statement is the sole source for these bank
        // fields, so a (re-)upload always overwrites them with whatever it
        // reads — no "only if blank" gate and no mismatch warning here,
        // unlike PAN/GST/MSME, which are typed independently and only
        // cross-checked against their own attachment. Address fields stay a
        // convenience fill only (fill if blank, freely editable after).
        setF(prev => ({
          ...prev,
          // The account holder is usually the organisation itself, so it also
          // fills the organisation name when that is still blank.
          org_name: prev.org_name.trim() ? prev.org_name : (extracted.beneficiary_name?.trim() || prev.org_name),
          beneficiary_name: extracted.beneficiary_name || prev.beneficiary_name,
          account_number: extracted.account_number || prev.account_number,
          ifsc_code: extracted.ifsc_code || prev.ifsc_code,
          bank_name: extracted.bank_name || prev.bank_name,
          branch: extracted.branch || prev.branch,
          address_line1: prev.address_line1 || extracted.address_line1 || prev.address_line1,
          city: prev.city || extracted.city || prev.city,
          state: prev.state || matchedState || prev.state,
          pincode: prev.pincode || extracted.pincode || prev.pincode,
        }))
        setChequeOcrLoading(false)
        const chequeRead = [extracted.beneficiary_name && 'beneficiary name', extracted.account_number && 'account number', extracted.ifsc_code && 'IFSC code'].filter(Boolean)
        const chequeMissing = [!extracted.beneficiary_name && 'beneficiary name', !extracted.account_number && 'account number', !extracted.ifsc_code && 'IFSC code'].filter(Boolean)
        setDocNote('cheque', chequeRead, chequeMissing)
        // The IFSC lookup below fills bank name and branch a moment later.
        trackFill('cheque', before, [150, 2500])
        // Canonicalize/lock the bank name + branch against the authoritative
        // IFSC directory in the background on every (re-)upload, same reason
        // as above — the new cheque's IFSC is what should win.
        if (extracted.ifsc_code) lookupIFSC(extracted.ifsc_code)
        return
      }
    } catch (err) {
      console.error('Cheque OCR failed:', err)
    }
    setDocNote('cheque', [], ['beneficiary name', 'account number', 'IFSC code'])
    setChequeOcrLoading(false)
  }

  // OCR the PAN copy to auto-fill PAN Number when it's still blank, or — if
  // someone already typed one — cross-check the two and surface a live
  // match/mismatch indicator instead. Never overrides a value already typed.
  async function handlePanFile(file) {
    setPanFile(file)
    setPanExtracted(null)
    clearDocNote('pan')
    if (!file) return
    setPanOcrLoading(true)
    try {
      const { base64 } = file.type === 'application/pdf'
        ? await pdfPageToBase64(file)
        : await imageFileToJpegBase64(file)
      const extracted = await extractPanCardDetails(base64)
      const before = fRef.current
      const extractedPan = extracted?.pan_number?.toUpperCase().trim()
      const panRead = []
      if (extractedPan && PAN_RE.test(extractedPan)) {
        setPanExtracted(extractedPan)
        panRead.push('PAN number')
        if (!f.pan_number.trim()) {
          setF(prev => ({ ...prev, pan_number: extractedPan }))
          setPanDupAcknowledged(false)
          checkPanDuplicates(extractedPan)
        }
      }
      // The card also carries the holder's name and a date (date of birth, or
      // of incorporation for an organisation) — fill those only if still blank.
      const panName = extracted?.name?.trim()
      const panDate = toInputDate(extracted?.date?.trim())
      if (panName) panRead.push('name')
      if (panDate) panRead.push('date of incorporation / birth')
      if (panName || panDate) {
        setF(prev => ({
          ...prev,
          org_name: prev.org_name.trim() ? prev.org_name : (panName || prev.org_name),
          date_of_incorporation: prev.date_of_incorporation || panDate || prev.date_of_incorporation,
        }))
      }
      setDocNote('pan', panRead, panRead.includes('PAN number') ? [] : ['PAN number'])
      trackFill('PAN card', before)
      setPanOcrLoading(false)
      return
    } catch (err) {
      console.error('PAN OCR failed:', err)
    }
    setDocNote('pan', [], ['PAN number'])
    setPanOcrLoading(false)
  }

  // OCR the incorporation/registration document to fill the registration
  // number (and whatever else it shows: state, date of incorporation,
  // organisation name, registered address) — only into blanks, so anything
  // already typed is never overwritten. A different registration number than
  // the one typed is surfaced as a mismatch instead of silently replaced.
  async function handleRegCertFile(file) {
    setRegCertFile(file)
    setRegNoExtracted(null)
    clearDocNote('reg_cert')
    if (!file) return
    setRegCertOcrLoading(true)
    try {
      const { base64 } = file.type === 'application/pdf'
        ? await pdfPageToBase64(file)
        : await imageFileToJpegBase64(file)
      const extracted = await extractRegistrationCertDetails(base64)
      if (extracted) {
        const regNo = extracted.registration_number?.toUpperCase().replace(/\s+/g, '').trim() || null
        const cinState = regNo && /^[LU]\d{5}[A-Z]{2}\d{4}/.test(regNo) ? CIN_STATE_CODES[regNo.slice(6, 8)] : null
        const regState = matchIndianState(extracted.state) || matchIndianState(cinState)
        const incDate = toInputDate(extracted.date_of_incorporation?.trim())
        const orgName = extracted.organisation_name?.trim() || null
        const before = fRef.current
        // Which kind of organisation this is, when the certificate says —
        // only filled if the type hasn't been chosen yet.
        const orgType = ORG_TYPES.find(t => t.toLowerCase() === String(extracted.organisation_type || '').trim().toLowerCase()) || null
        const pin = /^\d{6}$/.test(extracted.pincode || '') ? extracted.pincode : null
        const read = [
          regNo && 'registration number', regState && 'registration state', incDate && 'date of incorporation',
          orgName && 'organisation name', orgType && !fRef.current.org_type && 'organisation type', (extracted.address_line1 || extracted.city || pin) && 'registered address',
        ].filter(Boolean)
        const missing = [!regNo && 'registration number', !regState && 'registration state', !incDate && 'date of incorporation'].filter(Boolean)
        if (regNo) setRegNoExtracted(regNo)
        setF(prev => ({
          ...prev,
          org_type: prev.org_type || orgType || prev.org_type,
          org_registration_number: prev.org_registration_number.trim() ? prev.org_registration_number : (regNo || prev.org_registration_number),
          org_registration_state: prev.org_registration_state || regState || prev.org_registration_state,
          date_of_incorporation: prev.date_of_incorporation || incDate || prev.date_of_incorporation,
          org_name: prev.org_name.trim() ? prev.org_name : (orgName || prev.org_name),
          address_line1: prev.address_line1 || extracted.address_line1 || prev.address_line1,
          city: prev.city || extracted.city || prev.city,
          pincode: prev.pincode || pin || prev.pincode,
        }))
        setDocNote('reg_cert', read, missing)
        trackFill('registration certificate', before)
        setRegCertOcrLoading(false)
        return
      }
    } catch (err) {
      console.error('Registration certificate OCR failed:', err)
    }
    setDocNote('reg_cert', [], ['registration number', 'registration state', 'date of incorporation'])
    setRegCertOcrLoading(false)
  }

  // OCR the GST Registration Certificate to auto-fill GSTIN when it's still
  // blank. If one's already typed and differs from what this document reads,
  // that's trusted and auto-applied ONLY when the new GSTIN's embedded PAN
  // matches the PAN Number field above — i.e. it structurally belongs to the
  // same entity, so a replacement certificate correcting/updating the GSTIN
  // is applied automatically. Anything else (an embedded PAN that doesn't
  // match) is left alone for the live match/mismatch indicator below to
  // flag instead, same as the PAN copy above. Runs on every upload,
  // including replacing an already-uploaded file — it must NOT bail out
  // just because GSTIN already has a value, or a mismatched replacement
  // document would silently go unnoticed.
  async function handleGstCertFile(file) {
    setGstCertFile(file)
    setGstExtracted(null)
    clearDocNote('gst')
    if (!file) return
    setGstCertOcrLoading(true)
    try {
      const { base64 } = file.type === 'application/pdf'
        ? await pdfPageToBase64(file)
        : await imageFileToJpegBase64(file)
      const extracted = await extractGstCertDetails(base64)
      const before = fRef.current
      const extractedGstin = extracted?.gstin?.toUpperCase().trim()
      const gstRead = []
      if (extractedGstin && GSTIN_RE.test(extractedGstin)) {
        setGstExtracted(extractedGstin)
        gstRead.push('GSTIN')
        const panUpper = f.pan_number.toUpperCase().trim()
        const embeddedPan = parseGSTIN(extractedGstin)?.embeddedPan
        const embeddedPanMatches = embeddedPan === panUpper
        setF(prev => {
          const typed = prev.gstin.toUpperCase().trim()
          const next = { ...prev }
          if (!typed || (typed !== extractedGstin && embeddedPanMatches)) next.gstin = extractedGstin
          // A GSTIN embeds the holder's PAN — fill it if PAN is still blank.
          if (!prev.pan_number.trim() && embeddedPan) next.pan_number = embeddedPan
          return next
        })
      }
      // Legal name / principal-place-of-business address, only into blanks.
      const gstState = matchIndianState(extracted?.state)
      const gstName = extracted?.legal_name?.trim()
      if (gstName) gstRead.push('legal name')
      if (extracted?.address_line1 || extracted?.city || extracted?.pincode || gstState) gstRead.push('address')
      const gstEmail = extracted?.email?.trim()
      const gstPhone = String(extracted?.phone || '').replace(/\D/g, '').slice(-10)
      const gstPhoneUsable = phonePrefix === '+91' && gstPhone.length === 10
      if (gstEmail?.includes('@')) gstRead.push('email')
      if (gstPhoneUsable) gstRead.push('mobile number')
      setF(prev => ({
        ...prev,
        email: prev.email.trim() ? prev.email : (gstEmail?.includes('@') ? gstEmail : prev.email),
        phone: prev.phone.trim() ? prev.phone : (gstPhoneUsable ? gstPhone : prev.phone),
        org_name: prev.org_name.trim() ? prev.org_name : (gstName || prev.org_name),
        address_line1: prev.address_line1 || extracted?.address_line1 || prev.address_line1,
        city: prev.city || extracted?.city || prev.city,
        state: prev.state || gstState || prev.state,
        pincode: prev.pincode || (/^\d{6}$/.test(extracted?.pincode || '') ? extracted.pincode : prev.pincode),
      }))
      setDocNote('gst', gstRead, gstRead.includes('GSTIN') ? [] : ['GSTIN'])
      trackFill('GST certificate', before)
      setGstCertOcrLoading(false)
      return
    } catch (err) {
      console.error('GST certificate OCR failed:', err)
    }
    setDocNote('gst', [], ['GSTIN'])
    setGstCertOcrLoading(false)
  }

  // OCR the MSME/Udyam certificate to pre-fill the (free-text) MSME
  // Registration Details field with the registration number and category it
  // finds — fills only if blank, and the field stays an ordinary editable
  // textarea afterward. Runs on every upload, including replacing an
  // already-uploaded file, so a swapped-in certificate that disagrees with
  // whatever's already typed gets flagged instead of silently ignored.
  async function handleMsmeCertFile(file) {
    setMsmeCertFile(file)
    setMsmeExtracted(null)
    clearDocNote('msme')
    if (!file) return
    setMsmeCertOcrLoading(true)
    try {
      const { base64 } = file.type === 'application/pdf'
        ? await pdfPageToBase64(file)
        : await imageFileToJpegBase64(file)
      const extracted = await extractMsmeCertDetails(base64)
      const before = fRef.current
      const regNo = extracted?.registration_number?.trim() || null
      const category = extracted?.category?.trim() || null
      const msmeRead = []
      if (regNo || category) {
        setMsmeExtracted({ registration_number: regNo, category })
        if (regNo) msmeRead.push('registration number')
        if (category) msmeRead.push('category')
        if (!f.msme_details.trim()) {
          const lines = []
          if (regNo) lines.push(`Udyam Registration Number: ${regNo}`)
          if (category) lines.push(`Category: ${category}`)
          setF(prev => (prev.msme_details.trim() ? prev : { ...prev, msme_details: lines.join('\n') }))
        }
      }
      // Udyam certificates also print the enterprise's mobile and email.
      const msmeEmail = extracted?.email?.trim()
      const msmePhone = String(extracted?.phone || '').replace(/\D/g, '').slice(-10)
      const phoneUsable = phonePrefix === '+91' && msmePhone.length === 10
      if (msmeEmail?.includes('@')) msmeRead.push('email')
      if (phoneUsable) msmeRead.push('mobile number')
      // Services vs manufacturing/trading gives a sensible nature of business
      // when that is still blank.
      const activity = String(extracted?.activity || '').toLowerCase()
      const nature = activity.includes('service') ? 'Service Provider' : (activity.includes('manufactur') || activity.includes('trad')) ? 'Goods Supplier' : null
      if (nature && !fRef.current.nature_of_business) msmeRead.push('nature of business')
      setF(prev => ({
        ...prev,
        nature_of_business: prev.nature_of_business || nature || prev.nature_of_business,
        org_name: prev.org_name.trim() ? prev.org_name : (extracted?.enterprise_name?.trim() || prev.org_name),
        email: prev.email.trim() ? prev.email : (msmeEmail?.includes('@') ? msmeEmail : prev.email),
        phone: prev.phone.trim() ? prev.phone : (phoneUsable ? msmePhone : prev.phone),
      }))
      setDocNote('msme', msmeRead, (regNo ? [] : ['registration number']).concat(category ? [] : ['category']))
      trackFill('MSME certificate', before)
      setMsmeCertOcrLoading(false)
      return
    } catch (err) {
      console.error('MSME certificate OCR failed:', err)
    }
    setDocNote('msme', [], ['registration number', 'category'])
    setMsmeCertOcrLoading(false)
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

  // Generic words that don't help identify *which* organisation this is —
  // stripped before matching so e.g. "Acme Pvt Ltd" and "Acme Solutions Ltd"
  // still share enough real signal ("acme") to flag, without every vendor
  // ending in "Private Limited" cross-matching every other one.
  const ORG_NAME_STOPWORDS = new Set([
    'pvt', 'private', 'ltd', 'limited', 'llp', 'inc', 'incorporated', 'co',
    'company', 'corp', 'corporation', 'the', 'and', 'solutions', 'services',
  ])

  // Loose/partial match on organisation name — same "warn, never block"
  // pattern as checkPanDuplicates above, kept as its own separate function
  // (rather than folded into one shared helper) so the existing PAN path
  // above is never touched by this addition.
  async function checkOrgNameDuplicates(name) {
    const words = name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !ORG_NAME_STOPWORDS.has(w))
    if (words.length === 0) { setOrgNameDuplicates([]); return }
    const currentRowId = existingVendor?.id || draftId
    const orClause = words.map(w => `org_name.ilike.%${w}%`).join(',')
    let q = supabase.from('vendors').select('id, vendor_id, org_name, status, submitted_by').or(orClause)
    if (currentRowId) q = q.neq('id', currentRowId)
    const { data } = await q
    if (data && data.length > 0) {
      setOrgNameDuplicates(data)
      setShowOrgNameDupModal(true)
      setOrgNameDupAcknowledged(false)
    } else {
      setOrgNameDuplicates([])
    }
  }

  // Exact match on account number — same pattern again, own state.
  async function checkAccountNumberDuplicates(acct) {
    const cleaned = acct.trim()
    if (!cleaned) { setAcctNumDuplicates([]); return }
    const currentRowId = existingVendor?.id || draftId
    let q = supabase.from('vendors').select('id, vendor_id, org_name, status, submitted_by').eq('account_number', cleaned)
    if (currentRowId) q = q.neq('id', currentRowId)
    const { data } = await q
    if (data && data.length > 0) {
      setAcctNumDuplicates(data)
      setShowAcctNumDupModal(true)
      setAcctNumDupAcknowledged(false)
    } else {
      setAcctNumDuplicates([])
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
    // A vendor filling this themselves via the guest invite link has no
    // "employee" relationship to disclose a personal connection to — the
    // question (and its required-ness) only makes sense when an internal
    // person is the one creating the vendor record.
    if (!isGuestSubmission) {
      if (submit && f.is_related_to_org === null)     e.is_related_to_org = 'Please select Yes or No'
      if (submit && f.is_related_to_org === true && !f.related_org_description.trim()) {
        e.related_org_description = 'Please describe the relationship'
      }
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
    else if (f.account_number && (f.account_number.length < 9 || f.account_number.length > 18)) {
      e.account_number = 'Enter a 9-18 digit account number'
    }
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
      if (!draftId) {
        setDraftId(result.data.id)
        // First save only — autosave re-enters this every 45s.
        logActivity({ entityType: 'vendor', entityId: result.data.id, entityRef: result.data.org_name, action: 'draft_created', toValue: 'draft', actor: user })
      }
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
    // Three independent "warn, never block" duplicate gates — each shows its
    // own modal and must be acknowledged (or simply doesn't apply) before the
    // new review-before-submit step appears. Checked in this fixed order so
    // only one modal shows at a time even if more than one type matched.
    if (panDuplicates.length > 0 && !panDupAcknowledged) {
      setShowPanDupModal(true)
      return
    }
    if (orgNameDuplicates.length > 0 && !orgNameDupAcknowledged) {
      setShowOrgNameDupModal(true)
      return
    }
    if (acctNumDuplicates.length > 0 && !acctNumDupAcknowledged) {
      setShowAcctNumDupModal(true)
      return
    }
    setShowReviewModal(true)
  }

  // The actual insert/update, split out of handleSubmit so it only ever runs
  // from the review modal's "Confirm & Submit" — handleSubmit itself now only
  // validates, runs the duplicate gates, and opens that review step.
  async function performSubmit() {
    setShowReviewModal(false)
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
      logActivity({
        entityType: 'vendor', entityId: result.data.id, entityRef: result.data.vendor_id || result.data.org_name,
        action: isEdit ? 'resubmitted' : 'submitted', fromValue: existingVendor?.status || (draftId ? 'draft' : null), toValue: 'pending', actor: user,
        note: isGuestSubmission ? 'Submitted by the vendor via invite link' : null,
      })
      notifyVendorSubmitted({ vendor: result.data, submitter: user, viaInviteLink: isGuestSubmission, resubmitted: isEdit })
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

  const docsChecklist = [
    { key: 'cheque', label: 'Cancelled cheque or bank statement / passbook', fills: 'beneficiary name, account number, IFSC, bank & branch, address', have: !!(chequePath || chequeFile), applies: true },
    { key: 'pan', label: 'PAN card copy', fills: 'PAN number, name, date of incorporation', have: !!(panPath || panFile), applies: true },
    isIndividual
      ? { key: 'aadhaar', label: 'Aadhaar copy' + (f.aadhaar_pan_linked === true ? ' and proof of Aadhaar-PAN link' : ''), fills: 'proof of identity (Aadhaar number is typed in by you)', have: !!((aadhaarPath || aadhaarFile) && (f.aadhaar_pan_linked !== true || aadhaarProofPath || aadhaarProofFile)), applies: true }
      : { key: 'reg', label: f.org_type ? incorporationDocLabel(f.org_type) : 'Registration / incorporation certificate', fills: 'registration number, state, date of incorporation, organisation name, address', have: !!(regCertPath || regCertFile), applies: !!f.org_type, when: 'the exact document depends on the Type of Organisation you pick in section 1' },
    { key: 'gst', label: 'GST registration certificate', fills: 'GSTIN, legal name, address', have: !!(gstCertPath || gstCertFile), applies: f.is_gstin_registered, when: 'only if the vendor is GST-registered' },
    { key: 'msme', label: 'MSME / Udyam certificate', fills: 'Udyam number, category, email, mobile', have: !!(msmeCertPath || msmeCertFile), applies: f.is_msme, when: 'only if the vendor is MSME-registered' },
  ]

  // ── Documents panel ─────────────────────────────────────────────────────
  const reading = chequeOcrLoading || panOcrLoading || regCertOcrLoading || gstCertOcrLoading || msmeCertOcrLoading
  const neededDocs = docsChecklist.filter(d => d.applies)
  const gotDocs = neededDocs.filter(d => d.have).length

  const documentsPanel = (
    <aside
      data-tour-anchor="vendor-attachments"
      id="docs-panel"
      className="no-scrollbar"
      style={wide
        ? { position: 'fixed', top: '24px', width: panelOpen ? '330px' : '72px', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', boxSizing: 'border-box' }
        : { width: '100%', marginBottom: '16px', boxSizing: 'border-box' }}
    >
      <div style={{ background: 'var(--taupe-50)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)', padding: panelOpen ? '14px' : '12px 8px', boxSizing: 'border-box' }}>
        <button
          type="button"
          onClick={() => setPanelOpen(o => !o)}
          aria-expanded={panelOpen}
          title={panelOpen ? 'Collapse the Documents panel' : 'Open the Documents panel'}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
            flexDirection: panelOpen || !wide ? 'row' : 'column',
          }}
        >
          {panelOpen || !wide ? (
            <>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Documents</span>
              <span style={{ fontSize: '12px', color: gotDocs === neededDocs.length && neededDocs.length ? 'var(--moss-text)' : 'var(--text-muted)' }}>
                {reading ? 'Reading…' : `${gotDocs} of ${neededDocs.length} attached`}
              </span>
              <span style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--action)', background: 'var(--surface-card)', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)', padding: '4px 12px', display: 'inline-flex', alignItems: 'center' }}>
                <PanelToggleIcon open={panelOpen} stacked={!wide} />
              </span>
            </>
          ) : (
            <>
              <span style={{ color: 'var(--action)', background: 'var(--surface-card)', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }}>
                <PanelToggleIcon open={false} />
              </span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', writingMode: 'vertical-rl', margin: '8px 0' }}>Documents</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: gotDocs === neededDocs.length && neededDocs.length ? 'var(--moss-text)' : 'var(--text-muted)' }}>{gotDocs}/{neededDocs.length}</span>
            </>
          )}
        </button>

        {panelOpen && (
          <div style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Attach each document below
              <InfoTip side="bottom" text={`Each document is read and its details are filled into the form${wide ? ' on the right' : ' below'}. Fields filled this way carry a green tag, so you can see what came from where. Anything that can't be read is listed under that document, so you know exactly what to type in yourself.`} />
            </div>

            <DocSlot title="Cancelled cheque or bank statement / passbook" required={!isEdit} fills="beneficiary, account number, IFSC, bank, branch"
              status={slotStatus(chequePath || chequeFile, chequeOcrLoading, docNotes.cheque)} onGoTo={() => jumpTo('sec-bank')}>
              <FileUpload compact id="cheque" required={!isEdit} error={liveErrors.cheque} existing={chequePath} file={chequeFile} onChange={handleChequeFile} />
              {chequeOcrLoading && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '8px' }}>Reading document — filling in bank and address details…</div>}
              {!chequeOcrLoading && <DocNote note={docNotes.cheque} where="in Bank Account Details" />}
            </DocSlot>

            <DocSlot title="PAN card copy" required={!isEdit} fills="PAN number, name, date of incorporation"
              status={slotStatus(panPath || panFile, panOcrLoading, docNotes.pan)} onGoTo={() => jumpTo('sec-org')}>
              <FileUpload compact id="pan_copy" required={!isEdit} error={liveErrors.pan_copy} existing={panPath} file={panFile} onChange={handlePanFile} />
              {panOcrLoading && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '8px' }}>Reading document — checking PAN number…</div>}
              {!panOcrLoading && panMatchStatus === 'match' && (
                <div style={{ fontSize: '11px', color: 'var(--moss-text)', fontWeight: 600, marginTop: '4px', marginBottom: '8px' }}>✓ PAN copy matches the PAN Number in the form</div>
              )}
              {!panOcrLoading && <DocNote note={docNotes.pan} where="in Organisation Details" />}
              {!panOcrLoading && panMatchStatus === 'mismatch' && (
                <div style={{ fontSize: '11px', color: 'var(--clay-text)', fontWeight: 600, marginTop: '4px', marginBottom: '8px' }}>
                  ✗ This document shows {panExtracted} but the PAN Number in the form is {f.pan_number.toUpperCase().trim()} — please check the attachment again
                </div>
              )}
            </DocSlot>

            {!isIndividual ? (
              <DocSlot title={incorporationDocLabel(f.org_type)} required={!isEdit}
                fills={f.org_type ? 'registration number, state, date of incorporation, name, address' : 'organisation type, registration number, state, date, name, address'}
                status={slotStatus(regCertPath || regCertFile, regCertOcrLoading, docNotes.reg_cert)} onGoTo={() => jumpTo('sec-contact')}>
                <FileUpload compact id="reg_cert" required={!isEdit} error={liveErrors.reg_cert} existing={regCertPath} file={regCertFile} onChange={handleRegCertFile} />
                {regCertOcrLoading && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '8px' }}>Reading document — filling in registration and incorporation details…</div>}
                {!regCertOcrLoading && <DocNote note={docNotes.reg_cert} where="in Organisation Details and Contact & Registration" />}
              </DocSlot>
            ) : (
              <>
                <DocSlot title="Aadhaar copy" required fills="proof of identity (the Aadhaar number is typed in by you)"
                  status={slotStatus(aadhaarPath || aadhaarFile, false, null)} onGoTo={() => jumpTo('aadhaar_number')}>
                  <FileUpload compact id="aadhaar_copy" required error={liveErrors.aadhaar_copy} existing={aadhaarPath} file={aadhaarFile} onChange={setAadhaarFile} />
                </DocSlot>
                {f.aadhaar_pan_linked === true && (
                  <DocSlot title="Proof of Aadhaar-PAN link" required fills="confirms the Aadhaar and PAN are linked"
                    status={slotStatus(aadhaarProofPath || aadhaarProofFile, false, null)}>
                    <FileUpload compact id="aadhaar_pan_proof" required error={liveErrors.aadhaar_pan_proof} existing={aadhaarProofPath} file={aadhaarProofFile} onChange={setAadhaarProofFile} />
                  </DocSlot>
                )}
              </>
            )}

            {f.is_gstin_registered ? (
              <DocSlot title="GST registration certificate" required fills="GSTIN, legal name, address, contact"
                status={slotStatus(gstCertPath || gstCertFile, gstCertOcrLoading, docNotes.gst)} onGoTo={() => jumpTo('gstin')}>
                <FileUpload compact id="gst_cert" required error={liveErrors.gst_cert} existing={gstCertPath} file={gstCertFile} onChange={handleGstCertFile} />
                {gstCertOcrLoading && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '8px' }}>Reading document — filling in GSTIN and address…</div>}
                {!gstCertOcrLoading && <DocNote note={docNotes.gst} where="in the GST details" />}
                {!gstCertOcrLoading && gstCertMatchStatus === 'match' && (
                  <div style={{ fontSize: '11px', color: 'var(--moss-text)', fontWeight: 600, marginTop: '4px', marginBottom: '8px' }}>✓ Certificate matches the GSTIN in the form</div>
                )}
                {!gstCertOcrLoading && gstCertMatchStatus === 'mismatch' && (
                  <div style={{ fontSize: '11px', color: 'var(--clay-text)', fontWeight: 600, marginTop: '4px', marginBottom: '8px' }}>
                    ✗ This document shows {gstExtracted} but the GSTIN in the form is {f.gstin.toUpperCase().trim()} — please check the attachment again
                  </div>
                )}
              </DocSlot>
            ) : (
              <MutedSlot title="GST registration certificate" text="Only needed if the vendor is GST-registered. Switch on “GSTIN Registration Present?” in the form and it appears here." />
            )}

            {f.is_msme ? (
              <DocSlot title="MSME / Udyam certificate" required fills="Udyam number, category, name, contact, nature of business"
                status={slotStatus(msmeCertPath || msmeCertFile, msmeCertOcrLoading, docNotes.msme)} onGoTo={() => jumpTo('msme_details')}>
                <FileUpload compact id="msme_cert" required error={liveErrors.msme_cert} existing={msmeCertPath} file={msmeCertFile} onChange={handleMsmeCertFile} />
                {msmeCertOcrLoading && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '8px' }}>Reading document — filling in registration number and category…</div>}
                {!msmeCertOcrLoading && <DocNote note={docNotes.msme} where="in the MSME details" />}
                {!msmeCertOcrLoading && msmeMismatch && (
                  <div style={{ fontSize: '11px', color: 'var(--clay-text)', fontWeight: 600, marginTop: '4px', marginBottom: '8px' }}>
                    ✗ This document shows registration number {msmeExtracted.registration_number}, which doesn&apos;t appear in the MSME details — please check the attachment again
                  </div>
                )}
              </DocSlot>
            ) : (
              <MutedSlot title="MSME / Udyam certificate" text="Only needed if the vendor is MSME-registered. Switch on “MSME Registration Present?” in the form and it appears here." />
            )}

            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              PDF, JPG, PNG · max 10 MB per file · drag &amp; drop works on any upload box.
            </div>

            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--taupe-200)' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Before you submit</div>
              {checklist.map(c => (
                <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginBottom: '6px', color: c.done ? 'var(--moss-text)' : 'var(--text-muted)' }}>
                  <span>{c.done ? '✓' : '○'}</span>
                  <span>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  )

  // Opens the right place for a form error that points at an upload.
  const FILE_ERROR_KEYS = ['cheque', 'pan_copy', 'reg_cert', 'aadhaar_copy', 'aadhaar_pan_proof', 'gst_cert', 'msme_cert']
  function goToError(key) {
    if (FILE_ERROR_KEYS.includes(key)) setPanelOpen(true)
    setTimeout(() => scrollToField(key), 80)
  }

  return (
    <AutoFillContext.Provider value={autoTag}>
    <div style={{ maxWidth: wide ? (panelOpen ? '1180px' : '1000px') : '720px', margin: '0 auto', padding: '24px 20px 80px' }}>
    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
    {/* The page's own wrapper has overflow set, which stops `sticky` from
        working — so on wide screens the panel is fixed to the viewport (always
        in view while the form scrolls). A fixed element with no `left` stays at
        its natural horizontal spot, and this spacer of the same width keeps
        the form where it belongs. */}
    {wide && (
      <div style={{ flex: panelOpen ? '0 0 330px' : '0 0 72px', width: panelOpen ? '330px' : '72px' }}>
        {documentsPanel}
      </div>
    )}
    <div style={{ flex: '1 1 0', minWidth: 0, maxWidth: wide && panelOpen ? '720px' : 'none' }}>

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
        <TourButton onClick={tour.start} style={{ marginLeft: 'auto' }} />
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
      <DocsChecklist items={docsChecklist} open={docsOpen} onToggle={() => setDocsOpen(o => !o)} />

      {!wide && documentsPanel}

      <div style={card} id="sec-org" data-tour-anchor="vendor-org">
        <SectionHeader number="1" title="Organisation Details" subtitle="Legal identity and registered address" />

        <div style={grid2}>
          <div style={full}>
            <Field id="org_name" label="Name of Organisation" required error={liveErrors.org_name}>
              <Inp field="org_name" f={f} setF={setF} placeholder="e.g. Acme Solutions Pvt Ltd" err={!!liveErrors.org_name}
                onBlur={e => checkOrgNameDuplicates(e.target.value)} />
              {orgNameDuplicates.length > 0 && (
                <div
                  onClick={() => setShowOrgNameDupModal(true)}
                  style={{
                    marginTop: '6px', fontSize: '11px', color: 'var(--gold-text)', cursor: 'pointer',
                    background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)', padding: '6px 10px',
                  }}
                >
                  ⚠ {orgNameDuplicates.length} similarly-named vendor{orgNameDuplicates.length !== 1 ? 's' : ''} already registered — click to view
                </div>
              )}
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
          <Field id="pan_number" label="PAN Number" required error={liveErrors.pan_number || panFormatError}>
            <input
              type="text"
              value={f.pan_number}
              onChange={e => {
                // Filter then cap length — in that order, not via the native
                // maxLength attribute, which truncates the raw keystrokes
                // *before* this filter runs and can leave fewer than 10 real
                // characters if a stray symbol was typed within the limit.
                setF(p => ({ ...p, pan_number: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) }))
                setPanDupAcknowledged(false)
              }}
              onBlur={e => { setPanTouched(true); checkPanDuplicates(e.target.value) }}
              placeholder="ABCDE1234F"
              style={inputStyle(!!liveErrors.pan_number || !!panFormatError, { fontFamily: 'monospace', letterSpacing: '0.1em' })}
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
          <div style={{ background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gold-text)', marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
              Aadhaar Details (Individual Vendor)
              <InfoTip text="Type the Aadhaar number here. Attach the Aadhaar copy (and, if your Aadhaar and PAN are linked, the proof of the link) in the Documents panel." />
            </div>
            <Field id="aadhaar_number" label="Aadhaar Number" required error={liveErrors.aadhaar_number}>
              <input
                type="text"
                value={f.aadhaar_number}
                onChange={e => setF(p => ({ ...p, aadhaar_number: e.target.value.replace(/\D/g, '').slice(0, 12) }))}
                placeholder="123412341234"
                style={inputStyle(!!liveErrors.aadhaar_number, { fontFamily: 'monospace', letterSpacing: '0.08em' })}
              />
            </Field>
            <div style={{ marginTop: '4px' }}>
              <Field
                id="aadhaar_pan_linked"
                label="Are your Aadhaar and PAN linked?"
                required
                error={liveErrors.aadhaar_pan_linked}
                info="Answering No will block this registration from being submitted at all — an individual/proprietor vendor can't be registered without a linked Aadhaar and PAN. If they aren't linked yet, link them first via the Income Tax e-filing portal, then come back and answer Yes."
              >
                <YesNo
                  value={f.aadhaar_pan_linked}
                  onChange={v => setF(p => ({ ...p, aadhaar_pan_linked: v }))}
                />
              </Field>
            </div>
          </div>
        )}

      </div>

      {/* ══════════════════════════════════════
          SECTION 2 — Contact & Registration
      ══════════════════════════════════════ */}
      <div style={card} id="sec-contact" data-tour-anchor="vendor-contact">
        <SectionHeader
          number="2" title="Contact & Registration" subtitle="Point of contact and legal registration"
          info={isIndividual ? undefined : `Attach the ${incorporationDocLabel(f.org_type)} in the Documents panel first. The registration number, state and date of incorporation then fill in here automatically${(f.is_msme || f.is_gstin_registered) ? ', and the MSME / GST certificates fill in their own details below' : ''}. If anything can't be read from a document, you'll be told exactly what to type in yourself.`}
        />
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
                  phone: phonePrefix === '+91'
                    ? e.target.value.replace(/\D/g, '').slice(0, 10)
                    : e.target.value.replace(/[^0-9\- ]/g, '').slice(0, 15),
                }))}
                placeholder={phonePrefix === '+91' ? '9876543210' : 'e.g. 080-12345678'}
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
            {regNoMismatch && (
              <div style={{ fontSize: '11px', color: 'var(--clay-text)', fontWeight: 600, marginTop: '4px' }}>
                ✗ The attached document shows {regNoExtracted}, but the number above is {f.org_registration_number.trim()} — please check
              </div>
            )}
            {!isIndividual && docNotes.reg_cert && docNotes.reg_cert.missing.includes('registration number') && !f.org_registration_number.trim() && (
              <div style={{ fontSize: '11px', color: 'var(--gold-text)', fontWeight: 600, marginTop: '4px' }}>
                ⚠ We couldn&apos;t read the registration number from the document — please type it in here.
              </div>
            )}
          </Field>
          <Field label="Organisation Registration State"
            hint="Fill this to unlock the GSTIN field">
            <Sel field="org_registration_state" f={f} setF={setF} options={INDIAN_STATES} placeholder="Select state…" />
          </Field>
        </div>

        {/* MSME + GSTIN detail entry lives here — right after Organisation
            Registration State, which GSTIN validation depends on, instead of
            up in Organisation Details where the "fill the state below"
            hint used to point at a field a whole card further down. */}
        <div style={{ marginBottom: '14px' }}>
          <Toggle
            label="MSME Registration Present?"
            checked={f.is_msme}
            onChange={e => setF(p => ({ ...p, is_msme: e.target.checked }))}
          />
        </div>
        {f.is_msme && (
          <div style={{ background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gold-text)', marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
              MSME Registration Details
              <InfoTip text="Attach the MSME certificate in the Documents panel. It fills in the registration number, category and contact details here." />
            </div>
            <Field id="msme_details" label="MSME Registration Details" required error={liveErrors.msme_details}
              hint="If MSME is yes, please provide the registration details">
              <div style={{ position: 'relative' }}>
                <textarea
                  value={f.msme_details}
                  onChange={e => setF(p => ({ ...p, msme_details: e.target.value }))}
                  placeholder="MSME Udyam Registration Number, category (Micro/Small/Medium), etc."
                  rows={3}
                  style={{
                    width: '100%', border: `1px solid ${liveErrors.msme_details ? 'var(--clay-text)' : 'var(--gold-border)'}`,
                    borderRadius: 'var(--radius-sm)', padding: '10px', paddingRight: '40px', fontSize: '13px', color: 'var(--ink)',
                    outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
                    background: 'var(--surface-card)',
                  }}
                />
                <VoiceInputButton value={f.msme_details} onChange={v => setF(p => ({ ...p, msme_details: v }))} />
              </div>
            </Field>
          </div>
        )}

        <div style={{ marginBottom: '14px' }}>
          <Toggle
            label="GSTIN Registration Present?"
            checked={f.is_gstin_registered}
            disabled={!f.is_gstin_registered && !gstinEnabled}
            hint="Fill Organisation Registration State and a valid PAN Number above first — GSTIN is validated against them."
            onChange={e => setF(p => ({ ...p, is_gstin_registered: e.target.checked, gstin: '' }))}
          />
        </div>
        {f.is_gstin_registered && (
          <div style={{ background: '#EFF6FF', border: '1px solid var(--action-bg)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--action)', marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
              GST Registration Detail
              <InfoTip text={`Attach the GST certificate in the Documents panel. It fills in the GSTIN here.${gstinEnabled ? '' : ' To fill this section, first fill the Organisation Registration State and a valid PAN Number above.'}`} />
            </div>
            <Field id="gstin" label="GSTIN / UIN" required error={liveErrors.gstin}>
              <input
                type="text"
                value={f.gstin}
                onChange={e => {
                  if (!gstinEnabled) return
                  setF(p => ({ ...p, gstin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15) }))
                }}
                placeholder={gstinEnabled ? '29ABCDE1234F1Z5' : 'Fill state and PAN first…'}
                disabled={!gstinEnabled}
                style={gstinEnabled
                  ? inputStyle(!!liveErrors.gstin, {
                      fontFamily: 'monospace', letterSpacing: '0.08em',
                      border: `1px solid ${!f.gstin ? 'var(--action-bg)' : gstinValidation ? (gstinValidation.ok ? 'var(--moss-text)' : 'var(--clay-text)') : 'var(--action-bg)'}`,
                    })
                  : disabledStyle}
              />
              {/* Validates live as soon as 15 characters are in — no button,
                  no stale result, updates the instant the value changes. */}
              {gstinValidation && (
                <div style={{
                  marginTop: '8px', borderRadius: 'var(--radius-md)', padding: '12px 14px',
                  background: gstinValidation.ok ? 'var(--moss-bg)' : 'var(--clay-bg)',
                  border: `1px solid ${gstinValidation.ok ? 'var(--moss-border)' : 'var(--clay-border)'}`,
                  fontSize: '12px',
                }}>
                  {gstinValidation.ok ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--moss-text)', fontSize: '13px' }}>✓ Valid GSTIN</div>
                      <div style={{ color: 'var(--ink)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Place of Supply: </span>
                        <strong>[{gstinValidation.stateCode}] – {gstinValidation.stateName}</strong>
                      </div>
                      <div style={{ color: 'var(--ink)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>PAN: </span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{gstinValidation.embeddedPan}</span>
                        {gstinValidation.panMatch === true && (
                          <span style={{ color: 'var(--moss-text)', marginLeft: '6px' }}>✓ matches PAN field</span>
                        )}
                        {gstinValidation.panMatch === false && (
                          <span style={{ color: 'var(--clay-text)', marginLeft: '6px' }}>✗ mismatch — PAN field has {f.pan_number.toUpperCase()}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--clay-text)', fontWeight: 600 }}>✗ {gstinValidation.msg}</div>
                  )}
                </div>
              )}
            </Field>
          </div>
        )}

        {/* A vendor filling this themselves via the guest invite link has no
            "employee" relationship to disclose a personal connection to —
            this question only makes sense when an internal person is the one
            creating the vendor record (validated accordingly in validate()). */}
        {!isGuestSubmission && (
          <div style={grid2}>
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
                  <div style={{ position: 'relative' }}>
                    <textarea
                      value={f.related_org_description}
                      onChange={e => setF(p => ({ ...p, related_org_description: e.target.value }))}
                      placeholder="e.g. Vendor is owned by a family member of an employee"
                      rows={3}
                      style={{
                        width: '100%', border: `1px solid ${liveErrors.related_org_description ? 'var(--clay-text)' : 'var(--taupe-400)'}`,
                        borderRadius: 'var(--radius-sm)', padding: '10px', paddingRight: '40px', fontSize: '13px', color: 'var(--ink)',
                        outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
                        background: 'var(--surface-card)',
                      }}
                    />
                    <VoiceInputButton value={f.related_org_description} onChange={v => setF(p => ({ ...p, related_org_description: v }))} />
                  </div>
                </Field>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════
          SECTION 3 — Bank Account Details
      ══════════════════════════════════════ */}
      <div style={card} id="sec-bank" data-tour-anchor="vendor-bank">
        <SectionHeader number="3" title="Bank Account Details" subtitle="Beneficiary details for payment processing" />
        <div style={grid2}>
          <div style={full}>
            <Field id="beneficiary_name" label="Beneficiary Name" required error={liveErrors.beneficiary_name}>
              <Inp field="beneficiary_name" f={f} setF={setF} placeholder="Name as on bank account" err={!!liveErrors.beneficiary_name} />
            </Field>
          </div>
          <Field id="account_number" label="Account Number" required error={liveErrors.account_number}>
            <Inp field="account_number" f={f} setF={setF} placeholder="" mono err={!!liveErrors.account_number}
              filter={v => v.replace(/\D/g, '').slice(0, 18)}
              onBlur={e => checkAccountNumberDuplicates(e.target.value)} />
            {acctNumDuplicates.length > 0 && (
              <div
                onClick={() => setShowAcctNumDupModal(true)}
                style={{
                  marginTop: '6px', fontSize: '11px', color: 'var(--gold-text)', cursor: 'pointer',
                  background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)', padding: '6px 10px',
                }}
              >
                ⚠ {acctNumDuplicates.length} other vendor{acctNumDuplicates.length !== 1 ? 's' : ''} already registered with this account number — click to view
              </div>
            )}
          </Field>
          <Field id="ifsc_code" label="IFSC Code" required error={liveErrors.ifsc_code}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                value={f.ifsc_code}
                onChange={e => {
                  const code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11)
                  setF(p => ({ ...p, ifsc_code: code }))
                  // Auto-fill the moment a valid 11-character IFSC is typed
                  // (or pasted) — no blur/button needed. Re-fires the same
                  // way if the code is later changed to a different valid
                  // one, so bank/branch stay in sync with whatever's typed.
                  if (IFSC_RE.test(code)) lookupIFSC(code)
                }}
                placeholder="SBIN0001234"
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
                onClick={() => goToError(key)}
                style={{ fontSize: '12px', color: 'var(--clay-text)', marginBottom: '2px', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div data-tour-anchor="vendor-submit" style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
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

      <GuidedTour
        steps={VENDOR_TOUR} open={tour.open} tourKey="vendor"
        onClose={() => { tour.close(); setDocsOpen(false) }}
        onStepChange={step => {
          setDocsOpen(step?.anchor === 'vendor-docs')
          if (step?.anchor === 'vendor-attachments') setPanelOpen(true)
        }}
      />

      {showPanDupModal && (
        <PanDuplicateModal
          vendors={panDuplicates}
          onAcknowledge={() => { setPanDupAcknowledged(true); setShowPanDupModal(false) }}
          onClose={() => setShowPanDupModal(false)}
        />
      )}

      {showOrgNameDupModal && (
        <PanDuplicateModal
          vendors={orgNameDuplicates}
          title="A similarly-named vendor already exists"
          subtitle={`${orgNameDuplicates.length} other vendor${orgNameDuplicates.length !== 1 ? 's' : ''} with a similar organisation name ${orgNameDuplicates.length !== 1 ? 'are' : 'is'} already registered. Double-check this isn't the same organisation under a slightly different name — you can still continue either way.`}
          editLabel="Go Back and Edit Name"
          onAcknowledge={() => { setOrgNameDupAcknowledged(true); setShowOrgNameDupModal(false) }}
          onClose={() => setShowOrgNameDupModal(false)}
        />
      )}

      {showAcctNumDupModal && (
        <PanDuplicateModal
          vendors={acctNumDuplicates}
          title="This account number is already registered"
          subtitle={`${acctNumDuplicates.length} other vendor${acctNumDuplicates.length !== 1 ? 's' : ''} already ${acctNumDuplicates.length !== 1 ? 'use' : 'uses'} this bank account number. You can still continue — this just flags it for a second look.`}
          editLabel="Go Back and Edit Account Number"
          onAcknowledge={() => { setAcctNumDupAcknowledged(true); setShowAcctNumDupModal(false) }}
          onClose={() => setShowAcctNumDupModal(false)}
        />
      )}

      {showReviewModal && (
        <VendorReviewModal
          f={f}
          attachmentCount={[chequePath || chequeFile, panPath || panFile, regCertPath || regCertFile, (!f.is_msme || msmeCertPath || msmeCertFile), (!f.is_gstin_registered || gstCertPath || gstCertFile), (!isIndividual || aadhaarPath || aadhaarFile), (!isIndividual || aadhaarProofPath || aadhaarProofFile)].filter(Boolean).length}
          onConfirm={performSubmit}
          onClose={() => setShowReviewModal(false)}
        />
      )}

    </div>
    </div>

    </div>
    </AutoFillContext.Provider>
  )
}
