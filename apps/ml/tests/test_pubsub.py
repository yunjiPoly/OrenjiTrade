from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
import respx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.events.models import (
    CARD_SCAN_REQUESTED,
    CardScanCompleted,
    CardScanRequested,
    PubSubMessage,
    PubSubPushEnvelope,
    ScanStatus,
    encode_push_data,
)
from tests.helpers import (
    IMAGE_URL,
    SCAN_RESULTS_URL,
    RaisingIdentifier,
    image_bytes,
    make_client,
    make_settings,
    pubsub_envelope,
    scan_requested_payload,
    upload,
)

PUBSUB_PATH = "/internal/events/pubsub"
FIXTURE_TOKEN = "fixture-service-token"


def mock_image(respx_mock: respx.MockRouter, status: int = 200) -> respx.Route:
    return respx_mock.get(IMAGE_URL).mock(
        return_value=httpx.Response(
            status, content=image_bytes(), headers={"content-type": "image/png"}
        )
    )


def mock_results(respx_mock: respx.MockRouter, status: int = 200) -> respx.Route:
    return respx_mock.post(SCAN_RESULTS_URL).mock(return_value=httpx.Response(status))


def posted_result(route: respx.Route) -> dict[str, Any]:
    assert route.call_count == 1
    request = route.calls.last.request
    return json.loads(request.content)


# --- envelope / model unit tests ---------------------------------------------


def test_envelope_decodes_base64_json_data() -> None:
    payload = scan_requested_payload()
    envelope = PubSubPushEnvelope.model_validate(pubsub_envelope(payload, message_id="abc"))

    assert envelope.event_type == CARD_SCAN_REQUESTED
    assert envelope.message.message_id == "abc"
    assert envelope.message.decode_json() == payload
    event = CardScanRequested.model_validate(envelope.message.decode_json())
    assert event.scan_id == "scan-1"
    assert event.requested_at == datetime(2026, 9, 29, 10, 0, tzinfo=UTC)


def test_envelope_accepts_snake_case_pubsub_fields() -> None:
    envelope = PubSubPushEnvelope.model_validate(
        {"message": {"data": encode_push_data({}), "message_id": "m-9"}, "subscription": "s"}
    )

    assert envelope.message.message_id == "m-9"
    assert envelope.event_type is None


@pytest.mark.parametrize(
    ("data", "match"),
    [
        ("!!not base64!!", "base64"),
        (encode_push_data([1, 2])[:-1] + "=", "JSON"),
        ("WzEsIDJd", "object"),  # base64 of "[1, 2]"
    ],
)
def test_decode_json_rejects_bad_data(data: str, match: str) -> None:
    with pytest.raises(ValueError, match=match):
        PubSubMessage(data=data).decode_json()


def test_card_scan_completed_serialises_wire_format() -> None:
    result = CardScanCompleted(
        scan_id="scan-1",
        status=ScanStatus.COMPLETED,
        model_version="stub-0.1.0",
        completed_at=datetime(2026, 9, 29, 10, 0, 5, tzinfo=UTC),
    )

    dumped = result.model_dump(mode="json")

    assert dumped == {
        "scanId": "scan-1",
        "status": "COMPLETED",
        "candidates": [],
        "modelVersion": "stub-0.1.0",
        "completedAt": "2026-09-29T10:00:05Z",
        "reason": None,
    }


# --- endpoint behaviour --------------------------------------------------------


def test_unknown_event_type_is_acknowledged_without_side_effects(
    client: TestClient, respx_mock: respx.MockRouter, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO):
        response = client.post(PUBSUB_PATH, json=pubsub_envelope({}, event_type="user.signed_up"))

    assert response.status_code == 204
    assert response.headers["x-request-id"]
    assert respx_mock.calls.call_count == 0
    assert any("no handler" in record.getMessage() for record in caplog.records)


