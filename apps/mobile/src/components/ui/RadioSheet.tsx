import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import {
  TITLE_MAX_FONT_SCALE,
  fontFamily,
  fontWeight,
  spacing,
  textStyle,
  useTheme,
} from '@/src/theme';

import { BottomSheet } from './BottomSheet';

export interface RadioSheetOption {
  value: string;
  /** The name of the row. */
  label: string;
  /** Its second line ("38 of your cards", "Your region · Canada, United States, Mexico"). */
  detail?: string;
  /** What stands before the name (a game's tile, the globe of a region). */
  leading?: ReactNode;
  /**
   * A row that cannot be picked: dimmed, without a radio, said "dimmed" by a screen reader and
   * left alone by a tap (a game without cards, stage G).
   */
  disabled?: boolean;
}

export interface RadioSheetProps {
  visible: boolean;
  onClose: () => void;
  /** "Choose a game", "Choose a region". */
  title: string;
  /** The line under the title. */
  description?: string;
  /** The name of the group of radios for a screen reader ("Game", "Region"). */
  groupLabel: string;
  options: readonly RadioSheetOption[];
  value: string;
  /** Picking a row closes the sheet first; nothing else to confirm. */
  onPick: (value: string) => void;
  /** The small print at the bottom. */
  footnote?: string;
  /** The sheet. */
  testID?: string;
  /** Each row is `<optionTestID>-<value>`; `<testID>-option` by default. */
  optionTestID?: string;
}

/**
 * A bottom sheet of one choice (stage G, mockup screens 34 and 35): a title and its line, one row
 * per choice with what stands before it, the name, a second line and a radio on the right (orange
 * when chosen), dimmed rows that cannot be picked, then a footnote. Picking a row closes the sheet
 * and applies the choice: nothing else to confirm.
 */
export function RadioSheet({
  visible,
  onClose,
  title,
  description,
  groupLabel,
  options,
  value,
  onPick,
  footnote,
  testID = 'radio-sheet',
  optionTestID,
}: RadioSheetProps) {
  const rowTestID = optionTestID ?? `${testID}-option`;
  const { palette } = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} testID={testID}>
      <View style={styles.head}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[styles.title, { color: palette.ink }]}
          testID={`${testID}-title`}
        >
          {title}
        </Text>
        {description ? (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{description}</Text>
        ) : null}
      </View>
      <ScrollView
        accessibilityRole="radiogroup"
        accessibilityLabel={groupLabel}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
      >
        {options.map((option) => {
          const selected = option.value === value;
          const disabled = option.disabled === true;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              // The second line ("38 of your cards", "Your region · …") is said after the name.
              accessibilityHint={option.detail}
              accessibilityState={{ checked: selected, disabled }}
              aria-checked={selected}
              aria-disabled={disabled}
              disabled={disabled}
              onPress={() => {
                onClose();
                if (!selected) {
                  onPick(option.value);
                }
              }}
              testID={`${rowTestID}-${option.value}`}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: palette.border },
                disabled && styles.dimmed,
                pressed && styles.pressed,
              ]}
            >
              {option.leading}
              <View style={styles.texts}>
                <Text style={[styles.name, { color: palette.ink }]}>{option.label}</Text>
                {option.detail ? (
                  <Text style={[styles.detail, { color: palette.textMuted }]}>{option.detail}</Text>
                ) : null}
              </View>
              {disabled ? null : (
                <View
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.ring,
                    { borderColor: selected ? palette.primary : palette.borderStrong },
                  ]}
                >
                  {selected ? (
                    <View style={[styles.dot, { backgroundColor: palette.primary }]} />
                  ) : null}
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      {footnote ? (
        <Text style={[styles.footnote, { color: palette.textMuted }]} testID={`${testID}-footnote`}>
          {footnote}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing[1] },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 62,
    paddingVertical: spacing[2],
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...textStyle('md'), fontWeight: fontWeight.semibold },
  detail: { fontSize: 13, lineHeight: 18 },
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dimmed: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  footnote: { fontSize: 12, lineHeight: 17 },
});
