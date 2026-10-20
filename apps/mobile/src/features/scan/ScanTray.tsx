import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { fontWeight, PINNED_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { SCAN_COPY, trayTitle } from './scanCopy';
import type { ScanCounts, ScanTile } from './scanSession';
import { ScanTileCard } from './ScanTileCard';

export interface ScanTrayProps {
  tiles: readonly ScanTile[];
  counts: ScanCounts;
  /** The waiting tiles being tried again right now ("Trying again…"). */
  trying?: readonly string[];
  /** The tiles of an add sent without an answer ("Not confirmed yet"). */
  sent?: readonly string[];
  onTile: (tile: ScanTile) => void;
}

/**
 * The tray under the camera's frame (mockup screen 27): "This scan · {n}", "Photos stay on your
 * phone", and the scanned cards, newest first, in one row that scrolls sideways.
 */
export function ScanTray({ tiles, counts, trying = [], sent = [], onTile }: ScanTrayProps) {
  const { palette } = useTheme();
  return (
    <View style={styles.root} testID="scan-tray">
      <View style={styles.header}>
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[styles.title, { color: palette.textMuted }]}
          testID="scan-tray-title"
        >
          {trayTitle(counts).toUpperCase()}
        </Text>
        {/* One element for the screen reader: the lock is decorative. */}
        <View accessible accessibilityLabel={SCAN_COPY.trayPrivacy} style={styles.privacy}>
          <MaterialCommunityIcons name="lock-outline" size={13} color={palette.textMuted} />
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.privacyText, { color: palette.textMuted }]}
          >
            {SCAN_COPY.trayPrivacy}
          </Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="list"
        accessibilityLabel={SCAN_COPY.trayList}
        contentContainerStyle={styles.rail}
        testID="scan-tray-list"
      >
        {tiles.length === 0 ? (
          <View style={[styles.empty, { borderColor: palette.borderStrong }]}>
            <Text
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              style={[styles.emptyText, { color: palette.textMuted }]}
              testID="scan-tray-empty"
            >
              {SCAN_COPY.trayEmpty}
            </Text>
          </View>
        ) : (
          tiles.map((tile) => (
            <ScanTileCard
              key={tile.id}
              tile={tile}
              trying={trying.includes(tile.id)}
              sent={sent.includes(tile.id)}
              onPress={onTile}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
  },
  title: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold, letterSpacing: 0.6 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  privacyText: { fontSize: 12, lineHeight: 16 },
  rail: { gap: 8, paddingHorizontal: 16, paddingTop: 9, paddingBottom: 4 },
  empty: {
    minHeight: 82,
    minWidth: 220,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  emptyText: { fontSize: 13, lineHeight: 18 },
});
