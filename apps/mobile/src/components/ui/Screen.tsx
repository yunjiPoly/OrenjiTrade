import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, useTheme } from '@/src/theme';

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView (default: false). */
  scroll?: boolean;
  /** Remove the default horizontal/vertical padding (maps, full-bleed lists). */
  edgeToEdge?: boolean;
  /** Apply the bottom safe-area inset (screens without a tab bar). */
  safeBottom?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Themed page container: background colour, safe-area aware, optional scrolling. */
export function Screen({
  children,
  scroll = false,
  edgeToEdge = false,
  safeBottom = false,
  style,
  contentContainerStyle,
  testID,
}: ScreenProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  const padding: ViewStyle = edgeToEdge
    ? { paddingBottom: safeBottom ? insets.bottom : 0 }
    : {
        paddingHorizontal: spacing[4],
        paddingTop: spacing[4],
        paddingBottom: (safeBottom ? insets.bottom : 0) + spacing[6],
      };

  if (scroll) {
    // Forms scroll above the on-screen keyboard: the app is edge-to-edge on Android (SDK 57), so
    // the window no longer resizes for the keyboard and the padding comes from here instead.
    return (
      <KeyboardAvoidingView
        style={[styles.fill, { backgroundColor: palette.background }]}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
      >
        <ScrollView
          testID={testID}
          style={[styles.fill, { backgroundColor: palette.background }, style]}
          contentContainerStyle={[padding, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View
      testID={testID}
      style={[styles.fill, { backgroundColor: palette.background }, padding, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
