/**
 * LandingPage.jsx — Signal
 *
 * Premium app-like welcome screen with:
 *  • Live animated hero graphic (flowing waveform that responds to a sign gesture)
 *  • Floating gradient orbs for depth
 *  • Two tactile mode cards with distinct colour identities
 *  • Restrained motion — everything animates in once, then stays calm
 */
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Hand, MessageSquareText, Sparkles } from 'lucide-react'

// ── Subtle hero waveform — represents sign → signal conversion ──────
function HeroWaveform() {
  return (
    <svg
      viewBox="0 0 800 220"
      style={{ width: '100%', height: 'auto', display: 'block' }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="wave-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#7c5cff" stopOpacity="0" />
          <stop offset="20%"  stopColor="#7c5cff" stopOpacity="1" />
          <stop offset="80%"  stopColor="#f5b64e" stopOpacity="1" />
          <stop offset="100%" stopColor="#f5b64e" stopOpacity="0" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Animated flowing wave */}
      <motion.path
        d="M 0 110 Q 100 40 200 110 T 400 110 T 600 110 T 800 110"
        stroke="url(#wave-grad)"
        strokeWidth="2"
        fill="none"
        filter="url(#glow)"
        animate={{
          d: [
            "M 0 110 Q 100 40 200 110 T 400 110 T 600 110 T 800 110",
            "M 0 110 Q 100 170 200 110 T 400 110 T 600 110 T 800 110",
            "M 0 110 Q 100 60 200 110 T 400 110 T 600 110 T 800 110",
            "M 0 110 Q 100 40 200 110 T 400 110 T 600 110 T 800 110",
          ],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Secondary softer wave behind */}
      <motion.path
        d="M 0 110 Q 100 90 200 110 T 400 110 T 600 110 T 800 110"
        stroke="url(#wave-grad)"
        strokeWidth="1"
        fill="none"
        opacity="0.4"
        animate={{
          d: [
            "M 0 110 Q 100 90 200 110 T 400 110 T 600 110 T 800 110",
            "M 0 110 Q 100 130 200 110 T 400 110 T 600 110 T 800 110",
            "M 0 110 Q 100 80 200 110 T 400 110 T 600 110 T 800 110",
            "M 0 110 Q 100 90 200 110 T 400 110 T 600 110 T 800 110",
          ],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Dot nodes along the wave (like sign detection points) */}
      {[150, 300, 450, 600].map((cx, i) => (
        <motion.circle
          key={cx}
          cx={cx}
          cy="110"
          r="3"
          fill="#a78bff"
          animate={{ opacity: [0.3, 1, 0.3], r: [2, 4, 2] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.3,
            ease: "easeInOut",
          }}
        />
      ))}
    </svg>
  )
}

// ── Floating orbs (soft background atmosphere) ──────────────────────
function FloatingOrbs() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0,
        overflow: 'hidden', pointerEvents: 'none', zIndex: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: '-120px', left: '-80px',
        width: '500px', height: '500px',
        background: 'radial-gradient(circle, rgba(124,92,255,0.25) 0%, transparent 65%)',
        borderRadius: '50%',
        animation: 'drift-slow 20s ease-in-out infinite',
        filter: 'blur(20px)',
      }} />
      <div style={{
        position: 'absolute', bottom: '-120px', right: '-100px',
        width: '420px', height: '420px',
        background: 'radial-gradient(circle, rgba(245,182,78,0.15) 0%, transparent 65%)',
        borderRadius: '50%',
        animation: 'drift-fast 18s ease-in-out infinite',
        filter: 'blur(20px)',
      }} />
    </div>
  )
}

