import { callGemini } from './gemini.js'
import { callGroq } from './groq.js'
import { GSTIN_FORMAT_RE } from './formCalc.js'

export async function checkDocumentQuality(base64Image) {
  return await callGemini(base64Image,
    'Look at this image. Is the text readable? Reply with JSON only, no markdown, no code blocks, just raw JSON: { "readable": true or false, "issue": null or "blurry" or "dark" or "cropped" }'
  )
}

export async function extractReceiptData(base64Image) {
  return tidyReceiptData(await callGemini(base64Image,
    `You are an expert at reading Indian expense receipts, tax invoices, hotel bills, restaurant bills, travel tickets, UPI screenshots, and handwritten bills. Extract all fields accurately.

--- AMOUNT (most important) ---
Always extract the FINAL amount the person actually paid. Priority order:
1. "Amount Payable" / "Net Payable" / "Total Payable"
2. "Grand Total" / "Net Total" / "Total Amount Due"
3. "Amount Due" / "Balance Due" / "Total Due"
4. If UPI/payment screenshot: the large rupee amount shown
5. If only one amount visible: use that
NEVER use: item rates, MRP, subtotals before tax, individual line items
Amount must be a plain number (384.00 not "Rs. 384")

--- VENDOR ---
The business/merchant name — found in the letterhead, top of bill, or stamp.
NOT the customer name, employee name, or "sold to" party.
Common types: hotel name, restaurant name, cab company, airline, shop name, UPI recipient name.
Keep it short and clean e.g. "Peerless Hotels Limited" not the full address.

--- DATE ---
The transaction/invoice date (not the due date or booking date).
Convert ALL formats to DD/MM/YYYY:
- 2025-03-16 → 16/03/2025
- March 16, 2025 → 16/03/2025
- 16 Mar 25 → 16/03/2025
- 16-03-2025 → 16/03/2025
- 16.03.2025 → 16/03/2025

--- CATEGORY ---
Choose exactly one from this list based on what was purchased:
"Travel Fare" — cab (Ola/Uber/Rapido/auto), flight (IndiGo/Air India/SpiceJet), train (IRCTC), bus, metro, toll, parking, fuel/petrol/diesel
"Bike Fare" — bike taxi (Rapido bike), two-wheeler hire, cycle rental
"Lodging and Boarding" — hotel stay, room rent, OYO, guesthouse, lodge, dharamshala, airbnb, room charges, lodging, accommodation
"Food" — restaurant, food, dining, in-room dining, breakfast/lunch/dinner, cafe, dhaba, canteen, Swiggy/Zomato order, biriyani, snacks, beverages, mess
"Learning and Development" — training, workshop, seminar, course fee, books, certification, conference registration, Udemy/Coursera
"Consultant Fee" — consulting charges, advisory fee, consultancy invoice
"Professional Fee" — professional services, technical services, design, audit
"Retainership / Consultancy" — monthly retainer, ongoing consultancy
"Legal Fees" — lawyer, advocate, legal services, court fees
"Courier" — courier, parcel, delivery, shipping, postage
"Service" — general services, maintenance contract, outsourced service
"Staff Welfare" — team outing, staff gifts, employee welfare, medical reimbursement
"Filing Fees" — government filing, registration fees, MCA fees, ROC
"Furniture and Fixtures" — furniture, fixtures, office furniture, equipment purchase
"Housekeeping" — cleaning, housekeeping, sanitation, janitorial
"Leasehold Improvements" — renovation, building improvement, interior fit-out
"Medicine" — pharmacy, medicine, medical supplies, health
"Relocation Allowance" — relocation, shifting charges, moving expenses
"Repairs and Maintenance" — repairs, AMC, maintenance, servicing
"Subscription / Software" — software subscription, SaaS, app license, domain, hosting
"Other" — anything that clearly doesn't fit above

--- INVOICE NUMBER ---
Look for labels: Invoice No, Invoice#, Bill No, Inv No, Receipt No, Ref No, Voucher No, POS No, RMS No, Order ID, Bill Number, Serial No
Take the alphanumeric code after the label. Examples: INV-2025-001, 873/POS/RMS/17247, B2025031601

--- GSTIN ---
A 15-character GST Identification Number. Pattern: 2 digits + 5 uppercase letters + 4 digits + 1 letter + 1 digit + Z + 1 alphanumeric
Example: 19AABCP9484D1Z3, 27AAPFU0939F1ZV, 06AADCM5146R1ZZ
Look near: GSTIN, GSTN, GST No, GST Reg No, Tax ID

--- PAYMENT MODE ---
How the bill was paid, ONLY if the receipt states it (look near: Paid By, Payment Mode, Mode of Payment, Tender, Settled by, or a card/UPI/cash line).
Return exactly one of: "cash", "card" (credit or debit card, POS slip), "upi" (UPI, GPay, PhonePe, Paytm, BHIM), "online" (net banking, wallet, prepaid, "paid online").
If the receipt does not say, return null. NEVER infer it from the type of business.

--- CARD LAST 4 ---
If paid by card and the last 4 digits are printed (e.g. XXXX1234, ****1234, "card ending 1234"), return just those 4 digits as a string. Otherwise null.

Reply with raw JSON only — no markdown, no backticks, no explanation:
{"amount":number,"vendor":string,"date":string,"category":string,"invoice_number":string,"gstin":string,"payment_mode":string,"card_last4":string}
Use null for any field genuinely not visible. Do not guess.`
  ))
}

