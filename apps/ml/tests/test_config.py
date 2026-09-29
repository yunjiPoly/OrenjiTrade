from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings, get_settings


def test_defaults_are_safe_for_local_development() -> None:
    settings = Settings(_env_file=None)

    assert settings.port == 8000
    assert settings.log_level == "INFO"
    assert settings.model_backend == "stub"
    assert settings.api_base_url == "http://localhost:8080"
    assert settings.service_auth_token is None
    assert settings.max_image_bytes == 8 * 1024 * 1024
    assert settings.duplicate_threshold == 10
    assert settings.allowed_image_hosts == frozenset()
    assert settings.scan_results_url == "http://localhost:8080/internal/ml/scan-results"


def test_environment_overrides_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PORT", "9001")
    monkeypatch.setenv("LOG_LEVEL", "debug")
    monkeypatch.setenv("MODEL_BACKEND", "torch")
    monkeypatch.setenv("API_BASE_URL", "https://api.orenjitrade.test/")
    monkeypatch.setenv("SERVICE_AUTH_TOKEN", "fixture-token")
    monkeypatch.setenv("IMAGE_URL_ALLOWED_HOSTS", "Storage.googleapis.com, cdn.test ,")

    settings = Settings(_env_file=None)

    assert settings.port == 9001
    assert settings.log_level == "DEBUG"
    assert settings.model_backend == "torch"
    assert settings.api_base_url == "https://api.orenjitrade.test"
    assert settings.service_auth_token == "fixture-token"
    assert settings.allowed_image_hosts == frozenset({"storage.googleapis.com", "cdn.test"})


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("LOG_LEVEL", "LOUD"),
        ("MODEL_BACKEND", "tensorflow"),
        ("PORT", "0"),
        ("DUPLICATE_THRESHOLD", "65"),
    ],
)
def test_invalid_values_are_rejected(
    monkeypatch: pytest.MonkeyPatch, name: str, value: str
) -> None:
    monkeypatch.setenv(name, value)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_get_settings_is_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("MODEL_VERSION", "cached-1")
    try:
        first = get_settings()
        monkeypatch.setenv("MODEL_VERSION", "cached-2")
        second = get_settings()
    finally:
        get_settings.cache_clear()

    assert first is second
    assert first.model_version == "cached-1"
