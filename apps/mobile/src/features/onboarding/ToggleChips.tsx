import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { fontWeight, radius, spacing, useTheme } from '@/src/theme';

export interface ToggleChip {
  key: string;
  label: string;
  selected: boolean;
  /** Unpicked chips can be greyed while nothing more can be picked (the tags' 12). */
  disabled?: boolean;
  testID?: string;
}

export interface ToggleChipsProps {
  /** The group's name for a screen reader ("Languages you trade in"). */
  label: string;
  chips: readonly ToggleChip[];
  onToggle: (key: string) => void;
  disabled?: boolean;
  /** Something after the chips, in the same wrapping row (Edit profile's "Add a tag"). */
  trailing?: ReactNode;
  testID?: string;
}

/**
 * Chips that are picked or not (mockup v50 screen 41: "Languages you trade in", the tags): a
 * picked chip is filled in the ink colour, the others are outlined. Each is a checkbox for a
 * screen reader, 36 pt tall with a 44 pt touch area.
 */
export function ToggleChips({
  label,
  chips,
  onToggle,
  disabled,
  trailing,
  testID,
}: ToggleChipsProps) {
  const { palette } = useTheme();
  return (
    <View role="group" accessibilityLabel={label} style={styles.wrap} testID={testID}>
      {chips.map((chip) => {
        const inactive = disabled || (chip.disabled && !chip.selected);
        return (
          <Pressable
            key={chip.key}
            accessibilityRole="checkbox"
            accessibilityLabel={chip.label}
            aria-checked={chip.selected}
            aria-disabled={inactive}
            disabled={inactive}
            hitSlop={4}
            onPress={() => onToggle(chip.key)}
            testID={chip.testID}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: chip.selected ? palette.ink : 'transparent',
                borderColor: chip.selected ? palette.ink : palette.borderStrong,
              },
              pressed && styles.pressed,
              inactive && styles.disabled,
            ]}
          >
            <Text
              style={[styles.text, { color: chip.selected ? palette.background : palette.ink }]}
            >
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
});
