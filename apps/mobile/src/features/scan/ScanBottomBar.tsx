import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

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
 * The bar under the tray (mockup screen 27): "Photos" (adds photos already taken to this tray),
 * the shutter ("Take the photo", never waiting for the reading) and "Review {n}".
 */
export function ScanBottomBar({
  counts,
  canShoot,
  onPhotos,
  onShoot,
  onReview,
}: ScanBottomBarProps) {
  const { palette } = useTheme();
  return (
    <View style={styles.bar} testID="scan-bottom-bar">
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
      <View style={[styles.side, styles.end]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={reviewButtonLabel(counts)}
          accessibilityShowsLargeContentViewer
          accessibilityLargeContentTitle={reviewButtonLabel(counts)}
          onPress={onReview}
          style={({ pressed }) => [
            styles.review,
            { backgroundColor: palette.ink },
            pressed && styles.pressed,
          ]}
          testID="scan-review"
        >
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.reviewLabel, { color: palette.background }]}
          >
            {SCAN_COPY.review}
          </Text>
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.count, { backgroundColor: palette.primary, color: palette.onPrimary }]}
            testID="scan-review-count"
          >
            {counts.cards}
          </Text>
          <MaterialCommunityIcons name="arrow-right" size={18} color={palette.background} />
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
    gap: 8,
  },
  side: { flex: 1, alignItems: 'flex-start' },
  end: { alignItems: 'flex-end' },
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
