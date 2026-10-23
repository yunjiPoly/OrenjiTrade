import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState, type ReactElement, type ReactNode, type Ref } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSnackbar, useSnackbarCover } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { fontFamily, fontWeight, spacing, TITLE_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { SETTINGS_COPY } from './settingsCopy';

export interface SettingsTopBarProps {
  title: string;
  /** `null`: no back button (Import done, mockup v50 screen 68: its buttons lead on). */
  onBack: (() => void) | null;
  /** What a screen reader says for the back button ("Back"). */
  backLabel?: string;
  /** The right end of the bar ("Preview", "All changes saved"). */
  right?: ReactNode;
  /** The back button's id (`BackButton`, the navigation header's, by default). */
  backTestID?: string;
}

/**
 * The top bar of Settings and its pages (mockup v50 screens 47 to 59): a 44 pt back button, the
 * title in Sora on the left (on two lines at the largest text sizes, never cut), an optional action
 * or status on the right (which follows the text size a little only), a hairline under it. The
 * back button keeps the id of the navigation header's (`BackButton`): the flows go back the same
 * way on every screen.
 */
export function SettingsTopBar({
  title,
  onBack,
  backLabel = SETTINGS_COPY.back,
  right,
  backTestID = 'BackButton',
}: SettingsTopBarProps) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.top,
        onBack ? { borderBottomColor: palette.border } : styles.bare,
        !onBack && styles.noBack,
      ]}
    >
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={onBack}
          testID={backTestID}
          style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="chevron-left" size={28} color={palette.ink} />
        </Pressable>
      ) : null}
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
        numberOfLines={2}
        style={[styles.title, { color: palette.ink }]}
      >
        {title}
      </Text>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

export interface SettingsPageProps {
  title: string;
  children: ReactNode;
  /** The right end of the top bar. */
  right?: ReactNode;
  /**
   * Where back leads; by default the screen under this one, else Settings. `null`: no back button
   * and no hairline (Import done).
   */
  onBack?: (() => void) | null;
  /** The back button's id (`BackButton` by default; a flow's own, such as `import-file-back`). */
  backTestID?: string;
  /** The bar at the bottom (the page's main button), with a hairline above it. */
  footer?: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  scrollRef?: Ref<ScrollView>;
  /** The whole screen (`screen-settings-…`); its scroll view is `<testID>-scroll`. */
  testID: string;
}

/**
 * The layout of Settings and its pages: the safe area, the top bar, the content scrolling under
 * it (16 pt sides, 16 pt between groups) and an optional bottom bar. On iOS the scroll view keeps
 * the field being typed in above the keyboard (`automaticallyAdjustKeyboardInsets`, stage R12's
 * lesson); Android keeps the keyboard padding. A toast sits above the bottom bar, and the end of
 * the content keeps room for it.
 */
export function SettingsPage({
  title,
  children,
  right,
  onBack,
  backTestID,
  footer,
  refreshControl,
  scrollRef,
  testID,
}: SettingsPageProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const snackbar = useSnackbar();
  const cover = useSnackbarCover();
  const [footerHeight, setFooterHeight] = useState(0);
  const [toastRoom, setToastRoom] = useState(0);
  // The part of the content a toast covers (above the bottom bar, once that is laid out): the end
  // of the content keeps that much room, so a toast never hides the page's last row ("Remove my
  // location" under "Profile saved."); the largest room so far stays (R2's lesson: nothing moves
  // under a finger when the toast goes).
  const covered =
    cover > 0 && (!footer || footerHeight > 0) ? cover - (footer ? footerHeight : 0) : 0;
  if (covered > toastRoom) {
    setToastRoom(covered);
  }

  useEffect(() => {
    if (!footer || footerHeight === 0) {
      return undefined;
    }
    return snackbar.keepClear(footerHeight);
  }, [footer, footerHeight, snackbar]);

  const back =
    onBack === null
      ? null
      : (onBack ??
        (() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/settings');
          }
        }));

  return (
    <View
      testID={testID}
      style={[styles.fill, { backgroundColor: palette.background, paddingTop: insets.top }]}
    >
      <Stack.Screen options={{ headerShown: false, title }} />
      <SettingsTopBar title={title} onBack={back} right={right} backTestID={backTestID} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'android' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          testID={`${testID}-scroll`}
          style={styles.fill}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: (footer ? spacing[6] : insets.bottom + 28) + toastRoom },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior="never"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
      {footer ? (
        <View
          onLayout={(event) => setFooterHeight(Math.round(event.nativeEvent.layout.height))}
          testID={`${testID}-footer`}
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
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 8,
    borderBottomWidth: 1,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },
  right: { flexShrink: 0, maxWidth: '45%', paddingRight: 8 },
  bare: { borderBottomColor: 'transparent' },
  noBack: { paddingLeft: 16, minHeight: 60 },
  pressed: { opacity: 0.7 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    gap: spacing[4],
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: spacing[4],
    paddingTop: 10,
    gap: 6,
  },
});
