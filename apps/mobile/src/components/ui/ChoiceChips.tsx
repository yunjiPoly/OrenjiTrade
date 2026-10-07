import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fontWeight, radius, spacing, textStyle, useTheme, type ViewStyleProp } from '@/src/theme';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

export interface ChoiceChipsProps<T extends string> {
  /** Visible group label (also the radio group's accessible name). */
  label: string;
  /** Hide the visible label (the accessible name stays). */
  hideLabel?: boolean;
  options: readonly ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** One scrolling row instead of wrapping lines (game pills). */
  scroll?: boolean;
  disabled?: boolean;
  error?: string | null;
  hint?: string;
  style?: ViewStyleProp;
  /** Group id; each option is `<testID>-<value>`. */
  testID?: string;
}

/**
 * A single choice among a few values, as chips (condition, language, availability, visibility,
 * game pills). Accessible as a radio group: every chip is a `radio` with `aria-checked`.
 */
export function ChoiceChips<T extends string>({
  label,
  hideLabel = false,
  options,
  value,
  onChange,
  scroll = false,
  disabled = false,
  error,
  hint,
  style,
  testID,
}: ChoiceChipsProps<T>) {
  const { palette } = useTheme();
  const chips = options.map((option) => {
    const selected = option.value === value;
    return (
      <Pressable
        key={option.value}
        accessibilityRole="radio"
        accessibilityLabel={option.label}
        aria-checked={selected}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={() => onChange(option.value)}
        testID={testID ? `${testID}-${option.value}` : undefined}
        style={({ pressed }) => [
          styles.chip,
          {
            backgroundColor: selected ? palette.ink : palette.surfaceVariant,
            borderColor: selected ? palette.ink : palette.border,
          },
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        {selected ? (
          <MaterialCommunityIcons name="check" size={14} color={palette.background} />
        ) : null}
        <Text
          style={[styles.chipLabel, { color: selected ? palette.background : palette.ink }]}
          numberOfLines={1}
        >
          {option.label}
        </Text>
      </Pressable>
    );
  });

  return (
    <View style={[styles.root, style]}>
      {hideLabel ? null : (
        <Text style={[textStyle('sm'), styles.label, { color: palette.ink }]}>{label}</Text>
      )}
      <View accessibilityRole="radiogroup" accessibilityLabel={label} testID={testID}>
        {scroll ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            keyboardShouldPersistTaps="handled"
          >
            {chips}
          </ScrollView>
        ) : (
          <View style={styles.wrap}>{chips}</View>
        )}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[textStyle('xs'), { color: palette.danger }]}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[1] },
  label: { fontWeight: fontWeight.medium },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  row: { flexDirection: 'row', gap: spacing[2], paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 36,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipLabel: { fontSize: 14, lineHeight: 20, fontWeight: fontWeight.medium },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
