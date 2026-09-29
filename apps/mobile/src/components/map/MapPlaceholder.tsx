import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

import { MAP_OVERLAY_MESSAGE } from './constants';

export interface MapPlaceholderProps {
  reason: 'web' | 'unavailable';
  testID?: string;
}

/** Rendered instead of the native map on web and whenever the map module fails to load. */
export function MapPlaceholder({ reason, testID = 'map-placeholder' }: MapPlaceholderProps) {
  const { palette } = useTheme();
  const detail =
    reason === 'web'
      ? 'The interactive map is available in the iOS and Android apps.'
      : 'The map could not be loaded on this device. Collectors are still reachable from Search.';

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: palette.surfaceVariant }]}>
      <MaterialCommunityIcons name="map-outline" size={48} color={palette.textMuted} />
      <Text style={[textStyle('lg', 'heading'), styles.title, { color: palette.ink }]}>
        {MAP_OVERLAY_MESSAGE}
      </Text>
      <Text style={[textStyle('sm'), styles.detail, { color: palette.textMuted }]}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
    gap: spacing[2],
  },
  title: { fontWeight: fontWeight.semibold, textAlign: 'center' },
  detail: { textAlign: 'center', maxWidth: 320 },
});
