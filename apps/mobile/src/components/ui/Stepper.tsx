import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

export interface StepperProps {
  label: string;
  value: number;
  /** Rendered value, e.g. `7 km`. */
  format?: (value: number) => string;
  min: number;
  max: number;
  /** Next value in a direction (custom steps); default ±1. */
  next?: (value: number, direction: 1 | -1) => number;
  onChange: (value: number) => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * A number stepper with an `adjustable` accessibility role: screen-reader users swipe up/down,
 * everyone else taps − / +. Used for the trading radius (1–50 km).
 */
export function Stepper({
  label,
  value,
  format = String,
  min,
  max,
  next = (current, direction) => current + direction,
  onChange,
  disabled,
  testID = 'stepper',
}: StepperProps) {
  const { palette } = useTheme();
  const change = (direction: 1 | -1) => {
    const target = Math.min(max, Math.max(min, next(value, direction)));
    if (target !== value) {
      onChange(target);
    }
  };
  const text = format(value);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) =>
        change(event.nativeEvent.actionName === 'increment' ? 1 : -1)
      }
      style={styles.row}
    >
      <Text style={[textStyle('md'), styles.label, { color: palette.ink }]}>{label}</Text>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label.toLowerCase()}`}
          disabled={disabled || value <= min}
          onPress={() => change(-1)}
          style={({ pressed }) => [
            styles.button,
            { borderColor: palette.borderStrong },
            pressed && styles.pressed,
            (disabled || value <= min) && styles.disabled,
          ]}
          testID={`${testID}-decrease`}
        >
          <MaterialCommunityIcons name="minus" size={20} color={palette.ink} />
        </Pressable>
        <Text
          testID={`${testID}-value`}
          accessibilityLiveRegion="polite"
          style={[textStyle('md'), styles.value, { color: palette.ink }]}
        >
          {text}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label.toLowerCase()}`}
          disabled={disabled || value >= max}
          onPress={() => change(1)}
          style={({ pressed }) => [
            styles.button,
            { borderColor: palette.borderStrong },
            pressed && styles.pressed,
            (disabled || value >= max) && styles.disabled,
          ]}
          testID={`${testID}-increase`}
        >
          <MaterialCommunityIcons name="plus" size={20} color={palette.ink} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  label: { fontWeight: fontWeight.medium, flexShrink: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  button: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { minWidth: 64, textAlign: 'center', fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
});
