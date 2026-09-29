import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
  testID,
  accessibilityHint,
}: ButtonProps) {
  const { palette } = useTheme();

  const background =
    variant === 'primary'
      ? palette.primary
      : variant === 'secondary'
        ? palette.surfaceVariant
        : 'transparent';
  const color =
    variant === 'primary'
      ? palette.onPrimary
      : variant === 'secondary'
        ? palette.ink
        : palette.accent;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: background,
          borderColor: variant === 'ghost' ? 'transparent' : palette.border,
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[textStyle('md'), styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
