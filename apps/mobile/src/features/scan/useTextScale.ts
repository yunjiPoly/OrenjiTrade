import { useWindowDimensions } from 'react-native';

import { PINNED_MAX_FONT_SCALE } from '@/src/theme';

/**
 * How much the scan's fixed-width tiles grow with the system text size (the tray's tiles, the
 * tiles of "Other matches"): as far as their labels follow it (`PINNED_MAX_FONT_SCALE`), so a
 * status such as "Tap to search" is never cut at the larger sizes.
 */
export function useTextScale(): number {
  const { fontScale } = useWindowDimensions();
  return Math.min(PINNED_MAX_FONT_SCALE, Math.max(1, fontScale || 1));
}
