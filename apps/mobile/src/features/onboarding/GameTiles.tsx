import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ErrorState } from '@/src/components/ui/ErrorState';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import type { GameOption } from '@/src/features/games/browsingGame';
import { GameTile } from '@/src/features/games/GameTile';
import { withAlpha } from '@/src/features/account/StatusPage';
import { fontWeight, radius, spacing, useStackedRows, useTheme } from '@/src/theme';

import { WELCOME_COPY } from './welcomeCopy';

export interface GameTilesProps {
  /** The games of `GET /games` (null while loading or after an error). */
  games: readonly GameOption[] | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** The picked slugs, in the order picked. */
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** The game Home and Search open on ("Opens first"), or null. */
  opensFirst: string | null;
  disabled?: boolean;
}

/** What a tile says under the game's name, and what a screen reader adds to it. */
export function gameTileNote(
  game: Pick<GameOption, 'slug' | 'browsable'>,
  opensFirst: string | null
): string | null {
  if (game.slug === opensFirst) {
    return WELCOME_COPY.games.opensFirst;
  }
  return game.browsable ? null : WELCOME_COPY.games.comingSoon;
}

/**
 * The five game tiles of the welcome (mockup v50 screen 41): two columns, several can be picked;
 * the first picked that has cards says "Opens first", the games whose cards are coming soon say
 * so and can be picked all the same. One column at the largest text sizes.
 */
export function GameTiles({
  games,
  loading,
  error,
  onRetry,
  value,
  onChange,
  opensFirst,
  disabled,
}: GameTilesProps) {
  const { palette } = useTheme();
  const stacked = useStackedRows();

  if (!games) {
    return loading ? (
      <View
        style={styles.grid}
        accessibilityLabel={WELCOME_COPY.games.gamesLoading}
        testID="welcome-games-loading"
      >
        {[0, 1, 2, 3, 4].map((index) => (
          <View key={index} style={[styles.cell, stacked && styles.cellStacked]}>
            <Skeleton height={58} radius={14} />
          </View>
        ))}
      </View>
    ) : (
      <ErrorState
        compact
        error={error}
        title={WELCOME_COPY.games.gamesError}
        onRetry={onRetry}
        testID="welcome-games-error"
      />
    );
  }

  return (
    <View role="group" accessibilityLabel={WELCOME_COPY.games.gamesLabel} style={styles.grid}>
      {games.map((game) => {
        const picked = value.includes(game.slug);
        const shown = gameTileNote(game, opensFirst);
        return (
          <View key={game.slug} style={[styles.cell, stacked && styles.cellStacked]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={shown ? `${game.name}, ${shown}` : game.name}
              aria-checked={picked}
              aria-disabled={disabled}
              disabled={disabled}
              onPress={() =>
                onChange(
                  picked ? value.filter((slug) => slug !== game.slug) : [...value, game.slug]
                )
              }
              testID={`game-${game.slug}`}
              style={({ pressed }) => [
                styles.tile,
                {
                  borderColor: picked ? palette.primary : palette.border,
                  backgroundColor: picked ? withAlpha(palette.primary, 0.08) : palette.surface,
                },
                pressed && styles.pressed,
              ]}
            >
              <GameTile slug={game.slug} name={game.name} size={34} />
              <View style={styles.words}>
                <Text
                  numberOfLines={stacked ? undefined : 1}
                  style={[styles.name, { color: palette.ink }]}
                >
                  {game.name}
                </Text>
                {shown ? (
                  <Text
                    testID={`game-${game.slug}-note`}
                    style={[
                      styles.note,
                      {
                        color:
                          shown === WELCOME_COPY.games.opensFirst
                            ? palette.primary
                            : palette.textMuted,
                      },
                    ]}
                  >
                    {shown}
                  </Text>
                ) : null}
              </View>
              {picked ? (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[styles.check, { backgroundColor: palette.primary }]}
                >
                  <MaterialCommunityIcons name="check" size={13} color={palette.onPrimary} />
                </View>
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cell: { width: '50%', padding: 4 },
  cellStacked: { width: '100%' },
  tile: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: spacing[2],
    borderRadius: radius.lg - 2,
    borderWidth: 1.5,
  },
  words: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  note: { fontSize: 11, lineHeight: 15 },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
});
