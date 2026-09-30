"""Shared helpers: deterministic test images, envelopes and a failing identifier."""

from __future__ import annotations

import io
import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.config import Settings
from app.events.models import CARD_SCAN_REQUESTED, encode_push_data
from app.main import create_app
from app.ml.identifier import Candidate

API_BASE_URL = "http://api.test"
IMAGE_URL = "https://images.test/card.png"
SCAN_RESULTS_URL = f"{API_BASE_URL}/internal/ml/scan-results"


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "model_backend": "stub",
        "api_base_url": API_BASE_URL,
        "log_level": "WARNING",
        "max_image_bytes": 512 * 1024,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@contextmanager
def make_client(settings: Settings | None = None) -> Iterator[TestClient]:
    with TestClient(create_app(settings or make_settings())) as client:
        yield client


def patterned_image(size: tuple[int, int] = (96, 128), seed: int = 1) -> Image.Image:
    """Deterministic, photo-like (smooth) image; different seeds give different pictures.

    A rotated gradient background plus a few large shapes keeps the content low-frequency, so
    perceptual hashes behave like they do on real card photos.
    """
    width, height = size
    angle = (seed * 37) % 360
    background = Image.linear_gradient("L").rotate(angle, resample=Image.Resampling.BILINEAR)
    image = background.resize(size, Image.Resampling.BILINEAR).convert("RGB")
    draw = ImageDraw.Draw(image)
    for index in range(3):
        offset = (seed * 53 + index * 71) % 100
        left = width * offset // 160
        top = height * ((offset * 7) % 100) // 160
        box = [left, top, left + width // 3, top + height // 4]
        colour = ((seed * 61 + index * 90) % 256, (offset * 3) % 256, (255 - offset * 2) % 256)
        if index % 2:
            draw.ellipse(box, fill=colour)
        else:
            draw.rectangle(box, fill=colour)
    return image


def gradient_image(size: tuple[int, int] = (96, 128), reverse: bool = False) -> Image.Image:
    width, height = size
    row = bytes(
        (255 - (x * 255 // max(width - 1, 1))) if reverse else (x * 255 // max(width - 1, 1))
        for x in range(width)
    )
    return Image.frombytes("L", size, row * height).convert("RGB")


def noise_image(size: tuple[int, int] = (64, 64)) -> Image.Image:
    """Incompressible image, useful when a test needs a guaranteed-large encoded payload."""
    width, height = size
    return Image.frombytes("RGB", size, os.urandom(width * height * 3))


def encode(image: Image.Image, fmt: str = "PNG") -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()


def image_bytes(fmt: str = "PNG", size: tuple[int, int] = (96, 128), seed: int = 1) -> bytes:
    return encode(patterned_image(size, seed), fmt)


def upload(
    field: str, data: bytes, content_type: str = "image/png", filename: str = "card.png"
) -> dict[str, tuple[str, bytes, str]]:
    return {field: (filename, data, content_type)}


class RaisingIdentifier:
    """A ready backend whose model blows up on every call."""

    backend = "raising"
    ready = True

    def identify(self, image: Image.Image) -> list[Candidate]:
        msg = "model exploded"
        raise RuntimeError(msg)


def scan_requested_payload(
    scan_id: str = "scan-1", image_uri: str = IMAGE_URL, user_id: str = "user-1"
) -> dict[str, Any]:
    return {
        "scanId": scan_id,
        "userId": user_id,
        "imageUri": image_uri,
        "requestedAt": "2026-09-29T10:00:00Z",
    }


def pubsub_envelope(
    payload: dict[str, Any] | None,
    event_type: str | None = CARD_SCAN_REQUESTED,
    message_id: str = "m-1",
    data: str | None = None,
) -> dict[str, Any]:
    attributes = {"type": event_type} if event_type is not None else {}
    encoded = data if data is not None else encode_push_data(payload or {})
    return {
        "message": {
            "data": encoded,
            "attributes": attributes,
            "messageId": message_id,
            "publishTime": "2026-09-29T10:00:01Z",
        },
        "subscription": "projects/orenjitrade-local/subscriptions/ml-card-scan",
    }
