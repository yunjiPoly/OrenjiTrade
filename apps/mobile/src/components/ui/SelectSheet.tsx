import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { BottomSheet } from './BottomSheet';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Secondary line (counts, hints). */
  detail?: string;
}

export interface SelectSheetProps<T extends string> {
  label: string;
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Compact pill trigger (filter bars) instead of a full-width field. */
  compact?: boolean;
  /** Field id; the sheet is `<testID>-sheet`, each option `<testID>-option-<value>`. */
  testID?: string;
}

/**
 * A select: a field showing the current choice that opens a bottom sheet of options (long or
 * dynamic lists such as binders, sort orders and filters). The field reads as a button named
 * "<label>: <current choice>".
 */
export function SelectSheet<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  compact = false,
  testID,
}: SelectSheetProps<T>) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  const currentLabel = current?.label ?? '—';

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${currentLabel}`}
        accessibilityHint="Opens the choices"
        aria-disabled={disabled}
        disabled={disabled}
        onPress={() => setOpen(true)}
        testID={testID}
        style={({ pressed }) => [
          compact ? styles.pill : styles.field,
          {
            borderColor: palette.borderStrong,
            backgroundColor: compact ? palette.surfaceVariant : palette.surface,
          },
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <View style={styles.grow}>
          {compact ? null : (
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{label}</Text>
          )}
          <Text
            numberOfLines={1}
            style={[textStyle(compact ? 'sm' : 'md'), styles.value, { color: palette.ink }]}
          >
            {compact ? `${label}: ${currentLabel}` : currentLabel}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-down" size={20} color={palette.textMuted} />
      </Pressable>
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        testID={testID ? `${testID}-sheet` : undefined}
      >
        <ScrollView
          accessibilityRole="radiogroup"
          accessibilityLabel={label}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                aria-checked={selected}
                onPress={() => {
                  setOpen(false);
                  if (!selected) {
                    onChange(option.value);
                  }
                }}
                testID={testID ? `${testID}-option-${option.value}` : undefined}
                style={({ pressed }) => [
                  styles.option,
                  selected && { backgroundColor: palette.surfaceVariant },
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons
                  name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                  size={22}
                  color={selected ? palette.primary : palette.textMuted}
                />
                <View style={styles.grow}>
                  <Text style={[textStyle('md'), { color: palette.ink }]}>{option.label}</Text>
                  {option.detail ? (
                    <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
                      {option.detail}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 52,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 36,
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: 260,
  },
  grow: { flexShrink: 1, flexGrow: 1 },
  value: { fontWeight: fontWeight.medium },
  list: { flexGrow: 0 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 48,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