// Cleans what the model returned so only usable values reach the form: a
// GSTIN that isn't a valid 15-character GSTIN, a card number that isn't four
// digits, or a payment mode outside the known set is dropped rather than
// pre-filled wrongly.
function tidyReceiptData(data) {
  if (!data || typeof data !== 'object') return data
  const out = { ...data }
  const gstin = typeof out.gstin === 'string' ? out.gstin.toUpperCase().replace(/\s+/g, '') : null
  out.gstin = gstin && GSTIN_FORMAT_RE.test(gstin) ? gstin : null
  const inv = typeof out.invoice_number === 'string' ? out.invoice_number.trim() : null
  out.invoice_number = inv || null
  const mode = typeof out.payment_mode === 'string' ? out.payment_mode.trim().toLowerCase() : null
  out.payment_mode = ['cash', 'card', 'upi', 'online'].includes(mode) ? mode : null
  const last4 = out.card_last4 != null ? String(out.card_last4).replace(/\D/g, '') : ''
  out.card_last4 = last4.length === 4 ? last4 : null
  return out
}

export async function detectUPI(base64Image) {
  return await callGemini(base64Image,
    'Is this a UPI payment screenshot from GPay, PhonePe, Paytm or any Indian UPI app? Reply with JSON only, no markdown, no code blocks, just raw JSON: { "is_upi": true or false, "amount": number, "recipient": string, "transaction_id": string, "date": string, "payment_app": string, "has_vendor_info": true or false }. Amount must be a number not a string. Use null for any value you cannot find.'
  )
}

export async function extractPaymentAmount(base64Image) {
  return await callGemini(base64Image,
    'Look at this payment document. It could be a UPI screenshot, bank SMS, or card SMS. Find the total amount that was debited or paid. Reply with JSON only, no markdown, no code blocks, just raw JSON: { "amount": number }. Amount must be a number not a string. Use null if you cannot find an amount.'
  )
}

export async function generateManagerSummary(report, expenses) {
  if (!expenses || !expenses.length) return null

  const byCategory = {}
  for (const exp of expenses) {
    const cat = exp.category || 'Other'
    byCategory[cat] = (byCategory[cat] || 0) + (exp.amount || 0)
  }

  const catLines = Object.entries(byCategory)
    .map(([cat, amt]) => `${cat}: INR ${amt.toFixed(0)}`)
    .join(', ')

  const expLines = expenses.map((exp, i) =>
    `${i+1}. ${exp.vendor || 'Unknown'} — ${exp.category || 'Other'} — INR ${exp.amount || 0}${exp.policy_status === 'violation' || exp.policy_status === 'flagged' ? ' [FLAGGED]' : ''}`
  ).join('\n')

  const prompt = `You are summarising an expense report for a manager who needs to approve it quickly. Be concise and professional.

REPORT: ${report.report_reference} | Total: INR ${report.total_amount} | Entity: ${report.brand || 'N/A'} | Route: ${report.approval_route || 'N/A'}
CATEGORIES: ${catLines}
EXPENSES:
${expLines}

Reply with JSON only, no markdown, no code blocks:
{
  "headline": "One sentence: what this report is about (purpose inferred from vendors/categories)",
  "breakdown": "2-3 sentences covering what was spent, on what categories, any notable items",
  "flags": "One sentence on any flagged/unusual items, or null if none",
  "recommendation": "approve" or "review",
  "recommendation_note": "One sentence explaining why"
}`

  return await callGroq([{ role: 'user', content: prompt }], { max_tokens: 400 })
}

