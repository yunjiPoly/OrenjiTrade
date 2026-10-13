import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { PINNED_MAX_FONT_SCALE, fontWeight, radius, spacing, useTheme } from '@/src/theme';

export interface SegmentedProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  /** Group id; each segment is `<testID>-<value>`. */
  testID?: string;
}

/**
 * How far a label follows the system text size when three segments share the width: less than
 * with two, so that the longest label of the app ("Collectors") still fits its third of a
 * 320-point screen.
 */
export const THREE_WAY_MAX_FONT_SCALE = 1.2;

/**
 * A two-or-three-way switch between views of one screen (tabs inside a tab).
 *
 * Each label stays on one line and follows the system text size a little
 * (`PINNED_MAX_FONT_SCALE`, `THREE_WAY_MAX_FONT_SCALE`), instead of breaking in the middle of a
 * word ("Collect / ors") and taking a third of the screen at the largest sizes. A long press
 * shows it enlarged on iOS (the system's large content viewer).
 *
 * (No `adjustsFontSizeToFit`: on iOS it drew these labels four points high at the default text
 * size.)
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  style,
  testID,
}: SegmentedProps<T>) {
  const { palette } = useTheme();
  const cap = options.length > 2 ? THREE_WAY_MAX_FONT_SCALE : PINNED_MAX_FONT_SCALE;
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      testID={testID}
      style={[
        styles.root,
        { backgroundColor: palette.surfaceVariant, borderColor: palette.border },
        style,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityShowsLargeContentViewer
            accessibilityLargeContentTitle={option.label}
            aria-selected={selected}
            onPress={() => onChange(option.value)}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={({ pressed }) => [
              styles.segment,
              selected && { backgroundColor: palette.surface, borderColor: palette.borderStrong },
              pressed && styles.pressed,
            ]}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={cap}
              style={[
                styles.label,
                { color: selected ? palette.ink : palette.textMuted },
                selected && styles.selected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[1],
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  // As wide as its segment, so a label that does not fit ends in "…" inside it.
  label: {
    alignSelf: 'stretch',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: fontWeight.medium,
  },
  selected: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.8 },
});
