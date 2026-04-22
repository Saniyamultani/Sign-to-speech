"""
backend/services/vision_service.py
Async-safe MediaPipe Holistic processing + SignDetector.
Runs in a background thread; exposes thread-safe state to the API layer.
No OpenCV windows — output is JPEG bytes streamed to the browser.

FIXES APPLIED:
  - Python 3.9+ compatible typing  (Optional, Dict, List, Tuple from typing)
  - Removed dead imports: asyncio, base64
  - Camera auto-detection runs lazily here, NOT in Settings.__init__
  - consume_new_word is now race-safe (versioned token)
"""

from __future__ import annotations

import collections
import threading
import time
from typing import Dict, List, Optional, Tuple

import cv2
import joblib
import mediapipe as mp
import numpy as np

from backend.logger import get_logger
from backend.settings import get_settings

log = get_logger(__name__)
cfg = get_settings()

# ── MediaPipe ────────────────────────────────────────────────
_mp_holistic = mp.solutions.holistic
_mp_drawing  = mp.solutions.drawing_utils


# ================================================================
# FEATURE EXTRACTION  (UNCHANGED — trained model depends on this)
# ================================================================


def _extract_hand(lms) -> List[float]:
    if lms is None:
        return [0.0] * 63
    c = np.array([[l.x, l.y, l.z] for l in lms.landmark], dtype=np.float32)
    c -= c[0]
    return c.flatten().tolist()


def _extract_pose(lms) -> List[float]:
    if lms is None:
        return [0.0] * 132
    c = np.array(
        [[l.x, l.y, l.z, l.visibility] for l in lms.landmark], dtype=np.float32
    )
    mid = (c[11, :3] + c[12, :3]) / 2.0
    c[:, :3] -= mid
    return c.flatten().tolist()


def _extract_face(lms) -> List[float]:
    if not cfg.use_face:
        return []
    if lms is None:
        return [0.0] * 1404
    c = np.array([[l.x, l.y, l.z] for l in lms.landmark], dtype=np.float32)
    c -= c[1]
    return c.flatten().tolist()


def _build_features(results) -> np.ndarray:
    row = (
        _extract_hand(results.left_hand_landmarks)
        + _extract_hand(results.right_hand_landmarks)
        + _extract_pose(results.pose_landmarks)
        + _extract_face(results.face_landmarks)
    )
    return np.array(row, dtype=np.float32).reshape(1, -1)


def _draw_skeleton(frame, results) -> None:
    """Minimal clean skeleton overlay — no text clutter on frame."""
    if results.pose_landmarks:
        _mp_drawing.draw_landmarks(
            frame,
            results.pose_landmarks,
            _mp_holistic.POSE_CONNECTIONS,
            _mp_drawing.DrawingSpec(color=(0, 210, 90), thickness=2, circle_radius=3),
            _mp_drawing.DrawingSpec(color=(0, 170, 70), thickness=2),
        )
    if results.left_hand_landmarks:
        _mp_drawing.draw_landmarks(
            frame,
            results.left_hand_landmarks,
            _mp_holistic.HAND_CONNECTIONS,
            _mp_drawing.DrawingSpec(color=(0, 200, 255), thickness=2, circle_radius=4),
            _mp_drawing.DrawingSpec(color=(0, 160, 220), thickness=2),
        )
    if results.right_hand_landmarks:
        _mp_drawing.draw_landmarks(
            frame,
            results.right_hand_landmarks,
            _mp_holistic.HAND_CONNECTIONS,
            _mp_drawing.DrawingSpec(color=(255, 210, 0), thickness=2, circle_radius=4),
            _mp_drawing.DrawingSpec(color=(220, 170, 0), thickness=2),
        )


# ================================================================
# LAZY CAMERA OPENER (moved here from Settings)
# ================================================================


def _open_camera() -> Optional[cv2.VideoCapture]:
    """
    Open the webcam. Honours cfg.cam_index first; if that fails AND
    cfg.cam_auto_detect is True, scans indices 1-5 as a fallback.
    Returns an opened VideoCapture, or None.
    """
    cap = cv2.VideoCapture(cfg.cam_index)
    if cap.isOpened() and cap.read()[0]:
        log.info("Camera opened at index %d", cfg.cam_index)
        return cap
    cap.release()

    if not cfg.cam_auto_detect:
        log.error("Camera index %d unavailable and auto-detect disabled", cfg.cam_index)
        return None

    for idx in range(1, 6):
        if idx == cfg.cam_index:
            continue
        cap = cv2.VideoCapture(idx)
        if cap.isOpened() and cap.read()[0]:
            log.info("Camera auto-detected at index %d (requested %d)",
                     idx, cfg.cam_index)
            return cap
        cap.release()

    log.error("No working camera found after trying indices 0-5")
    return None


