"""FastAPI application factory. Run with `uvicorn app.main:app`."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from app import __version__
from app.api import duplicates, health, identify, pubsub
from app.api.deps import build_http_client
from app.body_limit import BodyLimitMiddleware
from app.config import Settings, get_settings
from app.errors import register_exception_handlers
from app.ml.identifier import get_identifier
from app.observability import RequestIdMiddleware, configure_logging

logger = logging.getLogger(__name__)

# Defense in depth: hard ceiling on any request body (two images plus multipart overhead).
_BODY_OVERHEAD_BYTES = 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    app.state.http_client = build_http_client(settings)
    logger.info(
        "ML service started",
        extra={
            "modelBackend": settings.model_backend,
            "modelVersion": settings.model_version,
            "internalAuth": bool(settings.service_auth_token),
        },
    )
    try:
        yield
    finally:
        client = app.state.http_client
        if isinstance(client, httpx.AsyncClient):
            await client.aclose()
        logger.info("ML service stopped")


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build a fully wired application. Tests pass explicit `Settings`."""
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="OrenjiTrade ML",
        version=__version__,
        description=(
            "Card identification and duplicate detection for OrenjiTrade. Internal service: "
            "the API treats it as optional and degrades gracefully when it is unavailable."
        ),
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.identifier = get_identifier(settings)

    # Middleware added last runs outermost: request ids wrap everything, including the
    # body-size ceiling (FastAPI does not honour Starlette's `max_body_size`, and Starlette's
    # own limiter answers in plain text, so a problem-aware variant is used).
    app.add_middleware(
        BodyLimitMiddleware,
        max_body_size=2 * settings.max_image_bytes + _BODY_OVERHEAD_BYTES,
    )
    app.add_middleware(RequestIdMiddleware)
    register_exception_handlers(app)

    app.include_router(health.router)
    app.include_router(identify.router)
    app.include_router(duplicates.router)
    app.include_router(pubsub.router)
    return app


app = create_app()
