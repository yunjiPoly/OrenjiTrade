import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useInventoryCount } from '@/src/api/hooks/inventory';
import type { BinderResponse, GameResponse } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Text } from '@/src/components/ui/Text';
import {
  clearedFilters,
  UNFILED,
  type InventoryFilters,
  type InventorySort,
  type VisibilityFilter,
} from '@/src/lib/inventoryFilters';
import { gameLabel } from '@/src/lib/profile';
import {
  fontWeight,
  PINNED_MAX_FONT_SCALE,
  spacing,
  textStyle,
  TITLE_MAX_FONT_SCALE,
  useTheme,
} from '@/src/theme';

import { FILTER_COPY } from './inventoryCopy';

export interface InventoryFilterSheetProps {
  visible: boolean;
  /** The filters in force when the sheet opens. */
  filters: InventoryFilters;
  /** The games of the collector's cards (`byGame` of the summary), in the catalogue's order. */
  ownedGames: readonly string[];
  /** Every game (for their names). */
  games: readonly GameResponse[] | undefined;
  binders: readonly BinderResponse[];
  onApply: (filters: InventoryFilters) => void;
  onClose: () => void;
}

interface Option<T> {
  value: T;
  label: string;
}

/**
 * "Filter and sort" (owner spec 2026-10-14, section 6, screen 2): Sort by (Recently added, Name,
 * Price), Game (All games, then the games the collector owns), Binder (All cards, No binder, then
 * each binder by name) and Who can see it (All, Public, Private). The choices apply with "Show {n}
 * cards", which counts the cards they keep as they change; "Clear all" turns every filter off.
 */
export function InventoryFilterSheet({
  visible,
  filters,
  ownedGames,
  games,
  binders,
  onApply,
  onClose,
}: InventoryFilterSheetProps) {
  const { palette } = useTheme();
  const [draft, setDraft] = useState<InventoryFilters>(filters);
  // Every opening starts from the filters in force.
  const [opened, setOpened] = useState(false);
  if (visible !== opened) {
    setOpened(visible);
    if (visible) {
      setDraft(filters);
    }
  }
  const count = useInventoryCount(draft, visible);

  const sorts: Option<InventorySort>[] = [
    { value: 'created', label: FILTER_COPY.sortCreated },
    { value: 'name', label: FILTER_COPY.sortName },
    { value: 'price', label: FILTER_COPY.sortPrice },
  ];
  const gameOptions = useMemo<Option<string | null>[]>(() => {
    const owned = [...ownedGames];
    if (draft.game && !owned.includes(draft.game)) {
      owned.push(draft.game);
    }
    return [
      { value: null, label: FILTER_COPY.allGames },
      ...owned.map((slug) => ({
        value: slug,
        label: games?.find((game) => game.slug === slug)?.shortName ?? gameLabel(slug),
      })),
    ];
  }, [draft.game, games, ownedGames]);
  const binderOptions = useMemo<Option<string | null>[]>(
    () => [
      { value: null, label: FILTER_COPY.allCards },
      { value: UNFILED, label: FILTER_COPY.noBinder },
      ...[...binders]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((binder) => ({ value: binder.id, label: binder.name })),
    ],
    [binders]
  );
  const visibilities: Option<VisibilityFilter | null>[] = [
    { value: null, label: FILTER_COPY.all },
    { value: 'PUBLIC', label: FILTER_COPY.public },
    { value: 'PRIVATE', label: FILTER_COPY.private },
  ];

  const shown = count.data ?? null;

  return (
    <BottomSheet visible={visible} onClose={onClose} testID="inventory-filters">
      <View style={styles.head}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[textStyle('lg'), styles.title, { color: palette.ink }]}
        >
          {FILTER_COPY.title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={FILTER_COPY.clearAll}
          onPress={() => setDraft(clearedFilters(draft))}
          hitSlop={8}
          testID="inventory-filters-clear"
          style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
        >
          <Text style={[textStyle('md'), styles.clearLabel, { color: palette.primary }]}>
            {FILTER_COPY.clearAll}
          </Text>
        </Pressable>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.groups}>
        <ChipGroup
          title={FILTER_COPY.sortBy}
          options={sorts}
          value={draft.sort}
          onChange={(sort) => setDraft({ ...draft, sort })}
          testID="filter-sort"
        />
        <ChipGroup
          title={FILTER_COPY.game}
          options={gameOptions}
          value={draft.game}
          onChange={(game) => setDraft({ ...draft, game })}
          testID="filter-game"
        />
        <ChipGroup
          title={FILTER_COPY.binder}
          options={binderOptions}
          value={draft.binder}
          onChange={(binder) => setDraft({ ...draft, binder })}
          testID="filter-binder"
        />
        <ChipGroup
          title={FILTER_COPY.whoCanSee}
          options={visibilities}
          value={draft.visibility}
          onChange={(visibility) => setDraft({ ...draft, visibility })}
          testID="filter-visibility"
        />
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={FILTER_COPY.show(shown)}
        aria-busy={count.isFetching}
        onPress={() => onApply(draft)}
        testID="inventory-filters-show"
        style={({ pressed }) => [
          styles.show,
          { backgroundColor: palette.primary },
          pressed && styles.pressed,
        ]}
      >
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[textStyle('md'), styles.showLabel, { color: palette.onPrimary }]}
        >
          {FILTER_COPY.show(shown)}
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

