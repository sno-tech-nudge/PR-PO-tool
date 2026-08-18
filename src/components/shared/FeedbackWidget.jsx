import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const CATEGORIES = [
  { key: 'bug', label: 'Bug', icon: '⚠' },
  { key: 'feature', label: 'Feature idea', icon: '✦' },
  { key: 'general', label: 'General feedback', icon: '✎' },
]

const PLACEHOLDERS = {
  bug: { title: 'Short summary of the bug', description: 'What did you expect vs. what happened? How do we reproduce it?' },
  feature: { title: 'Short summary of the idea', description: 'What would this let you do, and why does it matter?' },
  general: { title: 'Short summary', description: 'Tell us what\'s on your mind' },
}

const SEVERITIES = ['Low', 'Medium', 'High', 'Blocker']

const TIME_OPTIONS = ['Just now', 'Earlier today', 'Yesterday', 'Pick a date & time']

function parseBrowserOS(ua) {
  let browser = 'Unknown browser'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari'

  let os = 'Unknown OS'
  if (/Windows/.test(ua)) os = 'Windows'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/iPhone|iPad/.test(ua)) os = 'iOS'
  else if (/Linux/.test(ua)) os = 'Linux'

  return `${browser} · ${os}`
}

function relativeToISO(option) {
  const now = new Date()
  if (option === 'Just now') return now.toISOString()
  if (option === 'Earlier today') { now.setHours(now.getHours() - 3); return now.toISOString() }
  if (option === 'Yesterday') { now.setDate(now.getDate() - 1); return now.toISOString() }
  return null
}

// The button's chosen position — remembered across visits since it's used
// rarely and shouldn't have to be moved out of the way every time.
const POS_KEY = 'nudge_feedback_button_pos'
const DRAG_THRESHOLD = 4 // px of movement before a press counts as a drag, not a click

