"""Request-id propagation and JSON structured logging.

Every request carries `X-Request-Id` (generated when missing). The id is stored in a
`ContextVar` so that every log line emitted while handling the request includes it, and it is
echoed back in the response headers so the API and clients can correlate.
"""

from __future__ import annotations

import logging
import re
import sys
import uuid
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from pythonjsonlogger.json import JsonFormatter
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.common import iso_timestamp

REQUEST_ID_HEADER = "X-Request-Id"
SERVICE_NAME = "orenjitrade-ml"
_HANDLER_NAME = "orenjitrade-json"
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:/-]{1,128}$")
_UVICORN_LOGGERS = ("uvicorn", "uvicorn.error", "uvicorn.access")

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)


def new_request_id() -> str:
    return uuid.uuid4().hex


def current_request_id() -> str | None:
    """Request id of the request being handled on this task, if any."""
    return request_id_var.get()


def normalise_request_id(value: str | None) -> str:
    """Accept a well-formed client-supplied id, otherwise mint a fresh one."""
    if value is not None and _REQUEST_ID_PATTERN.match(value):
        return value
    return new_request_id()


class ServiceJsonFormatter(JsonFormatter):
    """One JSON object per line: timestamp, level, logger, message, requestId, module, extras."""

    def add_fields(
        self,
        log_data: dict[str, Any],
        record: logging.LogRecord,
        message_dict: dict[str, Any],
    ) -> None:
        super().add_fields(log_data, record, message_dict)
        extras = dict(log_data)
        extras.pop("message", None)
        request_id = extras.pop("requestId", None) or request_id_var.get()
        ordered: dict[str, Any] = {
            "timestamp": iso_timestamp(datetime.fromtimestamp(record.created, tz=UTC)),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "requestId": request_id,
            "module": record.module,
            "service": SERVICE_NAME,
        }
        ordered.update(extras)
        log_data.clear()
        log_data.update(ordered)


def configure_logging(level: str = "INFO") -> None:
    """Route all logging (including uvicorn's) through the JSON formatter on stdout.

    Safe to call repeatedly: the handler installed by a previous call is replaced.
    """
    root = logging.getLogger()
    for existing in list(root.handlers):
        if existing.get_name() == _HANDLER_NAME:
            root.removeHandler(existing)
    handler = logging.StreamHandler(sys.stdout)
    handler.set_name(_HANDLER_NAME)
    handler.setFormatter(ServiceJsonFormatter())
    root.addHandler(handler)
    root.setLevel(level.upper())
    for name in _UVICORN_LOGGERS:
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True


class RequestIdMiddleware:
    """Pure ASGI middleware: reads/generates `X-Request-Id`, exposes it, echoes it back."""

    def __init__(self, app: ASGIApp, header_name: str = REQUEST_ID_HEADER) -> None:
        self.app = app
        self.header_name = header_name

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = normalise_request_id(Headers(scope=scope).get(self.header_name))
        scope.setdefault("state", {})["request_id"] = request_id
        token = request_id_var.set(request_id)

        async def send_with_request_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                if self.header_name not in headers:
                    headers.append(self.header_name, request_id)
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            request_id_var.reset(token)
