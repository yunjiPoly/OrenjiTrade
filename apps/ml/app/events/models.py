"""Event contracts shared with the OrenjiTrade API (docs/architecture/ARCHITECTURE.md, 7 and 9).

Wire format is camelCase JSON. `CardScanRequested` arrives through a Pub/Sub push
subscription; `CardScanCompleted` is posted back to the API at `/internal/ml/scan-results`.
"""

from __future__ import annotations

import base64
import binascii
import json
from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import Field

from app.common import CamelModel
from app.ml.identifier import Candidate

EVENT_TYPE_ATTRIBUTE = "type"
CARD_SCAN_REQUESTED = "card.scan.requested"
CARD_SCAN_COMPLETED = "card.scan.completed"


class ScanStatus(StrEnum):
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    ML_UNAVAILABLE = "ML_UNAVAILABLE"


class CardScanRequested(CamelModel):
    """Published by the API when a collector uploads a card photo for identification."""

    scan_id: str = Field(min_length=1, max_length=128)
    user_id: str = Field(min_length=1, max_length=128)
    image_uri: str = Field(min_length=1, max_length=2048)
    requested_at: datetime


class CardScanCompleted(CamelModel):
    """Result of a scan. `candidates` is empty unless `status` is COMPLETED."""

    scan_id: str = Field(min_length=1, max_length=128)
    status: ScanStatus
    candidates: list[Candidate] = Field(default_factory=list)
    model_version: str
    completed_at: datetime
    # Safe, human-readable explanation for FAILED / ML_UNAVAILABLE. Never contains stack traces.
    reason: str | None = None


class PubSubMessage(CamelModel):
    """The `message` part of a Google Pub/Sub push delivery."""

    data: str = ""
    attributes: dict[str, str] = Field(default_factory=dict)
    message_id: str = ""
    publish_time: str | None = None

    def decode_json(self) -> dict[str, Any]:
        """Decode the base64 `data` field as a JSON object."""
        try:
            raw = base64.b64decode(self.data, validate=True)
        except (binascii.Error, ValueError) as exc:
            msg = "message data is not valid base64"
            raise ValueError(msg) from exc
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            msg = "message data is not valid JSON"
            raise ValueError(msg) from exc
        if not isinstance(payload, dict):
            msg = "message data must be a JSON object"
            raise ValueError(msg)
        return payload


class PubSubPushEnvelope(CamelModel):
    """Google Pub/Sub push envelope: https://cloud.google.com/pubsub/docs/push#receive_push."""

    message: PubSubMessage
    subscription: str = ""

    @property
    def event_type(self) -> str | None:
        return self.message.attributes.get(EVENT_TYPE_ATTRIBUTE)


def encode_push_data(payload: dict[str, Any]) -> str:
    """Base64-encode a JSON payload the way Pub/Sub does (useful for tests and tooling)."""
    return base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
