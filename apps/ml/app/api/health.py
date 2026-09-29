"""Liveness and readiness probes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app import __version__
from app.api.deps import IdentifierDep, SettingsDep

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness probe")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get(
    "/ready",
    summary="Readiness probe (model backend loaded)",
    responses={503: {"description": "Model backend is not ready"}},
)
async def ready(settings: SettingsDep, identifier: IdentifierDep) -> JSONResponse:
    model_ready = identifier.ready
    body: dict[str, Any] = {
        "status": "ready" if model_ready else "not_ready",
        "modelBackend": identifier.backend,
        "modelVersion": settings.model_version,
        "modelReady": model_ready,
        "serviceVersion": __version__,
    }
    return JSONResponse(body, status_code=200 if model_ready else 503)
