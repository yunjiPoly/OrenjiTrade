import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { useTheme } from '@/src/theme';

import { RATING_COPY, STAR_WORDS } from './ratingCopy';

const SCORES = [1, 2, 3, 4, 5] as const;

/** What a press on a star does: the score, or none again when the chosen star of a clearable row is pressed. */
export function nextScore(
  current: number | null,
  pressed: number,
  clearable: boolean
): number | null {
  return clearable && current === pressed ? null : pressed;
}

export interface StarRatingInputProps {
  /** The group's name ("Overall score", "Communication"). */
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  /** A details row: the chosen star pressed again clears the score. */
  clearable?: boolean;
  /** `large`: Overall's 34 pt stars with the score's word under them; `row`: a details row's 20 pt stars. */
  size?: 'large' | 'row';
  disabled?: boolean;
  /** The group; each star is `<testID>-<score>`. */
  testID: string;
}

/**
 * A 1–5 star picker (mockup v50 screen 61): a radio group of five stars in the amber of the
 * mockup, each read as "Communication: 4 stars, Good". Overall shows the score's word under its
 * stars (Poor, Not great, Okay, Good, Excellent); a details row is clearable by pressing its chosen
 * star again.
 */
export function StarRatingInput({
  label,
  value,
  onChange,
  clearable = false,
  size = 'row',
  disabled = false,
  testID,
}: StarRatingInputProps) {
  const { palette } = useTheme();
  const large = size === 'large';
  const stars = (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.stars, large && styles.starsLarge]}
      testID={testID}
    >
      {SCORES.map((score) => {
        const on = value !== null && score <= value;
        const word = STAR_WORDS[score] ?? '';
        return (
          <Pressable
            key={score}
            accessibilityRole="radio"
            accessibilityLabel={RATING_COPY.star(label, score, word)}
            accessibilityHint={clearable && value === score ? RATING_COPY.clearHint : undefined}
            aria-checked={value === score}
            aria-disabled={disabled}
            disabled={disabled}
            onPress={() => onChange(nextScore(value, score, clearable))}
            testID={`${testID}-${score}`}
            style={({ pressed }) => [
              large ? styles.starLarge : styles.star,
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons
              name="star"
              size={large ? 34 : 20}
              color={on ? palette.warning : palette.borderStrong}
            />
          </Pressable>
        );
      })}
    </View>
  );
  if (!large) {
    return stars;
  }
  return (
    <View style={styles.largeBox}>
      {stars}
      <Text
        importantForAccessibility="no"
        accessibilityElementsHidden
        testID={`${testID}-word`}
        style={[styles.word, { color: palette.textMuted }]}
      >
        {value ? (STAR_WORDS[value] ?? '') : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', gap: 4 },
  starsLarge: { gap: 6 },
  star: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  starLarge: { width: 46, height: 44, alignItems: 'center', justifyContent: 'center' },
  largeBox: { alignItems: 'center', gap: 6 },
  word: { minHeight: 18, fontSize: 13, lineHeight: 18 },
  pressed: { opacity: 0.7 },
});
