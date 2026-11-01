import { scrimColor } from './scrim';
import { tokens } from './tokens';

export type ColorScheme = 'light' | 'dark';

/** Semantic colours for one colour scheme (from `tokens.color.<scheme>`). Components consume this. */
export type Palette = (typeof tokens.color)[ColorScheme] & {
  scheme: ColorScheme;
  /**
   * What dims the page behind a sheet or a dialog: the `overlay` token, never a pure black
   * (scrim.ts says why). A view that covers the window takes this one, not `overlay`.
   */
  scrim: string;
};

function paletteOf(scheme: ColorScheme): Palette {
  const colors = tokens.color[scheme];
  return { ...colors, scheme, scrim: scrimColor(colors.overlay) };
}

export const lightPalette: Palette = paletteOf('light');
export const darkPalette: Palette = paletteOf('dark');

export function paletteFor(scheme: ColorScheme): Palette {
  return scheme === 'dark' ? darkPalette : lightPalette;
}
