from __future__ import annotations

import json
import logging

from app.observability import (
    ServiceJsonFormatter,
    configure_logging,
    current_request_id,
    request_id_var,
)


def make_record(message: str, **extra: object) -> logging.LogRecord:
    record = logging.LogRecord(
        name="app.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg=message,
        args=(),
        exc_info=None,
    )
    for key, value in extra.items():
        setattr(record, key, value)
    return record


def test_formatter_emits_required_fields_in_order() -> None:
    token = request_id_var.set("ctx-req-1")
    try:
        line = ServiceJsonFormatter().format(make_record("hello %s", scanId="scan-1"))
    finally:
        request_id_var.reset(token)

    payload = json.loads(line)
    assert list(payload)[:6] == ["timestamp", "level", "logger", "message", "requestId", "module"]
    assert payload["level"] == "INFO"
    assert payload["logger"] == "app.test"
    assert payload["message"] == "hello %s"
    assert payload["requestId"] == "ctx-req-1"
    assert payload["module"] == "test_logging"
    assert payload["scanId"] == "scan-1"
    assert payload["timestamp"].endswith("Z")


def test_explicit_request_id_extra_wins_over_context() -> None:
    token = request_id_var.set("ctx-req-1")
    try:
        line = ServiceJsonFormatter().format(make_record("x", requestId="explicit-req"))
    finally:
        request_id_var.reset(token)

    assert json.loads(line)["requestId"] == "explicit-req"
    assert current_request_id() is None


def test_exception_details_stay_in_the_log_line() -> None:
    record = make_record("failed")
    try:
        msg = "kaboom"
        raise ValueError(msg)
    except ValueError as exc:
        record.exc_info = (type(exc), exc, exc.__traceback__)

    payload = json.loads(ServiceJsonFormatter().format(record))

    assert "kaboom" in payload["exc_info"]
    assert payload["requestId"] is None


def test_configure_logging_is_idempotent_and_captures_uvicorn() -> None:
    root = logging.getLogger()
    configure_logging("DEBUG")
    configure_logging("info")

    ours = [handler for handler in root.handlers if handler.get_name() == "orenjitrade-json"]
    assert len(ours) == 1
    assert isinstance(ours[0].formatter, ServiceJsonFormatter)
    assert root.level == logging.INFO
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(name)
        assert uvicorn_logger.handlers == []
        assert uvicorn_logger.propagate is True
