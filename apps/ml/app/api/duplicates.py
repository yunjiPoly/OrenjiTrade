"""POST /v1/duplicates: are two images (or two precomputed dHashes) the same picture?"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.exceptions import RequestValidationError
from pydantic import Field, ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile

from app.api.deps import SettingsDep
from app.api.identify import JSON, MULTIPART
from app.api.images import decode_image, normalise_content_type, read_upload
from app.common import CamelModel
from app.config import Settings
from app.errors import ApiError, request_id_for
from app.ml.hashing import HEX_LENGTH, dhash, hamming_distance, hash_to_hex, hex_to_hash

router = APIRouter(prefix="/v1", tags=["duplicates"])

IMAGE_A_FIELD = "imageA"
IMAGE_B_FIELD = "imageB"
ALGORITHM = "dhash"
_HEX_PATTERN = rf"^[0-9a-fA-F]{{{HEX_LENGTH}}}$"


class DuplicatesByHashRequest(CamelModel):
    hash_a: str = Field(pattern=_HEX_PATTERN)
    hash_b: str = Field(pattern=_HEX_PATTERN)
    threshold: int | None = Field(default=None, ge=0, le=64)


class DuplicatesResponse(CamelModel):
    request_id: str
    distance: int
    is_duplicate: bool
    threshold: int
    hash_a: str
    hash_b: str
    algorithm: str = ALGORITHM


async def _hashes_from_multipart(request: Request, settings: Settings) -> tuple[int, int]:
    async with request.form(max_files=2, max_fields=4) as form:
        uploads: list[UploadFile] = []
        for field in (IMAGE_A_FIELD, IMAGE_B_FIELD):
            upload = form.get(field)
            if not isinstance(upload, UploadFile):
                raise RequestValidationError(
                    [{"type": "missing", "loc": ("body", field), "msg": "Field required"}]
                )
            uploads.append(upload)
        payloads = [
            await read_upload(upload, max_bytes=settings.max_image_bytes, field=field)
            for upload, field in zip(uploads, (IMAGE_A_FIELD, IMAGE_B_FIELD), strict=True)
        ]
    hashes: list[int] = []
    for data in payloads:
        image = await run_in_threadpool(decode_image, data, max_side_px=settings.max_image_side_px)
        hashes.append(await run_in_threadpool(dhash, image))
    return hashes[0], hashes[1]


async def _hashes_from_json(request: Request) -> tuple[int, int, int | None]:
    try:
        payload = await request.json()
    except ValueError as exc:
        raise RequestValidationError(
            [{"type": "json_invalid", "loc": ("body",), "msg": "Invalid JSON body"}]
        ) from exc
    try:
        body = DuplicatesByHashRequest.model_validate(payload)
    except ValidationError as exc:
        raise RequestValidationError(
            exc.errors(include_url=False, include_context=False, include_input=False),
            body=payload,
        ) from exc
    return hex_to_hash(body.hash_a), hex_to_hash(body.hash_b), body.threshold


@router.post(
    "/duplicates",
    response_model=DuplicatesResponse,
    summary="Compare two images or two dHashes",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                MULTIPART: {
                    "schema": {
                        "type": "object",
                        "required": [IMAGE_A_FIELD, IMAGE_B_FIELD],
                        "properties": {
                            IMAGE_A_FIELD: {"type": "string", "format": "binary"},
                            IMAGE_B_FIELD: {"type": "string", "format": "binary"},
                        },
                    }
                },
                JSON: {"schema": DuplicatesByHashRequest.model_json_schema()},
            },
        }
    },
)
async def duplicates(request: Request, settings: SettingsDep) -> DuplicatesResponse:
    content_type = normalise_content_type(request.headers.get("content-type"))
    threshold_override: int | None = None
    if content_type == MULTIPART:
        hash_a, hash_b = await _hashes_from_multipart(request, settings)
    elif content_type == JSON:
        hash_a, hash_b, threshold_override = await _hashes_from_json(request)
    else:
        raise ApiError(
            415,
            "UNSUPPORTED_MEDIA_TYPE",
            "Send multipart/form-data with 'imageA' and 'imageB' parts, "
            "or application/json with 'hashA' and 'hashB'.",
        )
    threshold = settings.duplicate_threshold if threshold_override is None else threshold_override
    distance = hamming_distance(hash_a, hash_b)
    return DuplicatesResponse(
        request_id=request_id_for(request),
        distance=distance,
        is_duplicate=distance <= threshold,
        threshold=threshold,
        hash_a=hash_to_hex(hash_a),
        hash_b=hash_to_hex(hash_b),
    )
