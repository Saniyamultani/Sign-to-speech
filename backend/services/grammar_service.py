"""
backend/services/grammar_service.py
================================================================
Grammar Engine v2 — Vocabulary-Aware Pattern Matcher

ROOT-CAUSE FIX: The old engine had generic gloss rules like
"i hungry → I am hungry" that never matched your trained vocabulary
(hello / you / how / fine / name / thank / thank you). Result: the
engine passed your sentences through unchanged.

NEW APPROACH:
  This engine is built around YOUR specific sign vocabulary. It recognises
  the conversational patterns those signs form (greetings, introductions,
  check-ins) and produces natural English.

PIPELINE (in order — first match wins):
  1. EXACT PHRASE LOOKUP      — complete phrases mapped to full sentences
                                 ("hello how you" → "Hello, how are you?")
  2. PATTERN TEMPLATES         — sliding-window n-gram templates that
                                 transform common gloss structures
  3. VOCABULARY SMOOTHING      — pronoun + adjective/verb fixes for
                                 known sign words
  4. spaCy POS expansion       — only runs if pattern stages leave the
                                 sentence unchanged (safety net for
                                 future vocabulary)
  5. language_tool cleanup     — final punctuation + capitalisation pass
  6. Fallback cap/punctuate    — always produces a well-formed sentence

Each tier is optional and loads independently; if spaCy or LT are
unavailable, tiers 1-3 still produce good output for your vocabulary.
================================================================
"""

from __future__ import annotations

import re
from typing import List, Optional, Tuple

from backend.logger import get_logger
from backend.settings import get_settings

log = get_logger(__name__)
cfg = get_settings()

# ── Engine flags ─────────────────────────────────────────────
_nlp     = None
_lt_tool = None
_SPACY   = False
_GPT     = False
_LT      = False


def _boot_engines() -> None:
    global _nlp, _lt_tool, _SPACY, _GPT, _LT

    try:
        import spacy
        _nlp = spacy.load("en_core_web_sm")
        _SPACY = True
        log.info("spaCy en_core_web_sm loaded")
    except Exception:
        log.warning("spaCy unavailable (pattern stages still work)")

    if cfg.openai_api_key:
        try:
            import openai
            openai.api_key = cfg.openai_api_key
            _GPT = True
            log.info("OpenAI %s available", cfg.openai_model)
        except Exception:
            log.warning("openai package not installed — GPT disabled")

    try:
        import language_tool_python
        _lt_tool = language_tool_python.LanguageTool("en-US")
        _LT = True
        log.info("language_tool loaded (punctuation + spelling pass)")
    except Exception:
        log.warning("language_tool unavailable — skipping final polish")


_boot_engines()


# ================================================================
# TIER 1 — EXACT PHRASE LOOKUP
# The full phrase is the key. First match wins, checked longest-first
# so "hello how you" beats "hello you".
# ================================================================

EXACT_PHRASES = {
    # ── Greetings ───────────────────────────────────────────
    "hello":                      "Hello!",
    "hello hello":                "Hello!",
    "hello you":                  "Hello, nice to meet you.",
    "you hello":                  "Hello, nice to meet you.",

    # ── How are you ─────────────────────────────────────────
    "how you":                    "How are you?",
    "you how":                    "How are you?",
    "how you fine":               "How are you? I'm fine.",
    "how fine":                   "How are you doing? I'm fine.",
    "hello how":                  "Hello, how are you?",
    "hello how you":              "Hello, how are you?",
    "hello you how":              "Hello, how are you?",
    "hello how you fine":         "Hello, how are you? I'm fine.",

    # ── Fine ────────────────────────────────────────────────
    "fine":                       "I'm fine.",
    "you fine":                   "Are you fine?",
    "fine you":                   "I'm fine, and you?",
    "fine thank you":             "I'm fine, thank you.",
    "thank you fine":             "Thank you, I'm fine.",
    "fine thank":                 "I'm fine, thanks.",

    # ── Thank you ───────────────────────────────────────────
    "thank":                      "Thank you.",
    "thank you":                  "Thank you.",
    "thank you thank you":        "Thank you so much.",
    "hello thank you":            "Hello, thank you.",
    "thank you hello":            "Hello, thank you.",

    # ── Name / introductions ────────────────────────────────
    "name":                       "My name is…",
    "name you":                   "What is your name?",
    "you name":                   "What is your name?",
    "you name you":               "What is your name?",
    "name name":                  "My name is…",
    "hello name":                 "Hello, my name is…",
    "hello name you":             "Hello, what is your name?",
    "hello you name":             "Hello, what is your name?",
    "name thank you":             "Thank you for the introduction.",

    # ── Longer combos ───────────────────────────────────────
    "hello name you thank you":   "Hello, what's your name? Thank you.",
    "hello how you thank you":    "Hello, how are you? Thank you.",
    "hello how you fine thank":   "Hello, how are you? I'm fine, thank you.",
    "hello how you fine thank you":"Hello, how are you? I'm fine, thank you.",
}


