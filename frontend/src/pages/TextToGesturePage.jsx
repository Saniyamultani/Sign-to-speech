/**
 * TextToGesturePage.jsx — Signal
 * Clean layout: video on the left, text input + library on the right.
 */
import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Trash2, Loader, PlayCircle, BookOpen, Plus,
} from 'lucide-react'
import { useGesture } from '../hooks/useGesture'
import {
  TopBar, PageTitle, ErrorToast, StatusDot,
  SuccessChip, WarnChip,
} from '../components/ui'

export default function TextToGesturePage({ onBack }) {
  const { status, library, lastResult, error, enqueue, clear, streamUrl } = useGesture()
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const inputRef = useRef(null)

  const isPlaying = Boolean(status.playing)

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (!input.trim()) return
    setLoading(true)
    await enqueue(input.trim())
    setInput('')
    setLoading(false)
    inputRef.current?.focus()
  }

  const insertWord = (word) => {
    setInput(prev => (prev.trim() ? prev.trim() + ' ' + word : word))
    inputRef.current?.focus()
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 48 }}>
      <TopBar onBack={onBack} accent="amber" moduleLabel="Text → Gesture" />

      <div className="container" style={{ marginTop: 8 }}>
        <PageTitle
          eyebrow="Module 02"
          title="Text to Gesture"
          description="Type words or phrases — matching sign videos play back in sequence. Build your own library by adding .mp4 files to /library."
          accent="amber"
        />

        <ErrorToast message={error} />

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: 20,
          alignItems: 'start',
        }}
        className="t2g-grid"
        >

          {/* ── LEFT: video + input ──────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Video viewport */}
            <div className="card" style={{
              aspectRatio: '16/9',
              position: 'relative',
              background: '#000',
              overflow: 'hidden',
            }}>
              {/* Always-mounted img — prevents the MJPEG stream from dropping
                  the first frames when the queue becomes non-empty */}
              <img
                src={streamUrl}
                alt=""
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'contain',
                  display: isPlaying ? 'block' : 'none',
                }}
              />

              {!isPlaying && (
                <div style={{
                  width: '100%', height: '100%',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 14,
                  background: 'radial-gradient(circle at center, #1a1208 0%, #0a0e1a 100%)',
                }}>
                  <PlayCircle size={44} color="var(--ink-4)" strokeWidth={1.5} />
                  <span className="mono" style={{
                    fontSize: 12, color: 'var(--ink-3)',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}>Waiting for input</span>
                </div>
              )}

              {/* Now-playing badge overlay */}
              {isPlaying && (
                <div style={{
                  position: 'absolute', bottom: 14, left: 14, right: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 16px',
                  background: 'rgba(10,14,26,0.82)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid rgba(245,182,78,0.3)',
                  pointerEvents: 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="pulse-dot" style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'var(--amber)',
                      boxShadow: '0 0 8px var(--amber)',
                    }} />
                    <span className="display" style={{
                      fontSize: '1.25rem',
                      color: 'var(--amber)',
                      textTransform: 'lowercase',
                    }}>
                      {status.playing}
                    </span>
                  </div>
                  <span className="mono" style={{
                    fontSize: 10, color: 'var(--ink-3)',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}>Playing</span>
                </div>
              )}
            </div>

            {/* Queue status strip */}
            <div className="card" style={{
              padding: '14px 18px',
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 14,
            }}>
              <StatusDot
                active={isPlaying}
                label={isPlaying ? 'Playing' : 'Idle'}
                color="#f5b64e"
              />
              {status.queued && status.queued.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                }}>
                  <span className="label">Queue:</span>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                    {status.queued.slice(0, 5).join('  →  ')}
                    {status.queued.length > 5 && `  +${status.queued.length - 5} more`}
                  </span>
                </div>
              )}
              {status.not_found && status.not_found.length > 0 && (
                <span className="mono" style={{ fontSize: 11.5, color: 'var(--danger)' }}>
                  Missing: {status.not_found.join(', ')}
                </span>
              )}
            </div>

            {/* Input form */}
            <div className="card card-padded" style={{ padding: '20px 22px' }}>
              <div className="label" style={{ marginBottom: 12 }}>
                Type signs to translate
              </div>
              <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder='e.g. "hello thank you"'
                  className="input"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="btn btn-primary"
                  style={{
                    background: input.trim() ? 'var(--amber)' : 'var(--bg-2)',
                    color: input.trim() ? '#1a1208' : 'var(--ink-4)',
                    boxShadow: input.trim() ? '0 2px 12px var(--amber-dim)' : 'none',
                  }}
                >
                  {loading
                    ? <Loader size={14} style={{ animation: 'gradient-spin 0.8s linear infinite' }} />
                    : <Send size={14} />
                  }
                  Send
                </button>
                <button
                  type="button"
                  onClick={clear}
                  className="btn btn-ghost"
                  title="Clear queue"
                >
                  <Trash2 size={14} />
                </button>
              </form>

              {/* Result chips */}
              <AnimatePresence>
                {lastResult && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 14 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {lastResult.queued.map(w => (
                        <SuccessChip key={w}>{w}</SuccessChip>
                      ))}
                      {lastResult.missing.map(w => (
                        <WarnChip key={w}>{w}</WarnChip>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── RIGHT: Library + instructions ────────────── */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 16,
            position: 'sticky', top: 16,
          }}>

            {/* Library */}
            <div className="card card-padded" style={{ padding: '20px 22px' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 14,
              }}>
                <div className="label">Sign library</div>
                <span className="tag" style={{
                  fontSize: 10, padding: '3px 8px',
                  color: 'var(--amber)',
                  background: 'var(--amber-dim)',
                  borderColor: 'transparent',
                }}>
                  {library.length} available
                </span>
              </div>

              {library.length > 0 ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  maxHeight: 280, overflowY: 'auto',
                  margin: '0 -6px', padding: '0 6px',
                }}>
                  {library.map(word => (
                    <button
                      key={word}
                      onClick={() => insertWord(word)}
                      style={{
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '9px 12px',
                        background: 'transparent',
                        border: '1px solid transparent',
                        borderRadius: 'var(--r-sm)',
                        color: 'var(--ink-2)',
                        fontFamily: 'var(--f-mono)',
                        fontSize: 12.5,
                        cursor: 'pointer',
                        textAlign: 'left',
                        textTransform: 'lowercase',
                        transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'var(--amber-dim)'
                        e.currentTarget.style.borderColor = 'rgba(245,182,78,0.3)'
                        e.currentTarget.style.color = 'var(--amber)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.borderColor = 'transparent'
                        e.currentTarget.style.color = 'var(--ink-2)'
                      }}
                    >
                      {word}
                      <Plus size={12} style={{ opacity: 0.4 }} />
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: '32px 16px', textAlign: 'center',
                  display: 'flex', flexDirection: 'column', gap: 12,
                  alignItems: 'center',
                }}>
                  <BookOpen size={28} color="var(--ink-4)" strokeWidth={1.5} />
                  <div>
                    <p style={{
                      color: 'var(--ink-2)', fontSize: 13,
                      margin: '0 0 6px',
                    }}>Library is empty</p>
                    <p className="mono" style={{
                      fontSize: 11, color: 'var(--ink-4)',
                      lineHeight: 1.5,
                    }}>
                      Add .mp4 files named<br/>
                      after each sign to <span style={{ color: 'var(--amber)' }}>/library</span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* How-to */}
            <div className="card card-padded" style={{ padding: '20px 22px' }}>
              <div className="label" style={{ marginBottom: 12 }}>How to use</div>
              <ol style={{
                margin: 0, padding: 0, listStyle: 'none',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                {[
                  'Click any library word or type freely.',
                  'Press Send to queue the matching sign videos.',
                  'Videos play back in order — missing signs are flagged.',
                  'Add more .mp4 files to grow your library.',
                ].map((t, i) => (
                  <li key={i} style={{ display: 'flex', gap: 10 }}>
                    <span className="mono" style={{
                      fontSize: 11, color: 'var(--amber)',
                      marginTop: 2, flexShrink: 0,
                    }}>0{i + 1}</span>
                    <span style={{
                      color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.55,
                    }}>{t}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 980px) {
          .t2g-grid {
            grid-template-columns: 1fr !important;
          }
          .t2g-grid > div:last-child {
            position: static !important;
          }
        }
      `}</style>
    </div>
  )
}