export async function runAIVouchCheck(report, expenses) {
  if (!expenses || !expenses.length) return null

  const expLines = expenses.map((exp, i) => {
    return [
      `Exp${i + 1}:`,
      `Vendor="${exp.vendor || 'Unknown'}"`,
      `Category="${exp.category || 'Unknown'}"`,
      `Amount=INR ${exp.amount || 0}`,
      `Date=${exp.date || 'unknown'}`,
      `Payment=${exp.payment_method || 'unknown'}`,
      exp.invoice_number ? `Invoice=${exp.invoice_number}` : 'Invoice=MISSING',
      exp.gstin ? `GSTIN=${exp.gstin}` : 'GSTIN=none',
      exp.description ? `Note="${exp.description}"` : null,
      `ExpenseType=${exp.expense_type === 'multiple_people' ? 'Team' : 'Personal'}`,
      exp.policy_status ? `SystemFlag=${exp.policy_status}` : null,
    ].filter(Boolean).join(', ')
  }).join('\n')

  const submittedDate = report.created_at
    ? new Date(report.created_at).toLocaleDateString('en-IN')
    : 'unknown'

  const prompt = `You are a senior finance auditor for an Indian NGO. Audit this expense report for vouching.

REPORT: Ref=${report.report_reference || 'N/A'} | Brand=${report.brand || report.entity || 'N/A'} | Total=INR ${report.total_amount || 0} | Submitted=${submittedDate}

POLICY RULES:
- Hotel/Accommodation: max INR 3250/night (non-metro), INR 4000/night (metro cities)
- Meals: max INR 750 per person per day.
  * ExpenseType=Personal → limit is INR 750. If amount > 750, it IS a violation. Do the arithmetic — do not give benefit of the doubt.
  * ExpenseType=Team → divide amount by attendee count. If attendee count is missing, flag as "missing headcount — cannot verify per-person amount, potential violation".
  * Example: INR 882 Personal meal → 882 > 750 → flag as violation.
  * Example: INR 882 Team meal, 2 people → 441/person → pass.
- Submission window: expense date vs report submission date. If gap > 7 days, flag as late submission. Calculate the actual gap in days and state it explicitly.
- Invoices required for all amounts above INR 500.
- GSTIN preferred for expenses above INR 1000 (for input tax credit).
- Subgranting or donations must have prior approval documented.
- NLF FCRA entity: any expense above INR 20000 with donor connection is a hard block.
- Round-number amounts (e.g. INR 5000, INR 10000) without invoices are suspicious.
- Duplicate vendor + amount within same report is a duplicate risk.

EXPENSES (in order):
${expLines}

Reply with JSON only, no markdown, no explanation, no code blocks — raw JSON only:
{
  "overall": {
    "verdict": "approve",
    "summary": "2-3 sentence overall assessment",
    "confidence": "high"
  },
  "expenses": [
    { "index": 0, "verdict": "pass", "reason": "Looks clean" }
  ],
  "audit_notes": "2-4 sentence professional audit notes summarising findings, flagging missing docs, confirming policy compliance."
}
verdict values: "approve" | "query" | "flag"
expense verdict values: "pass" | "warn" | "flag"
confidence values: "high" | "medium" | "low"`

  return await callGroq([{ role: 'user', content: prompt }], { max_tokens: 900 })
}

