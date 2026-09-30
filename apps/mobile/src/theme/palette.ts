import { tokens } from './tokens';

export type ColorScheme = 'light' | 'dark';

/** Semantic colours for one colour scheme (from `tokens.color.<scheme>`). Components consume this. */
export type Palette = (typeof tokens.color)[ColorScheme] & { scheme: ColorScheme };

export const lightPalette: Palette = { ...tokens.color.light, scheme: 'light' };
export const darkPalette: Palette = { ...tokens.color.dark, scheme: 'dark' };

export function paletteFor(scheme: ColorScheme): Palette {
  return scheme === 'dark' ? darkPalette : lightPalette;
}