# ================================================================
# TIER 2 — PATTERN TEMPLATES
# Regex-based transformations that catch common sub-structures.
# Patterns are applied in order; each replacement shapes the output.
# ================================================================

# Known vocabulary — ONLY these words get pattern transformations.
# Adding more library signs? Extend this set.
KNOWN_SIGNS = {
    "hello", "how", "you", "fine", "name", "thank",
}

PATTERN_RULES: List[Tuple[str, str]] = [
    # Greeting + question combos
    (r"\bhello\s+how\s+you\b",        "hello, how are you"),
    (r"\bhello\s+you\s+how\b",        "hello, how are you"),
    (r"\bhow\s+you\s+fine\b",         "how are you, i'm fine"),

    # "how you" → "how are you" (question)
    (r"\bhow\s+you\b",                "how are you"),
    (r"\byou\s+how\b",                "how are you"),

    # "you fine" / "fine you"
    (r"\byou\s+fine\b",               "are you fine"),
    (r"\bfine\s+you\b",               "i'm fine, and you"),

    # "name you" / "you name" → introductions
    (r"\bname\s+you\b",                "what is your name"),
    (r"\byou\s+name\b",                "what is your name"),

    # "hello name" → "hello, my name is"
    (r"\bhello\s+name\b",              "hello, my name is"),

    # Standalone pronouns + state
    (r"^fine$",                        "i'm fine"),
    (r"^you$",                         "you"),
    (r"^name$",                        "my name is"),
    (r"^how$",                         "how are you"),
    (r"^thank\s+you$",                 "thank you"),
    (r"^thank$",                       "thank you"),
]


# ================================================================
# TIER 3 — GENERIC GLOSS (pronoun + adj/verb) — safety net for
# future vocabulary beyond the current 6 signs.
# ================================================================

STATE_ADJECTIVES = {
    "hungry", "thirsty", "tired", "happy", "sad", "angry", "sick", "cold",
    "hot", "ready", "fine", "good", "bad", "excited", "bored", "scared",
    "sorry", "lost", "late", "busy", "free", "wrong", "right", "okay",
}

PROGRESSIVE_VERBS = {
    "go", "come", "eat", "drink", "walk", "run", "wait", "leave",
    "sleep", "work", "play", "study", "read", "write", "look", "try",
}

BE_MAP = {"i": "am", "he": "is", "she": "is", "it": "is",
          "we": "are", "you": "are", "they": "are"}


# ================================================================
# HELPERS
# ================================================================

def _normalise(text: str) -> str:
    """
    Lowercase, strip, collapse spaces, and dedupe:
      - consecutive identical tokens ("hello hello" → "hello")
      - consecutive identical BIGRAMS ("thank you thank you" → "thank you")

    The bigram pass handles the common case where a user holds a
    two-word sign like "thank you" for too long and it registers twice.
    """
    t = " ".join(text.lower().split())
    tokens = t.split()
    if not tokens:
        return ""

    # Pass 1: collapse consecutive identical tokens
    step1 = [tokens[0]]
    for tok in tokens[1:]:
        if tok != step1[-1]:
            step1.append(tok)

    # Pass 2: collapse consecutive identical bigrams
    #   e.g. [thank, you, thank, you] → [thank, you]
    step2 = []
    i = 0
    while i < len(step1):
        # Check for repeating bigram at position i
        if (i + 3 < len(step1)
                and step1[i] == step1[i + 2]
                and step1[i + 1] == step1[i + 3]):
            step2.append(step1[i])
            step2.append(step1[i + 1])
            # Skip ahead past all consecutive repeats
            j = i + 2
            while (j + 1 < len(step1)
                   and step1[j] == step1[i]
                   and step1[j + 1] == step1[i + 1]):
                j += 2
            i = j
        else:
            step2.append(step1[i])
            i += 1

    return " ".join(step2)


