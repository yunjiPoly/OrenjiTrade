import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
export function BottomSheet({ visible, onClose, title, children, testID = 'bottom-sheet' }: BottomSheetProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const translateY = useRef(new Animated.Value(windowHeight)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    const duration = reducedMotion ? 0 : motion.base;
    if (visible) {
      setMounted(true);
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(translateY, {
      toValue: windowHeight,
      duration,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [reducedMotion, translateY, visible, windowHeight]);

  if (!mounted) {
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
            <Text style={[textStyle('lg', 'heading'), styles.title, { color: palette.ink }]}>{title}</Text>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
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
