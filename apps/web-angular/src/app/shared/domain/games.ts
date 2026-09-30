/** A trading-card game collectors can follow (slugs match the API's `games` module). */
export interface GameInfo {
  slug: string;
  label: string;
  /** Short label for compact chips. */
  shortLabel: string;
  /** Material Symbols glyph used on the decorative card art. */
  glyph: string;
  /** CSS custom property holding the game's accent colour (defined in styles.scss). */
  colorVar: string;
}

/** The four games of the MVP catalogue (profile `games`, docs/api/contracts/phase1). */
export const GAMES: readonly GameInfo[] = [
  {
    slug: 'pokemon',
    label: 'Pokémon',
    shortLabel: 'Pokémon',
    glyph: 'bolt',
    colorVar: '--game-pokemon',
  },
  {
    slug: 'yugioh',
    label: 'Yu-Gi-Oh!',
    shortLabel: 'Yu-Gi-Oh!',
    glyph: 'visibility',
    colorVar: '--game-yugioh',
  },
  {
    slug: 'mtg',
    label: 'Magic: The Gathering',
    shortLabel: 'Magic',
    glyph: 'auto_awesome',
    colorVar: '--game-mtg',
  },
  {
    slug: 'riftbound',
    label: 'Riftbound',
    shortLabel: 'Riftbound',
    glyph: 'swords',
    colorVar: '--game-riftbound',
  },
];

const BY_SLUG = new Map(GAMES.map((game) => [game.slug, game]));

/** Game metadata for a slug; unknown slugs get a neutral fallback instead of disappearing. */
export function gameInfo(slug: string): GameInfo {
  return (
    BY_SLUG.get(slug) ?? {
      slug,
      label: slug,
      shortLabel: slug,
      glyph: 'style',
      colorVar: '--color-primary',
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
