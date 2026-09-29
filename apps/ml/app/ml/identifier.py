"""Card identification backends behind a single `CardIdentifier` protocol.

* `StubCardIdentifier` is deterministic and dependency-free: the image's dHash seeds the
  choice of fixture cards and their confidences, so the same picture always yields the same
  candidates. It is the default (`MODEL_BACKEND=stub`) and what CI exercises.
* `TorchCardIdentifier` is a placeholder for the real model. It reports "not ready" and raises
  `NotImplementedError` when asked to identify, which the HTTP layer turns into a degraded
  response rather than an error.
"""

from __future__ import annotations

import random
from collections.abc import Sequence
from typing import Protocol, runtime_checkable

from PIL import Image
from pydantic import Field

from app.common import CamelModel
from app.config import Settings
from app.ml.fixtures import FIXTURE_CARDS, CardDescriptor
from app.ml.hashing import dhash


class Candidate(CamelModel):
    """One ranked identification result."""

    game: str
    card_name: str
    set_code: str
    collector_number: str
    rarity: str
    edition: str
    language: str
    confidence: float = Field(ge=0.0, le=1.0)


@runtime_checkable
class CardIdentifier(Protocol):
    """A model backend. Implementations must be safe to call from a worker thread."""

    @property
    def backend(self) -> str: ...

    @property
    def ready(self) -> bool: ...

    def identify(self, image: Image.Image) -> list[Candidate]:
        """Return candidates sorted by descending confidence (may be empty)."""
        ...


class StubCardIdentifier:
    """Deterministic fixture-backed identifier for local development and tests."""

    def __init__(
        self,
        fixtures: Sequence[CardDescriptor] = FIXTURE_CARDS,
        max_candidates: int = 3,
    ) -> None:
        if not fixtures:
            msg = "at least one fixture card is required"
            raise ValueError(msg)
        self._fixtures = tuple(fixtures)
        self._max_candidates = max(1, max_candidates)

    @property
    def backend(self) -> str:
        return "stub"

    @property
    def ready(self) -> bool:
        return True

    def identify(self, image: Image.Image) -> list[Candidate]:
        seed = dhash(image)
        rng = random.Random(seed)
        count = min(self._max_candidates, len(self._fixtures))
        picks = rng.sample(self._fixtures, k=count)
        confidence = round(0.55 + 0.40 * rng.random(), 4)
        candidates: list[Candidate] = []
        for descriptor in picks:
            candidates.append(
                Candidate(
                    game=descriptor.game,
                    card_name=descriptor.card_name,
                    set_code=descriptor.set_code,
                    collector_number=descriptor.collector_number,
                    rarity=descriptor.rarity,
                    edition=descriptor.edition,
                    language=descriptor.language,
                    confidence=confidence,
                )
            )
            confidence = round(confidence * (0.35 + 0.45 * rng.random()), 4)
        candidates.sort(key=lambda candidate: candidate.confidence, reverse=True)
        return candidates


class TorchCardIdentifier:
    """Placeholder for the PyTorch-backed model. Not implemented yet."""

    @property
    def backend(self) -> str:
        return "torch"

    @property
    def ready(self) -> bool:
        return False

    def identify(self, image: Image.Image) -> list[Candidate]:
        msg = "TorchCardIdentifier is not implemented; run with MODEL_BACKEND=stub"
        raise NotImplementedError(msg)


def get_identifier(settings: Settings) -> CardIdentifier:
    """Select the backend configured through `MODEL_BACKEND`."""
    if settings.model_backend == "torch":
        return TorchCardIdentifier()
    return StubCardIdentifier()
