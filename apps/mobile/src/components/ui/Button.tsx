import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { fontWeight, radius, spacing, textStyle, useTheme, type ViewStyleProp } from '@/src/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Shows a spinner and blocks presses while an action runs. */
  loading?: boolean;
  /** Label read while loading (e.g. "Saving…"); defaults to `label`. */
  loadingLabel?: string;
  icon?: ComponentProps<typeof MaterialCommunityIcons>['name'];
  style?: ViewStyleProp;
  testID?: string;
  accessibilityHint?: string;
  /** Read instead of the visible label (e.g. "Make an offer on Lantern Fox"). */
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  loadingLabel,
  icon,
  style,
  testID,
  accessibilityHint,
  accessibilityLabel,
}: ButtonProps) {
  const { palette } = useTheme();
  const inactive = disabled || loading;

  const background =
    variant === 'primary'
      ? palette.primary
      : variant === 'danger'
        ? palette.danger
        : variant === 'secondary'
          ? palette.surfaceVariant
          : 'transparent';
  const color =
    variant === 'primary'
      ? palette.onPrimary
      : variant === 'danger'
        ? '#FFFFFF'
        : variant === 'secondary'
          ? palette.ink
          : palette.accent;
  const text = loading && loadingLabel ? loadingLabel : label;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={loading && loadingLabel ? text : (accessibilityLabel ?? text)}
      accessibilityHint={accessibilityHint}
      aria-disabled={inactive}
      aria-busy={loading}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: background,
          borderColor:
            variant === 'ghost' || variant === 'danger' || variant === 'primary'
              ? 'transparent'
              : palette.border,
        },
        pressed && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={color} />
        ) : icon ? (
          <MaterialCommunityIcons name={icon} size={18} color={color} />
        ) : null}
        <Text style={[textStyle('md'), styles.label, { color }]}>{text}</Text>
      </View>
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
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  label: { fontWeight: fontWeight.semibold, textAlign: 'center' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
