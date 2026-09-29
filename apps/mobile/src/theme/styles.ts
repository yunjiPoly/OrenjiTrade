import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import { tokens } from './tokens';

/**
 * Font families. Sora/Inter are not bundled yet (Phase 1 loads them with `expo-font`); until
 * then the system font is used so iOS never throws "Unrecognized font family".
 */
export const fontFamily = {
  display: undefined as string | undefined,
  body: undefined as string | undefined,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
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

export function textStyle(size: keyof typeof fontSize, variant: 'body' | 'heading' = 'body'): TextStyle {
  const px = fontSize[size];
  return {
    fontSize: px,
    lineHeight: Math.round(px * tokens.lineHeight[variant]),
    fontFamily: variant === 'heading' ? fontFamily.display : fontFamily.body,
  };
}
