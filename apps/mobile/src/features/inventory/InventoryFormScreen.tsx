import { useEffect, useState, type ReactNode, type Ref } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSnackbar } from '@/src/components/ui/Snackbar';
import { spacing, useTheme } from '@/src/theme';

export interface InventoryFormScreenProps {
  /** The top row (BackBar): stays put while the content scrolls. */
  header: ReactNode;
  children: ReactNode;
  /** The bar at the bottom (the main button and its line), above the keyboard. */
  footer?: ReactNode;
  scrollRef?: Ref<ScrollView>;
  /** The whole screen, header and bottom bar included (`screen-<id>` in the specs); its scroll
   * view is `<testID>-scroll`. */
  testID?: string;
}

/**
 * The layout of the screens of adding and editing a card, which draw their own header (mockup
 * v32, screens 3 to 7): the safe area at the top, the header row, the content scrolling under it,
 * and an optional bottom bar with a hairline. The content scrolls above the on-screen keyboard;
 * the bottom bar stays under it (the form keeps the room it needs while one types, as in the
 * system's own forms), and comes back when the keyboard goes.
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
  const snackbar = useSnackbar();
  const [footerHeight, setFooterHeight] = useState(0);
  // A toast on this screen sits above its bottom bar, not over its main button.
  useEffect(() => {
    if (!footer || footerHeight === 0) {
      return undefined;
    }
    return snackbar.keepClear(footerHeight);
  }, [footer, footerHeight, snackbar]);
  return (
    <View
      testID={testID}
      style={[styles.fill, { backgroundColor: palette.background, paddingTop: insets.top }]}
    >
      <View style={styles.header}>{header}</View>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
      >
        <ScrollView
          ref={scrollRef}
          testID={testID ? `${testID}-scroll` : undefined}
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
      </KeyboardAvoidingView>
      {footer ? (
        <View
          onLayout={(event) => setFooterHeight(Math.round(event.nativeEvent.layout.height))}
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
