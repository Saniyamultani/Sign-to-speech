/**
 * Backend-powered sign detector — polls /api/sign/status
 * Uses Python OpenCV/MediaPipe/ONNX (no browser WASM issues)
 */
import { useState, useEffect, useCallback } from 'react'
import { fixGrammar } from '../ml/grammar'

function speakAppend(text) {
  if (!window.speechSynthesis || !text) return
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.95
  window.speechSynthesis.speak(u)
}

function speakInterrupt(text) {
  if (!window.speechSynthesis || !text) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.95
  window.speechSynthesis.speak(u)
}

export function useSignDetector() {
  const [cameraOn, setCameraOn] = useState(false)
  const [error, setError] = useState(null)
  const [confirmedSign, setConfirmedSign] = useState('Neutral')
  const [confidence, setConfidence] = useState(0)
  const [allProbs, setAllProbs] = useState({})
  const [words, setWords] = useState([])
  const [corrected, setCorrected] = useState('')
  const [isCorrected, setIsCorrected] = useState(false)
  const [lastNewWord, setLastNewWord] = useState(null)
  const [frameSrc, setFrameSrc] = useState(null) // base64 jpeg from backend

  const sentence = useRef({ words: [], corrected: '', isCorrected: false })

  const startCamera = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/sign/start', { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      setCameraOn(true)
    } catch (e) {
      setError(e.message)
      setCameraOn(false)
    }
  }, [])

  const stopCamera = useCallback(async () => {
    try {
      await fetch('/api/sign/stop', { method: 'POST' })
    } catch (e) {}
    setCameraOn(false)
    setConfirmedSign('Neutral')
    setConfidence(0)
    sentence.current = { words: [], corrected: '', isCorrected: false }
    setWords([])
    setCorrected('')
    setIsCorrected(false)
    setFrameSrc(null)
    window.speechSynthesis?.cancel()
  }, [])

  const applyGrammar = useCallback(() => {
    const raw = sentence.current.words.join(' ')
    if (!raw.trim()) return
    const fixed = fixGrammar(raw)
    sentence.current.corrected = fixed
    sentence.current.isCorrected = true
    setCorrected(fixed)
    setIsCorrected(true)
    speakInterrupt(fixed)
  }, [])

  const clearSentence = useCallback(() => {
    sentence.current.words = []
    setWords([])
    setCorrected('')
    setIsCorrected(false)
    window.speechSynthesis?.cancel()
  }, [])

  const undoWord = useCallback(() => {
    sentence.current.words.pop()
    setWords([...sentence.current.words])
    setIsCorrected(false)
  }, [])

  useEffect(() => {
    let interval = null
    if (cameraOn) {
      interval = setInterval(async () => {
        try {
          const res = await fetch('/api/sign/state')
          const state = await res.json()
          if (state.error) {
            setError(state.error)
            setCameraOn(false)
            return
          }
          setConfirmedSign(state.confirmed_sign || 'Neutral')
          setConfidence(state.confidence || 0)
          setAllProbs(state.probs || {})
          setFrameSrc(state.frame_jpeg ? `data:image/jpeg;base64,${state.frame_jpeg}` : null)
          if (state.new_word) {
            sentence.current.words.push(state.new_word)
            setWords([...sentence.current.words])
            setLastNewWord(state.new_word)
            speakAppend(state.new_word)
            setTimeout(() => setLastNewWord(null), 1500)
            setIsCorrected(false)
          }
        } catch (e) {
          console.error('[backend detector]', e)
        }
      }, 100) // 10Hz poll
    }
    return () => interval && clearInterval(interval)
  }, [cameraOn])

  return {
    cameraOn, error, setError,
    confirmedSign, confidence, allProbs,
    words, corrected, isCorrected,
    lastNewWord, frameSrc,
    startCamera, stopCamera,
    applyGrammar, clearSentence, undoWord,
  }
}

