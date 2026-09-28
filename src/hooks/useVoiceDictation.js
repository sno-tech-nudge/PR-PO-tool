import { useRef, useState, useEffect, useCallback } from 'react'

// Wraps the browser's built-in SpeechRecognition for live dictation into a
// text field. Best-effort, same as this app's OCR features: unsupported
// browsers or a recognition error never block typing or submission, they
// just mean voice input didn't work this time.
export function useVoiceDictation({ value, onChange, maxLength, lang = 'en-IN' }) {
  const SpeechRecognitionCtor = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null
  const supported = !!SpeechRecognitionCtor

  const [listening, setListening] = useState(false)
  const [error, setError] = useState(null)

  const recognitionRef = useRef(null)
  const baseValueRef = useRef('')
  const finalTranscriptRef = useRef('')
  const listeningRef = useRef(false)
  const manualStopRef = useRef(false)
  const restartCountRef = useRef(0)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    valueRef.current = value
    onChangeRef.current = onChange
  })

  useEffect(() => () => {
    manualStopRef.current = true
    try { recognitionRef.current?.abort() } catch { /* already stopped */ }
  }, [])

  const applyMerged = useCallback((spoken) => {
    const base = baseValueRef.current
    const merged = base ? `${base.trim()}${spoken ? ' ' + spoken : ''}` : spoken
    const clamped = typeof maxLength === 'number' ? merged.slice(0, maxLength) : merged
    onChangeRef.current(clamped)
  }, [maxLength])

  const start = useCallback(() => {
    if (!supported || listeningRef.current) return
    setError(null)
    baseValueRef.current = valueRef.current || ''
    finalTranscriptRef.current = ''
    manualStopRef.current = false
    restartCountRef.current = 0

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = lang

    recognition.onresult = (event) => {
      let interim = ''
      let finalChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        if (r.isFinal) finalChunk += r[0].transcript
        else interim += r[0].transcript
      }
      if (finalChunk) {
        finalTranscriptRef.current = `${finalTranscriptRef.current} ${finalChunk}`.trim()
        restartCountRef.current = 0
      }
      const spoken = `${finalTranscriptRef.current} ${interim}`.trim()
      applyMerged(spoken)
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        manualStopRef.current = true
        listeningRef.current = false
        setListening(false)
        setError('Microphone access denied — allow microphone access for this site in your browser settings.')
        return
      }
      if (event.error === 'audio-capture') {
        manualStopRef.current = true
        listeningRef.current = false
        setListening(false)
        setError('No microphone found.')
        return
      }
      // transient (network, service-not-allowed, etc.) — let onend's
      // auto-restart retry, but give up quietly after repeated failures
      restartCountRef.current += 1
      if (restartCountRef.current > 5) {
        manualStopRef.current = true
        listeningRef.current = false
        setListening(false)
        setError('Voice input stopped — you can keep typing, or try the mic again.')
      }
    }

    recognition.onend = () => {
      if (listeningRef.current && !manualStopRef.current) {
        try { recognition.start() } catch { /* a restart is already pending */ }
      } else {
        setListening(false)
      }
    }

    recognitionRef.current = recognition
    listeningRef.current = true
    setListening(true)
    recognition.start()
  }, [supported, lang, applyMerged, SpeechRecognitionCtor])

  const finish = useCallback(() => {
    manualStopRef.current = true
    listeningRef.current = false
    try { recognitionRef.current?.stop() } catch { /* already stopped */ }
    setListening(false)
  }, [])

  const cancel = useCallback(() => {
    manualStopRef.current = true
    listeningRef.current = false
    try { recognitionRef.current?.abort() } catch { /* already stopped */ }
    setListening(false)
    onChangeRef.current(baseValueRef.current)
  }, [])

  return { supported, listening, error, start, finish, cancel }
}
