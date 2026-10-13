// A fingerprint (SHA-256) of the receipt image exactly as it is stored, so the
// same receipt filed twice, by anyone, can be recognised. Never throws: if the
// browser cannot compute it the receipt is simply saved without one.
export async function hashBlob(blob) {
  try {
    if (!blob || !globalThis.crypto?.subtle) return null
    const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}
