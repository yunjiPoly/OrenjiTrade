import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { fontWeight, PINNED_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { reviewButtonLabel, SCAN_COPY } from './scanCopy';
import type { ScanCounts } from './scanSession';

export interface ScanBottomBarProps {
  counts: ScanCounts;
  /** The shutter works (a camera, allowed and ready). */
  canShoot: boolean;
  onPhotos: () => void;
  onShoot: () => void;
  onReview: () => void;
}

/**
 * The room kept between "Review {n}" and the shutter, in points: with it, the pill as the mockup
 * draws it sits 3 points from the shutter on a 402-point phone, as in the mockup.
 */
export const SHUTTER_CLEARANCE = 2;
/** The arrow of "Review {n}" and the space before it, in points. */
const ARROW_ROOM = 18 + 7;

/**
 * How "Review {n}" fits its side of the bar without reaching over the shutter: as the mockup
 * draws it ("Review", the count, the arrow); without its arrow when that is too wide (a count of
 * two digits, a large text size, a narrow phone); with its count and arrow only when even that is
 * too wide (the largest text sizes, a narrower phone). A screen reader always hears "Review {n}".
 * Unknown sizes (not laid out yet) keep the mockup's pill.
 */
export function reviewPillFit(
  pillWidth: number | null,
  room: number | null
): 'FULL' | 'NO_ARROW' | 'COUNT' {
  if (pillWidth === null || room === null || pillWidth <= room) {
    return 'FULL';
  }
  return pillWidth - ARROW_ROOM <= room ? 'NO_ARROW' : 'COUNT';
}

/**
 * The bar under the tray (mockup screen 27): "Photos" (adds photos already taken to this tray),
 * the shutter ("Take the photo", never waiting for the reading) and "Review {n}". The shutter
 * stays in the middle: each side keeps its own half of what is left, and "Review {n}" never
 * reaches over the shutter.
 */
export function ScanBottomBar({
  counts,
  canShoot,
  onPhotos,
  onShoot,
  onReview,
}: ScanBottomBarProps) {
  const { palette } = useTheme();
  const [room, setRoom] = useState<number | null>(null);
  const [pillWidth, setPillWidth] = useState<number | null>(null);
  const fit = reviewPillFit(pillWidth, room);
  const width = (set: (value: number) => void) => (event: LayoutChangeEvent) =>
    set(Math.round(event.nativeEvent.layout.width));

  const count = (
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
      style={[styles.count, { backgroundColor: palette.primary, color: palette.onPrimary }]}
      testID="scan-review-count"
    >
      {counts.cards}
    </Text>
  );
  return (
    <View style={styles.bar} testID="scan-bottom-bar">
      {/*
        The pill as the mockup draws it, measured out of sight (never seen, never heard, never
        touched): its width tells whether the word "Review" fits beside the shutter.
      */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.measure}
      >
        <View onLayout={width(setPillWidth)} style={styles.review} testID="scan-review-measure">
          <Text maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE} style={styles.reviewLabel}>
            {SCAN_COPY.review}
          </Text>
          <Text maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE} style={styles.count}>
            {counts.cards}
          </Text>
          <View style={styles.arrow} />
        </View>
      </View>
      <View style={styles.side}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SCAN_COPY.photosLabel}
          onPress={onPhotos}
          style={({ pressed }) => [styles.photos, pressed && styles.pressed]}
          testID="scan-photos"
        >
          <View
            style={[
              styles.photosIcon,
              { borderColor: 'rgba(255, 255, 255, 0.55)', backgroundColor: palette.surfaceVariant },
            ]}
          >
            <MaterialCommunityIcons name="image-outline" size={22} color={palette.ink} />
          </View>
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.photosLabel, { color: palette.ink }]}
          >
            {SCAN_COPY.photos}
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={SCAN_COPY.shutter}
        aria-disabled={!canShoot}
        disabled={!canShoot}
        onPress={onShoot}
        style={({ pressed }) => [
          styles.shutter,
          { borderColor: palette.ink },
          pressed && styles.pressed,
          !canShoot && styles.disabled,
        ]}
        testID="scan-shutter"
      >
        <View style={[styles.shutterInner, { backgroundColor: palette.ink }]} />
      </Pressable>
      <View
        style={[styles.side, styles.end]}
        // Its side of the bar, less the room kept beside the shutter (its padding).
        onLayout={width((side) => setRoom(side - SHUTTER_CLEARANCE))}
        testID="scan-review-side"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={reviewButtonLabel(counts)}
          accessibilityShowsLargeContentViewer
          accessibilityLargeContentTitle={reviewButtonLabel(counts)}
          onPress={onReview}
          style={({ pressed }) => [
            styles.review,
            styles.reviewFits,
            fit === 'COUNT' && styles.reviewCompact,
            { backgroundColor: palette.ink },
            pressed && styles.pressed,
          ]}
          testID="scan-review"
        >
          {fit === 'COUNT' ? null : (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              style={[styles.reviewLabel, { color: palette.background }]}
              testID="scan-review-word"
            >
              {SCAN_COPY.review}
            </Text>
          )}
          {count}
          {fit === 'NO_ARROW' ? null : (
            <MaterialCommunityIcons
              name="arrow-right"
              size={18}
              color={palette.background}
              testID="scan-review-arrow"
            />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  // Like the mockup's grid (1fr, the shutter, 1fr): both sides as wide, the shutter in the middle,
  // and a little room kept on the shutter's side.
  side: { flex: 1, minWidth: 0, alignItems: 'flex-start', paddingRight: SHUTTER_CLEARANCE },
  end: { alignItems: 'flex-end', paddingRight: 0, paddingLeft: SHUTTER_CLEARANCE },
  // Out of sight and out of the row: it takes the width its words need, whatever the bar's.
  measure: { position: 'absolute', left: 0, top: 0, opacity: 0, flexDirection: 'row' },
  photos: { alignItems: 'center', gap: 6, minWidth: 52, minHeight: 44 },
  photosIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photosLabel: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30 },
  review: {
    minHeight: 48,
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  // Never wider than its side of the bar.
  reviewFits: { maxWidth: '100%' },
  reviewCompact: { minWidth: 48, paddingLeft: 12 },
  arrow: { width: 18, height: 18 },
  reviewLabel: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.bold },
  count: {
    minWidth: 22,
    minHeight: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    overflow: 'hidden',
    fontSize: 12,
    lineHeight: 22,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
});