// mimeType is optional — every browser call site pre-converts to a JPEG and
// never passes it (defaults to 'image/jpeg' in gemini.js). Only the
// server-side api/intake/extract.js passes 'application/pdf', since Gemini
// reads PDFs natively without needing to rasterize a page to an image.
export async function extractChequeDetails(base64Image, mimeType) {
  return await callGemini(base64Image,
    `You are extracting bank account and address details from an Indian cancelled cheque, bank statement, or passbook image.
The beneficiary_name is the account holder's name printed on the cheque (not the bank's name).
The account_number and ifsc_code are usually printed at the bottom of the cheque (MICR line) or on the passbook/statement header — IFSC is an 11-character code like SBIN0001234.
If a postal address for the account holder/organisation is printed anywhere on the document (often near the account holder's name), also extract it, split into a street/building line and the city, state, and 6-digit pincode.
Reply with raw JSON only — no markdown, no backticks, no explanation:
{"beneficiary_name":string,"account_number":string,"ifsc_code":string,"bank_name":string,"branch":string,"address_line1":string,"city":string,"state":string,"pincode":string}
Use null for any field not visible. Do not guess.`,
    mimeType
  )
}

export async function extractPanCardDetails(base64Image, mimeType) {
  return await callGemini(base64Image,
    `You are extracting details from an Indian PAN card, or a scanned/photographed copy of one.
The pan_number is a 10-character code printed on the card, format: 5 uppercase letters, then 4 digits, then 1 uppercase letter (e.g. ABCDE1234F).
The name is the holder's name printed on the card (for a company/firm/trust this is the organisation's name).
The date is the date printed on the card — a date of birth for an individual, or the date of incorporation/formation for an organisation. Convert it to DD/MM/YYYY.
Reply with raw JSON only — no markdown, no backticks, no explanation:
{"pan_number":string,"name":string,"date":string}
Use null for any field not clearly visible. Do not guess.`,
    mimeType
  )
}

export async function extractGstCertDetails(base64Image, mimeType) {
  return await callGemini(base64Image,
    `You are extracting details from an Indian GST Registration Certificate (Form GST REG-06), or a scanned/photographed copy of one.
The GSTIN is a 15-character code, usually printed near the top under "Registration Number" or "GSTIN", format: 2 digits (state code) + 5 uppercase letters + 4 digits + 1 uppercase letter + 1 digit-or-letter + "Z" + 1 alphanumeric (e.g. 29ABCDE1234F1Z5).
legal_name is the "Legal Name" on the certificate. address_line1 is the street/building part of the "Address of Principal Place of Business", city is the city/district, state is the state name, pincode is the 6-digit PIN code.
Reply with raw JSON only — no markdown, no backticks, no explanation:
{"gstin":string,"legal_name":string,"address_line1":string,"city":string,"state":string,"pincode":string}
Use null for any field not clearly visible. Do not guess.`,
    mimeType
  )
}

export async function extractMsmeCertDetails(base64Image, mimeType) {
  return await callGemini(base64Image,
    `You are extracting details from an Indian MSME/Udyam Registration Certificate, or a scanned/photographed copy of one.
The registration_number (also called "Udyam Registration Number" or "UDYAM No.") is printed near the top, format like UDYAM-KA-03-1234567 (older Udyog Aadhaar certificates instead have a 12-character alphanumeric UAN — extract whichever is present).
The category is the enterprise classification, printed as one of: Micro, Small, or Medium.
enterprise_name is the name of the enterprise. If a mobile number or email address of the enterprise is printed, extract it as phone (digits only, no +91) and email.
Reply with raw JSON only — no markdown, no backticks, no explanation:
{"registration_number":string,"category":string,"enterprise_name":string,"phone":string,"email":string}
Use null for any field not clearly visible. Do not guess.`,
    mimeType
  )
}

