from __future__ import annotations

import logging
from collections.abc import Iterator

import httpx
import pytest
import respx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.errors import PROBLEM_MEDIA_TYPE
from tests.helpers import (
    IMAGE_URL,
    RaisingIdentifier,
    encode,
    image_bytes,
    make_client,
    make_settings,
    noise_image,
    patterned_image,
    upload,
)

CANDIDATE_KEYS = {
    "game",
    "cardName",
    "setCode",
    "collectorNumber",
    "rarity",
    "edition",
    "language",
    "confidence",
}


def test_png_upload_returns_candidates_sorted_by_confidence(client: TestClient) -> None:
    response = client.post("/v1/identify", files=upload("file", image_bytes()))

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"requestId", "candidates", "modelVersion", "degraded", "processingMs"}
    assert body["modelVersion"] == "stub-0.1.0"
    assert body["degraded"] is False
    assert body["processingMs"] >= 0
    assert body["requestId"] == response.headers["x-request-id"]

    candidates = body["candidates"]
    assert candidates
    confidences = [candidate["confidence"] for candidate in candidates]
    assert confidences == sorted(confidences, reverse=True)
    for candidate in candidates:
        assert set(candidate) == CANDIDATE_KEYS
        assert candidate["game"] in {"yugioh", "pokemon", "mtg", "riftbound"}
        assert 0.0 <= candidate["confidence"] <= 1.0


def test_client_supplied_request_id_is_echoed(client: TestClient) -> None:
    response = client.post(
        "/v1/identify",
        files=upload("file", image_bytes()),
        headers={"X-Request-Id": "scan-req-42"},
    )

    assert response.status_code == 200
    assert response.headers["x-request-id"] == "scan-req-42"
    assert response.json()["requestId"] == "scan-req-42"


def test_same_image_gives_identical_candidates(client: TestClient) -> None:
    first = client.post("/v1/identify", files=upload("file", image_bytes(seed=3))).json()
    second = client.post("/v1/identify", files=upload("file", image_bytes(seed=3))).json()
    other = client.post("/v1/identify", files=upload("file", image_bytes(seed=9))).json()

    assert first["candidates"] == second["candidates"]
    assert first["candidates"] != other["candidates"]


@pytest.mark.parametrize(
    ("fmt", "content_type"),
    [("JPEG", "image/jpeg"), ("WEBP", "image/webp"), ("PNG", "image/png; charset=binary")],
)
def test_jpeg_and_webp_uploads_are_accepted(
    client: TestClient, fmt: str, content_type: str
) -> None:
    response = client.post("/v1/identify", files=upload("file", image_bytes(fmt), content_type))

    assert response.status_code == 200
    assert response.json()["candidates"]


def test_oversize_upload_returns_413() -> None:
    with make_client(make_settings(max_image_bytes=4096)) as client:
        response = client.post("/v1/identify", files=upload("file", encode(noise_image((64, 64)))))

    assert response.status_code == 413
    assert response.headers["content-type"].startswith(PROBLEM_MEDIA_TYPE)
    body = response.json()
    assert body["errorCode"] == "IMAGE_TOO_LARGE"
    assert body["status"] == 413
    assert body["requestId"] == response.headers["x-request-id"]


def test_declared_body_beyond_global_ceiling_returns_problem_413() -> None:
    settings = make_settings(max_image_bytes=4096)
    too_big = b"0" * (2 * settings.max_image_bytes + 1024 * 1024 + 1)
    with make_client(settings) as client:
        response = client.post(
            "/v1/identify", files=upload("file", too_big), headers={"X-Request-Id": "big-1"}
        )

    assert response.status_code == 413
    assert response.headers["content-type"].startswith(PROBLEM_MEDIA_TYPE)
    assert response.headers["x-request-id"] == "big-1"
    body = response.json()
    assert body["errorCode"] == "CONTENT_TOO_LARGE"
    assert body["requestId"] == "big-1"


