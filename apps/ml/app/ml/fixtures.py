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


def _card(
    game: str,
    card_name: str,
    set_code: str,
    collector_number: str,
    rarity: str,
    edition: str,
    language: str,
) -> CardDescriptor:
    return CardDescriptor(game, card_name, set_code, collector_number, rarity, edition, language)


FIXTURE_CARDS: Final[tuple[CardDescriptor, ...]] = (
    # --- yugioh -------------------------------------------------------------
    _card("yugioh", "Lantern Warden of the Dusk Gate", "ORJ1", "EN001", "Ultra Rare", "1st Edition", "EN"),
    _card("yugioh", "Tidebound Clockwork Serpent", "ORJ1", "EN014", "Super Rare", "Unlimited", "EN"),
    _card("yugioh", "Glasswing Courier", "ORJ2", "JP032", "Common", "1st Edition", "JA"),
    _card("yugioh", "Hollow Crown Sentinel", "ORJ2", "EN047", "Secret Rare", "1st Edition", "EN"),
    # --- pokemon ------------------------------------------------------------
    _card("pokemon", "Cinderpuff", "OTS", "012/150", "Common", "Unlimited", "EN"),
    _card("pokemon", "Marblefin", "OTS", "058/150", "Rare Holo", "1st Edition", "EN"),
    _card("pokemon", "Thornbeak", "OTS", "121/150", "Double Rare", "Unlimited", "JA"),
    _card("pokemon", "Duskmoth", "OTB", "077/120", "Illustration Rare", "Unlimited", "DE"),
    # --- mtg ----------------------------------------------------------------
    _card("mtg", "Embercairn Wayfinder", "ORJ", "143", "mythic", "foil", "EN"),
    _card("mtg", "Saltmarsh Archivist", "ORJ", "061", "uncommon", "nonfoil", "EN"),
    _card("mtg", "Gilded Aqueduct", "ORB", "254", "rare", "nonfoil", "FR"),
    _card("mtg", "Fen Lantern Adept", "ORB", "018", "common", "foil", "EN"),
    # --- riftbound ----------------------------------------------------------
    _card("riftbound", "Riftgate Sentinel", "OTR", "004", "epic", "standard", "EN"),
    _card("riftbound", "Prism Warden Ilsae", "OTR", "031", "rare", "alternate art", "EN"),
    _card("riftbound", "Stormline Skiff", "OTR", "102", "common", "standard", "JA"),
    _card("riftbound", "Cinder Choir Herald", "OTR2", "009", "showcase", "alternate art", "EN"),
)
