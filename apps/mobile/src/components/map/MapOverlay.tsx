import { StyleSheet, Text, View } from 'react-native';

import { elevation, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { MAP_OVERLAY_MESSAGE } from './constants';

/** Translucent floating card over the map explaining that markers arrive in Phase 4. */
export function MapOverlay() {
  const { palette, scheme } = useTheme();
  const background = scheme === 'dark' ? 'rgba(30, 27, 24, 0.86)' : 'rgba(255, 251, 247, 0.9)';

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View
        testID="map-overlay"
        accessibilityRole="text"
        style={[styles.card, elevation.floating, { backgroundColor: background, borderColor: palette.border }]}
      >
        <Text style={[textStyle('md'), styles.text, { color: palette.ink }]}>{MAP_OVERLAY_MESSAGE}</Text>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          Positions are approximate by design. Exact locations are never shown.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: spacing[4],
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[1],
  },
  text: { fontWeight: fontWeight.semibold },
});