def test_streamed_body_beyond_global_ceiling_returns_problem_413() -> None:
    settings = make_settings(max_image_bytes=4096)
    ceiling = 2 * settings.max_image_bytes + 1024 * 1024

    def chunks() -> Iterator[bytes]:
        yield b"{"
        yield b"0" * ceiling
        yield b"}"

    with make_client(settings) as client:
        response = client.post(
            "/v1/identify",
            content=chunks(),
            headers={"content-type": "application/json", "transfer-encoding": "chunked"},
        )

    assert response.status_code == 413
    assert response.json()["errorCode"] == "CONTENT_TOO_LARGE"


def test_text_file_returns_415(client: TestClient) -> None:
    response = client.post(
        "/v1/identify", files=upload("file", b"not an image", "text/plain", "notes.txt")
    )

    assert response.status_code == 415
    body = response.json()
    assert body["errorCode"] == "UNSUPPORTED_MEDIA_TYPE"
    assert body["type"] == "urn:orenjitrade:problem:unsupported-media-type"


def test_corrupt_image_bytes_return_422(client: TestClient) -> None:
    response = client.post("/v1/identify", files=upload("file", b"\x89PNG\r\n\x1a\ndefinitely not"))

    assert response.status_code == 422
    assert response.json()["errorCode"] == "IMAGE_DECODE_FAILED"


def test_empty_upload_returns_422(client: TestClient) -> None:
    response = client.post("/v1/identify", files=upload("file", b""))

    assert response.status_code == 422
    assert response.json()["errorCode"] == "IMAGE_EMPTY"


def test_image_dimensions_beyond_limit_return_413() -> None:
    with make_client(make_settings(max_image_side_px=64)) as client:
        response = client.post("/v1/identify", files=upload("file", image_bytes(size=(100, 40))))

    assert response.status_code == 413
    assert response.json()["errorCode"] == "IMAGE_DIMENSIONS_TOO_LARGE"


def test_missing_file_part_returns_validation_problem(client: TestClient) -> None:
    response = client.post("/v1/identify", files=upload("photo", image_bytes()))

    assert response.status_code == 422
    body = response.json()
    assert body["errorCode"] == "VALIDATION_FAILED"
    assert body["errors"] == [
        {"field": "body.file", "message": "Field required", "code": "missing"}
    ]


def test_unsupported_request_content_type_returns_415(client: TestClient) -> None:
    response = client.post("/v1/identify", content=b"x", headers={"content-type": "text/plain"})

    assert response.status_code == 415
    assert response.json()["errorCode"] == "UNSUPPORTED_MEDIA_TYPE"


def test_invalid_json_body_returns_validation_problem(client: TestClient) -> None:
    response = client.post(
        "/v1/identify", content=b"{not json", headers={"content-type": "application/json"}
    )

    assert response.status_code == 422
    body = response.json()
    assert body["errorCode"] == "VALIDATION_FAILED"
    assert body["errors"][0]["code"] == "json_invalid"


def test_json_body_without_image_url_returns_validation_problem(client: TestClient) -> None:
    response = client.post("/v1/identify", json={"imageUrl": 42})

    assert response.status_code == 422
    body = response.json()
    assert body["errorCode"] == "VALIDATION_FAILED"
    assert body["errors"][0]["field"] == "imageUrl"


def test_identify_by_url_fetches_and_identifies(
    client: TestClient, respx_mock: respx.MockRouter
) -> None:
    route = respx_mock.get(IMAGE_URL).mock(
        return_value=httpx.Response(
            200, content=image_bytes(), headers={"content-type": "image/png"}
        )
    )

    response = client.post("/v1/identify", json={"imageUrl": IMAGE_URL})

    assert response.status_code == 200
    assert response.json()["candidates"]
    assert route.call_count == 1


def test_identify_by_url_upstream_http_error_returns_502(
    client: TestClient, respx_mock: respx.MockRouter
) -> None:
    respx_mock.get(IMAGE_URL).mock(return_value=httpx.Response(404))

    response = client.post("/v1/identify", json={"imageUrl": IMAGE_URL})

    assert response.status_code == 502
    assert response.json()["errorCode"] == "IMAGE_FETCH_FAILED"


