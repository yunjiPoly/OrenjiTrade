"""Fictional card descriptors used by the stub identifier.

Every entry is invented for OrenjiTrade test data: names, set codes and numbers do not
correspond to real printed cards. Games mirror the catalog slugs used by the API
(`yugioh`, `pokemon`, `mtg`, `riftbound`).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True, slots=True)
class CardDescriptor:
    """Catalog-level description of a card printing (no image, no market data)."""

    game: str
    card_name: str
    set_code: str
    collector_number: str
    rarity: str
    edition: str
    language: str


# (card_name, set_code, collector_number, rarity, edition, language)
_Row = tuple[str, str, str, str, str, str]

_YUGIOH: tuple[_Row, ...] = (
    ("Lantern Warden of the Dusk Gate", "ORJ1", "EN001", "Ultra Rare", "1st Edition", "EN"),
    ("Tidebound Clockwork Serpent", "ORJ1", "EN014", "Super Rare", "Unlimited", "EN"),
    ("Glasswing Courier", "ORJ2", "JP032", "Common", "1st Edition", "JA"),
    ("Hollow Crown Sentinel", "ORJ2", "EN047", "Secret Rare", "1st Edition", "EN"),
)

_POKEMON: tuple[_Row, ...] = (
    ("Cinderpuff", "OTS", "012/150", "Common", "Unlimited", "EN"),
    ("Marblefin", "OTS", "058/150", "Rare Holo", "1st Edition", "EN"),
    ("Thornbeak", "OTS", "121/150", "Double Rare", "Unlimited", "JA"),
    ("Duskmoth", "OTB", "077/120", "Illustration Rare", "Unlimited", "DE"),
)

_MTG: tuple[_Row, ...] = (
    ("Embercairn Wayfinder", "ORJ", "143", "mythic", "foil", "EN"),
    ("Saltmarsh Archivist", "ORJ", "061", "uncommon", "nonfoil", "EN"),
    ("Gilded Aqueduct", "ORB", "254", "rare", "nonfoil", "FR"),
    ("Fen Lantern Adept", "ORB", "018", "common", "foil", "EN"),
)

_RIFTBOUND: tuple[_Row, ...] = (
    ("Riftgate Sentinel", "OTR", "004", "epic", "standard", "EN"),
    ("Prism Warden Ilsae", "OTR", "031", "rare", "alternate art", "EN"),
    ("Stormline Skiff", "OTR", "102", "common", "standard", "JA"),
    ("Cinder Choir Herald", "OTR2", "009", "showcase", "alternate art", "EN"),
)


def _descriptors(game: str, rows: tuple[_Row, ...]) -> list[CardDescriptor]:
    return [CardDescriptor(game, *row) for row in rows]


FIXTURE_CARDS: Final[tuple[CardDescriptor, ...]] = tuple(
    _descriptors("yugioh", _YUGIOH)
    + _descriptors("pokemon", _POKEMON)
    + _descriptors("mtg", _MTG)
    + _descriptors("riftbound", _RIFTBOUND)
)
