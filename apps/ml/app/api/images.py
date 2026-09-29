"""Image intake: content-type and size validation, decoding, and URL fetching.

All failures are raised as `ApiError` with stable error codes so both the HTTP layer
(problem responses) and the event worker (FAILED scan results) can react uniformly.
"""

from __future__ import annotations

import io
from typing import Final
from urllib.parse import urlparse

import httpx
from PIL import Image, UnidentifiedImageError
from starlette.datastructures import UploadFile

from app.config import Settings
from app.errors import ApiError

ALLOWED_CONTENT_TYPES: Final[frozenset[str]] = frozenset({"image/jpeg", "image/png", "image/webp"})
ALLOWED_PIL_FORMATS: Final[frozenset[str]] = frozenset({"JPEG", "PNG", "WEBP"})
ALLOWED_URL_SCHEMES: Final[frozenset[str]] = frozenset({"http", "https"})
_CHUNK_SIZE = 64 * 1024


def normalise_content_type(value: str | None) -> str:
    """`image/png; charset=binary` -> `image/png`."""
    if not value:
        return ""
    return value.split(";", 1)[0].strip().lower()


def unsupported_media_type(field: str) -> ApiError:
    return ApiError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        f"{field} must be image/jpeg, image/png or image/webp.",
    )


def image_too_large(field: str, max_bytes: int) -> ApiError:
    return ApiError(413, "IMAGE_TOO_LARGE", f"{field} exceeds the maximum size of {max_bytes} bytes.")


def ensure_supported_content_type(content_type: str | None, *, field: str) -> str:
    normalised = normalise_content_type(content_type)
    if normalised not in ALLOWED_CONTENT_TYPES:
        raise unsupported_media_type(field)
    return normalised


async def read_upload(upload: UploadFile, *, max_bytes: int, field: str) -> bytes:
    """Read a multipart file part, enforcing content type and size."""
    ensure_supported_content_type(upload.content_type, field=field)
    if upload.size is not None and upload.size > max_bytes:
        raise image_too_large(field, max_bytes)
    chunks: list[bytes] = []
    total = 0
    while chunk := await upload.read(_CHUNK_SIZE):
        total += len(chunk)
        if total > max_bytes:
            raise image_too_large(field, max_bytes)
        chunks.append(chunk)
    if total == 0:
        raise ApiError(422, "IMAGE_EMPTY", f"{field} is empty.")
    return b"".join(chunks)


def decode_image(data: bytes, *, max_side_px: int) -> Image.Image:
    """Decode JPEG/PNG/WebP bytes into an RGB image, guarding against decompression bombs."""
    try:
        with Image.open(io.BytesIO(data)) as probe:
            image_format = probe.format
            width, height = probe.size
            if image_format not in ALLOWED_PIL_FORMATS:
                raise unsupported_media_type("image")
            if width > max_side_px or height > max_side_px:
                raise ApiError(
                    413,
                    "IMAGE_DIMENSIONS_TOO_LARGE",
                    f"image dimensions exceed {max_side_px}x{max_side_px} pixels.",
                )
            return probe.convert("RGB")
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError) as exc:
        raise ApiError(422, "IMAGE_DECODE_FAILED", "The image could not be decoded.") from exc


async def fetch_image(client: httpx.AsyncClient, url: str, *, settings: Settings) -> bytes:
    """Download an image over http(s), enforcing scheme, host allow-list, type and size."""
    parsed = urlparse(url)
    if parsed.scheme.lower() not in ALLOWED_URL_SCHEMES or not parsed.hostname:
        raise ApiError(422, "IMAGE_URL_UNSUPPORTED", "imageUrl must be an http(s) URL.")
    allowed_hosts = settings.allowed_image_hosts
    if allowed_hosts and parsed.hostname.lower() not in allowed_hosts:
        raise ApiError(422, "IMAGE_URL_HOST_NOT_ALLOWED", "imageUrl host is not allowed.")

    max_bytes = settings.max_image_bytes
    try:
        async with client.stream(
            "GET", url, timeout=settings.image_fetch_timeout_seconds
        ) as response:
            if response.status_code != 200:
                raise ApiError(
                    502,
                    "IMAGE_FETCH_FAILED",
                    f"The image URL responded with HTTP {response.status_code}.",
                )
            ensure_supported_content_type(response.headers.get("content-type"), field="imageUrl")
            declared = response.headers.get("content-length")
            if declared is not None and declared.isdigit() and int(declared) > max_bytes:
                raise image_too_large("imageUrl", max_bytes)
            chunks: list[bytes] = []
            total = 0
            async for chunk in response.aiter_bytes(_CHUNK_SIZE):
                total += len(chunk)
                if total > max_bytes:
                    raise image_too_large("imageUrl", max_bytes)
                chunks.append(chunk)
    except httpx.HTTPError as exc:
        raise ApiError(502, "IMAGE_FETCH_FAILED", "The image could not be fetched.") from exc
    if total == 0:
        raise ApiError(422, "IMAGE_EMPTY", "The image URL returned an empty body.")
    return b"".join(chunks)
