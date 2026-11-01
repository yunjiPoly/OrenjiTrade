import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/ui/Text';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import {
  elevation,
  fontWeight,
  motion,
  radius,
  spacing,
  textStyle,
  TITLE_MAX_FONT_SCALE,
  useTheme,
} from '@/src/theme';

import { InsideModal, modalLeavesScreen, useModalOnScreen, useModalTurn } from './modalTurns';

/**
 * How long a hidden sheet waits at most for iOS to report it dismissed (its `Modal`'s `onDismiss`,
 * which comes within a frame or two): past it, the screen counts as free anyway.
 */
export const SHEET_DISMISS_TIMEOUT_MS = 1000;

const IS_IOS = Platform.OS === 'ios';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  testID?: string;
  /**
   * The sheet holds a text field: on iOS it rises above the keyboard so its buttons stay in reach
   * (Android resizes the window itself). Stage R4: Mark as sold, the saved address or email.
   */
  avoidKeyboard?: boolean;
}

/**
 * Lightweight bottom sheet (collector previews on the map). Intentionally built on the core
 * `Animated` API: no gesture/sheet library until Phase 4 needs snap points.
 */
export function BottomSheet({
  visible: wanted,
  onClose,
  title,
  children,
  testID = 'bottom-sheet',
  avoidKeyboard = false,
}: BottomSheetProps) {
  // iOS: a sheet asked for while another modal is on screen waits for its turn (modalTurns.tsx).
  const turn = useModalTurn(wanted);
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [translateY] = useState(() => new Animated.Value(windowHeight));
  // Stays mounted while the close animation plays; flips only from animation callbacks.
  const [closed, setClosed] = useState(!turn);
  // Asked for again while it is still sliding away, the sheet comes back at once: it is the modal
  // on screen, so there is no turn to wait for (waiting would take it down and put it up again).
  const visible = wanted && (turn || !closed);

  useEffect(() => {
    const duration = reducedMotion ? 0 : motion.base;
    const animation = Animated.timing(translateY, {
      toValue: visible ? 0 : windowHeight,
      duration,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setClosed(!visible);
    });
    return () => animation.stop();
  }, [reducedMotion, translateY, visible, windowHeight]);

  // On screen until the close animation has played: the next modal waits for that on iOS.
  const mounted = visible || !closed;
  useModalOnScreen(mounted);

  // iOS: hidden, but iOS is still dismissing the sheet's view controller until the Modal reports
  // `onDismiss`. What iOS presents itself, such as the share sheet, waits for that (`afterModals`):
  // asked for in that moment, it was taken away with the sheet ("⋯" › Share profile, stage R6).
  const [leaving, setLeaving] = useState(false);
  const [wasMounted, setWasMounted] = useState(mounted);
  if (mounted !== wasMounted) {
    setWasMounted(mounted);
    setLeaving(!mounted && IS_IOS);
  }
  // A layout effect: counted before the sheet stops counting as on screen (a passive effect).
  useLayoutEffect(() => (leaving ? modalLeavesScreen() : undefined), [leaving]);
  // iOS reports the dismissal within a frame or two; never wait for it longer than the timeout.
  useEffect(() => {
    if (!leaving) {
      return undefined;
    }
    const timer = setTimeout(() => setLeaving(false), SHEET_DISMISS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  if (!mounted && !leaving) {
    return null;
  }

  return (
    <Modal
      transparent
      visible={mounted}
      onDismiss={() => setLeaving(false)}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior="padding"
        enabled={avoidKeyboard && Platform.OS === 'ios'}
        testID={testID}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={[styles.backdrop, { backgroundColor: palette.scrim }]}
          testID={`${testID}-backdrop`}
        />
        <Animated.View
          style={[
            styles.sheet,
            elevation.sheet,
            {
              backgroundColor: palette.surface,
              paddingBottom: insets.bottom + spacing[4],
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: palette.borderStrong }]} />
          {title ? (
            // A title follows the text size as far as a screen's title does (twice its size), so
            // at the largest sizes it leaves the sheet room for its rows and its buttons.
            <Text
              maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
              style={[textStyle('lg', 'heading'), styles.title, { color: palette.ink }]}
              testID={`${testID}-title`}
            >
              {title}
            </Text>
          ) : null}
          <InsideModal>{children}</InsideModal>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    gap: spacing[3],
    maxHeight: '80%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: spacing[1] },
  title: { fontWeight: fontWeight.semibold },
});
