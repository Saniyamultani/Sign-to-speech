/**
 * src/ml/detector.js
 * ============================================================
 * SignDetector + SentenceManager — direct ports of the Python
 * classes in vision_service.py. Buffer, majority vote, cooldown,
 * and neutral-gating logic are byte-for-byte identical.
 * ============================================================
 */

// Defaults match your .env
export const DEFAULT_CONFIG = {
  confidenceThreshold:  0.50,
  bufferSize:           7,
  majorityThreshold:    0.50,
  wordCooldown:         1.0,   // seconds
  neutralFramesNeeded:  4,
  neutralLabel:         'Neutral',
}

/**
 * Port of _SignDetector.
 * Fed one classification per frame; emits a confirmed word when
 * the same label has majority support for `bufferSize` frames and
 * the user has returned to neutral in between.
 */
export class SignDetector {
  constructor(config = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...config }
    this.reset()
  }

  reset() {
    this.buffer          = []
    this.lastWord        = null
    this.lastWordTime    = 0
    this.confirmedSign   = this.cfg.neutralLabel
    this.confidence      = 0
    this.allProbs        = {}
    this._neutralStreak  = 0
    this._ready          = true
  }

  /**
   * Consume one frame's classification.
   * @returns {string|null} — new confirmed word, or null
   */
  update(label, confidence, allProbs) {
    const c = this.cfg
    this.confidence = confidence
    this.allProbs   = allProbs

    // Gate low-confidence frames as Neutral
    const push = confidence >= c.confidenceThreshold ? label : c.neutralLabel
    this.buffer.push(push)
    if (this.buffer.length > c.bufferSize) this.buffer.shift()

    // Track neutral streak — forces user to pause between signs
    if (push === c.neutralLabel) {
      this._neutralStreak += 1
      if (this._neutralStreak >= c.neutralFramesNeeded) this._ready = true
    } else {
      this._neutralStreak = 0
    }

    if (this.buffer.length < c.bufferSize) return null

    // Majority vote
    const counts = {}
    for (const x of this.buffer) counts[x] = (counts[x] || 0) + 1
    let top = null, topCount = 0
    for (const [k, v] of Object.entries(counts)) {
      if (v > topCount) { top = k; topCount = v }
    }
    const majority = topCount / c.bufferSize

    this.confirmedSign = majority >= c.majorityThreshold ? top : '...'

    if (top === c.neutralLabel || majority < c.majorityThreshold) return null
    if (!this._ready) return null

    // Cooldown — don't re-emit the same word too fast
    const now = performance.now() / 1000
    if (top === this.lastWord && now - this.lastWordTime < c.wordCooldown) {
      return null
    }

    this.lastWord     = top
    this.lastWordTime = now
    this._ready       = false
    return top
  }
}

/**
 * Port of _SentenceManager.
 */
export class SentenceManager {
  constructor(neutralLabel = 'Neutral') {
    this.neutralLabel = neutralLabel
    this.clear()
  }

  get raw() { return this.words.join(' ') }

  addWord(w) {
    if (w && w !== this.neutralLabel) {
      this.words.push(w)
      this.isCorrected = false
    }
  }

  undo() {
    if (this.words.length > 0) {
      this.words.pop()
      this.isCorrected = false
    }
  }

  clear() {
    this.words        = []
    this.corrected    = ''
    this.isCorrected  = false
  }

  setCorrected(s) {
    this.corrected   = s
    this.isCorrected = true
  }
}
