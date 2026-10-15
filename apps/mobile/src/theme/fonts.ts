import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_400Regular_Italic } from '@expo-google-fonts/inter/400Regular_Italic';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';
import { Platform, type TextStyle } from 'react-native';

import { tokens } from './tokens';

/**
 * The three typefaces of the phone redesign (spec 2026-10-14, section 3): Sora for screen titles
 * and big numbers, Inter for everything else, JetBrains Mono for card codes and tracking numbers.
 * Each weight is its own font file, loaded once by `useAppFonts` (app/_layout.tsx) under the
 * name of its export: React Native has no font weights for a custom family, so the themed `Text`
 * and `TextInput` (src/components/ui/Text.tsx) turn a family and a weight into one of these
 * faces. Only the weights the app uses are bundled (pinned @expo-google-fonts packages).
 */
export const APP_FONTS = {
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Sora_600SemiBold,
  Sora_700Bold,
  JetBrainsMono_500Medium,
} as const;

export type AppFontFace = keyof typeof APP_FONTS;

/** The families styles name (`fontFamily`), from the design tokens. */
export const FONT_FAMILIES = {
  display: tokens.font.display.mobile,
  body: tokens.font.body.mobile,
  mono: tokens.font.mono.mobile,
} as const;

type Family = (typeof FONT_FAMILIES)[keyof typeof FONT_FAMILIES];

const LOGICAL: ReadonlySet<string> = new Set(Object.values(FONT_FAMILIES));

/** The system face of a family while the bundled fonts are not loaded (or failed to load). */
const SYSTEM_MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/** What a piece of text asks for: a family, a weight (100–900) and italics. */
export interface FontRequest {
  family: string;
  weight: number;
  italic: boolean;
}

function weightOf(value: TextStyle['fontWeight'] | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (value === 'normal') {
    return 400;
  }
  if (value === 'bold') {
    return 700;
  }
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The font a text asks for: its own family, weight and style, else what it inherits from the
 * text around it (`parent`), else Inter regular.
 */
export function fontRequest(
  style: Pick<TextStyle, 'fontFamily' | 'fontWeight' | 'fontStyle'> | undefined,
  parent: FontRequest | null = null
): FontRequest {
  return {
    family: style?.fontFamily ?? parent?.family ?? FONT_FAMILIES.body,
    weight: weightOf(style?.fontWeight) ?? parent?.weight ?? 400,
    italic: style?.fontStyle ? style.fontStyle === 'italic' : (parent?.italic ?? false),
  };
}

/** The bundled face closest to a request of one of the three families, or `null` for others. */
export function fontFace(request: FontRequest): AppFontFace | null {
  const family = request.family as Family;
  if (family === FONT_FAMILIES.mono) {
    return 'JetBrainsMono_500Medium';
  }
  if (family === FONT_FAMILIES.display) {
    return request.weight >= 700 ? 'Sora_700Bold' : 'Sora_600SemiBold';
  }
  if (family === FONT_FAMILIES.body) {
    if (request.italic) {
      return 'Inter_400Regular_Italic';
    }
    if (request.weight >= 700) {
      return 'Inter_700Bold';
    }
    if (request.weight >= 600) {
      return 'Inter_600SemiBold';
    }
    return request.weight >= 500 ? 'Inter_500Medium' : 'Inter_400Regular';
  }
  return null;
}

/**
 * Whether the bundled faces can be named: on the web they are declared in the page (the static
 * render embeds them) and the browser falls back until they arrive; on a phone only once
 * `expo-font` loaded them (iOS warns about an unknown family otherwise).
 */
let ready = Platform.OS === 'web';

export function setFontsReady(value: boolean): void {
  ready = value;
}

export function fontsReady(): boolean {
  return ready;
}

/**
 * The style that makes a text render its request: the bundled face (with a plain weight and
 * style, since the face carries them; a synthesised bold on top would be wrong), the system
 * face while the fonts are not loaded, or `null` to leave a family the app does not bundle
 * untouched.
 */
export function fontStyleFor(request: FontRequest): TextStyle | null {
  if (!LOGICAL.has(request.family)) {
    return null;
  }
  if (!ready) {
    return { fontFamily: request.family === FONT_FAMILIES.mono ? SYSTEM_MONO : undefined };
  }
  return { fontFamily: fontFace(request) ?? undefined, fontWeight: 'normal', fontStyle: 'normal' };
}

type NavigationFont = { fontFamily: string; fontWeight: TextStyle['fontWeight'] };

/**
 * The fonts of the navigation theme (headers, back titles, tab labels): Inter, and Sora for the
 * large titles; the base theme's system fonts until the bundled ones are loaded.
 */
export function navigationFonts<
  T extends Record<'regular' | 'medium' | 'bold' | 'heavy', NavigationFont>,
>(base: T): T {
  if (!ready) {
    return base;
  }
  const face = (fontFamily: AppFontFace): NavigationFont => ({ fontFamily, fontWeight: 'normal' });
  return {
    ...base,
    regular: face('Inter_400Regular'),
    medium: face('Inter_500Medium'),
    bold: face('Inter_600SemiBold'),
    heavy: face('Sora_700Bold'),
  };
}

/** The title of a screen's header: Sora (spec section 3), the system font until it is loaded. */
export function headerTitleFont(): TextStyle {
  return ready ? { fontFamily: 'Sora_600SemiBold', fontWeight: 'normal' } : {};
}