@pytest.mark.parametrize(
    "body",
    [
        b"not json",
        b'{"subscription": "s"}',
        b'{"message": "nope"}',
    ],
)
def test_malformed_envelope_is_acknowledged_and_logged(
    client: TestClient, caplog: pytest.LogCaptureFixture, body: bytes
) -> None:
    with caplog.at_level(logging.ERROR):
        response = client.post(
            PUBSUB_PATH, content=body, headers={"content-type": "application/json"}
        )

    assert response.status_code == 204
    assert any("malformed Pub/Sub push envelope" in r.getMessage() for r in caplog.records)


@pytest.mark.parametrize(
    "envelope",
    [
        pubsub_envelope(None, data="!!!"),
        pubsub_envelope({"scanId": "scan-1"}),  # missing required fields
        pubsub_envelope(None, data=encode_push_data({"scanId": "s", "userId": "u"})[:4]),
    ],
)
def test_malformed_scan_event_is_acknowledged_and_logged(
    client: TestClient,
    respx_mock: respx.MockRouter,
    caplog: pytest.LogCaptureFixture,
    envelope: dict[str, Any],
) -> None:
    with caplog.at_level(logging.ERROR):
        response = client.post(PUBSUB_PATH, json=envelope)

    assert response.status_code == 204
    assert respx_mock.calls.call_count == 0
    assert any("malformed card.scan.requested" in r.getMessage() for r in caplog.records)


def test_scan_request_flow_posts_completed_result(
    client: TestClient, respx_mock: respx.MockRouter
) -> None:
    image_route = mock_image(respx_mock)
    results_route = mock_results(respx_mock)

    response = client.post(
        PUBSUB_PATH,
        json=pubsub_envelope(scan_requested_payload(scan_id="scan-77")),
        headers={"X-Request-Id": "push-1"},
    )

    assert response.status_code == 204
    assert image_route.call_count == 1
    result = posted_result(results_route)
    assert result["scanId"] == "scan-77"
    assert result["status"] == "COMPLETED"
    assert result["modelVersion"] == "stub-0.1.0"
    assert result["reason"] is None
    assert result["completedAt"].endswith("Z")
    confidences = [candidate["confidence"] for candidate in result["candidates"]]
    assert confidences and confidences == sorted(confidences, reverse=True)
    posted = results_route.calls.last.request
    assert posted.headers["x-request-id"] == "push-1"
    assert posted.headers["content-type"] == "application/json"
    assert "x-service-token" not in posted.headers


def test_scan_result_matches_direct_identify_call(
    client: TestClient, respx_mock: respx.MockRouter
) -> None:
    mock_image(respx_mock)
    results_route = mock_results(respx_mock)
    direct = client.post("/v1/identify", files=upload("file", image_bytes())).json()

    client.post(PUBSUB_PATH, json=pubsub_envelope(scan_requested_payload()))

    assert posted_result(results_route)["candidates"] == direct["candidates"]


def test_gs_uri_reports_ml_unavailable(client: TestClient, respx_mock: respx.MockRouter) -> None:
    results_route = mock_results(respx_mock)
    payload = scan_requested_payload(image_uri="gs://orenjitrade-media/scans/scan-1.jpg")

    response = client.post(PUBSUB_PATH, json=pubsub_envelope(payload))

    assert response.status_code == 204
    result = posted_result(results_route)
    assert result["status"] == "ML_UNAVAILABLE"
    assert result["candidates"] == []
    assert "gs://" in result["reason"]


def test_unreachable_image_reports_failed(client: TestClient, respx_mock: respx.MockRouter) -> None:
    mock_image(respx_mock, status=404)
    results_route = mock_results(respx_mock)

    response = client.post(PUBSUB_PATH, json=pubsub_envelope(scan_requested_payload()))

    assert response.status_code == 204
    result = posted_result(results_route)
    assert result["status"] == "FAILED"
    assert result["candidates"] == []
    assert "404" in result["reason"]


def test_unsupported_scheme_reports_failed(
    client: TestClient, respx_mock: respx.MockRouter
) -> None:
    results_route = mock_results(respx_mock)

    client.post(PUBSUB_PATH, json=pubsub_envelope(scan_requested_payload(image_uri="ftp://x/y")))

    assert posted_result(results_route)["status"] == "FAILED"