def test_identify_by_url_network_error_returns_502(
    client: TestClient, respx_mock: respx.MockRouter
) -> None:
    respx_mock.get(IMAGE_URL).mock(side_effect=httpx.ConnectError("refused"))

    response = client.post("/v1/identify", json={"imageUrl": IMAGE_URL})

    assert response.status_code == 502
    assert response.json()["errorCode"] == "IMAGE_FETCH_FAILED"


def test_identify_by_url_wrong_content_type_returns_415(
    client: TestClient, respx_mock: respx.MockRouter
) -> None:
    respx_mock.get(IMAGE_URL).mock(
        return_value=httpx.Response(200, content=b"<html>", headers={"content-type": "text/html"})
    )

    response = client.post("/v1/identify", json={"imageUrl": IMAGE_URL})

    assert response.status_code == 415
    assert response.json()["errorCode"] == "UNSUPPORTED_MEDIA_TYPE"


def test_identify_by_url_too_large_returns_413(respx_mock: respx.MockRouter) -> None:
    respx_mock.get(IMAGE_URL).mock(
        return_value=httpx.Response(
            200, content=encode(noise_image((64, 64))), headers={"content-type": "image/png"}
        )
    )

    with make_client(make_settings(max_image_bytes=4096)) as client:
        response = client.post("/v1/identify", json={"imageUrl": IMAGE_URL})

    assert response.status_code == 413
    assert response.json()["errorCode"] == "IMAGE_TOO_LARGE"


def test_identify_by_url_empty_body_returns_422(
    client: TestClient, respx_mock: respx.MockRouter
) -> None:
    respx_mock.get(IMAGE_URL).mock(
        return_value=httpx.Response(200, content=b"", headers={"content-type": "image/png"})
    )

    response = client.post("/v1/identify", json={"imageUrl": IMAGE_URL})

    assert response.status_code == 422
    assert response.json()["errorCode"] == "IMAGE_EMPTY"


def test_identify_by_url_rejects_non_http_schemes(client: TestClient) -> None:
    response = client.post("/v1/identify", json={"imageUrl": "ftp://images.test/card.png"})

    assert response.status_code == 422
    assert response.json()["errorCode"] == "IMAGE_URL_UNSUPPORTED"


def test_identify_by_url_honours_host_allow_list(respx_mock: respx.MockRouter) -> None:
    respx_mock.get(IMAGE_URL).mock(
        return_value=httpx.Response(
            200, content=image_bytes(), headers={"content-type": "image/png"}
        )
    )
    settings = make_settings(image_url_allowed_hosts="images.test, cdn.example")

    with make_client(settings) as client:
        blocked = client.post("/v1/identify", json={"imageUrl": "https://evil.test/card.png"})
        allowed = client.post("/v1/identify", json={"imageUrl": IMAGE_URL})

    assert blocked.status_code == 422
    assert blocked.json()["errorCode"] == "IMAGE_URL_HOST_NOT_ALLOWED"
    assert allowed.status_code == 200


def test_identifier_failure_degrades_instead_of_500(
    app: FastAPI, caplog: pytest.LogCaptureFixture
) -> None:
    app.state.identifier = RaisingIdentifier()

    with caplog.at_level(logging.WARNING), TestClient(app) as client:
        response = client.post("/v1/identify", files=upload("file", image_bytes()))

    assert response.status_code == 200
    body = response.json()
    assert body["degraded"] is True
    assert body["candidates"] == []
    assert body["modelVersion"] == "stub-0.1.0"
    warnings = [record for record in caplog.records if record.levelno == logging.WARNING]
    assert any("Identification degraded" in record.getMessage() for record in warnings)


def test_not_ready_backend_degrades(caplog: pytest.LogCaptureFixture) -> None:
    with (
        caplog.at_level(logging.WARNING),
        make_client(make_settings(model_backend="torch")) as client,
    ):
        response = client.post("/v1/identify", files=upload("file", image_bytes()))

    assert response.status_code == 200
    assert response.json()["degraded"] is True
    assert response.json()["candidates"] == []
    assert any("not ready" in record.getMessage() for record in caplog.records)


def test_patterned_images_differ_by_seed() -> None:
    assert patterned_image(seed=1).tobytes() != patterned_image(seed=2).tobytes()
