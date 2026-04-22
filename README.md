# Signal — Sign Language Translator v5

A web-based bi-directional sign language translator.

* **Sign → Speech** — Use your webcam to perform signs. The AI transcribes them, builds a sentence, applies grammar correction, and speaks it aloud.
* **Text → Gesture** — Type any phrase. Matching sign-language videos play back sequentially.

---

## Setup (one-time)

```bash
# 1. Extract the project, cd into it
cd signlang_redesign

# 2. Copy the environment template
cp .env.example .env

# 3. Python backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac / Linux
pip install -r requirements.txt
python -m spacy download en_core_web_sm

# 4. Train the model (only if model/sign_model_holistic.pkl doesn't exist)
python 1_collect_data.py       # Record samples for each sign
python 2_train_model.py        # Train the Random Forest

# 5. Frontend dependencies
cd frontend
npm install
cd ..
```

---

## Running — Development (two terminals)

**Terminal 1 — backend**
```bash
python run.py
# API:  http://localhost:8000
# Docs: http://localhost:8000/api/docs
```

**Terminal 2 — frontend**
```bash
cd frontend
npm run dev
# Open http://localhost:5173
```

## Running — Production (single command)

```bash
cd frontend && npm run build && cd ..
python run.py                       # Serves the built SPA at :8000
```

---

## Project structure

```
signlang_redesign/
├── run.py                          Start the FastAPI server
├── requirements.txt
├── .env.example                    Copy to .env and tune
├── .gitignore
│
├── backend/
│   ├── app.py                      FastAPI factory + lifespan
│   ├── settings.py                 Pydantic Settings
│   ├── logger.py                   Structured logging
│   ├── api/
│   │   ├── sign_routes.py          /api/sign/*
│   │   └── gesture_routes.py       /api/gesture/*
│   └── services/
│       ├── vision_service.py       MediaPipe loop + SignDetector
│       ├── grammar_service.py      5-tier vocabulary-aware grammar
│       └── gesture_service.py      Sign video queue + MJPEG stream
│
├── frontend/
│   ├── index.html                  Premium fonts (Instrument Serif + Geist)
│   ├── package.json
│   └── src/
│       ├── main.jsx · App.jsx
│       ├── api/client.js           Centralised API client
│       ├── styles/globals.css      Theme: navy + violet + amber
│       ├── components/ui.jsx       Design system
│       ├── hooks/
│       │   ├── useSignDetector.js  5 Hz polling + TTS
│       │   └── useGesture.js       Enqueue + library load
│       └── pages/
│           ├── LandingPage.jsx     Animated hero
│           ├── SignToSpeechPage.jsx
│           └── TextToGesturePage.jsx
│
├── model/                          .pkl files here
├── library/                        .mp4 sign videos here
└── data/                           Training CSVs
```

---

## Keyboard & button controls

### Sign → Speech page
| Control | Action |
|---|---|
| **Start camera** button | Open webcam + begin detection |
| **Stop camera** button | Release the camera |
| **Fix grammar & speak sentence** | Correct the raw sign sequence + speak full sentence |
| **Undo** | Remove the last detected word |
| **Clear** | Empty the sentence completely |

### Text → Gesture page
| Control | Action |
|---|---|
| Text input + **Send** | Queue sign videos for typed words |
| Click any library word | Adds it to the input field |
| **🗑** button | Empty the video queue |

---

## The grammar engine (5 tiers)

The critical piece that's been rewritten. When you sign
`hello how you fine thank you`, the engine produces
`"Hello, how are you? I'm fine, thank you."`

Tier priority (first success wins):

| Tier | Engine | Handles |
|------|--------|---------|
| 0 | OpenAI GPT | Anything — best quality (set `OPENAI_API_KEY` to enable) |
| 1 | Exact phrase lookup | Known multi-word phrases from your vocabulary |
| 2 | Regex pattern templates | Common sub-structures like "how you" → "how are you" |
| 3 | Generic gloss rules | Pronoun + adjective/verb insertion (future-proofs) |
| 4 | spaCy POS expansion | Out-of-vocab inputs |
| 5 | language_tool polish | Punctuation + spelling cleanup on top |

All input produces a sentence — no passthrough cases.

---

## API endpoints

### Sign → Speech
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/sign/start` | Start webcam + MediaPipe |
| POST | `/api/sign/stop` | Release camera |
| GET | `/api/sign/feed` | MJPEG stream |
| GET | `/api/sign/state` | Current detection + sentence |
| GET | `/api/sign/classes` | Known sign labels |
| POST | `/api/sign/grammar` | Apply grammar correction |
| POST | `/api/sign/clear` | Clear sentence |
| POST | `/api/sign/undo` | Remove last word |

### Text → Gesture
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/gesture/enqueue` | Queue text for playback |
| GET | `/api/gesture/stream` | MJPEG stream of sign videos |
| GET | `/api/gesture/status` | Queue state |
| GET | `/api/gesture/library` | List available signs |
| POST | `/api/gesture/clear` | Empty the queue |

Interactive docs at `/api/docs`.

---

## What changed vs v4

- **Grammar engine rewritten** — was passing sentences through unchanged
- Fixed circular import in `settings.py`
- Python 3.9 compatibility throughout
- MJPEG boundary now matches the Content-Type header exactly
- SPA fallback no longer swallows API 404s
- TTS dedupes via `new_word_id` instead of race-prone consume
- Library files renamed (no more `thank-.mp4` kludge)
- Brand-new UI: app aesthetic, animated landing, unified design system

---

## Troubleshooting

**"Cannot open webcam"** — another app is using it (Zoom/Teams/OBS). Close them or change `CAM_INDEX` in `.env`.

**"Model files not found"** — run `1_collect_data.py` then `2_train_model.py`.

**Grammar passes through unchanged** — this was a v4 bug, fixed in v5.

**MJPEG stream frozen on first frame** — check console for `--frame` boundary mismatch. Was a v4 bug, fixed in v5.

**spaCy model missing** — `python -m spacy download en_core_web_sm`. Without it, tiers 0-3 still work.
