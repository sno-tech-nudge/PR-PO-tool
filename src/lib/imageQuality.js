// A quick, deliberately forgiving look at an image to explain WHY a document
// could not be read — only used after the text reader has already come back
// empty, so it never blocks anything. Returns 'blank', 'dark', 'blurry' or
// null (nothing obviously wrong). Thresholds are set low on purpose: only a
// clearly unusable photo is named.
export async function describeUnreadableImage(base64) {
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = `data:image/jpeg;base64,${base64}`
    })
    const scale = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(8, Math.round(img.naturalWidth * scale))
    const h = Math.max(8, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)

    const gray = new Float32Array(w * h)
    let sum = 0
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      gray[p] = g
      sum += g
    }
    const mean = sum / gray.length
    let varSum = 0
    for (let p = 0; p < gray.length; p++) varSum += (gray[p] - mean) ** 2
    const std = Math.sqrt(varSum / gray.length)

    // Variance of a Laplacian: low when there are no sharp edges (blur).
    let lapSum = 0
    let lapSq = 0
    let n = 0
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x
        const lap = 4 * gray[p] - gray[p - 1] - gray[p + 1] - gray[p - w] - gray[p + w]
        lapSum += lap
        lapSq += lap * lap
        n++
      }
    }
    const lapVar = n ? lapSq / n - (lapSum / n) ** 2 : 0

    if (std < 8) return 'blank'
    if (mean < 40) return 'dark'
    if (lapVar < 12) return 'blurry'
    return null
  } catch {
    return null
  }
}

// Did the reader find anything useful? `keys` are the fields that count.
export function foundAnything(result, keys) {
  if (!result || typeof result !== 'object') return false
  return keys.some(k => {
    const v = result[k]
    return v != null && String(v).trim() !== ''
  })
}
