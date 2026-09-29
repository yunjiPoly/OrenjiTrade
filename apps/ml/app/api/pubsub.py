"""POST /internal/events/pubsub: Google Pub/Sub push endpoint.

Delivery semantics: the message is always acknowledged (HTTP 204) once it has been read,
whatever happened while processing it. Failures are logged with the request id and, where
possible, reported to the API as a FAILED / ML_UNAVAILABLE scan result. The only non-2xx
answers are 401 (bad or missing `X-Service-Token` when `SERVICE_AUTH_TOKEN` is configured),
so that a misconfigured subscription keeps retrying instead of silently dropping messages.
"""

from __future__ import annotations

import logging
import secrets

from fastapi import APIRouter, Request, Response
from pydantic import ValidationError

from app.api.deps import HttpClientDep, IdentifierDep, SettingsDep
from app.config import Settings
from app.errors import ApiError
from app.events.models import CARD_SCAN_REQUESTED, CardScanRequested, PubSubPushEnvelope
from app.events.scan_worker import SERVICE_TOKEN_HEADER, deliver_scan_result, process_scan_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", tags=["internal"])


def require_service_token(request: Request, settings: Settings) -> None:
    """Constant-time shared-secret check, active only when `SERVICE_AUTH_TOKEN` is set."""
    expected = settings.service_auth_token
    if not expected:
        return
    provided = request.headers.get(SERVICE_TOKEN_HEADER, "")
    if not secrets.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
        raise ApiError(401, "UNAUTHORIZED", f"A valid {SERVICE_TOKEN_HEADER} header is required.")


async def _read_envelope(request: Request) -> PubSubPushEnvelope | None:
    try:
        payload = await request.json()
        return PubSubPushEnvelope.model_validate(payload)
    except (ValueError, ValidationError) as exc:
        logger.error(
            "Discarding malformed Pub/Sub push envelope: %s",
            type(exc).__name__,
            extra={"path": request.url.path},
        )
        return None


@router.post(
    "/events/pubsub",
    status_code=204,
    response_class=Response,
    summary="Pub/Sub push subscription endpoint",
    responses={401: {"description": "Missing or invalid X-Service-Token"}},
)
async def receive_pubsub_push(
    request: Request,
    settings: SettingsDep,
    identifier: IdentifierDep,
    client: HttpClientDep,
) -> Response:
    require_service_token(request, settings)
    ack = Response(status_code=204)

    envelope = await _read_envelope(request)
    if envelope is None:
        return ack

    message_id = envelope.message.message_id
    event_type = envelope.event_type
    if event_type != CARD_SCAN_REQUESTED:
        logger.info(
            "Acknowledged Pub/Sub event with no handler",
            extra={"eventType": event_type, "messageId": message_id},
        )
        return ack

    try:
        event = CardScanRequested.model_validate(envelope.message.decode_json())
    except (ValueError, ValidationError) as exc:
        logger.error(
            "Discarding malformed %s event: %s",
            CARD_SCAN_REQUESTED,
            type(exc).__name__,
            extra={"eventType": event_type, "messageId": message_id},
        )
        return ack

    try:
        result = await process_scan_request(
            event, settings=settings, identifier=identifier, client=client
        )
        logger.info(
            "Processed scan request",
            extra={
                "eventType": event_type,
                "messageId": message_id,
                "scanId": event.scan_id,
                "status": result.status.value,
                "candidateCount": len(result.candidates),
            },
        )
        await deliver_scan_result(result, settings=settings, client=client)
    except Exception:
        logger.exception(
            "Scan request processing failed; message acknowledged anyway",
            extra={"eventType": event_type, "messageId": message_id, "scanId": event.scan_id},
        )
    return ack
