import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import { elevation, fontWeight, motion, radius, spacing, textStyle, useTheme } from '@/src/theme';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  testID?: string;
}

/**
 * Lightweight bottom sheet (collector previews on the map). Intentionally built on the core
 * `Animated` API: no gesture/sheet library until Phase 4 needs snap points.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  testID = 'bottom-sheet',
}: BottomSheetProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [translateY] = useState(() => new Animated.Value(windowHeight));
  // Stays mounted while the close animation plays; flips only from animation callbacks.
  const [closed, setClosed] = useState(!visible);

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

  if (!visible && closed) {
    return null;
  }

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root} testID={testID}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={[styles.backdrop, { backgroundColor: palette.overlay }]}
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
            <Text style={[textStyle('lg', 'heading'), styles.title, { color: palette.ink }]}>
              {title}
            </Text>
          ) : null}
          {children}
        </Animated.View>
      </View>
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
