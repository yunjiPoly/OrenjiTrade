"""RFC 9457 Problem Details for every error response.

Shape (mirrors the API's `ProblemDetailsExceptionHandler`):

    {type, title, status, detail, errorCode, message, requestId, timestamp[, errors]}

Stack traces, file paths and infrastructure details never appear in a response; they go to
the ERROR log carrying the same `requestId`.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse, Response

from app.common import iso_timestamp
from app.observability import REQUEST_ID_HEADER, current_request_id, new_request_id

logger = logging.getLogger(__name__)

PROBLEM_MEDIA_TYPE = "application/problem+json"
PROBLEM_TYPE_PREFIX = "urn:orenjitrade:problem:"

STATUS_ERROR_CODES: Mapping[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "CONTENT_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "VALIDATION_FAILED",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    502: "UPSTREAM_ERROR",
    503: "SERVICE_UNAVAILABLE",
}


class ApiError(HTTPException):
    """An HTTP error with a stable machine-readable `errorCode` and a client-safe message."""

    def __init__(
        self,
        status_code: int,
        error_code: str,
        message: str,
        *,
        errors: list[dict[str, Any]] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=message, headers=headers)
        self.error_code = error_code
        self.message = message
        self.errors = errors


def problem_type(error_code: str) -> str:
    return PROBLEM_TYPE_PREFIX + error_code.lower().replace("_", "-")


def request_id_for(request: Request) -> str:
    """Request id from the ASGI scope (set by `RequestIdMiddleware`), context, or a new one."""
    state = request.scope.get("state") or {}
    request_id = state.get("request_id") or current_request_id()
    return request_id if isinstance(request_id, str) and request_id else new_request_id()


def problem_response(
    request: Request,
    *,
    status: int,
    error_code: str,
    message: str,
    errors: list[dict[str, Any]] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    request_id = request_id_for(request)
    try:
        title = HTTPStatus(status).phrase
    except ValueError:
        title = "Error"
    body: dict[str, Any] = {
        "type": problem_type(error_code),
        "title": title,
        "status": status,
        "detail": message,
        "errorCode": error_code,
        "message": message,
        "requestId": request_id,
        "timestamp": iso_timestamp(),
    }
    if errors is not None:
        body["errors"] = errors
    response_headers = {REQUEST_ID_HEADER: request_id}
    if headers:
        response_headers.update(headers)
    return JSONResponse(
        body, status_code=status, headers=response_headers, media_type=PROBLEM_MEDIA_TYPE
    )


def _format_validation_errors(raw_errors: Any) -> list[dict[str, Any]]:
    formatted: list[dict[str, Any]] = []
    for error in raw_errors if isinstance(raw_errors, list | tuple) else []:
        if not isinstance(error, Mapping):
            continue
        loc = error.get("loc", ())
        field = ".".join(str(part) for part in loc) if isinstance(loc, list | tuple) else str(loc)
        formatted.append(
            {
                "field": field,
                "message": str(error.get("msg", "Invalid value")),
                "code": str(error.get("type", "invalid")),
            }
        )
    return formatted


async def http_exception_handler(request: Request, exc: Exception) -> Response:
    if not isinstance(exc, HTTPException):  # pragma: no cover - registered for HTTPException only
        return await unhandled_exception_handler(request, exc)
    if isinstance(exc, ApiError):
        error_code, message, errors = exc.error_code, exc.message, exc.errors
    else:
        error_code = STATUS_ERROR_CODES.get(exc.status_code, "HTTP_ERROR")
        message = str(exc.detail) if exc.detail else HTTPStatus(exc.status_code).phrase
        errors = None
    log_level = logging.ERROR if exc.status_code >= 500 else logging.INFO
    logger.log(
        log_level,
        "Request failed: %s",
        error_code,
        extra={"statusCode": exc.status_code, "errorCode": error_code, "path": request.url.path},
    )
    return problem_response(
        request,
        status=exc.status_code,
        error_code=error_code,
        message=message,
        errors=errors,
        headers=exc.headers,
    )


async def validation_exception_handler(request: Request, exc: Exception) -> Response:
    raw_errors = exc.errors() if isinstance(exc, RequestValidationError) else []
    errors = _format_validation_errors(raw_errors)
    logger.info(
        "Request validation failed",
        extra={"statusCode": 422, "errorCode": "VALIDATION_FAILED", "path": request.url.path},
    )
    return problem_response(
        request,
        status=422,
        error_code="VALIDATION_FAILED",
        message="Request validation failed.",
        errors=errors,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> Response:
    request_id = request_id_for(request)
    # The traceback is logged server-side only; the response carries a generic message.
    logger.error(
        "Unhandled exception while processing request",
        exc_info=exc,
        extra={"requestId": request_id, "statusCode": 500, "path": request.url.path},
    )
    return problem_response(
        request,
        status=500,
        error_code="INTERNAL_ERROR",
        message="An unexpected error occurred.",
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
