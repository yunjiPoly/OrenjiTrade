import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ErrorState } from '@/src/components/ui/ErrorState';
import { withAlpha } from '@/src/features/account/StatusPage';
import { RadioSheet } from '@/src/components/ui/RadioSheet';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import type { GameOption } from '@/src/features/games/browsingGame';
import { GameTile } from '@/src/features/games/GameTile';
import { gameLabel } from '@/src/lib/profile';
import {
  PINNED_MAX_FONT_SCALE,
  fontWeight,
  spacing,
  textStyle,
  useStackedRows,
  useTheme,
} from '@/src/theme';

import { EDIT_BINDER_COPY } from './binderCopy';

/** The name of a game for the binder screens: the games list's, else the app's label. */
export function binderGameName(options: readonly GameOption[], slug: string): string {
  return options.find((option) => option.slug === slug)?.name ?? gameLabel(slug);
}

/**
 * New binder's "Game" (stage G, the look of mockup screen 63 until R14 rebuilds New binder): one
 * card per game, two by two, with its 34 pt tile and its name; a game without cards is dimmed
 * with "Cards coming soon" and cannot be picked; the chosen one has an orange border and a check.
 * The hint says a binder holds one game. `locked`: cards were already picked for the binder, so
 * its game stays. Before `GET /games` answers, skeleton cards; when it fails, "The games could
 * not load" with "Try again" (review fix 1, P3: New binder saves only with a game).
 */
