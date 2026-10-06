import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectSheetProps {
  label: string;
  options: readonly MultiSelectOption[];
  values: readonly string[];
  onChange: (values: string[]) => void;
  /** Shown instead of the options while they load or when there are none. */
  emptyLabel?: string;
  loading?: boolean;
  /** Field id; the sheet is `<testID>-sheet`, each option `<testID>-option-<value>`. */
  testID?: string;
}

/** The pill's summary: "Tags: 2" / "Tags: any". */
export function multiSelectSummary(label: string, count: number): string {
  return `${label}: ${count > 0 ? count : 'any'}`;
}

/**
 * A multiple choice as a compact pill opening a bottom sheet of checkboxes (the map's tags
 * filter). Values unknown to the options stay selected (shown by their value).
 */
export function MultiSelectSheet({
  label,
  options,
  values,
  onChange,
  emptyLabel = 'Nothing to choose yet',
  loading = false,
  testID,
}: MultiSelectSheetProps) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const choices: MultiSelectOption[] = [
    ...options,
    ...values
      .filter((value) => !options.some((option) => option.value === value))
      .map((value) => ({ value, label: value })),
  ];
  const toggle = (value: string) =>
    onChange(
      values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]
    );
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={multiSelectSummary(label, values.length)}
        accessibilityHint="Opens the choices"
        onPress={() => setOpen(true)}
        testID={testID}
        style={({ pressed }) => [
          styles.pill,
          { borderColor: palette.borderStrong, backgroundColor: palette.surfaceVariant },
          pressed && styles.pressed,
        ]}
      >
        <Text numberOfLines={1} style={[textStyle('sm'), styles.value, { color: palette.ink }]}>
          {multiSelectSummary(label, values.length)}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={20} color={palette.textMuted} />
      </Pressable>
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        testID={testID ? `${testID}-sheet` : undefined}
      >
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {choices.length === 0 ? (
            <Text style={[textStyle('sm'), styles.empty, { color: palette.textMuted }]}>
              {loading ? 'Loading…' : emptyLabel}
            </Text>
          ) : (
            choices.map((option) => {
              const checked = values.includes(option.value);
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="checkbox"
                  accessibilityLabel={option.label}
                  aria-checked={checked}
                  onPress={() => toggle(option.value)}
                  testID={testID ? `${testID}-option-${option.value}` : undefined}
                  style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                >
                  <MaterialCommunityIcons
                    name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={22}
                    color={checked ? palette.primary : palette.textMuted}
                  />
                  <Text style={[textStyle('md'), styles.grow, { color: palette.ink }]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
        <View style={styles.actions}>
          <Button
            label="Clear"
            variant="ghost"
            disabled={values.length === 0}
            onPress={() => onChange([])}
            testID={testID ? `${testID}-clear` : undefined}
          />
          <Button
            label="Done"
            onPress={() => setOpen(false)}
            testID={testID ? `${testID}-done` : undefined}
          />
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
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
  value: { fontWeight: fontWeight.medium, flexShrink: 1 },
  list: { flexGrow: 0 },
  empty: { paddingVertical: spacing[3] },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 48,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
  },
  grow: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[2] },
  pressed: { opacity: 0.8 },
});