def test_identifier_failure_reports_ml_unavailable(
    app: FastAPI, respx_mock: respx.MockRouter
) -> None:
    app.state.identifier = RaisingIdentifier()
    mock_image(respx_mock)
    results_route = mock_results(respx_mock)

    with TestClient(app) as client:
        response = client.post(PUBSUB_PATH, json=pubsub_envelope(scan_requested_payload()))

    assert response.status_code == 204
    result = posted_result(results_route)
    assert result["status"] == "ML_UNAVAILABLE"
    assert result["reason"] == "model backend 'raising' failed"


def test_api_rejection_is_logged_but_still_acknowledged(
    client: TestClient, respx_mock: respx.MockRouter, caplog: pytest.LogCaptureFixture
) -> None:
    mock_image(respx_mock)
    mock_results(respx_mock, status=500)

    with caplog.at_level(logging.ERROR):
        response = client.post(PUBSUB_PATH, json=pubsub_envelope(scan_requested_payload()))

    assert response.status_code == 204
    assert any("API rejected scan result" in r.getMessage() for r in caplog.records)


def test_api_network_error_is_logged_but_still_acknowledged(
    client: TestClient, respx_mock: respx.MockRouter, caplog: pytest.LogCaptureFixture
) -> None:
    mock_image(respx_mock)
    respx_mock.post(SCAN_RESULTS_URL).mock(side_effect=httpx.ConnectTimeout("slow"))

    with caplog.at_level(logging.ERROR):
        response = client.post(PUBSUB_PATH, json=pubsub_envelope(scan_requested_payload()))

    assert response.status_code == 204
    assert any("Failed to deliver scan result" in r.getMessage() for r in caplog.records)


def test_unexpected_processing_error_is_logged_and_acknowledged(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def explode(*args: Any, **kwargs: Any) -> None:
        msg = "unexpected"
        raise RuntimeError(msg)

    monkeypatch.setattr("app.api.pubsub.process_scan_request", explode)

    with caplog.at_level(logging.ERROR):
        response = client.post(PUBSUB_PATH, json=pubsub_envelope(scan_requested_payload()))

    assert response.status_code == 204
    failures = [r for r in caplog.records if "acknowledged anyway" in r.getMessage()]
    assert failures and failures[0].exc_info is not None


# --- shared-secret protection --------------------------------------------------


def test_service_token_is_required_when_configured(respx_mock: respx.MockRouter) -> None:
    settings = make_settings(service_auth_token=FIXTURE_TOKEN)
    with make_client(settings) as client:
        missing = client.post(PUBSUB_PATH, json=pubsub_envelope({}, event_type="noop"))
        wrong = client.post(
            PUBSUB_PATH,
            json=pubsub_envelope({}, event_type="noop"),
            headers={"X-Service-Token": "not-the-token"},
        )
        right = client.post(
            PUBSUB_PATH,
            json=pubsub_envelope({}, event_type="noop"),
            headers={"X-Service-Token": FIXTURE_TOKEN},
        )

    assert missing.status_code == 401
    assert missing.json()["errorCode"] == "UNAUTHORIZED"
    assert missing.headers["content-type"].startswith("application/problem+json")
    assert wrong.status_code == 401
    assert right.status_code == 204
    assert respx_mock.calls.call_count == 0


def test_service_token_is_forwarded_to_the_api(respx_mock: respx.MockRouter) -> None:
    mock_image(respx_mock)
    results_route = mock_results(respx_mock)
    settings = make_settings(service_auth_token=FIXTURE_TOKEN)

    with make_client(settings) as client:
        response = client.post(
            PUBSUB_PATH,
            json=pubsub_envelope(scan_requested_payload()),
            headers={"X-Service-Token": FIXTURE_TOKEN},
        )

    assert response.status_code == 204
    assert results_route.calls.last.request.headers["x-service-token"] == FIXTURE_TOKEN
