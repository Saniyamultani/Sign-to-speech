/**
 * SignToSpeechPage.jsx — Signal
 * Clean app layout. Camera on the left, live detection + sentence builder on the right.
 */
import { motion, AnimatePresence } from 'framer-motion'
import {
  Video, VideoOff, Wand2, Trash2, CornerDownLeft, Volume2,
} from 'lucide-react'
import { useSignDetector } from '../hooks/useSignDetector'
import {
  TopBar, PageTitle, ConfidenceBar, ProbBars, SignDisplay,
  WordChip, ErrorToast, StatusDot,
} from '../components/ui'

export default function SignToSpeechPage({ onBack }) {
  const {
    cameraOn, error, setError,
    confirmedSign, confidence, allProbs,
    words, corrected, isCorrected,
    lastNewWord, classes,
    startCamera, stopCamera,
    applyGrammar, clearSentence, undoWord, speakCorrectedAgain,
    feedUrl,
  } = useSignDetector()

  const isNeutral = confirmedSign === 'Neutral' || confirmedSign === '...'
  const hasWords  = words.length > 0

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 48 }}>
      <TopBar onBack={onBack} accent="violet" moduleLabel="Sign → Speech" />

      <div className="container" style={{ marginTop: 8 }}>
        <PageTitle
          eyebrow="Module 01"
          title="Sign to Speech"
          description="Perform signs on camera — they're detected, transcribed, and spoken aloud in real time with natural grammar."
          accent="violet"
        />

        <ErrorToast message={error} onDismiss={() => setError(null)} />

        {/* ── Main 2-column grid ─────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: 20,
          alignItems: 'start',
        }}
        className="s2s-grid"
        >

          {/* ── LEFT COLUMN ─────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Camera viewport */}
            <div className="card" style={{
              aspectRatio: '16/9',
              position: 'relative',
              background: '#000',
              overflow: 'hidden',
            }}>
              {cameraOn ? (
                <>
                  <img
                    src={feedUrl}
                    alt=""
                    style={{
                      width: '100%', height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                  {/* Top HUD overlay */}
                  <div style={{
                    position: 'absolute', top: 12, left: 12, right: 12,
                    display: 'flex', justifyContent: 'space-between',
                    pointerEvents: 'none',
                  }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '5px 10px',
                      borderRadius: 100,
                      background: 'rgba(10,14,26,0.75)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      fontFamily: 'var(--f-mono)',
                      fontSize: 10,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: '#7c5cff',
                      border: '1px solid rgba(124,92,255,0.3)',
                    }}>
                      <span className="pulse-dot" style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: '#7c5cff',
                      }} />
                      Live
                    </span>
                  </div>
                </>
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 16,
                  background: 'radial-gradient(circle at center, #0f1423 0%, #0a0e1a 100%)',
                }}>
                  <VideoOff size={40} color="var(--ink-4)" strokeWidth={1.5} />
                  <span className="mono" style={{
                    fontSize: 12, color: 'var(--ink-3)',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}>Camera offline</span>
                </div>
              )}
            </div>

            {/* Camera control button */}
            {!cameraOn ? (
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={startCamera}
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
              >
                <Video size={16} /> Start camera
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={stopCamera}
                className="btn btn-danger btn-lg"
                style={{ width: '100%' }}
              >
                <VideoOff size={16} /> Stop camera
              </motion.button>
            )}

            {/* Sentence builder panel */}
            <div className="card card-padded" style={{ padding: '20px 22px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 14,
              }}>
                <span className="label">Sentence</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={undoWord}
                    disabled={!hasWords}
                    className="btn btn-ghost btn-sm"
                    title="Undo last word"
                  >
                    <CornerDownLeft size={12} /> Undo
                  </button>
                  <button
                    onClick={clearSentence}
                    disabled={!hasWords}
                    className="btn btn-danger btn-sm"
                    title="Clear all words"
                  >
                    <Trash2 size={12} /> Clear
                  </button>
                </div>
              </div>

              {/* Word chips */}
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 6,
                minHeight: 40, alignItems: 'center',
                padding: '12px 14px',
                borderRadius: 'var(--r-md)',
                background: 'var(--bg-0)',
                border: '1px solid var(--line)',
              }}>
                <AnimatePresence mode="popLayout">
                  {hasWords ? (
                    words.map((w, i) => (
                      <WordChip
                        key={`${w}-${i}`}
                        word={w}
                        isNew={w === lastNewWord && i === words.length - 1}
                      />
                    ))
                  ) : (
                    <motion.span
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="mono"
                      style={{
                        color: 'var(--ink-4)',
                        fontSize: 13,
                        fontStyle: 'italic',
                      }}
                    >
                      {cameraOn ? 'Perform a sign to begin…' : 'Start the camera first'}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              {/* Corrected result */}
              <AnimatePresence>
                {isCorrected && corrected && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                    exit={{    opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{
                      padding: '16px 18px',
                      background: 'var(--accent-dim)',
                      border: '1px solid rgba(124,92,255,0.3)',
                      borderRadius: 'var(--r-md)',
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginBottom: 10,
                      }}>
                        <span className="label" style={{ color: 'var(--accent-soft)' }}>
                          Corrected
                        </span>
                        <button
                          onClick={speakCorrectedAgain}
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--accent-soft)' }}
                        >
                          <Volume2 size={12} /> Speak
                        </button>
                      </div>
                      <p className="display" style={{
                        fontSize: '1.35rem',
                        lineHeight: 1.3,
                        margin: 0,
                        color: 'var(--ink-1)',
                      }}>
                        {corrected}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Primary action */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={applyGrammar}
                disabled={!hasWords}
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 16 }}
              >
                <Wand2 size={14} /> Fix grammar &amp; speak sentence
              </motion.button>
            </div>
          </div>

          {/* ── RIGHT COLUMN (sidebar) ──────────────────── */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 16,
            position: 'sticky', top: 16,
          }}>

            {/* Live sign display */}
            <div className="card-elevated" style={{
              padding: '28px 24px',
              display: 'flex', flexDirection: 'column', gap: 20,
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span className="label">Detecting</span>
                <StatusDot
                  active={cameraOn}
                  label={cameraOn ? 'Live' : 'Idle'}
                  color="#7c5cff"
                />
              </div>

              <div style={{
                minHeight: 100,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '12px 0',
              }}>
                <SignDisplay sign={confirmedSign} isNeutral={isNeutral} />
              </div>

              <ConfidenceBar value={confidence} threshold={0.5} />
            </div>

            {/* Top predictions */}
            {Object.keys(allProbs).length > 0 && (
              <div className="card card-padded" style={{ padding: '20px 22px' }}>
                <div className="label" style={{ marginBottom: 14 }}>Top predictions</div>
                <ProbBars probs={allProbs} />
              </div>
            )}

            {/* Known vocabulary */}
            {classes.length > 0 && (
              <div className="card card-padded" style={{ padding: '20px 22px' }}>
                <div className="label" style={{ marginBottom: 12 }}>
                  Recognised signs
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {classes.filter(c => c !== 'Neutral').map(c => (
                    <span key={c} style={{
                      padding: '3px 10px',
                      borderRadius: 100,
                      background: 'var(--bg-0)',
                      border: '1px solid var(--line)',
                      fontFamily: 'var(--f-mono)',
                      fontSize: 11,
                      color: 'var(--ink-3)',
                      textTransform: 'lowercase',
                    }}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* How-to */}
            <div className="card card-padded" style={{ padding: '20px 22px' }}>
              <div className="label" style={{ marginBottom: 12 }}>How to use</div>
              <ol style={{
                margin: 0, padding: 0, listStyle: 'none',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                {[
                  'Start the camera — frame your shoulders and hands.',
                  'Perform a sign — it\'s spoken aloud when confirmed.',
                  'Pause between signs so each one registers cleanly.',
                  'Words accumulate below — press Fix Grammar when done.',
                ].map((t, i) => (
                  <li key={i} style={{ display: 'flex', gap: 10 }}>
                    <span className="mono" style={{
                      fontSize: 11,
                      color: 'var(--accent-soft)',
                      marginTop: 2,
                      flexShrink: 0,
                    }}>0{i + 1}</span>
                    <span style={{
                      color: 'var(--ink-2)',
                      fontSize: 13,
                      lineHeight: 1.55,
                    }}>{t}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* Responsive collapse on small screens */}
      <style>{`
        @media (max-width: 980px) {
          .s2s-grid {
            grid-template-columns: 1fr !important;
          }
          .s2s-grid > div:last-child {
            position: static !important;
          }
        }
      `}</style>
    </div>
  )
}
