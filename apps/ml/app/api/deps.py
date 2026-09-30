"""Request-scoped access to application singletons stored on `app.state`."""

from __future__ import annotations

from typing import Annotated

import httpx
from fastapi import Depends, Request

from app import __version__
from app.config import Settings
from app.ml.identifier import CardIdentifier


def build_http_client(settings: Settings) -> httpx.AsyncClient:
    """Outbound client for image fetches and result delivery.

    Redirects are not followed so that the optional image host allow-list cannot be bypassed.
    """
    return httpx.AsyncClient(
        timeout=httpx.Timeout(settings.image_fetch_timeout_seconds),
        follow_redirects=False,
        headers={"User-Agent": f"orenjitrade-ml/{__version__}"},
    )


def get_app_settings(request: Request) -> Settings:
    settings = request.app.state.settings
    if not isinstance(settings, Settings):  # pragma: no cover - programming error
        msg = "application settings are not initialised"
        raise RuntimeError(msg)
    return settings


def get_app_identifier(request: Request) -> CardIdentifier:
    identifier = request.app.state.identifier
    if not isinstance(identifier, CardIdentifier):  # pragma: no cover - programming error
        msg = "card identifier is not initialised"
        raise RuntimeError(msg)
    return identifier


def get_http_client(request: Request) -> httpx.AsyncClient:
    client = getattr(request.app.state, "http_client", None)
    if not isinstance(client, httpx.AsyncClient):
        client = build_http_client(get_app_settings(request))
        request.app.state.http_client = client
    return client


SettingsDep = Annotated[Settings, Depends(get_app_settings)]
IdentifierDep = Annotated[CardIdentifier, Depends(get_app_identifier)]
HttpClientDep = Annotated[httpx.AsyncClient, Depends(get_http_client)]
