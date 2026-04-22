"""
backend/services/gesture_service.py
Text-to-Gesture: resolves each input word to a .mp4 in /library
and serves it as an MJPEG stream.

FIXES:
  - Removed the trailing-hyphen fallback (library files were renamed)
  - Python 3.9+ compatible typing
  - Keepalive frame interval increased from 10 Hz → 2 Hz (much less idle CPU)
  - Whole iter-dir loop now in a try/except — permission errors don't crash the service
"""

from __future__ import annotations

import queue
import threading
import time
from pathlib import Path
from typing import Dict, Generator, List, Optional

import cv2
import numpy as np

from backend.logger import get_logger
from backend.settings import get_settings

log = get_logger(__name__)
cfg = get_settings()

_EXTS = (".mp4", ".avi", ".mov", ".webm")


class GestureService:
    def __init__(self):
        self._queue:    queue.Queue = queue.Queue()
        self._lock:     threading.RLock = threading.RLock()
        self._status:   Dict = {
            "playing":   "",
            "queued":    [],
            "not_found": [],
            "idle":      True,
        }

    # ── Public ───────────────────────────────────────────────

    def enqueue(self, text: str) -> Dict[str, List[str]]:
        words = [w.strip() for w in text.lower().split() if w.strip()]
        found:   List[str] = []
        missing: List[str] = []

        for word in words:
            path = self._resolve(word)
            if path:
                self._queue.put((word, str(path)))
                found.append(word)
                log.info("Queued '%s' → %s", word, path)
            else:
                missing.append(word)
                log.warning("No video for '%s'", word)

        with self._lock:
            self._status["not_found"] = missing
            self._status["queued"]    = [q[0] for q in list(self._queue.queue)]
            if not self._status["playing"]:
                self._status["idle"] = self._queue.empty()

        return {"queued": found, "missing": missing}

    @property
    def status(self) -> Dict:
        with self._lock:
            return dict(self._status)

    def clear(self):
        while not self._queue.empty():
            try:
                self._queue.get_nowait()
            except queue.Empty:
                break
        with self._lock:
            self._status.update(playing="", queued=[], not_found=[], idle=True)

    def library_words(self) -> List[str]:
        """Return sorted list of available sign words from the library folder."""
        lib = Path(cfg.library_dir).resolve()
        if not lib.is_dir():
            return []
        words = []
        try:
            for p in lib.iterdir():
                if p.suffix.lower() in _EXTS:
                    display = p.stem.replace("_", " ").strip()
                    if display:
                        words.append(display)
        except (PermissionError, OSError) as e:
            log.error("Cannot read library dir %s: %s", lib, e)
        return sorted(set(words))

    def frame_stream(self) -> Generator[bytes, None, None]:
        """
        Blocking generator: yields MJPEG multipart chunks for each queued
        video. Sends a low-rate keepalive when idle so the browser stays
        connected without wasting CPU.
        """
        boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
        blank = _black_frame_jpeg(640, 360)

        while True:
            if self._queue.empty():
                yield boundary + blank + b"\r\n"
                time.sleep(0.5)    # 2 Hz keepalive (was 10 Hz)
                continue

            word, path = self._queue.get()
            cap = cv2.VideoCapture(path)
            if not cap.isOpened():
                log.error("Cannot open video: %s", path)
                with self._lock:
                    self._status["not_found"].append(word)
                continue

            fps       = cap.get(cv2.CAP_PROP_FPS) or 30.0
            frame_dur = 1.0 / fps

            with self._lock:
                self._status["playing"] = word
                self._status["idle"]    = False
                self._status["queued"]  = [q[0] for q in list(self._queue.queue)]

            log.info("Playing '%s' (%s)", word, path)

            try:
                while True:
                    t0 = time.perf_counter()
                    ret, frame = cap.read()
                    if not ret:
                        break
                    h, w = frame.shape[:2]
                    tw = 640
                    th = int(h * tw / w)
                    frame = cv2.resize(frame, (tw, th))
                    ok, buf = cv2.imencode(
                        ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 82]
                    )
                    if ok:
                        yield boundary + buf.tobytes() + b"\r\n"
                    elapsed = time.perf_counter() - t0
                    time.sleep(max(0.0, frame_dur - elapsed))
            finally:
                cap.release()

            with self._lock:
                self._status["playing"] = ""
                self._status["idle"]    = self._queue.empty()

    # ── Private ──────────────────────────────────────────────

    def _resolve(self, word: str) -> Optional[Path]:
        """
        Resolve a word to a video path.

        After the library rename, files are now consistently named
        (e.g. `thank.mp4`, `fine.mp4`, `thank_you.mp4`). No hyphen kludge.
        """
        lib = Path(cfg.library_dir).resolve()
        if not lib.is_dir():
            log.error("Library directory not found: %s", lib)
            return None

        clean = word.strip().lower().replace(" ", "_").replace("-", "_")

        # Try direct filename match first
        for ext in _EXTS:
            p = lib / (clean + ext)
            if p.is_file():
                return p

        # Case-insensitive scan fallback
        try:
            for p in lib.iterdir():
                if p.suffix.lower() not in _EXTS:
                    continue
                if p.stem.lower() == clean:
                    return p
        except (PermissionError, OSError) as e:
            log.error("Library scan failed: %s", e)
            return None

        log.warning("No video found for '%s' (looked for %s.*)", word, clean)
        return None


def _black_frame_jpeg(w: int, h: int) -> bytes:
    _, buf = cv2.imencode(".jpg", np.zeros((h, w, 3), dtype=np.uint8))
    return buf.tobytes()


# ── Singleton ────────────────────────────────────────────────
_gesture_service: Optional[GestureService] = None


def get_gesture_service() -> GestureService:
    global _gesture_service
    if _gesture_service is None:
        _gesture_service = GestureService()
    return _gesture_service
