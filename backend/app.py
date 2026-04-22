"""
backend/app.py
FastAPI application factory with lifespan management.

FIXES:
  - SPA fallback returns 404 for unmatched /api/* paths instead of
    serving index.html (made debugging real errors much easier)
  - CORS origins come from Settings (configurable without code changes)
  - Version bumped to 5.0.0 and mirrored in health endpoint + frontend
"""

from __future__ import annotations
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.logger import get_logger
from backend.settings import get_settings
from backend.services.grammar_service import shutdown as grammar_shutdown
from backend.services.vision_service import get_vision_service
from backend.api.sign_routes import router as sign_router
from backend.api.gesture_routes import router as gesture_router

log = get_logger(__name__)
cfg = get_settings()
VERSION = "5.0.0"
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("=" * 55)
    log.info("  Sign Language Translator %s — API starting", VERSION)
    log.info("=" * 55)
    yield
    log.info("Shutdown: stopping vision service...")
    vs = get_vision_service()
    vs.stop()
    grammar_shutdown()
    log.info("Shutdown complete")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Sign Language Translator API",
        description="Bi-directional sign ↔ speech/text translation",
        version=VERSION,
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(sign_router)
    app.include_router(gesture_router)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": VERSION}

    # Serve React build in production
    if FRONTEND_DIST.is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=FRONTEND_DIST / "assets"),
            name="assets",
        )

        @app.get("/{full_path:path}")
        def spa_fallback(full_path: str):
            """
            SPA router: serve index.html for any non-API path.
            Crucially, return 404 for unmatched /api/* routes so developers
            see a real error instead of HTML masking the problem.
            """
            if full_path.startswith("api/") or full_path.startswith("api"):
                raise HTTPException(status_code=404, detail="API route not found")
            return FileResponse(FRONTEND_DIST / "index.html")

    return app


app = create_app()