function ChipGroup<T extends string | null>({
  title,
  options,
  value,
  onChange,
  testID,
}: {
  title: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.group}>
      <Text style={[textStyle('sm'), styles.groupTitle, { color: palette.ink }]}>{title}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={title}
        testID={`${testID}-group`}
        style={styles.chips}
      >
        {options.map((option) => {
          const on = option.value === value;
          return (
            <Pressable
              key={option.value ?? 'all'}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              aria-checked={on}
              onPress={() => onChange(option.value)}
              // 36 pt chips (the mockup) with a 44 pt touch target.
              hitSlop={{ top: 4, bottom: 4 }}
              testID={`${testID}-${option.value ?? 'all'}`}
              style={({ pressed }) => [
                styles.chip,
                on
                  ? { backgroundColor: palette.ink, borderColor: palette.ink }
                  : { backgroundColor: 'transparent', borderColor: palette.borderStrong },
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  {
                    color: on ? palette.background : palette.ink,
                    fontWeight: on ? fontWeight.semibold : fontWeight.medium,
                  },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The games of the collector's cards, in the order of `games` (unknown slugs last). */
export function ownedGameSlugs(
  byGame: Readonly<Record<string, number>> | undefined,
  games: readonly GameResponse[] | undefined
): string[] {
  const owned = Object.entries(byGame ?? {})
    .filter(([, count]) => count > 0)
    .map(([slug]) => slug);
  const order = (games ?? []).map((game) => game.slug);
  return owned.sort((a, b) => {
    const left = order.indexOf(a);
    const right = order.indexOf(b);
    return (left < 0 ? order.length : left) - (right < 0 ? order.length : right);
  });
}

const styles = StyleSheet.create({
  // At the largest text sizes "Clear all" goes under the title rather than off the screen.
  head: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: spacing[3],
  },
  title: { fontWeight: fontWeight.bold, flexShrink: 1 },
  clear: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  clearLabel: { fontWeight: fontWeight.semibold },
  scroll: { flexGrow: 0 },
  groups: { gap: 18, paddingBottom: spacing[1] },
  group: { gap: spacing[2] },
  groupTitle: { fontWeight: fontWeight.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  chipLabel: { fontSize: 14, lineHeight: 20 },
  show: {
    minHeight: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[1],
  },
  showLabel: { fontWeight: fontWeight.bold },
  pressed: { opacity: 0.8 },
});
