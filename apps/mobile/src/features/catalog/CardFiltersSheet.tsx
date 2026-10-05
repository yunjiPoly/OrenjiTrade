import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { CardSearchQuery } from '@/src/api/hooks/catalog';
import { useSets } from '@/src/api/hooks/catalog';
import type { GameResponse } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Button } from '@/src/components/ui/Button';
import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { editionLabel, languageName } from '@/src/lib/catalog';
import { spacing, textStyle, useTheme } from '@/src/theme';

import { extraFilterCount, filterOptions, type CardFilterKey } from './cardSearch';

const ANY = '__any__';

export interface CardFiltersSheetProps {
  visible: boolean;
  onClose: () => void;
  query: CardSearchQuery;
  games: readonly GameResponse[];
  onFilter: (key: CardFilterKey, value: string | null) => void;
  onClear: () => void;
}

/**
 * Set, rarity, language and edition filters of the Search tab (the web's `app-card-filters`):
 * sets of the chosen game (`GET /sets`), the other values from the game schema.
 */
export function CardFiltersSheet({
  visible,
  onClose,
  query,
  games,
  onFilter,
  onClear,
}: CardFiltersSheetProps) {
  const { palette } = useTheme();
  const sets = useSets(visible ? query.game : null);
  const choice = (key: CardFilterKey) => (value: string) =>
    onFilter(key, value === ANY ? null : value);
  const active = extraFilterCount(query);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filters" testID="card-filters">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {query.game ? (
          <ChoiceChips
            label="Set"
            options={[
              { value: ANY, label: 'All sets' },
              ...(sets.data ?? []).map((set) => ({
                value: set.code ?? set.id ?? '',
                label: `${set.name ?? set.code} (${set.code})`,
              })),
            ]}
            value={query.set ?? ANY}
            onChange={choice('set')}
            hint={
              sets.isPending ? 'Loading sets…' : sets.isError ? 'Sets could not load.' : undefined
            }
            testID="filter-set"
          />
        ) : (
          <View style={styles.group}>
            <Text style={[textStyle('sm'), { color: palette.ink }]}>Set</Text>
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              Choose a game first.
            </Text>
          </View>
        )}
        <ChoiceChips
          label="Rarity"
          options={[
            { value: ANY, label: 'Any rarity' },
            ...filterOptions(games, query.game, 'rarities').map((value) => ({
              value,
              label: value,
            })),
          ]}
          value={query.rarity ?? ANY}
          onChange={choice('rarity')}
          testID="filter-rarity"
        />
        <ChoiceChips
          label="Language"
          options={[
            { value: ANY, label: 'Any language' },
            ...filterOptions(games, query.game, 'languages').map((value) => ({
              value,
              label: languageName(value),
            })),
          ]}
          value={query.language ?? ANY}
          onChange={choice('language')}
          testID="filter-language"
        />
        <ChoiceChips
          label="Edition"
          options={[
            { value: ANY, label: 'Any edition' },
            ...filterOptions(games, query.game, 'editions').map((value) => ({
              value,
              label: editionLabel(value),
            })),
          ]}
          value={query.edition ?? ANY}
          onChange={choice('edition')}
          testID="filter-edition"
        />
      </ScrollView>
      <View style={styles.actions}>
        <Button
          label={active > 0 ? `Clear filters (${active})` : 'Clear filters'}
          variant="ghost"
          onPress={onClear}
          disabled={active === 0}
          testID="filters-clear"
        />
        <Button label="Show results" onPress={onClose} testID="filters-done" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  content: { gap: spacing[4], paddingBottom: spacing[2] },
  group: { gap: spacing[1] },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[2] },
});
