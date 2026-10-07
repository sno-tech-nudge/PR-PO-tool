// Step lists for the guided tours (rendered by components/shared/GuidedTour.jsx).
// `anchor` matches a data-tour-anchor attribute on the page; null/absent
// anchors show as a centred card.

export const HOME_TOUR = [
  { anchor: 'quick-add', text: 'Start here: register a vendor, add a new expense with a receipt (we’ll read the amount, vendor and date for you), or start a report.' },
  { anchor: 'pr-nav', text: 'Need to buy something first? Start a Purchase Request here.' },
  { anchor: null, text: 'When you raise a Purchase Request, look for the ⓘ icon next to Allocation — it explains what % to charge each donor/programme.' },
  { anchor: null, text: 'Before submitting any form, you can preview an attached document first — look for the ↗ Preview link next to any upload.' },
]

export const VENDOR_TOUR = [
  { anchor: 'vendor-docs', text: 'This list shows which documents you need, based on your type of organisation, and ticks each one as you attach it. It folds away when you don’t need it. Open it any time.' },
  { anchor: 'vendor-attachments', text: 'Attach your documents in this panel. We read each one and fill in the form for you, and fields filled this way carry a green tag. Under each document you’ll see what was read and what you need to type in yourself. Use “Show in form” to jump to it, and fold the panel away if you need the space.' },
  { anchor: 'vendor-org', text: 'Start with the organisation’s name, address and PAN. The Type of Organisation you choose decides which documents are asked for. Anything a document fills in here is tagged.' },
  { anchor: 'vendor-contact', text: 'Contact person, phone, email and registration details. The registration number, state and incorporation date fill in from the registration certificate. Whatever couldn’t be read, please type in yourself.' },
  { anchor: 'vendor-bank', text: 'Bank details come from the cancelled cheque or statement. Type the IFSC code and the bank name and branch fill in automatically.' },
  { anchor: 'vendor-submit', text: 'When everything is filled in, Submit for Approval — you’ll get a final review first. Not ready? Save as Draft and finish later.' },
]

export const PR_TOUR = [
  { anchor: 'pr-steps', text: 'A purchase request has three steps: Program & Donor, Purchase Details, then Review. You can go back at any time, and Save as Draft keeps your work.' },
  { anchor: 'pr-allocation', text: 'Step 1 — choose which donor/programme budget this purchase is charged to. Most purchases need one row at 100%; add a second only if the cost is genuinely split.' },
  { anchor: null, text: 'Step 2 — pick an approved vendor, then add each item: what it is, quantity, category and rate, plus tax and the dates. Purchases of ₹25,000 or more need quotes attached.' },
  { anchor: null, text: 'Also in step 2 — attach the required quotes (or explain why there is a single source), and set the payment terms: how much is paid in advance and the credit period for the rest.' },
  { anchor: null, text: 'Step 3 — a plain-English summary of your request. Check it, then submit. It goes to your Functional Leader first, then the PR Approver, and you’re notified at each stage.' },
]

export const REPORT_TOUR = [
  { anchor: 'er-list', text: 'These are your saved expenses, including receipts you saved to file later. Tick the ones that belong in this report.' },
  { anchor: 'er-add', text: 'Missing one? Click + Add expense and drop in the receipts. They’re read automatically and added here, ticked.' },
  { anchor: 'er-preview', text: 'Click Continue to report. Next you’ll see all your receipts on the left and the details to fill in on the right.' },
  { anchor: null, text: 'First confirm the purpose and duration and click Continue. Then fill in any expense marked Needs details, and go straight to the preview, where any policy flags are shown before you submit.' },
  { anchor: null, text: 'After you submit, you’ll see everything you submitted along with the approval timeline. You’ll get a notification at each step.' },
]
