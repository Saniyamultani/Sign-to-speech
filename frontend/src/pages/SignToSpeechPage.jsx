/**
 * SignToSpeechPage.jsx — Signal
 * Clean app layout. Camera on the left, live detection + sentence builder on the right.
 */
import { motion, AnimatePresence } from 'framer-motion'
import {
  Video, VideoOff, Wand2, Trash2, CornerDownLeft, Volume2,
} from 'lucide-react'
import { useRef } from 'react'
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
    lastNewWord, frameSrc,
    startCamera, stopCamera,
    applyGrammar, clearSentence, undoWord,
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

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
            gap: 20,
            alignItems: 'start',
          }}
          className="s2s-grid"
        >

          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Camera */}
            <div className="card" style={{
              aspectRatio: '16/9',
              position: 'relative',
              background: '#000',
              overflow: 'hidden',
            }}>
              {cameraOn ? (
                <>
  <img
    src={frameSrc}
    alt="Live camera"
    style={{
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
    }}
  />

                  {/* HUD */}
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
                  }}>
                    Camera offline
                  </span>
                </div>
              )}
            </div>

            {/* Buttons */}
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

            {/* Sentence builder */}
            <div className="card card-padded" style={{ padding: '20px 22px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 14,
              }}>
                <span className="label">Sentence</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={undoWord} disabled={!hasWords} className="btn btn-ghost btn-sm">
                    <CornerDownLeft size={12} /> Undo
                  </button>
                  <button onClick={clearSentence} disabled={!hasWords} className="btn btn-danger btn-sm">
                    <Trash2 size={12} /> Clear
                  </button>
                </div>
              </div>

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
                      <WordChip key={`${w}-${i}`} word={w} />
                    ))
                  ) : (
                    <motion.span className="mono">
                      {cameraOn ? 'Perform a sign to begin…' : 'Start the camera first'}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={applyGrammar}
                disabled={!hasWords}
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 16 }}
              >
                <Wand2 size={14} /> Fix grammar & speak
              </motion.button>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-elevated" style={{ padding: '28px 24px' }}>
              <SignDisplay sign={confirmedSign} isNeutral={isNeutral} />
              <ConfidenceBar value={confidence} threshold={0.5} />
            </div>

            {Object.keys(allProbs).length > 0 && (
              <div className="card card-padded">
                <ProbBars probs={allProbs} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}