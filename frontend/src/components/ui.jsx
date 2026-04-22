/**
 * components/ui.jsx — Signal design system components
 */
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X, ArrowLeft, CheckCircle2 } from 'lucide-react'

// ── Top bar ─────────────────────────────────────────────────
export function TopBar({ onBack, accent = 'violet', moduleLabel }) {
  const accentColor = accent === 'violet' ? '#7c5cff' : '#f5b64e'
  return (
    <div className="container" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '20px 32px', borderBottom: '1px solid var(--line)',
    }}>
      <button
        onClick={onBack}
        className="btn btn-ghost btn-sm"
        style={{ marginLeft: -10 }}
      >
        <ArrowLeft size={14} /> Back
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: 'linear-gradient(135deg, #7c5cff, #f5b64e)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: 11, fontWeight: 700,
        }}>S</div>
        <span className="display" style={{ fontSize: '1.15rem' }}>Signal</span>
      </div>

      {moduleLabel && (
        <span className="tag" style={{ color: accentColor, borderColor: 'transparent',
          background: accent === 'violet' ? 'var(--accent-dim)' : 'var(--amber-dim)' }}>
          {moduleLabel}
        </span>
      )}
    </div>
  )
}

// ── Page title ──────────────────────────────────────────────
export function PageTitle({ eyebrow, title, description, accent = 'violet' }) {
  return (
    <div style={{ padding: '32px 0 24px' }}>
      {eyebrow && (
        <div className="label" style={{
          color: accent === 'violet' ? 'var(--accent-soft)' : 'var(--amber)',
          marginBottom: 10,
        }}>
          {eyebrow}
        </div>
      )}
      <h1 className="display" style={{
        fontSize: 'clamp(2.2rem, 4vw, 3.2rem)',
        margin: '0 0 12px',
      }}>{title}</h1>
      {description && (
        <p style={{ color: 'var(--ink-2)', fontSize: 15, margin: 0, maxWidth: 580 }}>
          {description}
        </p>
      )}
    </div>
  )
}

// ── Confidence meter ────────────────────────────────────────
export function ConfidenceBar({ value, threshold = 0.5 }) {
  const pct = Math.round(value * 100)
  const above = value >= threshold
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 8,
      }}>
        <span className="label">Confidence</span>
        <span className="mono" style={{
          fontSize: 13, fontWeight: 500,
          color: above ? 'var(--accent-soft)' : 'var(--ink-3)',
          transition: 'color 0.2s',
        }}>
          {pct}<span style={{ fontSize: 10, opacity: 0.6 }}>%</span>
        </span>
      </div>
      <div style={{
        height: 6, background: 'var(--bg-0)', borderRadius: 3, overflow: 'hidden',
        position: 'relative',
      }}>
        <motion.div
          style={{
            height: '100%',
            background: above
              ? 'linear-gradient(90deg, #7c5cff, #a78bff)'
              : 'var(--ink-4)',
            borderRadius: 3,
          }}
          animate={{ width: `${pct}%`, opacity: above ? 1 : 0.45 }}
          transition={{ duration: 0.2 }}
        />
        {/* Threshold marker */}
        <div style={{
          position: 'absolute', top: -3, bottom: -3,
          left: `${threshold * 100}%`, width: 1,
          background: 'var(--ink-4)',
        }} />
      </div>
    </div>
  )
}

