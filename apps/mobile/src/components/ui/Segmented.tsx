import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { fontWeight, radius, spacing, useTheme } from '@/src/theme';

export interface SegmentedProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  /** Group id; each segment is `<testID>-<value>`. */
  testID?: string;
}

/** A two-or-three-way switch between views of one screen (tabs inside a tab). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  style,
  testID,
}: SegmentedProps<T>) {
  const { palette } = useTheme();
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
    paddingHorizontal: spacing[3],
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  label: { fontSize: 14, lineHeight: 20, fontWeight: fontWeight.medium },
  selected: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.8 },
});
