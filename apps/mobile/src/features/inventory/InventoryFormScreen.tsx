import type { ReactNode, Ref } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, useTheme } from '@/src/theme';

export interface InventoryFormScreenProps {
  /** The top row (BackBar): stays put while the content scrolls. */
  header: ReactNode;
  children: ReactNode;
  /** The bar at the bottom (the main button and its line), above the keyboard. */
  footer?: ReactNode;
  scrollRef?: Ref<ScrollView>;
  /** The scroll view (`screen-<id>` in the specs). */
  testID?: string;
}

/**
 * The layout of the screens of adding and editing a card, which draw their own header (mockup
 * v32, screens 3 to 7): the safe area at the top, the header row, the content scrolling under it,
 * and an optional bottom bar with a hairline, all above the on-screen keyboard.
 */
export function InventoryFormScreen({
  header,
  children,
  footer,
  scrollRef,
  testID,
}: InventoryFormScreenProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, { backgroundColor: palette.background, paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
      >
        <View style={styles.header}>{header}</View>
        <ScrollView
          ref={scrollRef}
          testID={testID}
          style={styles.fill}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: footer ? spacing[6] : insets.bottom + spacing[6] },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="never"
        >
          {children}
        </ScrollView>
        {footer ? (
          <View
            style={[
              styles.footer,
              {
                borderTopColor: palette.border,
                backgroundColor: palette.background,
                paddingBottom: Math.max(insets.bottom, spacing[3]) + spacing[2],
              },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: spacing[4], paddingTop: spacing[2] },
  content: { flexGrow: 1, paddingHorizontal: spacing[4], paddingTop: 6, gap: spacing[4] },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: spacing[4],
    paddingTop: 10,
    gap: 6,
  },
});
