import { StyleSheet, Text, View } from 'react-native';

import { useRealtimeState } from '@/src/realtime/RealtimeProvider';
import type { RealtimeState } from '@/src/realtime/realtimeClient';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/** Label of a realtime state (web: `app-realtime-status`). */
export function realtimeStatusLabel(state: RealtimeState): string | null {
  switch (state) {
    case 'connected':
      return 'Live';
    case 'connecting':
      return 'Connecting…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'paused':
      return 'Paused';
    default:
      return null;
  }
}

/** "Live" / "Reconnecting…" next to the Messages title, so a stale inbox is never a surprise. */
export function RealtimeStatus() {
  const { palette } = useTheme();
  const state = useRealtimeState();
  const label = realtimeStatusLabel(state);
  if (!label) {
    return null;
  }
  const live = state === 'connected';
  return (
    <View
      testID="realtime-status"
      accessibilityRole="text"
      accessibilityLabel={`Realtime: ${label}`}
      accessibilityLiveRegion="polite"
      style={[
        styles.pill,
        { backgroundColor: live ? palette.accentContainer : palette.surfaceVariant },
      ]}
    >
      <View
        style={[styles.dot, { backgroundColor: live ? palette.online.online : palette.warning }]}
      />
      <Text
        testID={`realtime-status-${state}`}
        style={[
          textStyle('xs'),
          styles.text,
          { color: live ? palette.onAccentContainer : palette.textMuted },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontWeight: fontWeight.semibold },
});
