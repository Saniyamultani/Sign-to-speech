"""
backend/api/sign_routes.py
Sign-to-Speech endpoints.

FIXES:
  - MJPEG boundary now matches the Content-Type header exactly
  - Python 3.9+ compatible typing (Optional, Dict, List)
  - state reads snapshot once per iteration (not twice)
  - new 'classes' field so the UI can show which signs the model knows
  - new_word comes with new_word_id so two parallel polls can dedupe
"""

from __future__ import annotations

import asyncio
import time
from typing import AsyncGenerator, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.logger import get_logger
from backend.services.vision_service import VisionService, get_vision_service
from backend.services.grammar_service import fix_grammar

log = get_logger(__name__)
router = APIRouter(prefix="/api/sign", tags=["sign-to-speech"])

# MJPEG multipart boundary — MUST match the media_type header below.
_BOUNDARY = "frame"


# ── Response models ──────────────────────────────────────────

class SentenceState(BaseModel):
    words:          List[str]
    raw:            str
    corrected:      str
    is_corrected:   bool
    confirmed_sign: str
    confidence:     float
    all_probs:      Dict[str, float]
    running:        bool
    error:          Optional[str] = None
    new_word:       Optional[str] = None
    new_word_id:    int = 0


class GrammarResponse(BaseModel):
    raw:       str
    corrected: str


class ClassesResponse(BaseModel):
    classes: List[str]


# ── MJPEG generator ──────────────────────────────────────────

async def _mjpeg_generator(vs: VisionService) -> AsyncGenerator[bytes, None]:
    """
    Yield MJPEG multipart chunks. Format MUST be:

        --<boundary>\r\n
        Content-Type: image/jpeg\r\n
        Content-Length: <n>\r\n
        \r\n
        <jpeg bytes>\r\n

    The boundary string must match the media_type declared on the
    StreamingResponse exactly.
    """
    boundary_line = f"--{_BOUNDARY}\r\n".encode()
    last_jpeg: Optional[bytes] = None
    frames_sent = 0

    while True:
        state = vs.state          # Snapshot once
        if not state["running"] and frames_sent > 0:
            break

        jpeg = state.get("frame_jpeg")

        if jpeg:
            last_jpeg = jpeg
            frames_sent += 1
        elif last_jpeg is not None:
            jpeg = last_jpeg      # repeat previous frame on gap
        else:
            await asyncio.sleep(0.05)
            continue

        header = (
            boundary_line
            + b"Content-Type: image/jpeg\r\n"
            + b"Content-Length: " + str(len(jpeg)).encode() + b"\r\n\r\n"
        )
        yield header + jpeg + b"\r\n"
        await asyncio.sleep(0.033)   # ~30 FPS cap


# ── Routes ───────────────────────────────────────────────────

@router.post("/start")
def start_camera(vs: VisionService = Depends(get_vision_service)):
    """Start the webcam + MediaPipe pipeline. Blocks briefly to confirm success."""
    vs.start()
    # Wait up to 5 seconds for the camera to actually open
    for _ in range(50):
        state = vs.state
        if state["running"]:
            return {"status": "started"}
        if state["error"]:
            raise HTTPException(status_code=500, detail=state["error"])
        time.sleep(0.1)

    final = vs.state
    raise HTTPException(
        status_code=500,
        detail=final["error"] or
        "Camera timed out starting. Check it's connected and not already in use.",
    )


@router.post("/stop")
def stop_camera(vs: VisionService = Depends(get_vision_service)):
    vs.stop()
    return {"status": "stopped"}


@router.get("/feed")
async def video_feed(vs: VisionService = Depends(get_vision_service)):
    return StreamingResponse(
        _mjpeg_generator(vs),
        media_type=f"multipart/x-mixed-replace; boundary={_BOUNDARY}",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/state", response_model=SentenceState)
def get_state(vs: VisionService = Depends(get_vision_service)):
    """
    Poll current detection + sentence state.
    new_word is included unconditionally; client uses new_word_id to dedupe.
    """
    s = vs.state
    return SentenceState(
        words=s["words"],
        raw=" ".join(s["words"]),
        corrected=s["corrected"],
        is_corrected=s["is_corrected"],
        confirmed_sign=s["confirmed_sign"],
        confidence=round(s["confidence"], 3),
        all_probs={k: round(v, 3) for k, v in s["all_probs"].items()},
        running=s["running"],
        error=s["error"],
        new_word=s.get("new_word"),
        new_word_id=s.get("new_word_id", 0),
    )


@router.get("/classes", response_model=ClassesResponse)
def list_classes(vs: VisionService = Depends(get_vision_service)):
    """Return the list of sign labels the trained model supports."""
    return ClassesResponse(classes=vs.classes())


@router.post("/grammar", response_model=GrammarResponse)
def correct_grammar(vs: VisionService = Depends(get_vision_service)):
    raw = " ".join(vs.state["words"])
    if not raw.strip():
        raise HTTPException(400, "Sentence is empty")
    corrected = fix_grammar(raw)
    vs.apply_grammar(corrected)
    log.info("Grammar: %r → %r", raw, corrected)
    return GrammarResponse(raw=raw, corrected=corrected)


@router.post("/clear")
def clear_sentence(vs: VisionService = Depends(get_vision_service)):
    vs.clear_sentence()
    return {"status": "cleared"}


@router.post("/undo")
def undo_word(vs: VisionService = Depends(get_vision_service)):
    vs.undo_word()
    state = vs.state
    return {"words": state["words"], "raw": " ".join(state["words"])}
