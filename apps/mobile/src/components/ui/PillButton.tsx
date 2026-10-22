import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

export interface PillButtonProps {
  label: string;
  onPress?: () => void;
  icon?: ComponentProps<typeof MaterialCommunityIcons>['name'];
  /** Greyed and not pressable ("No changes yet"). */
  disabled?: boolean;
  loading?: boolean;
  /** What a screen reader says while loading ("Adding…"). */
  loadingLabel?: string;
  /** `large`: the 52 pt main button of a screen; `small`: the 44 pt "Add cards" of a header. */
  size?: 'large' | 'small';
  /**
   * `primary`: the orange pill; `outline`: the 48 pt outlined pill of a second action ("Continue
   * with Google", "Resend email"); `quiet`: the words alone, 44 pt tall ("Sign out", "Skip for
   * now"). The outline and quiet ones keep their size whatever `size` says.
   */
  variant?: 'primary' | 'outline' | 'quiet';
  accessibilityHint?: string;
  /**
   * How far the label follows the system text size: a button that stays on screen (a header, the
   * bar at the bottom of a form) follows it a little only (PINNED_MAX_FONT_SCALE), or it would
   * take the screen at the largest sizes; a long press shows it enlarged (iOS).
   */
  maxFontSizeMultiplier?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The orange pill of mockup v32 (the main button of a screen, "Add cards" in the Inventory
 * header). Disabled, it turns grey and says why in its own words ("No changes yet").
 */
export function PillButton({
  label,
  onPress,
  icon,
  disabled = false,
  loading = false,
  loadingLabel,
  size = 'large',
  variant = 'primary',
  accessibilityHint,
  maxFontSizeMultiplier,
  style,
  testID,
}: PillButtonProps) {
  const { palette } = useTheme();
  const inactive = disabled || loading;
  const color = disabled
    ? palette.availability.notAvailable
    : variant === 'primary'
      ? palette.onPrimary
      : variant === 'outline'
        ? palette.ink
        : palette.textMuted;
  const shape =
    variant === 'outline'
      ? [
          styles.outline,
          { borderColor: disabled ? palette.border : palette.borderStrong },
          loading && styles.busy,
        ]
      : variant === 'quiet'
        ? [styles.quiet, inactive && styles.busy]
        : [
            size === 'large' ? styles.large : styles.small,
            { backgroundColor: disabled ? palette.surfaceVariant : palette.primary },
          ];
  const fontSize =
    variant === 'primary' ? (size === 'large' ? 16 : 15) : variant === 'outline' ? 15 : 14;
  const text = loading && loadingLabel ? loadingLabel : label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityHint={accessibilityHint}
      accessibilityShowsLargeContentViewer={maxFontSizeMultiplier !== undefined}
      accessibilityLargeContentTitle={maxFontSizeMultiplier !== undefined ? text : undefined}
      aria-disabled={inactive}
      aria-busy={loading}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [shape, pressed && styles.pressed, style]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={color} />
        ) : icon ? (
          <MaterialCommunityIcons name={icon} size={size === 'large' ? 20 : 18} color={color} />
        ) : null}
        <Text
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          style={[
            textStyle(size === 'large' ? 'md' : 'sm'),
            variant === 'primary' ? styles.label : styles.secondLabel,
            { color, fontSize },
          ]}
          numberOfLines={2}
        >
          {text}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  large: {
    minHeight: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
  },
  small: {
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 14,
    paddingRight: 18,
    paddingVertical: spacing[1],
  },
  outline: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
  },
  quiet: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  busy: { opacity: 0.6 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontWeight: fontWeight.bold, textAlign: 'center' },
  secondLabel: { fontWeight: fontWeight.semibold, textAlign: 'center' },
  pressed: { opacity: 0.85 },
});
