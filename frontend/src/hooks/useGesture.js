/**
 * src/hooks/useGesture.js
 * Text-to-Gesture: enqueue text, poll status, load library (bounded retry).
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { gestureApi } from '../api/client'

export function useGesture() {
  const [status,     setStatus]     = useState({ idle: true, playing: '', queued: [], not_found: [] })
  const [library,    setLibrary]    = useState([])
  const [lastResult, setLastResult] = useState(null)
  const [error,      setError]      = useState(null)
  const pollRef = useRef(null)

  // Load library ONCE with bounded retry (max 3 tries, then give up)
  useEffect(() => {
    let attempts = 0
    let timer = null
    const load = async () => {
      attempts++
      try {
        const r = await gestureApi.library()
        // Accept empty library as a valid response too — no infinite retry
        setLibrary(r.words || [])
        return     // Stop retrying — we got a response
      } catch (_) {
        if (attempts < 3) {
          timer = setTimeout(load, 1500)
        }
      }
    }
    load()
    return () => { if (timer) clearTimeout(timer) }
  }, [])

  // Status polling
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const s = await gestureApi.status()
        setStatus(s)
      } catch (_) {}
    }, 400)
    return () => clearInterval(pollRef.current)
  }, [])

  const enqueue = useCallback(async (text) => {
    if (!text.trim()) return
    setError(null)
    try {
      const res = await gestureApi.enqueue(text)
      setLastResult(res)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  const clear = useCallback(async () => {
    await gestureApi.clear().catch(() => {})
    setLastResult(null)
    setStatus({ idle: true, playing: '', queued: [], not_found: [] })
  }, [])

  return {
    status, library,
    lastResult, error,
    enqueue, clear,
    streamUrl: gestureApi.streamUrl(),
  }
}
