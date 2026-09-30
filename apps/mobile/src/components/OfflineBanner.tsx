import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontWeight, spacing, useTheme } from '@/src/theme';

/** Slim top banner shown while the device has no usable connection. */
export function OfflineBanner() {
  const { isConnected, isInternetReachable } = useNetInfo();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  const offline = isConnected === false || isInternetReachable === false;
  if (!offline) {
    return null;
  }

  return (
    <View
      testID="offline-banner"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.banner,
        { backgroundColor: palette.warning, paddingTop: insets.top + spacing[1] },
      ]}
    >
      <MaterialCommunityIcons name="wifi-off" size={16} color={palette.onPrimary} />
      <Text style={[styles.text, { color: palette.onPrimary }]}>
        You are offline. Showing saved data.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingBottom: spacing[1],
    paddingHorizontal: spacing[4],
  },
  text: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
});
