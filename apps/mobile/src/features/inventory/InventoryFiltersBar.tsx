import { ScrollView, StyleSheet, View } from 'react-native';

import type {
  BinderResponse,
  GameResponse,
  InventoryAvailability,
  Visibility,
} from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { TextField } from '@/src/components/ui/TextField';
import { QUERY_MAX_LENGTH } from '@/src/lib/catalog';
import {
  AVAILABILITIES,
  AVAILABILITY_LABELS,
  VISIBILITIES,
  VISIBILITY_INFO,
  cardCount,
} from '@/src/lib/inventory';
import {
  INVENTORY_SORTS,
  UNFILED,
  type InventoryFilters,
  type InventorySort,
} from '@/src/lib/inventoryFilters';
import { gamesFrom } from '@/src/lib/profile';
import { spacing } from '@/src/theme';

const ALL = '__all__';

export interface InventoryFiltersBarProps {
  /** What is typed in the search field (debounced into `filters.q` by the screen). */
  text: string;
  onText: (text: string) => void;
  filters: InventoryFilters;
  onChange: (patch: Partial<InventoryFilters>) => void;
  onClear: () => void;
  games: readonly GameResponse[] | undefined;
  binders: readonly BinderResponse[];
  /** Cards in no binder (null while unknown). */
  unfiledCount: number | null;
  filtered: boolean;
}

/**
 * Search and filters of the Inventory tab (web: `app-inventory-toolbar` + the binder list):
 * game, intent (the API's availability), visibility, binder (all, unfiled or one binder) and sort.
 */
export function InventoryFiltersBar({
  text,
  onText,
  filters,
  onChange,
  onClear,
  games,
  binders,
  unfiledCount,
  filtered,
}: InventoryFiltersBarProps) {
  return (
    <View style={styles.root}>
      <TextField
        label="Search your cards"
        placeholder="Card name, printing code or set"
        value={text}
        onChangeText={onText}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        maxLength={QUERY_MAX_LENGTH}
        testID="inventory-search"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pills}
        keyboardShouldPersistTaps="handled"
      >
        <SelectSheet
          compact
          label="Binder"
          options={[
            { value: ALL, label: 'All cards' },
            {
              value: UNFILED,
              label: 'Unfiled',
              detail: unfiledCount === null ? undefined : cardCount(unfiledCount),
            },
            ...binders.map((binder) => ({
              value: binder.id,
              label: binder.name,
              detail: cardCount(binder.itemCount),
            })),
          ]}
          value={filters.binder ?? ALL}
          onChange={(binder) => onChange({ binder: binder === ALL ? null : binder })}
          testID="inventory-filter-binder"
        />
        <SelectSheet
          compact
          label="Game"
          options={[
            { value: ALL, label: 'All games' },
            ...gamesFrom(games).map((game) => ({ value: game.slug, label: game.label })),
          ]}
          value={filters.game ?? ALL}
          onChange={(game) => onChange({ game: game === ALL ? null : game })}
          testID="inventory-filter-game"
        />
        <SelectSheet<InventoryAvailability | typeof ALL>
          compact
          label="Intent"
          options={[
            { value: ALL, label: 'Any intent' },
            ...AVAILABILITIES.map((availability) => ({
              value: availability,
              label: AVAILABILITY_LABELS[availability],
            })),
          ]}
          value={filters.availability ?? ALL}
          onChange={(availability) =>
            onChange({ availability: availability === ALL ? null : availability })
          }
          testID="inventory-filter-intent"
        />
        <SelectSheet<Visibility | typeof ALL>
          compact
          label="Visibility"
          options={[
            { value: ALL, label: 'Any visibility' },
            ...VISIBILITIES.map((visibility) => ({
              value: visibility,
              label: VISIBILITY_INFO[visibility].label,
            })),
          ]}
          value={filters.visibility ?? ALL}
          onChange={(visibility) =>
            onChange({ visibility: visibility === ALL ? null : visibility })
          }
          testID="inventory-filter-visibility"
        />
        <SelectSheet<InventorySort>
          compact
          label="Sort"
          options={INVENTORY_SORTS}
          value={filters.sort}
          onChange={(sort) => onChange({ sort })}
          testID="inventory-sort"
        />
        {filtered ? (
          <Button
            label="Clear"
            variant="ghost"
            onPress={onClear}
            style={styles.clear}
            testID="inventory-clear-filters"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2] },
  pills: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: 2 },
  clear: { minHeight: 36, paddingVertical: spacing[1], paddingHorizontal: spacing[3] },
});
