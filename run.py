"""
run.py — One-command server start.
Usage:  python run.py
"""
import uvicorn
from backend.settings import get_settings

if __name__ == "__main__":
    cfg = get_settings()
    uvicorn.run(
        "backend.app:app",
        host      = cfg.host,
        port      = cfg.port,
        log_level = cfg.log_level,
        reload    = False,
    )
