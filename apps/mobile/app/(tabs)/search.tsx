import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip, type ChipTone } from '@/src/components/ui/Chip';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { Screen } from '@/src/components/ui/Screen';
import { TextField } from '@/src/components/ui/TextField';
import { spacing } from '@/src/theme';

const AVAILABILITY_FILTERS: { key: string; label: string; tone: ChipTone }[] = [
  { key: 'trade', label: 'Trade', tone: 'teal' },
  { key: 'sale', label: 'Sale', tone: 'orange' },
  { key: 'offers', label: 'Accepting offers', tone: 'violet' },
  { key: 'collection', label: 'Collection only', tone: 'outline' },
];

/** Search tab: card autocomplete + nearby collectors (Phase 2). */
export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string | null>(null);

  return (
    <Screen testID="screen-search">
      <TextField
        label="Find a card"
        placeholder="Card name, set code or collector number"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        testID="search-input"
      />
      <View style={styles.filters}>
        {AVAILABILITY_FILTERS.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            tone={item.tone}
            selected={filter === item.key}
            onPress={() => setFilter((current) => (current === item.key ? null : item.key))}
          />
        ))}
      </View>
      <EmptyState
        icon="magnify"
        title={query ? `No results for "${query}"` : 'Search across every game'}
        description="Card search with autocomplete and nearby-collector results arrives in Phase 2."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[3] },
});
