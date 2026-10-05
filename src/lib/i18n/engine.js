import hi, { HI_PATTERNS } from './hi'

// Runtime English -> Hindi translator. Rather than threading t() calls through
// every form, it swaps the visible text (and placeholder/title/aria-label
// attributes) of whatever is on screen using a dictionary, and keeps doing so
// as React re-renders. Anything not in the dictionary — names, numbers,
// freshly-composed sentences — is simply left in English. Switching back
// restores the original English exactly. Default is English.
const KEY = 'nudge_lang_v1'
const ATTRS = ['placeholder', 'title', 'aria-label']
const SKIP = 'script, style, textarea, code, pre, noscript, [translate="no"], .notranslate, [contenteditable="true"]'

let lang = 'en'
const listeners = new Set()
const textOrig = new Map() // Text node -> { en, hi }
const attrOrig = new Map() // Element -> { attr: { en, hi } }
let observer = null

const patterns = HI_PATTERNS.map(([src, tpl]) => [new RegExp(src), tpl])

function translate(raw) {
  const lead = raw.match(/^\s*/)[0]
  const trail = raw.match(/\s*$/)[0]
  const key = raw.trim().replace(/\s+/g, ' ')
  if (!key || !/[A-Za-z]/.test(key)) return raw
  if (Object.prototype.hasOwnProperty.call(hi, key)) return lead + hi[key] + trail
  for (const [re, tpl] of patterns) {
    if (re.test(key)) return lead + key.replace(re, tpl) + trail
  }
  return raw
}

function doText(node) {
  const parent = node.parentElement
  if (!parent || parent.closest(SKIP)) return
  const cur = node.nodeValue
  const rec = textOrig.get(node)
  if (rec && cur === rec.hi) return
  const t = translate(cur)
  if (t !== cur) { textOrig.set(node, { en: cur, hi: t }); node.nodeValue = t }
  else if (rec) textOrig.delete(node)
}

function doAttr(el, attr) {
  const cur = el.getAttribute(attr)
  if (cur == null) return
  const rec = attrOrig.get(el)?.[attr]
  if (rec && cur === rec.hi) return
  const t = translate(cur)
  if (t !== cur) {
    const m = attrOrig.get(el) || {}
    m[attr] = { en: cur, hi: t }
    attrOrig.set(el, m)
    el.setAttribute(attr, t)
  } else if (rec) {
    const m = attrOrig.get(el)
    delete m[attr]
  }
}

function walk(root) {
  if (root.nodeType === Node.TEXT_NODE) { doText(root); return }
  if (root.nodeType !== Node.ELEMENT_NODE) return
  if (root.closest(SKIP)) return
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let n
  while ((n = tw.nextNode())) doText(n)
  const els = [root, ...root.querySelectorAll('[placeholder],[title],[aria-label]')]
  els.forEach(el => ATTRS.forEach(a => { if (el.hasAttribute?.(a)) doAttr(el, a) }))
}

function prune() {
  for (const n of textOrig.keys()) if (!n.isConnected) textOrig.delete(n)
  for (const e of attrOrig.keys()) if (!e.isConnected) attrOrig.delete(e)
}

function start() {
  document.documentElement.lang = 'hi'
  walk(document.body)
  if (observer) return
  observer = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(walk)
      else if (m.type === 'characterData') doText(m.target)
      else if (m.type === 'attributes') doAttr(m.target, m.attributeName)
    }
  })
  observer.observe(document.body, {
    childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS,
  })
}

function stop() {
  if (observer) { observer.disconnect(); observer = null }
  prune()
  textOrig.forEach((rec, node) => { if (node.nodeValue === rec.hi) node.nodeValue = rec.en })
  attrOrig.forEach((m, el) => Object.entries(m).forEach(([a, rec]) => { if (el.getAttribute(a) === rec.hi) el.setAttribute(a, rec.en) }))
  textOrig.clear(); attrOrig.clear()
  document.documentElement.lang = 'en'
}

export function getLang() { return lang }

export function subscribeLang(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setLang(next) {
  if (next === lang) return
  lang = next
  try { localStorage.setItem(KEY, next) } catch { /* private-browsing or storage disabled — just won't persist */ }
  if (next === 'hi') start(); else stop()
  listeners.forEach(fn => fn())
}

// Called once at startup (main.jsx): restores the saved choice, default English.
export function initLanguage() {
  let saved = 'en'
  try { saved = localStorage.getItem(KEY) === 'hi' ? 'hi' : 'en' } catch { /* default English */ }
  if (saved === 'hi') {
    lang = 'hi'
    // Started immediately (not on requestAnimationFrame — browsers pause
    // those for background tabs): the observer picks up everything React
    // renders afterwards, so it doesn't matter that the page is still empty.
    start()
  }
}
