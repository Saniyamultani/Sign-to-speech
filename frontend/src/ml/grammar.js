/**
 * src/ml/grammar.js
 * ============================================================
 * 3-tier grammar engine (pure JS, no network).
 *
 * Trained vocabulary: Hello, fine, good, how, im, my, name,
 *                     thankyou, you
 *
 * Pipeline (first hit wins):
 *   Tier 1: Exact phrase lookup — full sequence → complete sentence
 *   Tier 2: Regex pattern rules — sub-structure transformations
 *   Tier 3: Fallback polish    — capitalise + terminate
 *
 * Normalisation runs first: lowercase, dedup consecutive tokens,
 * dedup consecutive bigrams (fixes "thankyou thankyou" → "thankyou").
 * ============================================================
 */

// ── Tier 1: exact phrase lookup ──────────────────────────────
// Keys must be normalised (lowercase, no repeats).
const EXACT_PHRASES = {
  // Single words
  'hello':           'Hello!',
  'you':             'You.',
  'fine':            "I'm fine.",
  'good':            'Good.',
  'thankyou':        'Thank you.',
  'how':             'How?',
  'name':            'My name…',
  'my':              'Mine.',
  'im':              "I'm.",

  // Greetings
  'hello you':       'Hello, nice to meet you.',
  'hello hello':     'Hello!',
  'you hello':       'Hello, nice to meet you.',

  // How are you
  'how you':         'How are you?',
  'you how':         'How are you?',
  'how you fine':    "How are you? I'm fine.",
  'how fine':        "How are you? I'm fine.",
  'hello how':       'Hello, how are you?',
  'hello how you':   'Hello, how are you?',
  'hello you how':   'Hello, how are you?',
  'hello how you fine': "Hello, how are you? I'm fine.",

  // Fine
  'you fine':        'Are you fine?',
  'fine you':        "I'm fine, and you?",
  'fine thankyou':   "I'm fine, thank you.",
  'thankyou fine':   "Thank you, I'm fine.",
  'im fine':         "I'm fine.",
  'im good':         "I'm good.",
  'im fine thankyou': "I'm fine, thank you.",

  // Name / introductions
  'my name':         'My name is…',
  'name my':         'My name is…',
  'name you':        'What is your name?',
  'you name':        'What is your name?',
  'my name you':     "My name — what's yours?",
  'name my you':     "My name — what's yours?",
  'hello my name':   'Hello, my name is…',
  'hello name':      'Hello, my name is…',
  'hello name you':  "Hello, what's your name?",
  'hello you name':  "Hello, what's your name?",
  'hello my name you': "Hello, my name — what's yours?",

  // Thank you combos
  'hello thankyou':  'Hello, thank you.',
  'thankyou hello':  'Hello, thank you.',
  'thankyou you':    'Thank you.',
  'you thankyou':    'Thank you.',

  // Longer conversational turns
  'hello how you fine thankyou':
    "Hello, how are you? I'm fine, thank you.",
  'hello im fine thankyou':
    "Hello, I'm fine, thank you.",
  'hello my name thankyou':
    'Hello, my name is… thank you.',
  'hello how you im fine':
    "Hello, how are you? I'm fine.",
  'how you im fine':
    "How are you? I'm fine.",
  'how you im good':
    "How are you? I'm good.",

  // Good combos
  'good you':        'Good, and you?',
  'you good':        'Are you good?',
  'im good thankyou': "I'm good, thank you.",
}

// ── Tier 2: regex pattern rules ──────────────────────────────
// Applied in order. Each fires independently; all matches compound.
const PATTERN_RULES = [
  // "how you" → "how are you"
  [/\bhow\s+you\b/g,              'how are you'],
  [/\byou\s+how\b/g,              'how are you'],

  // "you fine" / "fine you"
  [/\byou\s+fine\b/g,             'are you fine'],
  [/\bfine\s+you\b/g,             "i'm fine, and you"],

  // "im X" — pronoun + state
  [/\bim\s+fine\b/gi,             "i'm fine"],
  [/\bim\s+good\b/gi,             "i'm good"],
  [/\bim\b/gi,                    "i'm"],

  // "my name" / "name you"
  [/\bmy\s+name\b/gi,             'my name is'],
  [/\bname\s+you\b/gi,            'what is your name'],
  [/\byou\s+name\b/gi,            'what is your name'],

  // Greetings that lead
  [/\bhello\s+how\s+you\b/gi,     'hello, how are you'],
  [/\bhello\s+my\s+name\b/gi,     'hello, my name is'],
  [/\bhello\s+name\b/gi,          'hello, my name is'],
  [/\bhello\s+you\b/gi,           'hello, nice to meet you'],

  // Single tokens in isolation
  [/^fine$/i,                     "i'm fine"],
  [/^name$/i,                     'my name is'],
  [/^how$/i,                      'how are you'],
  [/^thankyou$/i,                 'thank you'],
  [/^good$/i,                     "i'm good"],

  // Always expand "thankyou" → "thank you"
  [/\bthankyou\b/gi,              'thank you'],
]

// ── Helpers ─────────────────────────────────────────────────
function normalise(text) {
  const tokens = text.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return ''

  // Pass 1: collapse consecutive identical tokens
  const step1 = [tokens[0]]
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] !== step1[step1.length - 1]) step1.push(tokens[i])
  }

  // Pass 2: collapse consecutive identical bigrams
  const step2 = []
  let i = 0
  while (i < step1.length) {
    if (i + 3 < step1.length
        && step1[i]     === step1[i + 2]
        && step1[i + 1] === step1[i + 3]) {
      step2.push(step1[i], step1[i + 1])
      let j = i + 2
      while (j + 1 < step1.length
             && step1[j]     === step1[i]
             && step1[j + 1] === step1[i + 1]) {
        j += 2
      }
      i = j
    } else {
      step2.push(step1[i])
      i += 1
    }
  }
  return step2.join(' ')
}

function polish(s) {
  if (!s) return ''
  let out = s.trim()

  // Standalone 'i' → 'I'
  out = out.replace(/\bi\b/g, 'I')

  // Capitalise first letter and after . ! ?
  out = out.replace(/(^|[.!?]\s+)([a-z])/g,
    (_m, pre, ch) => pre + ch.toUpperCase())

  // Add terminal punctuation if missing
  if (!/[.!?…]$/.test(out)) out += '.'

  // Collapse repeated punctuation
  out = out.replace(/([.!?])\1+/g, '$1')
  out = out.replace(/\s+([.,!?])/g, '$1')

  return out
}

// ── Public API ──────────────────────────────────────────────
export function fixGrammar(raw) {
  if (!raw || !raw.trim()) return ''

  const text = normalise(raw)

  // Tier 1: exact match
  if (EXACT_PHRASES[text]) {
    return polish(EXACT_PHRASES[text])
  }

  // Tier 2: pattern rules
  let out = text
  for (const [pattern, replacement] of PATTERN_RULES) {
    out = out.replace(pattern, replacement)
  }

  // Tier 3: polish
  return polish(out)
}
