"""Hard ceiling on request body size, answered as an RFC 9457 problem.

Starlette ships `RequestBodyLimitMiddleware`, but it answers with a plain-text 413 whenever the
declared `Content-Length` is too large, bypassing the application's exception handlers. This
variant keeps the contract: a declared oversize body gets a problem response straight away,
and a streamed body that grows past the limit raises `ApiError`, which the route's exception
handling renders as the same problem shape.
"""

from __future__ import annotations

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.errors import ApiError, problem_json_response
from app.observability import current_request_id, new_request_id

ERROR_CODE = "CONTENT_TOO_LARGE"


def _too_large(max_body_size: int) -> ApiError:
    return ApiError(413, ERROR_CODE, f"Request body exceeds {max_body_size} bytes.")


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_body_size: int) -> None:
        if max_body_size <= 0:
            msg = "max_body_size must be positive"
            raise ValueError(msg)
        self.app = app
        self.max_body_size = max_body_size

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = Headers(scope=scope).get("content-length")
        if declared is not None and declared.isdigit() and int(declared) > self.max_body_size:
            error = _too_large(self.max_body_size)
            response = problem_json_response(
                status=error.status_code,
                error_code=error.error_code,
                message=error.message,
                request_id=current_request_id() or new_request_id(),
            )
            await response(scope, receive, send)
            return

        received = 0

        async def receive_with_limit() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_body_size:
                    raise _too_large(self.max_body_size)
            return message

        await self.app(scope, receive_with_limit, send)
