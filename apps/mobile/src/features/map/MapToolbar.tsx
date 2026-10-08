import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useGames, useTagSearch } from '@/src/api/hooks/profile';
import { MultiSelectSheet } from '@/src/components/ui/MultiSelectSheet';
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { QUERY_MAX_LENGTH, SEARCH_DEBOUNCE_MS, boundedQuery } from '@/src/lib/catalog';
import { gamesFrom } from '@/src/lib/profile';
import { elevation, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  FRESHNESS_FILTERS,
  INTENT_FILTERS,
  RADIUS_CHOICES,
  activeFilterCount,
  isFreshnessFilter,
  isIntentFilter,
  type MapFilters,
} from './discovery';

const ANY = '__any__';

export type MapView = 'map' | 'list';

export interface MapToolbarProps {
  status: string;
  loading: boolean;
  filters: MapFilters;
  radiusKm: number;
  radiusCap: number;
  onFilters: (patch: Partial<MapFilters>) => void;
  onClearFilters: () => void;
  view: MapView;
  onView: (view: MapView) => void;
  /** "Who has this near me": the card's name (null while it loads). */
  holdersTitle: string | null | undefined;
  onClearHolders: () => void;
}

/**
 * The Map tab's top bar: the status line ("8 collectors within 10 km"), the Map / List switch, the
 * search box (collectors by handle, name or tag text, like the web map's search) and the filters
 * as compact selects (game, intent, distance bounded by the plan, freshness, tags), then the "who
 * has this near me" banner. Controls stay off the top-right corner, where a development build
 * (Expo Go) floats its tools button. Filters never carry a position.
 */
