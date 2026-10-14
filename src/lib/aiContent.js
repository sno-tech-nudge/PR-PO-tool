// Spotting an image that is clearly AI-generated, for a small "AI content"
// label (the way social apps mark AI pictures). It is deliberately cautious:
// a wrong label on a real bill is worse than a missed one, so it only fires
// when it is sure, and it never blocks anything.
//
// Two signals, both strong:
//   1. the file's own embedded data says it was generated (the standard
//      "trained algorithmic media" source tag, or a known generator's name),
//   2. the reader that already looks at every receipt was certain from the picture.
// Neither is a guess from how a bill looks, so photos, scans, screenshots and
// poor-quality bills are not marked.

const SOURCE_TAGS = /trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|algorithmicMedia|compositeSynthetic/i
const GENERATORS = /Midjourney|DALL[·.\- ]?E|Stable ?Diffusion|Adobe Firefly|Firefly|SynthID|Imagen|Ideogram|Leonardo\.Ai|Flux\.1|Craiyon|NightCafe/i

// Looks through the start and end of the original file (where JPEG, PNG and
// WebP keep their embedded data) for those tags. Read on the file as it was
// picked, because the copy sent for reading has already been re-encoded and
// carries none of it.
export async function detectAiMetadata(file) {
  try {
    if (!file || typeof file.slice !== 'function' || file.type === 'application/pdf') return false
    const head = await file.slice(0, 400 * 1024).arrayBuffer()
    const tail = file.size > 400 * 1024 ? await file.slice(Math.max(400 * 1024, file.size - 200 * 1024)).arrayBuffer() : new ArrayBuffer(0)
    const text = new TextDecoder('latin1').decode(head) + new TextDecoder('latin1').decode(tail)
    return SOURCE_TAGS.test(text) || GENERATORS.test(text)
  } catch {
    return false
  }
}

// 'metadata' | 'model' | null. `extracted` is what the receipt reader returned.
export async function aiContentFlag(file, extracted) {
  if (await detectAiMetadata(file)) return 'metadata'
  if (extracted?.ai_generated === true) return 'model'
  return null
}
