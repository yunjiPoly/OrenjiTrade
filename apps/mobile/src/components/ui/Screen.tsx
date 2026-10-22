import type { ReactNode, Ref } from 'react';
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
  /** The scroll view of a `scroll` screen (to scroll to a section). */
  scrollRef?: Ref<ScrollView>;
  /**
   * `on-drag`: dragging a `scroll` screen puts the keyboard away. For a screen whose field has no
   * key that does (a multiline field), so what is under the keyboard can be reached.
   */
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  /**
   * A `scroll` screen whose content fills the screen at least, so its last buttons sit at the
   * bottom (mockup v50's sign-in and status pages): the safe area is added as padding instead of
   * iOS's automatic insets, which made a content as tall as the scroll view overflow it by the
   * insets (Sign in's last link was under the home indicator). `below-header`: a screen under a
   * navigation header (the bottom inset only); `full`: a screen without one (top and bottom).
   */
  fillHeight?: 'below-header' | 'full';
  testID?: string;
}

/**
 * Bottom safe-area padding a screen adds itself (`safeBottom`).
 *
 * A scrolling screen on iOS adds none: iOS already ends a scroll view above the home indicator
 * (`contentInsetAdjustmentBehavior="automatic"`). Adding the inset a second time ended every
 * form 34 pt too high, with a blank band under its last button, and put that button exactly
 * under the snackbar ("Card saved." covered "Delete card" until it faded). Android and the web
 * have no such adjustment, and a screen that does not scroll has no scroll view to make it.
 */
export function ownSafeBottom(
  platform: string,
  options: { scroll: boolean; safeBottom: boolean; insetBottom: number }
): number {
  if (!options.safeBottom || (options.scroll && platform === 'ios')) {
    return 0;
  }
  return options.insetBottom;
}

/** Themed page container: background colour, safe-area aware, optional scrolling. */
export function Screen({
  children,
  scroll = false,
  edgeToEdge = false,
  safeBottom = false,
  style,
  contentContainerStyle,
  scrollRef,
  keyboardDismissMode,
  fillHeight,
  testID,
}: ScreenProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  const filling = scroll && fillHeight !== undefined;
  const bottom = filling
    ? insets.bottom
    : ownSafeBottom(Platform.OS, { scroll, safeBottom, insetBottom: insets.bottom });
  const top = filling && fillHeight === 'full' ? insets.top : 0;
  const padding: ViewStyle = edgeToEdge
    ? { paddingBottom: bottom, paddingTop: top }
    : {
        paddingHorizontal: spacing[4],
        paddingTop: top + spacing[4],
        paddingBottom: bottom + spacing[6],
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
          ref={scrollRef}
          testID={testID}
          style={[styles.fill, { backgroundColor: palette.background }, style]}
          contentContainerStyle={[padding, filling && styles.grow, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={keyboardDismissMode}
          contentInsetAdjustmentBehavior={filling ? 'never' : 'automatic'}
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
  grow: { flexGrow: 1 },
});
