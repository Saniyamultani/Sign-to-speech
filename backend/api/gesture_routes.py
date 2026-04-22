"""
backend/api/gesture_routes.py
Text-to-Gesture endpoints: text input → sign video MJPEG stream.

FIXES:
  - Python 3.9+ compatible typing (List from typing)
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.logger import get_logger
from backend.services.gesture_service import GestureService, get_gesture_service

log = get_logger(__name__)
router = APIRouter(prefix="/api/gesture", tags=["text-to-gesture"])


class TextInput(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)


class EnqueueResponse(BaseModel):
    queued:  List[str]
    missing: List[str]
    message: str


@router.post("/enqueue", response_model=EnqueueResponse)
def enqueue_text(body: TextInput,
                 gs: GestureService = Depends(get_gesture_service)):
    if not body.text.strip():
        raise HTTPException(400, "Text cannot be empty")
    result = gs.enqueue(body.text)
    msg = (
        f"Queued {len(result['queued'])} sign(s)."
        + (f" Missing: {', '.join(result['missing'])}" if result["missing"] else "")
    )
    log.info("Enqueue: %s", msg)
    return EnqueueResponse(
        queued=result["queued"],
        missing=result["missing"],
        message=msg,
    )


@router.get("/stream")
def gesture_stream(gs: GestureService = Depends(get_gesture_service)):
    """MJPEG stream — boundary must match frame_stream()'s output."""
    return StreamingResponse(
        gs.frame_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive",
                 "X-Accel-Buffering": "no"},
    )


@router.get("/status")
def gesture_status(gs: GestureService = Depends(get_gesture_service)):
    return gs.status


@router.post("/clear")
def clear_queue(gs: GestureService = Depends(get_gesture_service)):
    gs.clear()
    return {"status": "cleared"}


@router.get("/library")
def list_library(gs: GestureService = Depends(get_gesture_service)):
    words = gs.library_words()
    return {"words": words, "count": len(words)}
