/**
 * "Check TCGplayer price" (the phone's `features/cards/tcgplayer.ts`, decision 10): TCGplayer's own
 * search for the card's name, opened in a new tab. Nothing is fetched from TCGplayer and nothing
 * about it is stored; a game TCGplayer has no category for searches every category.
 */
const CATEGORIES: Readonly<Record<string, string>> = {
  yugioh: 'yugioh',
  pokemon: 'pokemon',
  mtg: 'magic',
  onepiece: 'one-piece-card-game',
  riftbound: 'riftbound-league-of-legends-trading-card-game',
};

export function tcgplayerCategory(game: string | null | undefined): string {
  return (game && CATEGORIES[game]) || 'all';
}

export function tcgplayerSearchUrl(game: string | null | undefined, name: string): string {
  return `https://www.tcgplayer.com/search/${tcgplayerCategory(game)}/product?q=${encodeURIComponent(
    name.trim(),
  )}`;
}
