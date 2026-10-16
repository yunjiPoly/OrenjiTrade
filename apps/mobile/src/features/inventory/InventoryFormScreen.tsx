import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSnackbar, useSnackbarCover } from '@/src/components/ui/Snackbar';
import { spacing, useTheme } from '@/src/theme';

export interface InventoryFormScreenProps {
  /** The top row (BackBar): stays put while the content scrolls. */
  header: ReactNode;
  children: ReactNode;
  /** The bar at the bottom (the main button and its line), above the keyboard. */
  footer?: ReactNode;
  /**
   * Opens on the end of the content once it is laid out (Edit card opened on the photos an add
   * could not save, which are at the end of the form).
   */
  startAtEnd?: boolean;
  /**
   * Each new value (a count) shows the end of the content again, as `startAtEnd` does on opening
   * (Edit card after a save whose photos were not all saved: their message is at the end).
   */
  showEnd?: number;
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
 *
 * A toast sits above the bottom bar, over the end of the content: the content keeps that much room
 * at its end (review fix 2 of stage R2: the toast "Saved · 1 photo wasn't saved" covered the
 * failure line and its "Try again" where Edit card opens), and the room stays once given, so
 * nothing moves under a finger when the toast goes. Opened on the end (or asked to show it), the
 * screen stays on the end while its content grows, until it is touched or scrolled.
 */
export function InventoryFormScreen({
  header,
  children,
  footer,
  startAtEnd = false,
  showEnd = 0,
  testID,
}: InventoryFormScreenProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbar();
  const cover = useSnackbarCover();
  const [footerHeight, setFooterHeight] = useState(0);
  const [toastRoom, setToastRoom] = useState(0);
  const ownScroll = useRef<ScrollView>(null);
  const atEnd = useRef(!startAtEnd);
  // On the end by the screen's own doing (opened there, or asked to show it); a touch ends it.
  const keepEnd = useRef(false);
  // A toast on this screen sits above its bottom bar, not over its main button.
  useEffect(() => {
    if (!footer || footerHeight === 0) {
      return undefined;
    }
    return snackbar.keepClear(footerHeight);
  }, [footer, footerHeight, snackbar]);
  // The part of the content a toast covers (above the bottom bar, once that is laid out); the
  // largest one so far stays.
  const covered =
    cover > 0 && (!footer || footerHeight > 0) ? cover - (footer ? footerHeight : 0) : 0;
  if (covered > toastRoom) {
    setToastRoom(covered);
  }
  useEffect(() => {
    if (showEnd > 0) {
      keepEnd.current = true;
      ownScroll.current?.scrollToEnd({ animated: true });
    }
  }, [showEnd]);
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
          ref={ownScroll}
          onContentSizeChange={() => {
            if (!atEnd.current) {
              atEnd.current = true;
              keepEnd.current = true;
            }
            if (keepEnd.current) {
              ownScroll.current?.scrollToEnd({ animated: false });
            }
          }}
          onTouchStart={() => {
            keepEnd.current = false;
          }}
          onScrollBeginDrag={() => {
            keepEnd.current = false;
          }}
          testID={testID ? `${testID}-scroll` : undefined}
          style={styles.fill}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: (footer ? spacing[6] : insets.bottom + spacing[6]) + toastRoom },
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
          testID={testID ? `${testID}-footer` : undefined}
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
