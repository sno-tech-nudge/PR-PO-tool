// Converts a rupee amount to words using the Indian numbering system
// (crore/lakh/thousand/hundred) — used for the Purchase Order PDF's
// "Amount in words" line.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n) {
  if (n < 20) return ONES[n]
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(' ')
}

function threeDigits(n) {
  const parts = []
  if (n >= 100) { parts.push(ONES[Math.floor(n / 100)], 'Hundred'); n %= 100 }
  if (n > 0) parts.push(twoDigits(n))
  return parts.join(' ')
}

export function amountInWords(amount) {
  let n = Math.round(Number(amount) || 0)
  if (n === 0) return 'Zero'
  if (n < 0) return 'Minus ' + amountInWords(-n)

  const crore = Math.floor(n / 10000000); n %= 10000000
  const lakh  = Math.floor(n / 100000);   n %= 100000
  const thousand = Math.floor(n / 1000);  n %= 1000
  const hundred = n

  const parts = []
  if (crore) parts.push(threeDigits(crore), 'Crore')
  if (lakh) parts.push(threeDigits(lakh), 'Lakh')
  if (thousand) parts.push(threeDigits(thousand), 'Thousand')
  if (hundred) parts.push(threeDigits(hundred))

  return parts.join(' ')
}