// ── Single feature stat ─────────────────────────────────────────────
function Stat({ n, label }) {
  return (
    <div>
      <div className="display" style={{ fontSize: '2.2rem', color: 'var(--ink-1)' }}>{n}</div>
      <div className="label" style={{ marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ── Mode card ───────────────────────────────────────────────────────
function ModeCard({ icon: Icon, title, lede, accent, onClick, delay = 0 }) {
  const accentColor = accent === 'violet' ? '#7c5cff' : '#f5b64e'
  const accentDim   = accent === 'violet' ? 'var(--accent-dim)' : 'var(--amber-dim)'

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ y: -2, scale: 0.99 }}
      onClick={onClick}
      className="card card-padded"
      style={{
        padding: '28px 28px 24px',
        textAlign: 'left',
        cursor: 'pointer',
        border: '1px solid var(--line)',
        background: 'var(--bg-1)',
        transition: 'border-color 0.2s, background 0.2s, transform 0.2s',
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = accentColor + '40'
        e.currentTarget.style.background = 'var(--bg-2)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--line)'
        e.currentTarget.style.background = 'var(--bg-1)'
      }}
    >
      {/* Gradient accent corner */}
      <div style={{
        position: 'absolute', top: -60, right: -60,
        width: 160, height: 160,
        background: `radial-gradient(circle, ${accentColor}30 0%, transparent 70%)`,
        borderRadius: '50%',
        pointerEvents: 'none',
      }} />

      {/* Icon chip */}
      <div style={{
        width: 44, height: 44,
        borderRadius: 12,
        background: accentDim,
        color: accentColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20,
      }}>
        <Icon size={20} />
      </div>

      {/* Title */}
      <h3 className="display" style={{
        fontSize: '1.9rem',
        margin: '0 0 8px',
        color: 'var(--ink-1)',
      }}>{title}</h3>

      {/* Description */}
      <p style={{
        color: 'var(--ink-2)',
        fontSize: '14.5px',
        lineHeight: 1.55,
        margin: '0 0 24px',
      }}>{lede}</p>

      {/* CTA */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        color: accentColor,
        fontFamily: 'var(--f-mono)',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}>
        Open module <ArrowRight size={14} />
      </div>
    </motion.button>
  )
}

// ═════════════════════════════════════════════════════════════════════
export default function LandingPage({ onMode }) {
  const reducedMotion = useReducedMotion()

  return (
    <div style={{ minHeight: '100vh', position: 'relative', paddingBottom: 64 }}>

      <FloatingOrbs />

      {/* ── Top bar ───────────────────────────────────────────── */}
      <div className="container" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '24px 32px', position: 'relative', zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg, #7c5cff, #f5b64e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 12, fontWeight: 700,
          }}>
            S
          </div>
          <span className="display" style={{ fontSize: '1.4rem' }}>Signal</span>
        </div>

        <span className="tag">
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--success)',
          }} className="pulse-dot" />
          v5.0 · Live
        </span>
      </div>

      {/* ── Hero section ───────────────────────────────────────── */}
      <div className="container" style={{
        paddingTop: 60, paddingBottom: 40,
        position: 'relative', zIndex: 1,
        textAlign: 'center',
      }}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="tag tag-accent" style={{ marginBottom: 24 }}>
            <Sparkles size={11} />
            Real-time sign language translation
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="display"
          style={{
            fontSize: 'clamp(3.2rem, 8vw, 6rem)',
            margin: '0 0 24px',
            maxWidth: 960, marginLeft: 'auto', marginRight: 'auto',
          }}
        >
          Where hands{' '}
          <span style={{ fontStyle: 'italic' }} className="gradient-text">
            become voice
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          style={{
            fontSize: '17px',
            color: 'var(--ink-2)',
            maxWidth: 560,
            margin: '0 auto 48px',
            lineHeight: 1.6,
          }}
        >
          An AI translator that bridges sign language and English — in real time,
          on your webcam, with natural conversational grammar.
        </motion.p>

        {/* Hero waveform graphic */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          style={{ maxWidth: 880, margin: '0 auto 56px', padding: '0 32px' }}
        >
          <HeroWaveform />
        </motion.div>

        {/* Stats strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.55 }}
          style={{
            display: 'flex', gap: 56, justifyContent: 'center',
            marginBottom: 72, flexWrap: 'wrap',
          }}
        >
          <Stat n="<350ms" label="Latency" />
          <Stat n="6+" label="Signs learnt" />
          <Stat n="4-tier" label="Grammar engine" />
        </motion.div>
      </div>

      {/* ── Mode cards ─────────────────────────────────────────── */}
      <div className="container" style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          maxWidth: 880, margin: '0 auto',
        }}>
          <ModeCard
            icon={Hand}
            title="Sign → Speech"
            lede="Point your webcam at your hands. Signal detects each gesture, builds a sentence, and speaks it aloud with natural grammar."
            accent="violet"
            onClick={() => onMode('s2s')}
            delay={0.6}
          />
          <ModeCard
            icon={MessageSquareText}
            title="Text → Gesture"
            lede="Type any word or phrase. The system finds matching sign videos from your library and plays them back smoothly in sequence."
            accent="amber"
            onClick={() => onMode('t2g')}
            delay={0.7}
          />
        </div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.9 }}
          style={{
            marginTop: 56,
            textAlign: 'center',
            color: 'var(--ink-4)',
            fontFamily: 'var(--f-mono)',
            fontSize: 11,
            letterSpacing: '0.08em',
          }}
        >
          Powered by MediaPipe Holistic · Random Forest · spaCy
        </motion.p>
      </div>
    </div>
  )
}
