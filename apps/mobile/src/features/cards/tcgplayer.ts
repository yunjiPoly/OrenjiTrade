/**
 * "Check TCGplayer price" on the card page (owner spec 2026-10-14, section 8; default 9 of section
 * 16): TCGplayer's own search for the card's name, in the browser. The app only builds the address
 * and hands it to the system: nothing is fetched from TCGplayer and nothing about it is stored.
 * A game TCGplayer has no category for searches every category (`/search/all`).
 */
const CATEGORIES: Readonly<Record<string, string>> = {
  yugioh: 'yugioh',
  pokemon: 'pokemon',
  mtg: 'magic',
  // Stage G: TCGplayer's own category slugs of the two newer games.
  onepiece: 'one-piece-card-game',
  riftbound: 'riftbound-league-of-legends-trading-card-game',
};

export function tcgplayerCategory(game: string | null | undefined): string {
  return (game && CATEGORIES[game]) || 'all';
}

export function tcgplayerSearchUrl(game: string | null | undefined, name: string): string {
  return `https://www.tcgplayer.com/search/${tcgplayerCategory(game)}/product?q=${encodeURIComponent(
    name.trim()
  )}`;
}
