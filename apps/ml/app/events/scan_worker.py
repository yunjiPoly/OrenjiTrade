"""Processes `card.scan.requested` events and reports `CardScanCompleted` back to the API."""

from __future__ import annotations

import logging

import httpx
from starlette.concurrency import run_in_threadpool

from app.api.images import decode_image, fetch_image
from app.common import utc_now
from app.config import Settings
from app.errors import ApiError
from app.events.models import CardScanCompleted, CardScanRequested, ScanStatus
from app.ml.identifier import Candidate, CardIdentifier
from app.ml.service import identify_image
from app.observability import REQUEST_ID_HEADER, current_request_id, new_request_id

logger = logging.getLogger(__name__)

SERVICE_AUTH_HEADER = "X-Service-Token"
GCS_SCHEME = "gs://"


async def process_scan_request(
    event: CardScanRequested,
    *,
    settings: Settings,
    identifier: CardIdentifier,
    client: httpx.AsyncClient,
) -> CardScanCompleted:
    """Fetch, decode and identify the image; never raises for expected failures."""
    if event.image_uri.startswith(GCS_SCHEME):
        # TODO(ml): read objects through the Cloud Storage client (or have the API publish a
        # signed https URL). Until then the API falls back to manual entry via ML_UNAVAILABLE.
        return _result(
            event,
            settings,
            ScanStatus.ML_UNAVAILABLE,
            reason="gs:// image sources are not supported yet",
        )
    try:
        data = await fetch_image(client, event.image_uri, settings=settings)
        image = await run_in_threadpool(decode_image, data, max_side_px=settings.max_image_side_px)
    except ApiError as exc:
        logger.warning(
            "Scan image rejected: %s",
            exc.error_code,
            extra={"scanId": event.scan_id, "errorCode": exc.error_code},
        )
        return _result(event, settings, ScanStatus.FAILED, reason=exc.message)

    outcome = await identify_image(identifier, image)
    if outcome.degraded:
        return _result(event, settings, ScanStatus.ML_UNAVAILABLE, reason=outcome.reason)
    return _result(event, settings, ScanStatus.COMPLETED, candidates=outcome.candidates)


def _result(
    event: CardScanRequested,
    settings: Settings,
    status: ScanStatus,
    *,
    reason: str | None = None,
    candidates: list[Candidate] | None = None,
) -> CardScanCompleted:
    return CardScanCompleted(
        scan_id=event.scan_id,
        status=status,
        candidates=list(candidates or []),
        model_version=settings.model_version,
        completed_at=utc_now(),
        reason=reason,
    )


async def deliver_scan_result(
    result: CardScanCompleted,
    *,
    settings: Settings,
    client: httpx.AsyncClient,
) -> bool:
    """POST the result to the API. Returns False (after logging) instead of raising."""
    headers = {REQUEST_ID_HEADER: current_request_id() or new_request_id()}
    if settings.service_auth_token:
        headers[SERVICE_AUTH_HEADER] = settings.service_auth_token
    payload = result.model_dump(mode="json")
    log_extra = {"scanId": result.scan_id, "status": result.status.value}
    try:
        response = await client.post(
            settings.scan_results_url,
            json=payload,
            headers=headers,
            timeout=settings.api_timeout_seconds,
        )
    except httpx.HTTPError as exc:
        logger.error(
            "Failed to deliver scan result to the API: %s",
            type(exc).__name__,
            extra=log_extra,
        )
        return False
    if response.is_success:
        logger.info("Delivered scan result to the API", extra=log_extra)
        return True
    logger.error(
        "API rejected scan result",
        extra={**log_extra, "statusCode": response.status_code},
    )
    return False
