import { forwardRef, type ComponentRef } from 'react';
import type { TextProps } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { HANDLE_MAX_FONT_SCALE } from '@/src/theme';

/**
 * What a text that is a collector's handle (or a short line led by one: "@{handle} · Quebec",
 * "Block {handle}") takes (owner decision of 2026-10-28, R8 follow-up 1): one line, the text size
 * followed up to `HANDLE_MAX_FONT_SCALE`, and, where its row is still too narrow, the end given
 * way to "…" at that size. A handle has no spaces, so without this it broke anywhere at the
 * largest text sizes. It is never shrunk to fit (`adjustsFontSizeToFit`): React Native 0.86
 * ignores `minimumFontScale` on both platforms, so a shrink has no floor above 4 points (review
 * fix 2, see `HANDLE_MAX_FONT_SCALE`). The words a screen reader says are the text's own, whole;
 * a long press on iOS still shows it enlarged.
 */
export const HANDLE_TEXT_PROPS = {
  numberOfLines: 1,
  ellipsizeMode: 'tail',
  maxFontSizeMultiplier: HANDLE_MAX_FONT_SCALE,
} as const satisfies TextProps;

/**
 * What a label that names a collector by handle takes ("Message {handle}", "Report {handle}",
 * "Block {handle}?", "Rate {handle}"; review fix 1 of the owner decisions of 2026-10-28, U1 and
 * U3): `HANDLE_TEXT_PROPS`, so the whole label stays on one line, capped, its end cut with "…"
 * where its button or row is too narrow (a label left free broke the handle anywhere, one capped
 * only broke the widest one), and the style that lets its box narrow inside a row beside an icon.
 */
export const HANDLE_LABEL_STYLE = { flexShrink: 1 } as const;

/**
 * The app's `Text` for a collector's handle, with `HANDLE_TEXT_PROPS`; a prop passed here wins
 * (a line that may take two lines passes `numberOfLines={2}`).
 */
export const HandleText = forwardRef<ComponentRef<typeof Text>, TextProps>(
  function HandleText(props, ref) {
    return <Text ref={ref} {...HANDLE_TEXT_PROPS} {...props} />;
  }
);