// ── Top predictions ─────────────────────────────────────────
export function ProbBars({ probs }) {
  const top3 = Object.entries(probs).sort((a, b) => b[1] - a[1]).slice(0, 3)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {top3.map(([label, p], i) => (
        <div key={label}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            marginBottom: 6,
          }}>
            <span className="mono" style={{
              fontSize: 12,
              color: i === 0 ? 'var(--accent-soft)' : 'var(--ink-3)',
              textTransform: 'lowercase',
            }}>{label}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
              {Math.round(p * 100)}%
            </span>
          </div>
          <div style={{
            height: 3, background: 'var(--bg-0)', borderRadius: 2, overflow: 'hidden',
          }}>
            <motion.div
              style={{
                height: '100%',
                background: i === 0 ? 'var(--accent)' : 'var(--line-strong)',
                borderRadius: 2,
              }}
              animate={{ width: `${p * 100}%` }}
              transition={{ duration: 0.25 }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Detected sign display (giant typography) ────────────────
export function SignDisplay({ sign, isNeutral }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={sign}
        initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{    opacity: 0, y: -6, filter: 'blur(4px)' }}
        transition={{ duration: 0.25, ease: [0.22,1,0.36,1] }}
        className="display"
        style={{
          fontSize: 'clamp(2.8rem, 6vw, 4.5rem)',
          lineHeight: 1,
          color: isNeutral ? 'var(--ink-4)' : 'var(--ink-1)',
          textAlign: 'center',
          transition: 'color 0.3s',
          wordBreak: 'break-word',
          textTransform: 'lowercase',
        }}
      >
        {sign}
      </motion.div>
    </AnimatePresence>
  )
}

// ── Word chip ───────────────────────────────────────────────
export function WordChip({ word, isNew }) {
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{
        opacity: 1, scale: 1,
        background: isNew ? 'rgba(124,92,255,0.2)' : 'var(--bg-2)',
        borderColor: isNew ? 'var(--accent)' : 'var(--line)',
      }}
      transition={{ duration: 0.4 }}
      style={{
        fontFamily: 'var(--f-mono)',
        fontSize: 13,
        padding: '6px 12px',
        borderRadius: 8,
        border: '1px solid var(--line)',
        color: 'var(--ink-1)',
        display: 'inline-block',
        textTransform: 'lowercase',
      }}
    >
      {word}
    </motion.span>
  )
}

// ── Error toast ─────────────────────────────────────────────
export function ErrorToast({ message, onDismiss }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0,  scale: 1 }}
          exit={{    opacity: 0, y: -10, scale: 0.98 }}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '14px 16px',
            border: '1px solid rgba(248,113,113,0.3)',
            background: 'var(--danger-dim)',
            borderRadius: 'var(--r-md)',
            color: 'var(--danger)',
            fontSize: 13.5,
            marginBottom: 16,
          }}
        >
          <AlertTriangle size={16} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ flex: 1, color: 'var(--ink-1)' }}>{message}</span>
          <button
            onClick={onDismiss}
            style={{
              background: 'none', border: 'none', color: 'var(--danger)',
              cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Status dot ──────────────────────────────────────────────
export function StatusDot({ active, label, color = 'var(--success)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        className={active ? 'pulse-dot' : ''}
        style={{
          width: 7, height: 7, borderRadius: '50%',
          background: active ? color : 'var(--ink-4)',
          boxShadow: active ? `0 0 8px ${color}` : 'none',
          display: 'inline-block',
          transition: 'background 0.2s',
        }}
      />
      <span className="mono" style={{
        fontSize: 12,
        color: active ? 'var(--ink-1)' : 'var(--ink-3)',
      }}>
        {label}
      </span>
    </div>
  )
}

// ── Success chip ────────────────────────────────────────────
export function SuccessChip({ children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 6,
      background: 'rgba(74,222,128,0.1)',
      border: '1px solid rgba(74,222,128,0.25)',
      color: 'var(--success)',
      fontFamily: 'var(--f-mono)', fontSize: 11.5,
    }}>
      <CheckCircle2 size={11} />{children}
    </span>
  )
}

export function WarnChip({ children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 6,
      background: 'var(--danger-dim)',
      border: '1px solid rgba(248,113,113,0.25)',
      color: 'var(--danger)',
      fontFamily: 'var(--f-mono)', fontSize: 11.5,
    }}>
      <AlertTriangle size={11} />{children}
    </span>
  )
}