def _polish(sentence: str) -> str:
    """Capitalise first letter and ensure terminal punctuation."""
    if not sentence:
        return ""
    s = sentence.strip()

    # Fix standalone 'i' → 'I'
    s = re.sub(r"\bi\b", "I", s)

    # Capitalise after sentence-ending punctuation and at start
    def _cap_first(match):
        return match.group(1) + match.group(2).upper()

    s = re.sub(r"(^|[.!?]\s+)([a-z])", _cap_first, s)

    # Ensure terminal punctuation
    if s and s[-1] not in ".!?":
        s += "."

    # Collapse multiple punctuation
    s = re.sub(r"([.!?])\1+", r"\1", s)
    s = re.sub(r"\s+([.,!?])", r"\1", s)

    return s


def _to_gerund(verb: str) -> str:
    special = {"go": "going", "come": "coming", "be": "being",
               "see": "seeing"}
    if verb in special:
        return special[verb]
    if verb.endswith("ie"):
        return verb[:-2] + "ying"
    if verb.endswith("e") and not verb.endswith("ee"):
        return verb[:-1] + "ing"
    if (len(verb) >= 3 and verb[-1] not in "aeiouwxy"
            and verb[-2] in "aeiou" and verb[-3] not in "aeiou"):
        return verb + verb[-1] + "ing"
    return verb + "ing"


# ================================================================
# TIER 1 — Exact phrase lookup
# ================================================================

def _tier1_exact_phrase(text: str) -> Optional[str]:
    if text in EXACT_PHRASES:
        log.info("[Tier 1] Exact phrase match")
        return EXACT_PHRASES[text]
    return None


# ================================================================
# TIER 2 — Pattern templates
# ================================================================

def _tier2_patterns(text: str) -> str:
    """
    Apply each regex rule in order. Returns the transformed sentence,
    which is always different from `text` when at least one rule fires.
    """
    result = text
    any_match = False
    for pat, rep in PATTERN_RULES:
        new = re.sub(pat, rep, result, flags=re.IGNORECASE)
        if new != result:
            log.info("[Tier 2] %s → %s", pat, rep)
            any_match = True
            result = new
    return result if any_match else text


# ================================================================
# TIER 3 — Generic gloss rules (only runs if Tier 2 didn't change anything)
# ================================================================

def _tier3_generic_gloss(text: str) -> str:
    """
    Subject + state-adjective / progressive-verb insertion.
    Catches patterns OUTSIDE the current vocabulary so the engine
    gracefully handles future library expansion.
    """
    t = text
    adj_alt  = "|".join(STATE_ADJECTIVES)
    verb_alt = "|".join(PROGRESSIVE_VERBS)

    rules = [
        (rf"\b(i)\s+({adj_alt})\b", r"I am \2"),
        (rf"\b(he|she)\s+({adj_alt})\b",
         lambda m: f"{m.group(1)} is {m.group(2)}"),
        (rf"\b(we|they|you)\s+({adj_alt})\b",
         lambda m: f"{m.group(1)} are {m.group(2)}"),
        (rf"\b(i)\s+({verb_alt})\b",
         lambda m: f"I am {_to_gerund(m.group(2))}"),
        (rf"\b(he|she)\s+({verb_alt})\b",
         lambda m: f"{m.group(1)} is {_to_gerund(m.group(2))}"),
        (rf"\b(we|they|you)\s+({verb_alt})\b",
         lambda m: f"{m.group(1)} are {_to_gerund(m.group(2))}"),
    ]
    for pat, rep in rules:
        t = re.sub(pat, rep, t, flags=re.IGNORECASE)
    return t


# ================================================================
# TIER 4 — spaCy POS-aware expansion (future vocabulary safety net)
# ================================================================

