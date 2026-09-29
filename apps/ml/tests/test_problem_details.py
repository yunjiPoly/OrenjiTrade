from __future__ import annotations

import logging
import re

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.errors import PROBLEM_MEDIA_TYPE, ApiError
from app.main import create_app
from tests.helpers import make_settings

PROBLEM_KEYS = {
    "type",
    "title",
    "status",
    "detail",
    "errorCode",
    "message",
    "requestId",
    "timestamp",
}
TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
HEX32 = re.compile(r"^[0-9a-f]{32}$")


def test_validation_error_shape_includes_request_id_and_errors(client: TestClient) -> None:
    response = client.post(
        "/v1/duplicates",
        json={"hashA": "bad", "hashB": "0123456789abcdef"},
        headers={"X-Request-Id": "req-val-1"},
    )

    assert response.status_code == 422
    assert response.headers["content-type"].startswith(PROBLEM_MEDIA_TYPE)
    assert response.headers["x-request-id"] == "req-val-1"
    body = response.json()
    assert set(body) == PROBLEM_KEYS | {"errors"}
    assert body["type"] == "urn:orenjitrade:problem:validation-failed"
    assert body["title"]
    assert body["status"] == 422
    assert body["errorCode"] == "VALIDATION_FAILED"
    assert body["detail"] == body["message"] == "Request validation failed."
    assert body["requestId"] == "req-val-1"
    assert TIMESTAMP.match(body["timestamp"])
    assert body["errors"] == [
        {
            "field": "hashA",
            "message": body["errors"][0]["message"],
            "code": "string_pattern_mismatch",
        }
    ]


def test_not_found_uses_problem_shape(client: TestClient) -> None:
    response = client.get("/does-not-exist")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith(PROBLEM_MEDIA_TYPE)
    body = response.json()
    assert set(body) == PROBLEM_KEYS
    assert body["errorCode"] == "NOT_FOUND"
    assert body["type"] == "urn:orenjitrade:problem:not-found"
    assert body["requestId"] == response.headers["x-request-id"]


def test_method_not_allowed_uses_problem_shape(client: TestClient) -> None:
    response = client.get("/v1/identify")

    assert response.status_code == 405
    assert response.json()["errorCode"] == "METHOD_NOT_ALLOWED"


def test_request_id_is_generated_when_missing_or_malformed(client: TestClient) -> None:
    generated = client.get("/health")
    replaced = client.get("/health", headers={"X-Request-Id": "has spaces and <tags>"})
    too_long = client.get("/health", headers={"X-Request-Id": "x" * 129})
    kept = client.get("/health", headers={"X-Request-Id": "trace-1234.abc:def/ghi"})

    assert HEX32.match(generated.headers["x-request-id"])
    assert HEX32.match(replaced.headers["x-request-id"])
    assert HEX32.match(too_long.headers["x-request-id"])
    assert kept.headers["x-request-id"] == "trace-1234.abc:def/ghi"


def test_unhandled_exception_returns_generic_problem_without_stack_trace(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app: FastAPI = create_app(make_settings())

    @app.get("/boom")
    async def boom() -> None:
        msg = "secret internal detail"
        raise RuntimeError(msg)

    with (
        caplog.at_level(logging.ERROR),
        TestClient(app, raise_server_exceptions=False) as client,
    ):
        response = client.get("/boom", headers={"X-Request-Id": "req-boom"})

    assert response.status_code == 500
    assert response.headers["content-type"].startswith(PROBLEM_MEDIA_TYPE)
    assert response.headers["x-request-id"] == "req-boom"
    body = response.json()
    assert set(body) == PROBLEM_KEYS
    assert body["errorCode"] == "INTERNAL_ERROR"
    assert body["message"] == "An unexpected error occurred."
    assert body["requestId"] == "req-boom"
    assert "secret internal detail" not in response.text
    assert "Traceback" not in response.text

    errors = [record for record in caplog.records if record.levelno == logging.ERROR]
    assert errors and errors[-1].exc_info is not None
    assert getattr(errors[-1], "requestId", None) == "req-boom"


def test_api_error_carries_custom_code_and_headers() -> None:
    app: FastAPI = create_app(make_settings())

    @app.get("/teapot")
    async def teapot() -> None:
        raise ApiError(418, "TEAPOT", "Short and stout.", headers={"Retry-After": "30"})

    with TestClient(app) as client:
        response = client.get("/teapot")

    assert response.status_code == 418
    assert response.headers["retry-after"] == "30"
    body = response.json()
    assert body["errorCode"] == "TEAPOT"
    assert body["detail"] == "Short and stout."
    assert body["type"] == "urn:orenjitrade:problem:teapot"
