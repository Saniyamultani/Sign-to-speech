/**
 * src/hooks/useSignDetector.js
 *
 * Polls the vision service state at 5 Hz.
 * Fires TTS on each NEW confirmed word, deduped via new_word_id so two
 * parallel polls can't double-fire or drop events.
 * Does NOT cancel in-flight speech — words queue naturally.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { signApi } from '../api/client'

const POLL_INTERVAL = 200

function speakAppend(text) {
  if (!window.speechSynthesis || !text) return
  const utt = new SpeechSynthesisUtterance(text)
  utt.rate = 0.95
  utt.volume = 1
  window.speechSynthesis.speak(utt)
}

function speakInterrupt(text) {
  if (!window.speechSynthesis || !text) return
  window.speechSynthesis.cancel()
  const utt = new SpeechSynthesisUtterance(text)
  utt.rate = 0.95
  utt.volume = 1
  window.speechSynthesis.speak(utt)
}

export function useSignDetector() {
  const [cameraOn,      setCameraOn]      = useState(false)
  const [error,         setError]         = useState(null)
  const [confirmedSign, setConfirmedSign] = useState('Neutral')
  const [confidence,    setConfidence]    = useState(0)
  const [allProbs,      setAllProbs]      = useState({})
  const [words,         setWords]         = useState([])
  const [raw,           setRaw]           = useState('')
  const [corrected,     setCorrected]     = useState('')
  const [isCorrected,   setIsCorrected]   = useState(false)
  const [lastNewWord,   setLastNewWord]   = useState(null)
  const [classes,       setClasses]       = useState([])

  const pollRef           = useRef(null)
  const lastSeenWordIdRef = useRef(0)

  const startCamera = useCallback(async () => {
    try {
      setError(null)
      await signApi.start()
      setCameraOn(true)
      try {
        const c = await signApi.classes()
        setClasses(c.classes || [])
      } catch (_) {}
    } catch (e) {
      setError(e.message)
    }
  }, [])

  const stopCamera = useCallback(async () => {
    clearInterval(pollRef.current)
    try { await signApi.stop() } catch (_) {}
    setCameraOn(false)
    setConfirmedSign('Neutral')
    setConfidence(0)
    setAllProbs({})
    if (window.speechSynthesis) window.speechSynthesis.cancel()
  }, [])

  const applyGrammar = useCallback(async () => {
    try {
      const res = await signApi.grammar()
      setCorrected(res.corrected)
      setIsCorrected(true)
      speakInterrupt(res.corrected)
    } catch (e) { setError(e.message) }
  }, [])

  const clearSentence = useCallback(async () => {
    try {
      await signApi.clear()
      setWords([]); setRaw(''); setCorrected(''); setIsCorrected(false)
      if (window.speechSynthesis) window.speechSynthesis.cancel()
    } catch (e) { setError(e.message) }
  }, [])

  const undoWord = useCallback(async () => {
    try {
      const res = await signApi.undo()
      setWords(res.words); setRaw(res.raw)
      setIsCorrected(false)
    } catch (e) { setError(e.message) }
  }, [])

  const speakCorrectedAgain = useCallback(() => {
    if (corrected) speakInterrupt(corrected)
  }, [corrected])

  useEffect(() => {
    if (!cameraOn) return
    pollRef.current = setInterval(async () => {
      try {
        const s = await signApi.state()
        setConfirmedSign(s.confirmed_sign)
        setConfidence(s.confidence)
        setAllProbs(s.all_probs || {})
        setWords(s.words)
        setRaw(s.raw)
        setCorrected(s.corrected)
        setIsCorrected(s.is_corrected)

        if (s.error) setError(s.error)

        if (s.new_word && s.new_word_id > lastSeenWordIdRef.current) {
          lastSeenWordIdRef.current = s.new_word_id
          setLastNewWord(s.new_word)
          speakAppend(s.new_word)
          setTimeout(() => setLastNewWord(null), 1500)
        }
      } catch (e) {
        setError('Lost connection to backend: ' + e.message)
      }
    }, POLL_INTERVAL)

    return () => clearInterval(pollRef.current)
  }, [cameraOn])

  return {
    cameraOn,
    error, setError,
    confirmedSign, confidence, allProbs,
    words, raw, corrected, isCorrected,
    lastNewWord, classes,
    startCamera, stopCamera,
    applyGrammar, clearSentence, undoWord, speakCorrectedAgain,
    feedUrl: signApi.feedUrl(),
  }
}