// Incorporation / registration certificate — Certificate of Incorporation
// (MCA), LLP certificate, partnership/trust/HUF deed, society registration.
export async function extractRegistrationCertDetails(base64Image, mimeType) {
  return await callGemini(base64Image,
    `You are extracting details from an Indian organisation registration document: a Certificate of Incorporation (MCA), an LLP incorporation certificate, a partnership deed, trust deed, HUF deed, or a society/co-operative registration certificate — or a scan/photo of one.
registration_number is the organisation's registration identifier: the CIN (21 characters, e.g. U74999KA2020PTC123456) for a company, the LLPIN (e.g. AAB-1234) for an LLP, otherwise the registration number printed on the certificate/deed. Extract exactly what is printed.
organisation_name is the registered name. date_of_incorporation is the date of incorporation/registration/execution, converted to DD/MM/YYYY.
state is the Indian state of the registered office or of the registering authority (e.g. "Karnataka" — the "State" in "Registrar of Companies, Karnataka"). address_line1, city and pincode (6 digits) come from the registered office address if one is printed.
Reply with raw JSON only — no markdown, no backticks, no explanation:
{"registration_number":string,"organisation_name":string,"date_of_incorporation":string,"state":string,"address_line1":string,"city":string,"pincode":string}
Use null for any field not clearly visible. Do not guess.`,
    mimeType
  )
}

export async function extractVendorQuote(base64Image, mimeType) {
  return await callGemini(base64Image,
    `You are extracting data from a vendor quote or invoice document. Extract all key fields accurately.
Reply with raw JSON only — no markdown, no backticks, no explanation:
{"vendor_name":string,"quote_number":string,"date":string,"line_items":[{"description":string,"qty":number,"unit_price":number,"total":number}],"subtotal":number,"tax":number,"total_amount":number}
Use null for any field not visible. date format: DD/MM/YYYY. All amounts as numbers.`,
    mimeType
  )
}

// Used by SubmitPOExpense.jsx (PO tranche/invoice capture) so the person
// never has to manually type the invoice number — it's read straight off
// the invoice document itself, same "best-effort, never a gate" contract as
// every other OCR call here.
export async function extractInvoiceDetails(base64Image, mimeType) {
  return await callGemini(base64Image,
    `You are extracting data from a vendor invoice document. Extract all key fields accurately.
The invoice_number is the invoice's own reference number (often printed near the top, labeled "Invoice No.", "Invoice #", or similar).
Reply with raw JSON only — no markdown, no backticks, no explanation:
{"invoice_number":string,"vendor_name":string,"date":string,"total_amount":number,"tax":number}
Use null for any field not clearly visible. date format: DD/MM/YYYY. All amounts as numbers. Do not guess.`,
    mimeType
  )
}

export async function generatePRSummary(prData, vendorData) {
  if (!prData || !vendorData) return null
  const prompt = `Generate a 2-sentence summary for a purchase request that needs approval.

PR Details:
- Amount: INR ${prData.amount}
- Purpose: ${prData.purpose}
- Category: ${prData.category}
- Entity: ${prData.entity}
- Vendor: ${vendorData.org_name} (approved on ${vendorData.approved_at ? new Date(vendorData.approved_at).toLocaleDateString('en-IN') : 'N/A'})
- Recurring: ${prData.is_recurring ? 'Yes, ' + (prData.recurring_frequency || '') : 'No'}

Reply with raw JSON only, no markdown:
{"summary":"Two sentences: what this purchase is for and key vendor/amount context for the approver."}`

  const result = await callGroq([{ role: 'user', content: prompt }], { max_tokens: 200 })
  return result?.summary ?? null
}

export async function suggestCategory(vendorName) {
  if (!vendorName) return null
  const result = await callGroq([{
    role: 'user',
    content: `Given this vendor name: "${vendorName}", what expense category does it belong to? Reply with JSON only, no markdown, no code blocks: { "category": one of these exact values only: "Travel Fare" or "Bike Fare" or "Lodging and Boarding" or "Food" or "Learning and Development" or "Consultant Fee" or "Professional Fee" or "Retainership / Consultancy" or "Legal Fees" or "Courier" or "Service" or "Staff Welfare" or "Filing Fees" or "Furniture and Fixtures" or "Housekeeping" or "Leasehold Improvements" or "Medicine" or "Relocation Allowance" or "Repairs and Maintenance" or "Subscription / Software" or "Other" }`,
  }], { max_tokens: 50 })
  return result?.category ?? null
}
