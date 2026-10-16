import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /**
   * Read by a screen reader instead of `label`, for a chip whose visible label is shortened to
   * stay in view in a pinned row. It starts with the visible label, then says what it means
   * ("356 assumed: the lines whose plain copy was assumed" for "356 assumed"), so the words on
   * screen also reach the chip through Voice Control (WCAG 2.5.3, label in name).
   */
  accessibilityLabel?: string;
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
  /**
   * With `scroll`: the chosen chip is brought into the row's visible part whenever the choice
   * changes, also when something else than a press on the chip changed it (a button elsewhere on
   * the screen). Without it a row longer than the screen can show no chosen chip at all.
   */
  revealSelected?: boolean;
  /**
   * How far the chips follow the system text size: for chips that stay on screen over a scrolling
   * list (`PINNED_MAX_FONT_SCALE`), where they must not take the list's room.
   */
  maxFontSizeMultiplier?: number;
  disabled?: boolean;
  error?: string | null;
  hint?: string;
  style?: StyleProp<ViewStyle>;
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
  revealSelected = false,
  maxFontSizeMultiplier,
  disabled = false,
  error,
  hint,
  style,
  testID,
}: ChoiceChipsProps<T>) {
  const { palette } = useTheme();
  const row = useRef<ScrollView>(null);
  // Where each chip stands in the scrolling row, and which part of the row is on screen.
  const frames = useRef(new Map<string, { x: number; width: number }>());
  const seen = useRef({ width: 0, offset: 0 });

  /** Scrolls the row just far enough for the chip to be whole on screen; nothing when it is. */
  const reveal = useCallback((key: string | null, animated: boolean) => {
    const frame = key === null ? undefined : frames.current.get(key);
    const { width, offset } = seen.current;
    if (!frame || width <= 0) {
      return;
    }
    if (frame.x < offset) {
      row.current?.scrollTo({ x: Math.max(0, frame.x - spacing[2]), animated });
    } else if (frame.x + frame.width > offset + width) {
      row.current?.scrollTo({ x: frame.x + frame.width - width + spacing[2], animated });
    }
  }, []);

  const follows = scroll && revealSelected;
  useEffect(() => {
    if (follows) {
      reveal(value, true);
    }
  }, [follows, reveal, value]);

  const chips = options.map((option) => {
    const selected = option.value === value;
    return (
      <Pressable
        key={option.value}
        accessibilityRole="radio"
        accessibilityLabel={option.accessibilityLabel ?? option.label}
        aria-checked={selected}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={() => onChange(option.value)}
        onLayout={
          follows
            ? (event) => {
                const { x, width } = event.nativeEvent.layout;
                frames.current.set(option.value, { x, width });
                if (selected) {
                  // A chip that is chosen as it appears, or whose label grew.
                  reveal(option.value, false);
                }
              }
            : undefined
        }
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
          maxFontSizeMultiplier={maxFontSizeMultiplier}
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
            ref={row}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            keyboardShouldPersistTaps="handled"
            onLayout={
              follows
                ? (event) => {
                    seen.current.width = event.nativeEvent.layout.width;
                    reveal(value, false);
                  }
                : undefined
            }
            onScroll={
              follows
                ? (event) => {
                    seen.current.offset = event.nativeEvent.contentOffset.x;
                  }
                : undefined
            }
            scrollEventThrottle={follows ? 16 : undefined}
            testID={follows && testID ? `${testID}-row` : undefined}
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
