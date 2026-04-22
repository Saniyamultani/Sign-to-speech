/**
 * src/api/client.js
 * All backend calls in one place. Components never call fetch() directly.
 */

const BASE = '/api'

async function req(method, path, body) {
  const opts = {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }
  const res = await fetch(BASE + path, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Sign-to-Speech ───────────────────────────────────────────
export const signApi = {
  start:   ()    => req('POST', '/sign/start'),
  stop:    ()    => req('POST', '/sign/stop'),
  state:   ()    => req('GET',  '/sign/state'),
  classes: ()    => req('GET',  '/sign/classes'),
  grammar: ()    => req('POST', '/sign/grammar'),
  clear:   ()    => req('POST', '/sign/clear'),
  undo:    ()    => req('POST', '/sign/undo'),
  feedUrl: ()    => BASE + '/sign/feed',
}

// ── Text-to-Gesture ──────────────────────────────────────────
export const gestureApi = {
  enqueue:   (text) => req('POST', '/gesture/enqueue', { text }),
  status:    ()     => req('GET',  '/gesture/status'),
  clear:     ()     => req('POST', '/gesture/clear'),
  library:   ()     => req('GET',  '/gesture/library'),
  streamUrl: ()     => BASE + '/gesture/stream',
}

export const healthApi = {
  check: () => req('GET', '/health'),
}
