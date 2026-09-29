import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { assertNever } from '@/src/lib/assertNever';
import { fontWeight, radius, spacing, useTheme, type Palette } from '@/src/theme';

import type { IconName } from './EmptyState';

/** Availability tones from docs/design/design-system.md ("chips" row). */
export type ChipTone = 'neutral' | 'teal' | 'orange' | 'violet' | 'outline';

export interface ChipProps {
  label: string;
  tone?: ChipTone;
  icon?: IconName;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function toneColors(tone: ChipTone, palette: Palette, selected: boolean) {
  switch (tone) {
    case 'neutral':
      return {
        background: selected ? palette.ink : palette.surfaceVariant,
        color: selected ? palette.background : palette.ink,
        border: 'transparent',
      };
    case 'teal':
      return {
        background: selected ? palette.accent : palette.accentContainer,
        color: selected ? palette.onAccent : palette.onAccentContainer,
        border: 'transparent',
      };
    case 'orange':
      return {
        background: selected ? palette.primary : palette.primaryContainer,
        color: selected ? palette.onPrimary : palette.onPrimaryContainer,
        border: 'transparent',
      };
    case 'violet':
      return {
        background: selected ? palette.availability.offers : 'transparent',
        color: selected ? '#FFFFFF' : palette.availability.offers,
        border: palette.availability.offers,
      };
    case 'outline':
      return {
        background: selected ? palette.surfaceVariant : 'transparent',
        color: palette.textMuted,
        border: palette.borderStrong,
      };
    default:
      return assertNever(tone, 'Unhandled chip tone');
  }
}

/** Compact selectable label (filters, availability, theme picker). */
export function Chip({
  label,
  tone = 'neutral',
  icon,
  selected = false,
  onPress,
  disabled = false,
  style,
  testID,
}: ChipProps) {
  const { palette } = useTheme();
  const colors = toneColors(tone, palette, selected);

  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: colors.background, borderColor: colors.border },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={16} color={colors.color} /> : null}
      <Text style={[styles.label, { color: colors.color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[1],
    minHeight: 32,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  label: { fontSize: 14, lineHeight: 20, fontWeight: fontWeight.medium },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
