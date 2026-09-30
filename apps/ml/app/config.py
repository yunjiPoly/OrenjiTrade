"""Runtime configuration, loaded from environment variables (and an optional local .env)."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ModelBackend = Literal["stub", "torch"]

MEBIBYTE = 1024 * 1024


class Settings(BaseSettings):
    """Service settings. Every value has a safe local default; nothing here is a secret."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    port: int = Field(default=8000, ge=1, le=65535)
    log_level: str = "INFO"
    model_backend: ModelBackend = "stub"
    model_version: str = "stub-0.1.0"
    # Base URL of the OrenjiTrade API that receives CardScanCompleted results.
    api_base_url: str = "http://localhost:8080"
    # Optional shared secret. When set it is required on /internal/* requests (X-Service-Token)
    # and attached to calls made to the API.
    service_auth_token: str | None = None
    max_image_bytes: int = Field(default=8 * MEBIBYTE, ge=1024)
    # Longest image side accepted by the decoder (decompression-bomb guard).
    max_image_side_px: int = Field(default=8192, ge=64)
    # Hamming distance (0..64) at or below which two 64-bit dHashes count as duplicates.
    duplicate_threshold: int = Field(default=10, ge=0, le=64)
    # Timeouts for outbound HTTP (image fetch and posting results to the API), in seconds.
    image_fetch_timeout_seconds: float = Field(default=5.0, gt=0)
    api_timeout_seconds: float = Field(default=5.0, gt=0)
    # Optional comma-separated allow-list of hosts image URLs may point at (empty = any host).
    image_url_allowed_hosts: str = ""

    @field_validator("log_level")
    @classmethod
    def _normalise_log_level(cls, value: str) -> str:
        level = value.strip().upper()
        if level not in {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}:
            msg = f"unsupported LOG_LEVEL {value!r}"
            raise ValueError(msg)
        return level

    @field_validator("api_base_url")
    @classmethod
    def _strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @property
    def allowed_image_hosts(self) -> frozenset[str]:
        return frozenset(
            host.strip().lower() for host in self.image_url_allowed_hosts.split(",") if host.strip()
        )

    @property
    def scan_results_url(self) -> str:
        return f"{self.api_base_url}/internal/ml/scan-results"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide settings, read once from the environment."""
    return Settings()