def _tier4_spacy(text: str) -> str:
    """
    Only runs for out-of-vocabulary input. Uses POS tags to insert
    auxiliaries and articles.
    """
    if not _SPACY:
        return text

    doc = _nlp(text.lower())
    tokens = [(t.text, t.pos_, t.tag_, t.dep_) for t in doc]
    subj = next((t for t, _, _, d in tokens if d in ("nsubj", "nsubjpass")), None)
    if not subj:
        for t, pos, _, _ in tokens:
            if pos in ("PRON", "NOUN", "PROPN"):
                subj = t
                break

    has_aux = any(p == "AUX" or tg in ("VBZ", "VBP", "VBD", "MD")
                  for _, p, tg, _ in tokens)

    words = [t for t, *_ in tokens]
    out: List[str] = []
    i = 0
    while i < len(words):
        w, pos, _tag = words[i], tokens[i][1], tokens[i][2]
        if i > 0 and w == words[i - 1]:
            i += 1
            continue
        if (pos in ("NOUN", "PROPN") and i > 0
                and tokens[i - 1][1] not in ("DET", "NUM", "PRON", "ADJ")):
            if w not in KNOWN_SIGNS:   # Don't add articles to known sign-words
                out.append("an" if w[0] in "aeiou" else "a")
        if pos == "ADJ" and w in STATE_ADJECTIVES and not has_aux and subj:
            be = BE_MAP.get(subj, "is")
            if be not in out:
                out.append(be)
        out.append(w)
        i += 1
    return " ".join(out)


# ================================================================
# TIER 5 — language_tool final polish
# ================================================================

def _tier5_lt(text: str) -> str:
    if not _LT:
        return text
    try:
        return _lt_tool.correct(text)
    except Exception as e:
        log.warning("language_tool correction failed: %s", e)
        return text


# ================================================================
# TIER 0 — GPT (opt-in, best quality, needs API key)
# ================================================================

def _tier0_gpt(text: str) -> Optional[str]:
    if not _GPT:
        return None
    try:
        import openai
        r = openai.chat.completions.create(
            model=cfg.openai_model,
            messages=[
                {"role": "system", "content": (
                    "You are translating American Sign Language gloss into "
                    "natural conversational English. Input is a sequence of "
                    "sign words (e.g. 'hello how you fine'). Produce ONE "
                    "natural English sentence with correct grammar and "
                    "punctuation. Output only the sentence, nothing else."
                )},
                {"role": "user", "content": text},
            ],
            max_tokens=100,
            temperature=0.2,
        )
        out = r.choices[0].message.content.strip()
        return out or None
    except Exception as e:
        log.warning("GPT fix failed: %s", e)
        return None


# ================================================================
# PUBLIC ENTRY POINT
# ================================================================

def fix_grammar(raw: str) -> str:
    """
    Transform a raw sign-gloss sequence into natural English.

    Tier order:
        0. GPT (if enabled via OPENAI_API_KEY)
        1. Exact phrase lookup
        2. Regex pattern templates
        3. Generic gloss rules (pronoun + adj/verb)
        4. spaCy POS expansion (if installed)
        5. language_tool punctuation polish (if installed)
        Final: capitalise + terminate

    Every input produces a sentence — there are no passthrough cases.
    """
    if not raw or not raw.strip():
        return ""

    text = _normalise(raw)
    log.info("[Grammar] input: %r", text)

    # ── Tier 0: GPT override ────────────────────────────────
    gpt = _tier0_gpt(text)
    if gpt:
        final = _polish(gpt)
        log.info("[Grammar] GPT output: %r", final)
        return final

    # ── Tier 1: exact phrase ────────────────────────────────
    exact = _tier1_exact_phrase(text)
    if exact:
        final = _polish(exact)
        log.info("[Grammar] exact-match output: %r", final)
        return final

    # ── Tier 2: patterns ────────────────────────────────────
    after_patterns = _tier2_patterns(text)
    matched = after_patterns != text

    # ── Tier 3: generic gloss ───────────────────────────────
    after_generic = _tier3_generic_gloss(after_patterns)
    if after_generic != after_patterns:
        matched = True

    # ── Tier 4: spaCy (only if nothing matched so far) ──────
    if not matched:
        spacy_out = _tier4_spacy(after_generic)
        after_generic = spacy_out
    else:
        log.info("[Grammar] after patterns+generic: %r", after_generic)

    # ── Tier 5: language_tool polish ────────────────────────
    polished_lt = _tier5_lt(after_generic)

    final = _polish(polished_lt)
    log.info("[Grammar] final: %r", final)
    return final


def shutdown() -> None:
    if _lt_tool:
        try:
            _lt_tool.close()
        except Exception:
            pass
