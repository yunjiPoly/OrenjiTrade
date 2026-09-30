from __future__ import annotations

from fastapi.testclient import TestClient

from tests.helpers import make_client, make_settings


def test_health_is_a_plain_liveness_probe(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-request-id"]


def test_ready_reports_stub_backend_ready(client: TestClient) -> None:
    response = client.get("/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["modelBackend"] == "stub"
    assert body["modelReady"] is True
    assert body["modelVersion"] == "stub-0.1.0"
    assert body["serviceVersion"]


def test_ready_returns_503_when_torch_backend_is_not_ready() -> None:
    with make_client(make_settings(model_backend="torch", model_version="torch-0.0.1")) as client:
        response = client.get("/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["modelBackend"] == "torch"
    assert body["modelReady"] is False
    assert body["modelVersion"] == "torch-0.0.1"
