// The Payment Mode choices on an expense, and the company cards a Company Card
// payment can be attributed to.
export const PAYMENT_MODES = ['Self - Cash/Card', 'Self - UPI', 'Company Card', 'Advance Adjustment']

export const CARD_NUMBERS = [
  'XXXX-XXXX-XXXX-3800',
  'XXXX-XXXX-XXXX-3750',
  'XXXX-XXXX-XXXX-3768',
  'XXXX-XXXX-XXXX-3735',
  'XXXX-XXXX-XXXX-3826',
  'XXXX-XXXX-XXXX-3776',
  'XXXX-XXXX-XXXX-3784',
  'XXXX-XXXX-XXXX-3818',
  'XXXX-XXXX-XXXX-3743',
  'XXXX-XXXX-XXXX-3792',
]

// Anything that says how something was paid (a receipt's "cash"/"card"/"upi",
// the capture flow's payment type, or an already-correct label) -> one of
// PAYMENT_MODES, or null when it can't be told.
export function toPaymentMode(raw) {
  if (!raw) return null
  if (PAYMENT_MODES.includes(raw)) return raw
  const v = String(raw).toLowerCase()
  if (v === 'upi') return 'Self - UPI'
  if (v === 'cash' || v === 'card' || v === 'online') return 'Self - Cash/Card'
  return null
}

// Payment details read off a receipt: the mode, plus the card number when the
// printed last four digits match one of the company cards. Everything is only
// a pre-fill — it can be changed on the form.
export function paymentFromReceipt(extracted) {
  const last4 = extracted?.card_last4
  if (last4) {
    const card = CARD_NUMBERS.find(c => c.endsWith(last4))
    if (card) return { payment_method: 'Company Card', card_no: card }
  }
  return { payment_method: toPaymentMode(extracted?.payment_mode), card_no: null }
}
