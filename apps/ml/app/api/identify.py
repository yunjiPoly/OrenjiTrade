"""POST /v1/identify: rank catalog candidates for a card photo."""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Request
from fastapi.exceptions import RequestValidationError
from pydantic import Field, ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile

from app.api.deps import HttpClientDep, IdentifierDep, SettingsDep
from app.api.images import decode_image, fetch_image, normalise_content_type, read_upload
from app.common import CamelModel
from app.config import Settings
from app.errors import ApiError, request_id_for
from app.ml.identifier import Candidate
from app.ml.service import identify_image

router = APIRouter(prefix="/v1", tags=["identify"])

MULTIPART = "multipart/form-data"
JSON = "application/json"
FILE_FIELD = "file"


class IdentifyByUrlRequest(CamelModel):
    image_url: str = Field(min_length=1, max_length=2048)


class IdentifyResponse(CamelModel):
    request_id: str
    candidates: list[Candidate]
    model_version: str
    degraded: bool
    processing_ms: int


_REQUEST_BODY_DOC: dict[str, Any] = {
    "requestBody": {
        "required": True,
        "content": {
            MULTIPART: {
                "schema": {
                    "type": "object",
                    "required": [FILE_FIELD],
                    "properties": {
                        FILE_FIELD: {
                            "type": "string",
                            "format": "binary",
                            "description": "JPEG, PNG or WebP image",
                        }
                    },
                }
            },
            JSON: {"schema": IdentifyByUrlRequest.model_json_schema()},
        },
    }
}


async def _load_image_bytes(request: Request, settings: Settings, client: Any) -> bytes:
    content_type = normalise_content_type(request.headers.get("content-type"))
    if content_type == MULTIPART:
        async with request.form(max_files=2, max_fields=4) as form:
            upload = form.get(FILE_FIELD)
            if not isinstance(upload, UploadFile):
                raise RequestValidationError(
                    [{"type": "missing", "loc": ("body", FILE_FIELD), "msg": "Field required"}]
                )
            return await read_upload(upload, max_bytes=settings.max_image_bytes, field=FILE_FIELD)
    if content_type == JSON:
        try:
            payload = await request.json()
        except ValueError as exc:
            raise RequestValidationError(
                [{"type": "json_invalid", "loc": ("body",), "msg": "Invalid JSON body"}]
            ) from exc
        try:
            body = IdentifyByUrlRequest.model_validate(payload)
        except ValidationError as exc:
            raise RequestValidationError(
                exc.errors(include_url=False, include_context=False, include_input=False),
                body=payload,
            ) from exc
        return await fetch_image(client, body.image_url, settings=settings)
    raise ApiError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Send multipart/form-data with a 'file' part, or application/json with 'imageUrl'.",
    )


@router.post(
    "/identify",
    response_model=IdentifyResponse,
    summary="Identify a card from a photo",
    openapi_extra=_REQUEST_BODY_DOC,
)
async def identify(
    request: Request,
    settings: SettingsDep,
    identifier: IdentifierDep,
    client: HttpClientDep,
) -> IdentifyResponse:
    started = time.perf_counter()
    data = await _load_image_bytes(request, settings, client)
    image = await run_in_threadpool(decode_image, data, max_side_px=settings.max_image_side_px)
    outcome = await identify_image(identifier, image)
    return IdentifyResponse(
        request_id=request_id_for(request),
        candidates=outcome.candidates,
        model_version=settings.model_version,
        degraded=outcome.degraded,
        processing_ms=int((time.perf_counter() - started) * 1000),
    )
