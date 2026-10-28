import { forwardRef, type ComponentRef } from 'react';
import type { TextProps } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { HANDLE_MAX_FONT_SCALE, HANDLE_MIN_FONT_SCALE } from '@/src/theme';

/**
 * What a text that is a collector's handle (or a short line led by one: "@{handle} · Quebec",
 * "Block {handle}") takes (owner decision of 2026-10-28, R8 follow-up 1): one line, the text size
 * followed up to `HANDLE_MAX_FONT_SCALE`, and, where its row is still too narrow, shrunk to fit
 * (iOS and Android) down to `HANDLE_MIN_FONT_SCALE` before the end gives way to "…". A handle has
 * no spaces, so without this it broke anywhere at the largest text sizes. The words a screen
 * reader says are the text's own; a long press on iOS still shows it enlarged.
 */
export const HANDLE_TEXT_PROPS = {
  numberOfLines: 1,
  ellipsizeMode: 'tail',
  adjustsFontSizeToFit: true,
  minimumFontScale: HANDLE_MIN_FONT_SCALE,
  maxFontSizeMultiplier: HANDLE_MAX_FONT_SCALE,
} as const satisfies TextProps;

/**
 * The app's `Text` for a collector's handle, with `HANDLE_TEXT_PROPS`; a prop passed here wins
 * (a line that may take two lines passes `numberOfLines={2}`).
 */
export const HandleText = forwardRef<ComponentRef<typeof Text>, TextProps>(
  function HandleText(props, ref) {
    return <Text ref={ref} {...HANDLE_TEXT_PROPS} {...props} />;
  }
);
