from __future__ import annotations

from fastapi.testclient import TestClient

from app.ml.hashing import dhash, hash_to_hex
from tests.helpers import encode, gradient_image, image_bytes, patterned_image, upload


def test_identical_images_are_duplicates(client: TestClient) -> None:
    data = image_bytes()
    files = {**upload("imageA", data), **upload("imageB", data, filename="copy.png")}

    response = client.post("/v1/duplicates", files=files)

    assert response.status_code == 200
    body = response.json()
    assert body["distance"] == 0
    assert body["isDuplicate"] is True
    assert body["threshold"] == 10
    assert body["hashA"] == body["hashB"] == hash_to_hex(dhash(patterned_image()))
    assert body["algorithm"] == "dhash"
    assert body["requestId"] == response.headers["x-request-id"]


def test_opposite_gradients_are_not_duplicates(client: TestClient) -> None:
    files = {
        **upload("imageA", encode(gradient_image())),
        **upload("imageB", encode(gradient_image(reverse=True)), filename="b.png"),
    }

    response = client.post("/v1/duplicates", files=files)

    assert response.status_code == 200
    body = response.json()
    assert body["distance"] == 64
    assert body["isDuplicate"] is False


def test_hashes_can_be_compared_without_images(client: TestClient) -> None:
    response = client.post(
        "/v1/duplicates", json={"hashA": "0123456789ABCDEF", "hashB": "0123456789abcdee"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["distance"] == 1
    assert body["isDuplicate"] is True
    assert body["hashA"] == "0123456789abcdef"


def test_threshold_can_be_overridden_per_request(client: TestClient) -> None:
    response = client.post(
        "/v1/duplicates",
        json={"hashA": "0123456789abcdef", "hashB": "0123456789abcdee", "threshold": 0},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["threshold"] == 0
    assert body["isDuplicate"] is False


def test_invalid_hash_returns_validation_problem(client: TestClient) -> None:
    response = client.post("/v1/duplicates", json={"hashA": "zz", "hashB": "0123456789abcdee"})

    assert response.status_code == 422
    body = response.json()
    assert body["errorCode"] == "VALIDATION_FAILED"
    assert body["errors"][0]["field"] == "hashA"


def test_invalid_json_returns_validation_problem(client: TestClient) -> None:
    response = client.post(
        "/v1/duplicates", content=b"[", headers={"content-type": "application/json"}
    )

    assert response.status_code == 422
    assert response.json()["errors"][0]["code"] == "json_invalid"


def test_missing_second_image_returns_validation_problem(client: TestClient) -> None:
    response = client.post("/v1/duplicates", files=upload("imageA", image_bytes()))

    assert response.status_code == 422
    body = response.json()
    assert body["errorCode"] == "VALIDATION_FAILED"
    assert body["errors"][0]["field"] == "body.imageB"


def test_non_image_part_returns_415(client: TestClient) -> None:
    files = {**upload("imageA", image_bytes()), **upload("imageB", b"text", "text/plain", "b.txt")}

    response = client.post("/v1/duplicates", files=files)

    assert response.status_code == 415
    assert response.json()["errorCode"] == "UNSUPPORTED_MEDIA_TYPE"


def test_unsupported_request_content_type_returns_415(client: TestClient) -> None:
    response = client.post("/v1/duplicates", content=b"x", headers={"content-type": "text/csv"})

    assert response.status_code == 415
    assert response.json()["errorCode"] == "UNSUPPORTED_MEDIA_TYPE"