# ================================================================
# SIGN DETECTOR
# ================================================================


class _SignDetector:
    def __init__(self):
        self.buffer = collections.deque(maxlen=cfg.buffer_size)
        self.last_word: Optional[str] = None
        self.last_word_time = 0.0
        self.confirmed_sign = cfg.neutral_label
        self.confidence = 0.0
        self.all_probs: Dict[str, float] = {}
        self._neutral_streak = 0
        self._ready = True

    def update(self, label: str, confidence: float,
               all_probs: Dict[str, float]) -> Optional[str]:
        self.confidence = confidence
        self.all_probs = all_probs
        push = label if confidence >= cfg.confidence_threshold else cfg.neutral_label
        self.buffer.append(push)

        if push == cfg.neutral_label:
            self._neutral_streak += 1
            if self._neutral_streak >= cfg.neutral_frames_needed:
                self._ready = True
        else:
            self._neutral_streak = 0

        if len(self.buffer) < cfg.buffer_size:
            return None

        counts = collections.Counter(self.buffer)
        top, cnt = counts.most_common(1)[0]
        majority = cnt / cfg.buffer_size
        self.confirmed_sign = top if majority >= cfg.majority_threshold else "..."

        if top == cfg.neutral_label or majority < cfg.majority_threshold:
            return None
        if not self._ready:
            return None

        now = time.time()
        if top == self.last_word and now - self.last_word_time < cfg.word_cooldown:
            return None

        self.last_word = top
        self.last_word_time = now
        self._ready = False
        return top

    def reset(self):
        self.buffer.clear()
        self.last_word, self.last_word_time = None, 0.0
        self.confirmed_sign = cfg.neutral_label
        self.confidence, self.all_probs = 0.0, {}
        self._neutral_streak, self._ready = 0, True


# ================================================================
# SENTENCE MANAGER
# ================================================================


class _SentenceManager:
    def __init__(self):
        self.words: List[str] = []
        self.corrected: str = ""
        self.is_corrected: bool = False

    @property
    def raw(self) -> str:
        return " ".join(self.words)

    def add_word(self, w: str):
        if w and w != cfg.neutral_label:
            self.words.append(w)
            self.is_corrected = False

    def undo(self):
        if self.words:
            self.words.pop()
            self.is_corrected = False

    def clear(self):
        self.words = []
        self.corrected = ""
        self.is_corrected = False


# ================================================================
# VISION SERVICE (singleton, thread-backed)
# ================================================================


