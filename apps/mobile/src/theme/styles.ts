import { type TextStyle, type ViewStyle } from 'react-native';

import { FONT_FAMILIES } from './fonts';
import { tokens } from './tokens';

/**
 * Font families (spec 2026-10-14, section 3): Sora for screen titles and big numbers, Inter for
 * everything else, JetBrains Mono for card codes and tracking numbers. Styles name a family and a
 * weight; the app's `Text` and `TextInput` (src/components/ui/Text.tsx) render the bundled face
 * (src/theme/fonts.ts), or the system font until the fonts are loaded.
 */
export const fontFamily = {
  display: FONT_FAMILIES.display as string,
  body: FONT_FAMILIES.body as string,
  mono: FONT_FAMILIES.mono as string,
};

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<keyof typeof tokens.fontWeight, TextStyle['fontWeight']>;

export const spacing = tokens.spacing;
export const radius = tokens.radius;
export const fontSize = tokens.fontSize;

/** React Native translation of the CSS `elevation` tokens (subtle shadows on floating elements). */
export const elevation: Record<'floating' | 'sheet' | 'menu', ViewStyle> = {
  floating: {
    shadowColor: '#1C1917',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  sheet: {
    shadowColor: '#1C1917',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  menu: {
    shadowColor: '#1C1917',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
};

/** Durations in milliseconds (tokens.motion is expressed as CSS strings). */
export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

/**
 * How far the large title of a screen follows the system text size: up to twice its size, which
 * is still larger than body text at the largest accessibility size. Beyond that a single word of
 * a title ("Americas") no longer fits the width of a phone and is cut in two.
 */
export const TITLE_MAX_FONT_SCALE = 2;

/**
 * How far the controls that stay on screen above a scrolling list follow the system text size
 * (the segments of a tab, the region switcher of the Search tab): a little, like the tab bar and
 * the navigation header of the system, which do not grow with it either. At the largest
 * accessibility sizes they otherwise broke their words over five lines and took the whole
 * screen, leaving the list under them out of reach. On iOS a long press shows them enlarged
 * (the system's large content viewer).
 */
export const PINNED_MAX_FONT_SCALE = 1.35;

/**
 * How far a collector's handle follows the system text size (owner decision of 2026-10-28, R8
 * follow-up 1: cap the small things, leave paragraphs alone): as little as the controls pinned
 * above a list. A handle has no spaces, so at the largest accessibility sizes even a short one no
 * longer fit its row and iOS broke it anywhere ("collector_ / 7f3k2a"). At this cap a handle of
 * the longest length the API allows (24 characters of [a-z0-9_], `HANDLE_MAX`) in ordinary
 * letters and digits fits one line of a row beside an avatar on a 402 pt wide phone; a wider one,
 * or a narrower row, shrinks to fit (`HANDLE_MIN_FONT_SCALE`). Every place that draws a handle uses `HandleText` or
 * `HANDLE_TEXT_PROPS` (src/components/ui/HandleText.tsx). Paragraphs that name a collector keep
 * growing.
 */
export const HANDLE_MAX_FONT_SCALE = PINNED_MAX_FONT_SCALE;

/** The least a handle shrinks to, of its capped size, where its row is too narrow for it. */
export const HANDLE_MIN_FONT_SCALE = 0.6;

export function textStyle(
  size: keyof typeof fontSize,
  variant: 'body' | 'heading' = 'body'
): TextStyle {
  const px = fontSize[size];
  return {
    fontSize: px,
    lineHeight: Math.round(px * tokens.lineHeight[variant]),
    fontFamily: variant === 'heading' ? fontFamily.display : fontFamily.body,
  };
}
