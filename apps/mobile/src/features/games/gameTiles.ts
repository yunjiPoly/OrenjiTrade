import { tokens } from '@/src/theme';

/** A game's monogram tile: its letter in `foreground` on `background` (packages/design-tokens). */
export interface GameTileColors {
  letter: string;
  foreground: string;
  background: string;
}

/** Tiles of a game the tokens do not know yet (a game an admin adds): a stone square. */
const UNKNOWN = { foreground: '#E7E5E4', background: '#44403C' } as const;

const TILES: Readonly<Record<string, GameTileColors | undefined>> = tokens.gameTile;

/**
 * The monogram tile of a game (stage G, mockup screens 34 and 17): the design tokens' tile of the
 * slug, the same in both themes; for a game the tokens do not know, the first letter of its name
 * on a stone square.
 */
export function gameTile(slug: string, name?: string | null): GameTileColors {
  const known = TILES[slug];
  if (known) {
    return known;
  }
  const letter = (name || slug).trim().charAt(0).toLocaleUpperCase('en') || '?';
  return { letter, ...UNKNOWN };
}