class VisionService:
    """
    Manages the webcam capture loop in a background daemon thread.
    Exposes thread-safe state (frame bytes, detected sign, sentence)
    to FastAPI route handlers via properties.
    """

    def __init__(self):
        self._lock = threading.RLock()
        self._thread: Optional[threading.Thread] = None
        self._stop_evt = threading.Event()
        self._holistic = None
        self._pipeline = None
        self._encoder = None
        self._detector = _SignDetector()
        self._sentence = _SentenceManager()

        self._state: Dict = {
            "running":        False,
            "error":          None,
            "frame_jpeg":     None,
            "confirmed_sign": cfg.neutral_label,
            "confidence":     0.0,
            "all_probs":      {},
            "words":          [],
            "corrected":      "",
            "is_corrected":   False,
            # new_word + monotonic id so clients can dedupe without
            # losing events under parallel polling
            "new_word":       None,
            "new_word_id":    0,
        }
        self._word_counter = 0   # monotonically increments per new word

    # ── Lifecycle ────────────────────────────────────────────

    def start(self) -> None:
        with self._lock:
            if self._state["running"]:
                log.warning("VisionService already running")
                return
            # reset error so UI can retry cleanly
            self._state["error"] = None

        self._stop_evt.clear()
        self._thread = threading.Thread(
            target=self._loop, daemon=True, name="VisionThread"
        )
        self._thread.start()
        log.info("VisionService thread launched")

    def stop(self) -> None:
        self._stop_evt.set()
        if self._thread:
            self._thread.join(timeout=4)
        with self._lock:
            self._state["running"] = False
        log.info("VisionService stopped")

    # ── Thread-safe state accessors ──────────────────────────

    @property
    def state(self) -> Dict:
        with self._lock:
            return dict(self._state)

    def classes(self) -> List[str]:
        """Return the list of sign labels the trained model supports."""
        if self._encoder is None:
            return []
        try:
            return [str(c) for c in self._encoder.classes_]
        except Exception:
            return []

    def clear_sentence(self):
        with self._lock:
            self._sentence.clear()
            self._sync_sentence()

    def undo_word(self):
        with self._lock:
            self._sentence.undo()
            self._sync_sentence()

    def apply_grammar(self, corrected: str):
        with self._lock:
            self._sentence.corrected = corrected
            self._sentence.is_corrected = True
            self._sync_sentence()

    # ── Model loading ────────────────────────────────────────

    def _load_model(self) -> bool:
        try:
            self._pipeline = joblib.load(cfg.model_path)
            self._encoder = joblib.load(cfg.encoder_path)
            log.info("Model loaded — classes: %s", list(self._encoder.classes_))
            return True
        except Exception as e:
            log.error("Model load failed: %s", e)
            with self._lock:
                self._state["error"] = (
                    "Model files not found. Run 1_collect_data.py then "
                    "2_train_model.py before starting the camera."
                )
            return False

    # ── Camera loop ──────────────────────────────────────────

    def _loop(self):
        if not self._load_model():
            return

        self._holistic = _mp_holistic.Holistic(
            static_image_mode=False,
            model_complexity=cfg.mp_model_complexity,
            smooth_landmarks=True,
            enable_segmentation=False,
            refine_face_landmarks=True,
            min_detection_confidence=cfg.mp_min_detect_conf,
            min_tracking_confidence=cfg.mp_min_track_conf,
        )

        cap = _open_camera()
        if cap is None:
            with self._lock:
                self._state["error"] = (
                    "Cannot open webcam. Check that it's connected and not "
                    "in use by another application (Zoom, Teams, etc.)."
                )
            return

        cap.set(cv2.CAP_PROP_FRAME_WIDTH, cfg.cam_width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, cfg.cam_height)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        with self._lock:
            self._state.update(running=True, error=None)
        log.info("Camera loop active — %dx%d", cfg.cam_width, cfg.cam_height)

        try:
            while not self._stop_evt.is_set():
                ret, frame = cap.read()
                if not ret:
                    log.warning("Frame grab failed — retrying")
                    time.sleep(0.05)
                    continue

                frame = cv2.flip(frame, 1)
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                rgb.flags.writeable = False
                results = self._holistic.process(rgb)
                rgb.flags.writeable = True

                _draw_skeleton(frame, results)
                self._run_inference(results)

                ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if ok:
                    with self._lock:
                        self._state["frame_jpeg"] = buf.tobytes()

        except Exception as e:
            log.exception("Camera loop crashed: %s", e)
            with self._lock:
                self._state["error"] = f"Camera crashed: {e}"
        finally:
            cap.release()
            if self._holistic is not None:
                self._holistic.close()
            with self._lock:
                self._state["running"] = False
            log.info("Camera released")

    def _run_inference(self, results) -> None:
        body_ok = any(
            [
                results.pose_landmarks,
                results.left_hand_landmarks,
                results.right_hand_landmarks,
            ]
        )
        if body_ok:
            feats = _build_features(results)
            proba = self._pipeline.predict_proba(feats)[0]
            idx = int(np.argmax(proba))
            conf = float(proba[idx])
            label = self._encoder.inverse_transform([idx])[0]
            all_probs = {
                self._encoder.inverse_transform([i])[0]: float(p)
                for i, p in enumerate(proba)
            }
        else:
            label, conf, all_probs = cfg.neutral_label, 0.0, {}

        new_word = self._detector.update(label, conf, all_probs)

        with self._lock:
            self._state["confirmed_sign"] = self._detector.confirmed_sign
            self._state["confidence"] = conf
            self._state["all_probs"] = all_probs
            if new_word:
                self._word_counter += 1
                self._sentence.add_word(new_word)
                self._state["new_word"] = new_word
                self._state["new_word_id"] = self._word_counter
                log.info("Word confirmed [#%d]: '%s' → sentence: '%s'",
                         self._word_counter, new_word, self._sentence.raw)
            self._sync_sentence()

    def _sync_sentence(self):
        """Copy sentence state into shared dict. Must hold _lock."""
        self._state["words"] = list(self._sentence.words)
        self._state["corrected"] = self._sentence.corrected
        self._state["is_corrected"] = self._sentence.is_corrected


# ── Singleton ────────────────────────────────────────────────
_vision_service: Optional[VisionService] = None


def get_vision_service() -> VisionService:
    global _vision_service
    if _vision_service is None:
        _vision_service = VisionService()
    return _vision_service
