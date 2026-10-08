import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Covers the navigator while Firebase restores the session and `/me` answers (the native splash
 * stays up on iOS/Android; this is what the web build shows).
 */
export function BootScreen() {
  const { palette } = useTheme();
  return (
    <View
      testID="boot-screen"
      accessibilityLabel="Loading OrenjiTrade"
      aria-busy
      style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: palette.background }]}
    >
      <Text style={[textStyle('3xl', 'heading'), styles.wordmark]}>
        <Text style={{ color: palette.primary }}>Orenji</Text>
        <Text style={{ color: palette.ink }}>Trade</Text>
      </Text>
      <ActivityIndicator color={palette.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', gap: spacing[4] },
  wordmark: { fontWeight: fontWeight.bold },
});
