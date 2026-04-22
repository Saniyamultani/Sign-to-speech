"""
backend/logger.py
Structured logging configuration for the entire backend.
All modules import get_logger(__name__) — no print() anywhere.
"""
import logging
import sys
from typing import Optional


def get_logger(name: str, level: Optional[str] = None) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    level_val = getattr(logging, (level or "INFO").upper(), logging.INFO)
    logger.setLevel(level_val)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level_val)
    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)-28s | %(message)s",
        datefmt="%H:%M:%S",
    )
    handler.setFormatter(fmt)
    logger.addHandler(handler)
    logger.propagate = False
    return logger