export function BinderGameGrid({
  options,
  value,
  onChange,
  locked = false,
  disabled = false,
  loading = false,
  error = null,
  onRetry,
}: {
  options: readonly GameOption[];
  value: string;
  onChange: (game: string) => void;
  locked?: boolean;
  disabled?: boolean;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
}) {
  const { palette } = useTheme();
  // One game per row at the larger text sizes: two by two, the names broke in mid-word.
  const stacked = useStackedRows();
  return (
    <View style={styles.field}>
      <Text style={[textStyle('sm'), styles.label, { color: palette.ink }]}>
        {EDIT_BINDER_COPY.game}
      </Text>
      {options.length === 0 && error ? (
        <ErrorState
          compact
          error={error}
          title={EDIT_BINDER_COPY.gamesLoadError}
          onRetry={onRetry}
          testID="binder-game-error"
        />
      ) : null}
      {options.length === 0 && !error && loading ? (
        <View style={styles.grid} testID="binder-game-loading" accessibilityLabel="Loading">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton
              key={index}
              height={58}
              radius={14}
              style={[styles.choice, stacked && styles.choiceFull]}
            />
          ))}
        </View>
      ) : null}
      <View accessibilityRole="radiogroup" style={styles.grid} testID="binder-game">
        {options.map((option) => {
          const on = option.slug === value;
          const off = !option.browsable || (locked && !on);
          return (
            <Pressable
              key={option.slug}
              accessibilityRole="radio"
              accessibilityLabel={
                option.browsable
                  ? option.name
                  : `${option.name}, ${EDIT_BINDER_COPY.gameComingSoon}`
              }
              accessibilityState={{ checked: on, disabled: off || disabled }}
              aria-checked={on}
              disabled={off || disabled}
              onPress={() => onChange(option.slug)}
              testID={`binder-game-${option.slug}`}
              style={({ pressed }) => [
                styles.choice,
                stacked && styles.choiceFull,
                {
                  borderColor: on ? palette.primary : palette.border,
                  // Mockup v50 screen 63 (stage R14): the chosen tile is tinted orange, as the
                  // welcome's game tiles.
                  backgroundColor: on
                    ? withAlpha(palette.primary, 0.08)
                    : option.browsable
                      ? palette.surface
                      : 'transparent',
                },
                !option.browsable && styles.dimmed,
                pressed && styles.pressed,
              ]}
            >
              <GameTile slug={option.slug} name={option.name} size={34} />
              <View style={styles.choiceTexts}>
                <Text
                  style={[
                    styles.choiceName,
                    { color: on ? palette.onPrimaryContainer : palette.ink },
                  ]}
                >
                  {option.name}
                </Text>
                {option.browsable ? null : (
                  <Text style={[styles.choiceSub, { color: palette.textMuted }]}>
                    {EDIT_BINDER_COPY.gameComingSoon}
                  </Text>
                )}
              </View>
              {on ? (
                <View
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  style={[styles.check, { backgroundColor: palette.primary }]}
                >
                  <MaterialCommunityIcons name="check" size={13} color={palette.onPrimary} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={[textStyle('xs'), { color: palette.textMuted }]} testID="binder-game-hint">
        {EDIT_BINDER_COPY.gameHint}
      </Text>
    </View>
  );
}

/**
 * Edit binder's "Game" beside the name (stage G, mockup screen 18): the binder's game with its
 * 22 pt tile. Once the binder holds cards it is read-only with a lock, spoken "Game: {name}. It
 * can't change once the binder has cards"; an empty binder's game opens the games that can hold
 * binders. `lockedByUndo`: the binder holds no card, but one that left it can still come back
 * with Undo (the API's `gameLocked`): locked too, with a line that says why (review fix 1, U2).
 */
export function BinderGameField({
  options,
  value,
  onChange,
  locked,
  lockedByUndo = false,
  disabled = false,
}: {
  options: readonly GameOption[];
  value: string;
  onChange: (game: string) => void;
  locked: boolean;
  lockedByUndo?: boolean;
  disabled?: boolean;
}) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const name = binderGameName(options, value);
  const box = (
    <>
      <GameTile slug={value} name={name} size={22} />
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        style={[styles.boxName, { color: palette.ink }]}
      >
        {name}
      </Text>
      <MaterialCommunityIcons
        name={locked ? 'lock-outline' : 'chevron-down'}
        size={16}
        color={palette.textMuted}
      />
    </>
  );
  return (
    <View style={styles.field}>
      <Text style={[textStyle('sm'), styles.label, { color: palette.ink }]}>
        {EDIT_BINDER_COPY.game}
      </Text>
      {locked ? (
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={
            lockedByUndo
              ? EDIT_BINDER_COPY.gameLockedUndoLabel(name)
              : EDIT_BINDER_COPY.gameLocked(name)
          }
          style={[
            styles.box,
            { borderColor: palette.border, backgroundColor: palette.surfaceVariant },
          ]}
          testID="binder-game-locked"
        >
          {box}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={EDIT_BINDER_COPY.gameChange(name)}
          disabled={disabled}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.box,
            { borderColor: palette.borderStrong, backgroundColor: palette.surface },
            pressed && styles.pressed,
          ]}
          testID="binder-game-change"
        >
          {box}
        </Pressable>
      )}
      <RadioSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={EDIT_BINDER_COPY.gameSheetTitle}
        description={EDIT_BINDER_COPY.gameHint}
        groupLabel={EDIT_BINDER_COPY.game}
        value={value}
        onPick={onChange}
        testID="binder-game-sheet"
        options={options.map((option) => ({
          value: option.slug,
          label: option.name,
          detail: option.browsable ? undefined : EDIT_BINDER_COPY.gameComingSoon,
          disabled: !option.browsable,
          leading: <GameTile slug={option.slug} name={option.name} size={38} />,
        }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontWeight: fontWeight.semibold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  choice: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 58,
    paddingVertical: spacing[2],
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  choiceFull: { flexBasis: '100%' },
  choiceTexts: { flex: 1, minWidth: 0, gap: 1 },
  choiceName: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  choiceSub: { fontSize: 11, lineHeight: 15 },
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
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 48,
    paddingLeft: 10,
    paddingRight: spacing[3],
    borderRadius: 12,
    borderWidth: 1,
  },
  boxName: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold, flexShrink: 1 },
  dimmed: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});
