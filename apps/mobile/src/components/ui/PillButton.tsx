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

import { HANDLE_LABEL_STYLE, HANDLE_TEXT_PROPS } from '@/src/components/ui/HandleText';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, lightPalette, spacing, textStyle, useTheme } from '@/src/theme';

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
   * now"). The outline and quiet ones keep their size whatever `size` says. `danger`: the red
   * pill of a destructive main button ("Delete my account"), the same red in both schemes as the
   * confirmation sheets' (white on it reads at 4.8 : 1); disabled, it is grey like the others.
   */
  variant?: 'primary' | 'outline' | 'quiet' | 'danger';
  accessibilityHint?: string;
  /**
   * What a screen reader says instead of the label, when the label is shortened to fit ("Add 3
   * cards (5 copies)" is read "Add 3 cards (5 copies) to my inventory"). It starts with the words
   * on screen (WCAG 2.5.3).
   */
  accessibilityLabel?: string;
  /**
   * How far the label follows the system text size: a button that stays on screen (a header, the
   * bar at the bottom of a form) follows it a little only (PINNED_MAX_FONT_SCALE), or it would
   * take the screen at the largest sizes; a long press shows it enlarged (iOS).
   */
  maxFontSizeMultiplier?: number;
  /**
   * The label names a collector by handle ("Message {handle}"): one line, capped and shrunk to
   * fit the pill (`HANDLE_TEXT_PROPS`), so the handle never breaks (owner decision of 2026-10-28).
   */
  handleInLabel?: boolean;
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
  accessibilityLabel,
  maxFontSizeMultiplier,
  handleInLabel = false,
  style,
  testID,
}: PillButtonProps) {
  const { palette } = useTheme();
  const inactive = disabled || loading;
  const filled = variant === 'primary' || variant === 'danger';
  const color = disabled
    ? palette.availability.notAvailable
    : variant === 'danger'
      ? '#FFFFFF'
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
            {
              backgroundColor: disabled
                ? palette.surfaceVariant
                : variant === 'danger'
                  ? lightPalette.danger
                  : palette.primary,
            },
          ];
  const fontSize = filled ? (size === 'large' ? 16 : 15) : variant === 'outline' ? 15 : 14;
  const text = loading && loadingLabel ? loadingLabel : label;
  const capped = handleInLabel || maxFontSizeMultiplier !== undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading ? text : (accessibilityLabel ?? text)}
      accessibilityHint={accessibilityHint}
      accessibilityShowsLargeContentViewer={capped}
      accessibilityLargeContentTitle={capped ? text : undefined}
      aria-disabled={inactive}
      aria-busy={loading}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [shape, pressed && styles.pressed, style]}
    >
      <View style={[styles.content, handleInLabel && styles.contentFits]}>
        {loading ? (
          <ActivityIndicator size="small" color={color} />
        ) : icon ? (
          <MaterialCommunityIcons name={icon} size={size === 'large' ? 20 : 18} color={color} />
        ) : null}
        <Text
          {...(handleInLabel ? HANDLE_TEXT_PROPS : { maxFontSizeMultiplier, numberOfLines: 2 })}
          style={[
            textStyle(size === 'large' ? 'md' : 'sm'),
            filled ? styles.label : styles.secondLabel,
            { color, fontSize },
            handleInLabel && HANDLE_LABEL_STYLE,
          ]}
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
  contentFits: { maxWidth: '100%' },
  label: { fontWeight: fontWeight.bold, textAlign: 'center' },
  secondLabel: { fontWeight: fontWeight.semibold, textAlign: 'center' },
  pressed: { opacity: 0.85 },
});
