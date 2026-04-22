"""
backend/settings.py
Production-grade settings via Pydantic BaseSettings.
All values read from environment variables with typed defaults.

FIX: Camera auto-detection moved out of __init__ into a lazy method
that VisionService calls ONLY when it's actually trying to open the
camera. The previous version ran cv2.VideoCapture in Settings.__init__
on Windows, which (a) caused a 6s import-time block, and (b) created
a circular import because it called get_logger() from inside __init__
while modules that imported settings were still being loaded.
"""

from __future__ import annotations
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Paths ────────────────────────────────────────────────
    model_path:   Path = Path("model/sign_model_holistic.pkl")
    encoder_path: Path = Path("model/label_encoder_holistic.pkl")
    library_dir:  Path = Path("library")

    # ── MediaPipe ────────────────────────────────────────────
    mp_model_complexity: int   = 0
    mp_min_detect_conf:  float = 0.6
    mp_min_track_conf:   float = 0.5
    use_face:            bool  = False

    # ── Sign detector ────────────────────────────────────────
    confidence_threshold:  float = 0.50
    buffer_size:           int   = 7
    majority_threshold:    float = 0.50
    word_cooldown:         float = 1.0
    neutral_frames_needed: int   = 4
    neutral_label:         str   = "Neutral"

    # ── Grammar ──────────────────────────────────────────────
    openai_api_key: str = ""
    openai_model:   str = "gpt-3.5-turbo"

    # ── Webcam ───────────────────────────────────────────────
    cam_width:       int  = 1280
    cam_height:      int  = 720
    cam_index:       int  = 0
    cam_auto_detect: bool = True       # Tried ONCE when the camera loop starts

    # ── Server ───────────────────────────────────────────────
    host:      str = "0.0.0.0"
    port:      int = 8000
    log_level: str = "info"

    # ── CORS (configurable so deployments don't need code changes) ──
    cors_origins: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached singleton Settings instance."""
    return Settings()
