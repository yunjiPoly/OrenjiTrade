/** A trading-card game collectors can follow (slugs match the API's `games` module). */
export interface GameInfo {
  slug: string;
  label: string;
  /** Short label for compact chips. */
  shortLabel: string;
  /** Material Symbols glyph used on the decorative card art. */
  glyph: string;
  /** The game's monogram letter (design tokens `gameTile.<key>.letter`). */
  letter: string;
  /** Key of the monogram tile in the design tokens: `--game-tile-<key>-background|foreground`. */
  tileKey: string;
  /**
   * CSS colour of the game's accent (dots, borders, tints, decorative art), from the monogram
   * tokens only: the tile's light foreground in dark, its deep background in light, so the accent
   * reads on both surfaces (web redesign WA: no hard-coded game colours).
   */
  accent: string;
}

function accentOf(key: string): string {
  return `light-dark(var(--game-tile-${key}-background), var(--game-tile-${key}-foreground))`;
}

/** The four games of the profile and channel pickers (profile `games`, docs/api/contracts/phase1). */
export const GAMES: readonly GameInfo[] = [
  {
    slug: 'pokemon',
    label: 'Pokémon',
    shortLabel: 'Pokémon',
    glyph: 'bolt',
    letter: 'P',
    tileKey: 'pokemon',
    accent: accentOf('pokemon'),
  },
  {
    slug: 'yugioh',
    label: 'Yu-Gi-Oh!',
    shortLabel: 'Yu-Gi-Oh!',
    glyph: 'visibility',
    letter: 'Y',
    tileKey: 'yugioh',
    accent: accentOf('yugioh'),
  },
  {
    slug: 'mtg',
    label: 'Magic: The Gathering',
    shortLabel: 'Magic',
    glyph: 'auto_awesome',
    letter: 'M',
    tileKey: 'mtg',
    accent: accentOf('mtg'),
  },
  {
    slug: 'riftbound',
    label: 'Riftbound',
    shortLabel: 'Riftbound',
    glyph: 'swords',
    letter: 'R',
    tileKey: 'riftbound',
    accent: accentOf('riftbound'),
  },
];

/** One Piece (V130): in the catalogue's game list, not yet in the profile and channel pickers. */
const ONE_PIECE: GameInfo = {
    slug: 'onepiece',
    label: 'One Piece',
    shortLabel: 'One Piece',
    glyph: 'sailing',
    letter: 'O',
    tileKey: 'onepiece',
    accent: accentOf('onepiece'),
};

/** Every game in the phone's order (the game pill and its popover, stage G and web WA). */
export const ALL_GAMES: readonly GameInfo[] = ['yugioh', 'pokemon', 'mtg', 'onepiece', 'riftbound'].map(
  (slug) => (slug === 'onepiece' ? ONE_PIECE : GAMES.find((game) => game.slug === slug)!),
);

const BY_SLUG = new Map(ALL_GAMES.map((game) => [game.slug, game]));

/** Game metadata for a slug; unknown slugs get a neutral fallback instead of disappearing. */
export function gameInfo(slug: string): GameInfo {
  return (
    BY_SLUG.get(slug) ?? {
      slug,
      label: slug,
      shortLabel: slug,
      glyph: 'style',
      letter: slug.slice(0, 1).toUpperCase(),
      tileKey: '',
      accent: 'var(--color-primary)',
    }
  );
}

/** Languages offered in the profile editor (ISO 639-1). */
export const PROFILE_LANGUAGES: readonly { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' },
];
