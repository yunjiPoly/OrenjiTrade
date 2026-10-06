import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SCORE_WORDS } from '@/src/features/collectors/ratingLabels';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

const SCORES = [1, 2, 3, 4, 5] as const;

/**
 * A 1–5 star picker (web: `app-star-rating-input`): a radio group of five stars, each read as
 * "4 stars, Great", the chosen score's word next to them and, when `clearable`, "Clear".
 */
export function StarRatingInput({
  label,
  value,
  onChange,
  clearable = false,
  disabled = false,
  testID,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  clearable?: boolean;
  disabled?: boolean;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.row}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={styles.stars}
        testID={testID}
      >
        {SCORES.map((score) => {
          const on = value !== null && score <= value;
          return (
            <Pressable
              key={score}
              accessibilityRole="radio"
              accessibilityLabel={`${score} ${score === 1 ? 'star' : 'stars'}, ${SCORE_WORDS[score]}`}
              aria-checked={value === score}
              aria-disabled={disabled}
              disabled={disabled}
              hitSlop={4}
              onPress={() => onChange(score)}
              testID={`${testID}-${score}`}
              style={({ pressed }) => [styles.star, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons
                name={on ? 'star' : 'star-outline'}
                size={30}
                color={on ? palette.primary : palette.textDisabled}
              />
            </Pressable>
          );
        })}
      </View>
      <Text
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={[textStyle('sm'), styles.word, { color: palette.textMuted }]}
      >
        {value ? SCORE_WORDS[value] : ''}
      </Text>
      {clearable && value !== null && !disabled ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Clear ${label}`}
          onPress={() => onChange(null)}
          hitSlop={6}
          testID={`${testID}-clear`}
        >
          <Text style={[textStyle('sm'), styles.clear, { color: palette.accent }]}>Clear</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' },
  stars: { flexDirection: 'row' },
  star: { padding: 2 },
  word: { minWidth: 64 },
  clear: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.7 },
});
