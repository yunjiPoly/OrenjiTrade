import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue } from 'react-native';

import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import { radius as radii, spacing, useTheme, type ViewStyleProp } from '@/src/theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyleProp;
  testID?: string;
}

/** Pulsing placeholder block. Respects "reduce motion" by rendering a static block. */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = radii.sm,
  style,
  testID = 'skeleton',
}: SkeletonProps) {
  const { palette } = useTheme();
  const reducedMotion = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reducedMotion]);

  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius, backgroundColor: palette.border, opacity },
        style,
      ]}
    />
  );
}

export interface SkeletonListProps {
  rows?: number;
  rowHeight?: number;
  style?: ViewStyleProp;
  testID?: string;
}

/** A column of card-like skeleton rows for list screens. */
export function SkeletonList({
  rows = 4,
  rowHeight = 72,
  style,
  testID = 'skeleton-list',
}: SkeletonListProps) {
  return (
    <View testID={testID} style={[styles.list, style]} accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton
          key={index}
          height={rowHeight}
          radius={radii.md}
          testID={`${testID}-row-${index}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[3] },
});
