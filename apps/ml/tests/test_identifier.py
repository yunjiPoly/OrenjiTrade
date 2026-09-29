from __future__ import annotations

import pytest
from PIL import Image

from app.ml.fixtures import FIXTURE_CARDS
from app.ml.identifier import (
    Candidate,
    CardIdentifier,
    StubCardIdentifier,
    TorchCardIdentifier,
    get_identifier,
)
from app.ml.service import identify_image
from tests.helpers import RaisingIdentifier, make_settings, patterned_image


def test_fixture_catalog_is_fictional_and_covers_every_game() -> None:
    assert len(FIXTURE_CARDS) == 16
    assert {card.game for card in FIXTURE_CARDS} == {"yugioh", "pokemon", "mtg", "riftbound"}
    assert len({(card.game, card.card_name) for card in FIXTURE_CARDS}) == 16


def test_stub_identifier_is_deterministic_and_ranked() -> None:
    identifier = StubCardIdentifier()
    image = patterned_image(seed=4)

    first = identifier.identify(image)
    second = identifier.identify(patterned_image(seed=4))

    assert first == second
    assert 1 <= len(first) <= 3
    confidences = [candidate.confidence for candidate in first]
    assert confidences == sorted(confidences, reverse=True)
    assert all(0.0 <= value <= 1.0 for value in confidences)
    assert isinstance(identifier, CardIdentifier)
    assert identifier.ready is True
    assert identifier.backend == "stub"


def test_stub_identifier_honours_max_candidates() -> None:
    identifier = StubCardIdentifier(fixtures=FIXTURE_CARDS[:2], max_candidates=5)

    assert len(identifier.identify(patterned_image())) == 2


def test_stub_identifier_requires_fixtures() -> None:
    with pytest.raises(ValueError, match="fixture"):
        StubCardIdentifier(fixtures=())


def test_candidate_serialises_to_camel_case() -> None:
    candidate = Candidate(
        game="mtg",
        card_name="Saltmarsh Archivist",
        set_code="ORJ",
        collector_number="061",
        rarity="uncommon",
        edition="nonfoil",
        language="EN",
        confidence=0.5,
    )

    dumped = candidate.model_dump()

    assert dumped["cardName"] == "Saltmarsh Archivist"
    assert dumped["collectorNumber"] == "061"
    assert Candidate.model_validate(dumped) == candidate


def test_torch_identifier_is_a_not_ready_placeholder() -> None:
    identifier = TorchCardIdentifier()

    assert identifier.ready is False
    assert identifier.backend == "torch"
    with pytest.raises(NotImplementedError):
        identifier.identify(Image.new("RGB", (8, 8)))


def test_factory_selects_backend_from_settings() -> None:
    assert isinstance(get_identifier(make_settings(model_backend="stub")), StubCardIdentifier)
    assert isinstance(get_identifier(make_settings(model_backend="torch")), TorchCardIdentifier)


async def test_identify_image_degrades_on_failure() -> None:
    outcome = await identify_image(RaisingIdentifier(), patterned_image())

    assert outcome.degraded is True
    assert outcome.candidates == []
    assert outcome.reason == "model backend 'raising' failed"


async def test_identify_image_degrades_when_not_ready() -> None:
    outcome = await identify_image(TorchCardIdentifier(), patterned_image())

    assert outcome.degraded is True
    assert outcome.reason == "model backend 'torch' is not ready"


async def test_identify_image_returns_ranked_candidates() -> None:
    outcome = await identify_image(StubCardIdentifier(), patterned_image())

    assert outcome.degraded is False
    assert outcome.reason is None
    assert outcome.candidates