export function MapToolbar({
  status,
  loading,
  filters,
  radiusKm,
  radiusCap,
  onFilters,
  onClearFilters,
  view,
  onView,
  holdersTitle,
  onClearHolders,
}: MapToolbarProps) {
  const { palette } = useTheme();
  const games = gamesFrom(useGames().data);
  const radii = [...new Set([...RADIUS_CHOICES.filter((km) => km <= radiusCap), radiusKm])].sort(
    (a, b) => a - b
  );
  const active = activeFilterCount(filters);
  const [searchOpen, setSearchOpen] = useState(filters.q.length > 0);
  const [text, setText] = useState(filters.q);
  // The search box re-queries after a pause, like the Search tab.
  useEffect(() => {
    const q = boundedQuery(text);
    if (q === filters.q) {
      return undefined;
    }
    const timer = setTimeout(() => onFilters({ q }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, filters.q, onFilters]);
  // "Clear filters" (and the clear button) also empty the box (render-time sync).
  const [lastQ, setLastQ] = useState(filters.q);
  if (lastQ !== filters.q) {
    setLastQ(filters.q);
    if (!filters.q && text) {
      setText('');
    }
  }
  // Curated tags (loaded once the pill opens; the tag list is short).
  const tags = useTagSearch('');

  return (
    <View
      style={[
        styles.bar,
        elevation.floating,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <View style={styles.statusRow}>
        <Text
          testID="map-status"
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          style={[textStyle('sm'), styles.grow, styles.strong, { color: palette.ink }]}
        >
          {status}
        </Text>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={palette.primary}
            accessibilityLabel="Loading collectors"
            testID="map-loading"
          />
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        accessibilityLabel="Map filters"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={view === 'map' ? 'List' : 'Map'}
          accessibilityHint={
            view === 'map' ? 'Shows the collectors as a list' : 'Shows the collectors on the map'
          }
          onPress={() => onView(view === 'map' ? 'list' : 'map')}
          testID="map-view-toggle"
          style={({ pressed }) => [
            styles.toggle,
            { backgroundColor: palette.accentContainer },
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons
            name={view === 'map' ? 'format-list-bulleted' : 'map-outline'}
            size={18}
            color={palette.onAccentContainer}
          />
          <Text style={[textStyle('sm'), styles.strong, { color: palette.onAccentContainer }]}>
            {view === 'map' ? 'List' : 'Map'}
          </Text>
        </Pressable>
        <SelectSheet
          compact
          label="Game"
          options={[
            { value: ANY, label: 'All games' },
            ...games.map((game) => ({ value: game.slug, label: game.label })),
          ]}
          value={filters.game ?? ANY}
          onChange={(value) => onFilters({ game: value === ANY ? null : value })}
          testID="map-filter-game"
        />
        <SelectSheet
          compact
          label="Intent"
          options={[{ value: ANY, label: 'Any intent' }, ...INTENT_FILTERS]}
          value={filters.intent ?? ANY}
          onChange={(value) => onFilters({ intent: isIntentFilter(value) ? value : null })}
          testID="map-filter-intent"
        />
        <SelectSheet
          compact
          label="Within"
          options={radii.map((km) => ({ value: String(km), label: `${km} km` }))}
          value={String(radiusKm)}
          onChange={(value) => onFilters({ radiusKm: Number(value) })}
          testID="map-filter-radius"
        />
        <SelectSheet
          compact
          label="Freshness"
          options={[{ value: ANY, label: 'Any freshness' }, ...FRESHNESS_FILTERS]}
          value={filters.freshness ?? ANY}
          onChange={(value) => onFilters({ freshness: isFreshnessFilter(value) ? value : null })}
          testID="map-filter-freshness"
        />
        <MultiSelectSheet
          label="Tags"
          options={(tags.data ?? []).map((tag) => ({ value: tag.slug, label: tag.label }))}
          values={filters.tags}
          onChange={(values) => onFilters({ tags: values })}
          loading={tags.isPending}
          emptyLabel="No tags around here yet"
          testID="map-filter-tags"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={searchOpen ? 'Hide the search box' : 'Search collectors'}
          aria-expanded={searchOpen}
          onPress={() => setSearchOpen((open) => !open)}
          testID="map-search-toggle"
          style={({ pressed }) => [
            styles.clear,
            { borderColor: palette.borderStrong },
            filters.q ? { backgroundColor: palette.accentContainer } : null,
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons name="magnify" size={16} color={palette.ink} />
          <Text style={[textStyle('sm'), { color: palette.ink }]}>
            {filters.q ? `“${filters.q}”` : 'Search'}
          </Text>
        </Pressable>
        {active > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear filters (${active})`}
            onPress={onClearFilters}
            testID="map-filters-clear"
            style={({ pressed }) => [
              styles.clear,
              { borderColor: palette.borderStrong },
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons name="filter-remove-outline" size={16} color={palette.ink} />
            <Text style={[textStyle('sm'), { color: palette.ink }]}>Clear ({active})</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {searchOpen ? (
        <View style={[styles.search, { borderColor: palette.borderStrong }]}>
          <MaterialCommunityIcons name="magnify" size={18} color={palette.textMuted} />
          <TextInput
            accessibilityLabel="Search collectors"
            placeholder="Handle, name or tag"
            placeholderTextColor={palette.textDisabled}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => onFilters({ q: boundedQuery(text) })}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            maxLength={QUERY_MAX_LENGTH}
            style={[textStyle('sm'), styles.searchInput, { color: palette.ink }]}
            testID="map-search-input"
          />
          {text ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear the search"
              onPress={() => {
                setText('');
                onFilters({ q: '' });
              }}
              hitSlop={8}
              testID="map-search-clear"
            >
              <MaterialCommunityIcons name="close-circle" size={18} color={palette.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {holdersTitle !== undefined ? (
        <View
          testID="map-holders"
          style={[styles.holders, { backgroundColor: palette.primaryContainer }]}
        >
          <MaterialCommunityIcons
            name="cards-outline"
            size={18}
            color={palette.onPrimaryContainer}
          />
          <Text
            numberOfLines={2}
            style={[
              textStyle('sm'),
              styles.grow,
              styles.strong,
              { color: palette.onPrimaryContainer },
            ]}
          >
            Who has {holdersTitle ?? 'this card'} near you
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show every collector"
            onPress={onClearHolders}
            hitSlop={8}
            testID="map-holders-clear"
          >
            <MaterialCommunityIcons name="close" size={20} color={palette.onPrimaryContainer} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing[2],
    gap: spacing[2],
  },
  holders: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[1],
  },
  grow: { flexShrink: 1, flexGrow: 1 },
  strong: { fontWeight: fontWeight.semibold },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    minHeight: 36,
  },
  filters: { gap: spacing[2], alignItems: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 40,
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  searchInput: { flex: 1, paddingVertical: spacing[1] },
  clear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    minHeight: 36,
  },
  pressed: { opacity: 0.8 },
});
