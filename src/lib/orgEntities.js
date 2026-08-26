// Registered address for each Entity (see src/lib/donorData.js ENTITIES) —
// used on the Purchase Order PDF for the "Entity Name & Address" block, and
// as the default "Billing Address" / "Shipping Address" (a PO ships back to
// the entity's own office unless told otherwise).
//
// NLF - FCRA's address is confirmed from a real issued PO. The other three
// are placeholders — deliberately left blank rather than guessed, since this
// prints on a legal document sent to real vendors. Fill in the exact
// registered address string for each as it's confirmed.
//
// Keyed by both the full legal name used in the current donor mapping
// (src/lib/donorData.js, sourced from "PRPO module - mapping - mapping.pdf")
// and the short form used on any PR raised before that mapping was
// corrected — so a PO generated from an older PR still resolves correctly.
export const ENTITY_ADDRESSES = {
  'AIC': '',
  'AIC Developmental Foundation': '',
  'Nudge Lifeskills Foundation': '',
  'NLF - FCRA': 'Nudge Lifeskills Foundation FCRA, Ground Floor, Near APJ Abdul Kalam Enclave, Aswath Nagar Service Road, 15-19, NH 44, Dodda Nekkundi Extension, Marathahalli, Bengaluru, Karnataka, 560037, India',
  'Nudge Lifeskills Foundation - FCRA': 'Nudge Lifeskills Foundation FCRA, Ground Floor, Near APJ Abdul Kalam Enclave, Aswath Nagar Service Road, 15-19, NH 44, Dodda Nekkundi Extension, Marathahalli, Bengaluru, Karnataka, 560037, India',
  'TNF': '',
}

// City shown as "Place of Delivery" — defaults to Bengaluru (where the
// confirmed NLF - FCRA address sits) until told otherwise per entity.
export const ENTITY_CITY = {
  'AIC': 'Bengaluru',
  'AIC Developmental Foundation': 'Bengaluru',
  'Nudge Lifeskills Foundation': 'Bengaluru',
  'NLF - FCRA': 'Bengaluru',
  'Nudge Lifeskills Foundation - FCRA': 'Bengaluru',
  'TNF': 'Bengaluru',
}

export function getEntityAddress(entity) {
  return ENTITY_ADDRESSES[entity] || ''
}

export function getEntityCity(entity) {
  return ENTITY_CITY[entity] || ''
}
