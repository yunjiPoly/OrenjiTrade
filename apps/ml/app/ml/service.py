"""Runs a `CardIdentifier` with graceful degradation.

Model failures are never surfaced as HTTP 5xx: the outcome is marked `degraded` with an empty
candidate list, and a warning is logged with the request id.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from PIL import Image
from starlette.concurrency import run_in_threadpool

from app.ml.identifier import Candidate, CardIdentifier

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class IdentificationOutcome:
    candidates: list[Candidate] = field(default_factory=list)
    degraded: bool = False
    reason: str | None = None


async def identify_image(identifier: CardIdentifier, image: Image.Image) -> IdentificationOutcome:
    """Identify `image`, returning a degraded outcome instead of raising on model failure."""
    if not identifier.ready:
        reason = f"model backend '{identifier.backend}' is not ready"
        logger.warning("Identification degraded: %s", reason, extra={"backend": identifier.backend})
        return IdentificationOutcome(degraded=True, reason=reason)
    try:
        candidates = await run_in_threadpool(identifier.identify, image)
    except Exception:
        reason = f"model backend '{identifier.backend}' failed"
        logger.warning(
            "Identification degraded: %s", reason, exc_info=True, extra={"backend": identifier.backend}
        )
        return IdentificationOutcome(degraded=True, reason=reason)
    ranked = sorted(candidates, key=lambda candidate: candidate.confidence, reverse=True)
    return IdentificationOutcome(candidates=ranked)
