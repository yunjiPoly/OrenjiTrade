import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useGames } from '@/src/api/hooks/profile';
import { Chip } from '@/src/components/ui/Chip';
import { gamesFrom, PROFILE_LANGUAGES } from '@/src/lib/profile';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

export interface MultiPickerProps {
  value: readonly string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

function toggle(values: readonly string[], item: string): string[] {
  return values.includes(item) ? values.filter((value) => value !== item) : [...values, item];
}

/**
 * Selectable game tiles (toggle buttons). The list comes from `GET /games` (hidden games
 * disappear); the built-in list stands in while it loads or when the API cannot be reached.
 */
export function GamePicker({ value, onChange, disabled }: MultiPickerProps) {
  const { palette } = useTheme();
  const games = gamesFrom(useGames().data);
  return (
    <View role="group" accessibilityLabel="Games you collect or play" style={styles.games}>
      {games.map((game) => {
        const selected = value.includes(game.slug);
        return (
          <Pressable
            key={game.slug}
            accessibilityRole="checkbox"
            accessibilityLabel={game.label}
            aria-checked={selected}
            aria-disabled={disabled}
            disabled={disabled}
            onPress={() => onChange(toggle(value, game.slug))}
            testID={`game-${game.slug}`}
            style={({ pressed }) => [
              styles.game,
              {
                borderColor: selected ? palette.primary : palette.border,
                backgroundColor: selected ? palette.primaryContainer : palette.surface,
              },
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons
              name={selected ? 'check-circle' : 'plus-circle-outline'}
              size={20}
              color={selected ? palette.primary : palette.textMuted}
            />
            <Text style={[textStyle('sm'), styles.gameLabel, { color: palette.ink }]}>
              {game.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Multi-select chips for the languages a collector trades in. */
export function LanguagePicker({ value, onChange, disabled }: MultiPickerProps) {
  return (
    <View role="group" accessibilityLabel="Languages you trade in" style={styles.chips}>
      {PROFILE_LANGUAGES.map((language) => (
        <Chip
          key={language.code}
          label={language.label}
          tone="teal"
          selected={value.includes(language.code)}
          disabled={disabled}
          onPress={() => onChange(toggle(value, language.code))}
          testID={`language-${language.code}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  games: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  game: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 48,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.lg,
    borderWidth: 2,
    flexGrow: 1,
    flexBasis: '45%',
  },
  gameLabel: { fontWeight: fontWeight.semibold, flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  pressed: { opacity: 0.8 },
});
