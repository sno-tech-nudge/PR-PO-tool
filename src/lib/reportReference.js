// TNIV.. for a report paying an invoice against a Purchase Order (money
// ultimately going to an external vendor's account, subject to TDS) vs
// TNIE.. for an employee's own out-of-pocket reimbursement claim — lets
// Finance filter/sort on the reference alone to prioritise vendor payments
// instead of having to open each report to tell the two apart.
export function generateReportReference(isVendorPayment = false) {
  const y = String(new Date().getFullYear()).slice(-2)
  const prefix = isVendorPayment ? 'TNIV' : 'TNIE'
  return prefix + y + Math.floor(1000 + Math.random() * 9000)
}
