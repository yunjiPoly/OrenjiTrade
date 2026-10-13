import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type ComponentProps } from 'react';
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
  /** An icon before the current choice. */
  icon?: ComponentProps<typeof MaterialCommunityIcons>['name'];
  /**
   * Only the icon, as a round button (a navigation header has no room for the words): the name
   * "<label>: <current choice>" is still what a screen reader says.
   */
  iconOnly?: boolean;
  /** `accent` tints the trigger: the choice is not the usual one and should be noticed. */
  tone?: 'default' | 'accent';
  /**
   * A compact trigger that must always show its whole choice (the region switcher): it may take
   * the width of its row and wraps onto more lines at large text sizes instead of ending in "…".
   */
  wrap?: boolean;
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
  icon,
  iconOnly = false,
  tone = 'default',
  wrap = false,
  testID,
}: SelectSheetProps<T>) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  const currentLabel = current?.label ?? '—';
  const accent = tone === 'accent';
  const ink = accent ? palette.onAccentContainer : palette.ink;

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
          iconOnly ? styles.round : compact ? styles.pill : styles.field,
          compact && wrap && !iconOnly && styles.wrapping,
          {
            // A round header button is bare until it has something to say (the accent tone).
            borderColor: accent ? palette.accent : iconOnly ? 'transparent' : palette.borderStrong,
            backgroundColor: accent
              ? palette.accentContainer
              : iconOnly
                ? 'transparent'
                : compact
                  ? palette.surfaceVariant
                  : palette.surface,
          },
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        {icon ? (
          <MaterialCommunityIcons
            name={icon}
            size={iconOnly ? 22 : 18}
            color={accent || iconOnly ? ink : palette.textMuted}
          />
        ) : null}
        {iconOnly ? null : (
          <>
            <View style={compact ? styles.shrink : styles.grow}>
              {compact ? null : (
                <Text style={[textStyle('xs'), { color: accent ? ink : palette.textMuted }]}>
                  {label}
                </Text>
              )}
              <Text
                numberOfLines={compact && wrap ? undefined : 1}
                style={[textStyle(compact ? 'sm' : 'md'), styles.value, { color: ink }]}
              >
                {compact ? `${label}: ${currentLabel}` : currentLabel}
              </Text>
            </View>
            <MaterialCommunityIcons
              name="chevron-down"
              size={20}
              color={accent ? ink : palette.textMuted}
            />
          </>
        )}
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
                // The second line (a count, "Your region") is said after the choice.
                accessibilityHint={option.detail}
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
  // A pill that shows its whole text: as wide as its row allows, as tall as its lines need. Its
  // corners are half of one line's height: a pill on one line, a rounded box on several (the
  // full pill radius turned three lines of large text into an oval).
  wrapping: { maxWidth: '100%', paddingVertical: spacing[1], borderRadius: 18 },
  round: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  grow: { flexShrink: 1, flexGrow: 1 },
  // Compact pills size to their text (filter bars scroll sideways).
  shrink: { flexShrink: 1 },
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
