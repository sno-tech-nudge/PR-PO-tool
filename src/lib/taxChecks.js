import { supabase } from './supabase'
import { GSTIN_FORMAT_RE } from './formCalc'
import { sameVendor } from './duplicateCheck'

// India tax checks shown while vouching. Every check appears only where it
// applies: GSTIN checks need a GSTIN on the expense, the vendor-master checks
// need a registered vendor to compare with, and the TDS hint needs a fee or
// contractor category. Nothing here blocks anything; it is for Finance to read.

const STATE_BY_CODE = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
}

const CODE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// The 15th character of a GSTIN is a check digit over the first 14.
export function gstinCheckChar(first14) {
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const v = CODE_CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(v / 36) + (v % 36)
  }
  return CODE_CHARS[(36 - (sum % 36)) % 36]
}

export function checkGstin(raw) {
  const gstin = String(raw || '').toUpperCase().replace(/\s+/g, '')
  if (!gstin) return null
  if (!GSTIN_FORMAT_RE.test(gstin)) return { valid: false, gstin, reason: 'format' }
  if (!STATE_BY_CODE[gstin.slice(0, 2)]) return { valid: false, gstin, reason: 'state' }
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) return { valid: false, gstin, reason: 'checksum' }
  return { valid: true, gstin, state: STATE_BY_CODE[gstin.slice(0, 2)], pan: gstin.slice(2, 12) }
}

// Where tax may be deducted at source, by expense category. A hint only.
const TDS_BY_CATEGORY = {
  'Consultant Fee': 'professional',
  'Professional Fee': 'professional',
  'Retainership / Consultancy': 'professional',
  'Legal Fees': 'professional',
  'Service': 'contract',
  'Courier': 'contract',
  'Housekeeping': 'contract',
  'Repairs and Maintenance': 'contract',
  'Leasehold Improvements': 'contract',
}
const TDS_TEXT = {
  professional: 'Fee for professional or consultancy work. TDS under section 194J may apply (10%, or 2% for technical services) once payments to this vendor pass ₹50,000 in the year.',
  contract: 'Contractor or service work. TDS under section 194C may apply (1% for individuals and HUF, 2% for others) if this bill is over ₹30,000 or the year\'s total with this vendor passes ₹1,00,000.',
}

// { [expenseId]: [{ kind, level, text }] } with level 'ok' | 'info' | 'warn' | 'bad'.
// Never throws: on any failure the checklist simply shows no tax checks.
export async function runTaxChecks(expenses) {
  const out = {}
  const add = (id, check) => { (out[id] ||= []).push(check) }
  try {
    const checked = Object.fromEntries(expenses.map(e => [e.id, checkGstin(e.gstin)]))
    const validGstins = [...new Set(Object.values(checked).filter(c => c?.valid).map(c => c.gstin))]
    const vendorIds = [...new Set(expenses.map(e => e.vendor_id).filter(Boolean))]

    const [byId, byGstin] = await Promise.all([
      vendorIds.length ? supabase.from('vendors').select('id, org_name, gstin, pan_number').in('id', vendorIds) : { data: [] },
      validGstins.length ? supabase.from('vendors').select('id, org_name, gstin, pan_number').in('gstin', validGstins) : { data: [] },
    ])
    const vendorById = Object.fromEntries((byId.data || []).map(v => [v.id, v]))

    for (const e of expenses) {
      const g = checked[e.id]
      const linked = e.vendor_id ? vendorById[e.vendor_id] : null

      // GSTIN: only when one was given.
      if (g && !g.valid) {
        const why = g.reason === 'checksum' ? 'its check digit does not add up, so it is probably mistyped'
          : g.reason === 'state' ? 'it starts with a state code that does not exist'
          : 'it is not in the 15-character GSTIN format'
        add(e.id, { kind: 'gstin', level: 'bad', text: `GSTIN ${g.gstin} looks wrong: ${why}.` })
      } else if (g?.valid) {
        add(e.id, { kind: 'gstin', level: 'ok', text: `GSTIN is valid (${g.state}).` })
      }

      // PAN and GSTIN against the vendor master: only for a registered vendor.
      if (linked) {
        const lg = checkGstin(linked.gstin)
        if (lg?.valid && linked.pan_number && lg.pan !== String(linked.pan_number).toUpperCase()) {
          add(e.id, { kind: 'pan_gst', level: 'bad', text: `The vendor master is inconsistent: its GSTIN carries PAN ${lg.pan} but its PAN is ${linked.pan_number}.` })
        }
        if (g?.valid) {
          if (linked.pan_number && g.pan !== String(linked.pan_number).toUpperCase()) {
            add(e.id, { kind: 'pan_gst', level: 'bad', text: `The PAN inside this GSTIN (${g.pan}) is not the vendor's registered PAN (${linked.pan_number}).` })
          } else if (lg?.valid && lg.gstin !== g.gstin) {
            add(e.id, { kind: 'pan_gst', level: 'warn', text: `This GSTIN differs from the one on the vendor master (${lg.gstin}). It may be another branch.` })
          } else if (linked.pan_number) {
            add(e.id, { kind: 'pan_gst', level: 'ok', text: `PAN in the GSTIN matches ${linked.org_name}'s registered PAN.` })
          }
        }
      } else if (g?.valid) {
        // Not tied to a vendor, but the GSTIN may belong to one we have registered.
        const owner = (byGstin.data || []).find(v => String(v.gstin).toUpperCase() === g.gstin)
        if (owner && e.vendor && !sameVendor(e.vendor, owner.org_name)) {
          add(e.id, { kind: 'pan_gst', level: 'warn', text: `This GSTIN is registered to ${owner.org_name}, but the vendor entered is ${e.vendor}.` })
        } else if (owner) {
          add(e.id, { kind: 'pan_gst', level: 'ok', text: `GSTIN matches registered vendor ${owner.org_name}.` })
        }
      }

      // TDS: only for fee and contractor categories.
      const tdsKind = TDS_BY_CATEGORY[e.category]
      if (tdsKind && Number(e.amount) > 0) {
        add(e.id, { kind: 'tds', level: 'info', section: tdsKind === 'professional' ? '194J' : '194C', text: TDS_TEXT[tdsKind] })
      }
    }
  } catch (err) {
    console.error('tax checks failed:', err)
  }
  return out
}
