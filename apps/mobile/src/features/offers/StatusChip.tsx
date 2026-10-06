import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { Palette } from '@/src/theme';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import type { StatusInfo, StatusTone } from './offerLabels';

/** Foreground colour of a status tone. */
export function toneColor(tone: StatusTone, palette: Palette): string {
  switch (tone) {
    case 'live':
      return palette.primary;
    case 'success':
      return palette.success;
    case 'danger':
      return palette.danger;
    case 'muted':
      return palette.textMuted;
    default:
      return palette.info;
  }
}

/**
 * A status pill of an offer, a trade or a report (web: `app-status-chip`): an icon and a label,
 * coloured by tone; the label is what screen readers announce.
 */
export function StatusChip({ info, testID }: { info: StatusInfo; testID?: string }) {
  const { palette } = useTheme();
  const color = toneColor(info.tone, palette);
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`Status: ${info.label}`}
      style={[styles.chip, { borderColor: color, backgroundColor: palette.surface }]}
    >
      <MaterialCommunityIcons name={info.icon} size={14} color={color} />
      <Text style={[textStyle('xs'), styles.label, { color }]}>{info.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[1],
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  label: { fontWeight: fontWeight.semibold },
});
