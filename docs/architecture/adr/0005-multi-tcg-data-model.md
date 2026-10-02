# ADR 0005 — Generic multi-TCG card model with JSONB metadata

**Status:** Accepted · **Date:** 2026-09-29

## Context
Yu-Gi-Oh!, Pokémon, Magic: The Gathering, Riftbound and future games have different
attributes (level/attack, HP/types, mana cost, ...) but identical trading semantics.

## Decision
Game-agnostic entities: `game → card → card_printing → card_image`, `card_set` per game.
Common fields are normalised columns (name, set code, collector number, rarity, language,
edition/printing type, release date). Game-specific attributes live in `card.metadata` and
`card_printing.metadata` JSONB, indexed with GIN where filtered. A `CardProvider` interface
(`searchCards, getCard, getSets, syncCards, getCardPrintings, getImages, getMarketPrices`)
isolates external catalog APIs; `MockCardProvider` ships realistic local data; real adapters
(YGOPRODeck, PokémonTCG.io, Scryfall, Riftbound sources) implement the same interface later.
Per-game presentation (which metadata to show, condition/edition vocabularies) is described by
a `GameSchema` JSON document stored with the game row, not by Java classes per game.

## Consequences
- Adding a game is a data operation plus an optional provider adapter.
- Queries filtering on metadata use JSONB operators; hot filters get expression indexes.
- Rejected: table-per-game schemas; hard-coding game logic across modules.
- Card images (one row per provider artwork, hosting policies, the capped local cache) are
  specified in [ADR 0015](0015-card-images-provider-hosting-capped-cache.md); the first real
  adapter is `YgoProDeckCardProvider`.