function loadPos() {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

function clampPos(pos, width, height) {
  const maxLeft = Math.max(4, window.innerWidth - width - 4)
  const maxTop = Math.max(4, window.innerHeight - height - 4)
  return { left: Math.min(Math.max(4, pos.left), maxLeft), top: Math.min(Math.max(4, pos.top), maxTop) }
}

// Floating "Share feedback" button + slide-in drawer, mounted globally so
// it's available from every screen. Matches the app's own visual language
// (plain inline styles, single accent color, no new UI kit).
export default function FeedbackWidget({ user, moduleName }) {
  const [open, setOpen] = useState(false)
  const [buttonPos, setButtonPos] = useState(loadPos)
  const [dragging, setDragging] = useState(false)
  const buttonRef = useRef(null)
  const dragRef = useRef({ startX: 0, startY: 0, origTop: 0, origLeft: 0, moved: false })
  const [category, setCategory] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState(null)
  const [timeFrame, setTimeFrame] = useState(null)
  const [customDateTime, setCustomDateTime] = useState('')
  const [screenshotFile, setScreenshotFile] = useState(null)
  const [screenshotPreview, setScreenshotPreview] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)
  const [screenshotError, setScreenshotError] = useState(null)
  const fileInputRef = useRef(null)
  const drawerRef = useRef(null)

  // Keep the button on-screen if the window is resized smaller than wherever
  // it was last dropped.
  useEffect(() => {
    function handleResize() {
      if (!buttonPos || !buttonRef.current) return
      const rect = buttonRef.current.getBoundingClientRect()
      setButtonPos(prev => (prev ? clampPos(prev, rect.width, rect.height) : prev))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [buttonPos])

  function handleButtonPointerDown(e) {
    const rect = buttonRef.current.getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origTop: rect.top, origLeft: rect.left, moved: false }
    setDragging(true)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  function handleButtonPointerMove(e) {
    if (!dragging) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (!dragRef.current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    dragRef.current.moved = true
    const rect = buttonRef.current.getBoundingClientRect()
    setButtonPos(clampPos({ left: dragRef.current.origLeft + dx, top: dragRef.current.origTop + dy }, rect.width, rect.height))
  }

  function handleButtonPointerUp(e) {
    setDragging(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    if (dragRef.current.moved) {
      setButtonPos(current => {
        if (current) localStorage.setItem(POS_KEY, JSON.stringify(current))
        return current
      })
    } else {
      setOpen(true)
    }
  }

  useEffect(() => {
    if (!open) return
    function handleKey(e) { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    function handlePaste(e) {
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'))
      if (item) applyScreenshotFile(item.getAsFile())
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [open])

  function resetForm() {
    setCategory(null); setTitle(''); setDescription(''); setSeverity(null)
    setTimeFrame(null); setCustomDateTime('')
    setScreenshotFile(null); setScreenshotPreview(null); setScreenshotError(null)
  }

  function handleClose() {
    setOpen(false)
    resetForm()
  }

  function applyScreenshotFile(file) {
    setScreenshotError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) { setScreenshotError('Only image files are supported.'); return }
    if (file.size > 5 * 1024 * 1024) { setScreenshotError('Image must be under 5MB.'); return }
    setScreenshotFile(file)
    setScreenshotPreview(URL.createObjectURL(file))
  }

  async function handleCaptureScreen() {
    setCapturing(true)
    setOpen(false) // hide the drawer/backdrop so they don't appear in the capture
    await new Promise(resolve => setTimeout(resolve, 250))
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(document.body, { useCORS: true, logging: false })
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      const file = new File([blob], 'capture.png', { type: 'image/png' })
      setOpen(true)
      applyScreenshotFile(file)
    } catch {
      setOpen(true)
      setScreenshotError('Could not capture the screen. Try uploading an image instead.')
    }
    setCapturing(false)
  }

  function removeScreenshot() {
    setScreenshotFile(null)
    setScreenshotPreview(null)
    setScreenshotError(null)
  }

  const canSubmit = !!category && title.trim() && description.trim() && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      let screenshotPath = null
      if (screenshotFile) {
        const ext = screenshotFile.name.split('.').pop() || 'png'
        const path = `feedback/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('feedback-screenshots').upload(path, screenshotFile)
        if (uploadErr) throw uploadErr
        screenshotPath = path
      }

      const occurredAt = timeFrame === 'Pick a date & time'
        ? (customDateTime ? new Date(customDateTime).toISOString() : null)
        : relativeToISO(timeFrame)

      const { data, error } = await supabase.from('feedback').insert({
        category,
        title: title.trim(),
        description: description.trim(),
        severity: category === 'bug' ? severity : null,
        time_frame: timeFrame,
        occurred_at: occurredAt,
        page_url: window.location.href,
        module: moduleName || null,
        browser_info: parseBrowserOS(navigator.userAgent),
        screen_resolution: `${window.screen.width}x${window.screen.height}`,
        screenshot_path: screenshotPath,
        submitter_name: user?.name || null,
        submitter_email: user?.email || null,
      }).select('id').single()
      if (error) throw error

      const refId = (data?.id || '').slice(0, 8).toUpperCase()
      setToast({ type: 'success', message: `Thanks! Feedback submitted — ref ${refId}` })
      handleClose()
    } catch (err) {
      console.error('Feedback submit error:', err)
      setToast({ type: 'error', message: 'Could not submit feedback. Please try again.' })
    }
    setSubmitting(false)
  }

  const inputStyle = {
    width: '100%', height: '40px', border: '1px solid #E3E8EF', borderRadius: '4px',
    padding: '0 12px', fontSize: '13px', color: '#1A1F36', outline: 'none',
    boxSizing: 'border-box', background: '#FFFFFF', fontFamily: 'inherit',
  }

  const contextChips = [
    ['Page', window.location.pathname + window.location.hash || '/'],
    ['Module', moduleName || '—'],
    ['Browser / OS', parseBrowserOS(navigator.userAgent)],
    ['Screen', `${window.screen.width}×${window.screen.height}`],
    ['User', user?.name ? `${user.name} (${user.email})` : (user?.email || '—')],
  ]

  return (
    <>
      {!capturing && !open && (
        <div
          ref={buttonRef}
          onPointerDown={handleButtonPointerDown}
          onPointerMove={handleButtonPointerMove}
          onPointerUp={handleButtonPointerUp}
          title="Share feedback — drag to move"
          style={{
            position: 'fixed', zIndex: 150,
            ...(buttonPos ? { top: `${buttonPos.top}px`, left: `${buttonPos.left}px` } : { bottom: '20px', right: '20px' }),
            height: '40px', padding: '0 16px', borderRadius: '20px',
            background: '#8C3225', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px',
            cursor: dragging ? 'grabbing' : 'grab', boxShadow: '0 4px 14px rgba(0,0,0,0.2)', fontSize: '13px', fontWeight: 600,
            userSelect: 'none', touchAction: 'none',
          }}
        >
          <span style={{ fontSize: '14px' }}>✎</span>
          Share feedback
        </div>
      )}

      {open && (
        <div
          onClick={handleClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.5)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
        >
          <div
            ref={drawerRef}
            onClick={e => e.stopPropagation()}
            style={{
              width: '440px', maxWidth: '100%', height: '100vh', background: '#FFFFFF',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column',
              overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid #E3E8EF', flexShrink: 0 }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#1A1F36' }}>Share feedback</div>
              <div onClick={handleClose} style={{ cursor: 'pointer', fontSize: '18px', color: '#6B7280', lineHeight: 1 }}>×</div>
            </div>

            <div style={{ padding: '20px', flex: 1 }}>
              {/* Category picker */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                {CATEGORIES.map(c => (
                  <div
                    key={c.key}
                    onClick={() => setCategory(c.key)}
                    style={{
                      flex: 1, border: `1.5px solid ${category === c.key ? '#8C3225' : '#E3E8EF'}`,
                      background: category === c.key ? '#fdf0ed' : '#FFFFFF', borderRadius: '6px',
                      padding: '14px 8px', textAlign: 'center', cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '18px', color: category === c.key ? '#8C3225' : '#6B7280', marginBottom: '6px' }}>{c.icon}</div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: category === c.key ? '#8C3225' : '#374151' }}>{c.label}</div>
                  </div>
                ))}
              </div>

              {category && (
                <>
                  {/* Title */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px', display: 'block' }}>
                      Title<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder={PLACEHOLDERS[category].title}
                      style={inputStyle}
                    />
                  </div>

                  {/* Description */}
                  <div style={{ marginBottom: '18px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px', display: 'block' }}>
                      Description<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder={PLACEHOLDERS[category].description}
                      rows={4}
                      style={{ ...inputStyle, height: 'auto', minHeight: '90px', padding: '10px 12px', resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  </div>

                  {/* Severity — bug only */}
                  {category === 'bug' && (
                    <div style={{ marginBottom: '18px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '7px', display: 'block' }}>Severity</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {SEVERITIES.map(s => (
                          <div
                            key={s}
                            onClick={() => setSeverity(prev => prev === s ? null : s)}
                            style={{
                              flex: 1, textAlign: 'center', padding: '8px 6px', borderRadius: '16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                              border: `1.5px solid ${severity === s ? '#8C3225' : '#E3E8EF'}`,
                              background: severity === s ? '#8C3225' : '#FFFFFF',
                              color: severity === s ? '#FFFFFF' : '#374151',
                            }}
                          >
                            {s}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Time frame */}
                  <div style={{ marginBottom: '18px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '7px', display: 'block' }}>When did this happen</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {TIME_OPTIONS.map(t => (
                        <div
                          key={t}
                          onClick={() => setTimeFrame(prev => prev === t ? null : t)}
                          style={{
                            padding: '7px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer',
                            border: `1.5px solid ${timeFrame === t ? '#8C3225' : '#E3E8EF'}`,
                            background: timeFrame === t ? '#fdf0ed' : '#FFFFFF',
                            color: timeFrame === t ? '#8C3225' : '#374151', fontWeight: timeFrame === t ? 600 : 400,
                          }}
                        >
                          {t}
                        </div>
                      ))}
                    </div>
                    {timeFrame === 'Pick a date & time' && (
                      <input
                        type="datetime-local"
                        value={customDateTime}
                        onChange={e => setCustomDateTime(e.target.value)}
                        style={{ ...inputStyle, marginTop: '10px' }}
                      />
                    )}
                  </div>

                  {/* Screenshot */}
                  <div style={{ marginBottom: '18px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '7px', display: 'block' }}>Screenshot (optional)</label>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <button
                        type="button"
                        onClick={handleCaptureScreen}
                        style={{ flex: 1, height: '36px', border: '1px solid #E3E8EF', borderRadius: '4px', background: '#FFFFFF', color: '#374151', fontSize: '12px', cursor: 'pointer' }}
                      >
                        Capture current screen
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{ flex: 1, height: '36px', border: '1px solid #E3E8EF', borderRadius: '4px', background: '#FFFFFF', color: '#374151', fontSize: '12px', cursor: 'pointer' }}
                      >
                        Upload image
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={e => applyScreenshotFile(e.target.files?.[0])}
                      />
                    </div>

                    {screenshotPreview ? (
                      <div style={{ border: '1px solid #E3E8EF', borderRadius: '4px', padding: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img src={screenshotPreview} alt="Screenshot preview" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '3px', flexShrink: 0 }} />
                        <div style={{ fontSize: '12px', color: '#6B7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {screenshotFile?.name}
                        </div>
                        <span onClick={removeScreenshot} style={{ fontSize: '12px', color: '#B91C1C', cursor: 'pointer', flexShrink: 0 }}>Remove</span>
                      </div>
                    ) : (
                      <div
                        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={e => { e.preventDefault(); setDragOver(false); applyScreenshotFile(e.dataTransfer.files?.[0]) }}
                        style={{
                          border: `1.5px dashed ${dragOver ? '#8C3225' : '#D1D5DB'}`, borderRadius: '4px',
                          padding: '14px', textAlign: 'center', fontSize: '11px', color: '#9CA3AF',
                          background: dragOver ? '#fdf0ed' : '#FAFAFA',
                        }}
                      >
                        Drag & drop, or paste (Ctrl/Cmd+V) an image
                      </div>
                    )}
                    {screenshotError && (
                      <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '6px' }}>{screenshotError}</div>
                    )}
                  </div>

                  {/* Auto-attached context */}
                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '7px', display: 'block' }}>Auto-attached context</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {contextChips.map(([label, value]) => (
                        <div key={label} style={{ fontSize: '11px', color: '#6B7280', background: '#F3F4F6', borderRadius: '3px', padding: '4px 8px' }}>
                          <span style={{ fontWeight: 600 }}>{label}:</span> {value}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: '10px', padding: '16px 20px', borderTop: '1px solid #E3E8EF', flexShrink: 0 }}>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{
                  flex: 1, height: '42px', borderRadius: '4px', fontSize: '13px', fontWeight: 600, border: 'none',
                  background: canSubmit ? '#8C3225' : '#9CA3AF', color: '#FFFFFF', cursor: canSubmit ? 'pointer' : 'default',
                }}
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
              <button
                onClick={handleClose}
                style={{ height: '42px', padding: '0 20px', border: '1px solid #D1D5DB', borderRadius: '4px', background: '#FFFFFF', color: '#374151', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: '20px', right: '20px', zIndex: 250,
          background: '#FFFFFF', border: `1px solid ${toast.type === 'success' ? '#16A34A' : '#DC2626'}`,
          borderRadius: '6px', padding: '12px 16px', fontSize: '13px', color: '#1A1A1A',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '320px',
        }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: toast.type === 'success' ? '#16A34A' : '#DC2626', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>{toast.message}</div>
          <span onClick={() => setToast(null)} style={{ cursor: 'pointer', color: '#6B7280', flexShrink: 0 }}>×</span>
        </div>
      )}
    </>
  )
}
