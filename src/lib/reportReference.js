export function generateReportReference() {
  const y = String(new Date().getFullYear()).slice(-2)
  return 'TNI' + y + Math.floor(1000 + Math.random() * 9000)
}
