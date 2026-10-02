/**
 * Credits owed for the card data and pictures of each game's catalog source (ADR 0015). One entry
 * per game whose real catalog comes from an external provider; adding Pokémon, Magic or Riftbound
 * means adding their provider's wording here, nothing else. The wording follows the provider's
 * documentation (`docs/providers/<provider>.md`) and is subject to the legal review before any
 * public launch.
 */
export interface CardDataAttribution {
  /** Game slug (`yugioh`). */
  game: string;
  /** Provider name, linked to {@link providerUrl}. */
  provider: string;
  providerUrl: string;
  /** Sentence crediting the provider ("Card data and images courtesy of"). */
  credit: string;
  /** Trademark and copyright notice of the game's publisher. */
  notice: string;
}

export const CARD_DATA_ATTRIBUTIONS: readonly CardDataAttribution[] = [
  {
    // docs/providers/ygoprodeck.md, "Copyright and attribution".
    game: 'yugioh',
    provider: 'YGOPRODeck',
    providerUrl: 'https://ygoprodeck.com',
    credit: 'Card data and images courtesy of',
    notice:
      'Yu-Gi-Oh! is a trademark of Konami Digital Entertainment, Inc.; card content © 4K Media Inc. ' +
      'OrenjiTrade is not affiliated with Konami or 4K Media.',
  },
];

/** The attribution owed when showing a card of `game`, if any. */
export function attributionFor(game: string | null | undefined): CardDataAttribution | null {
  return CARD_DATA_ATTRIBUTIONS.find((entry) => entry.game === game) ?? null;
}
