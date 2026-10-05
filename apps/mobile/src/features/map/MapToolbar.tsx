import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useGames } from '@/src/api/hooks/profile';
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { gamesFrom } from '@/src/lib/profile';
import { elevation, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  INTENT_FILTERS,
  RADIUS_CHOICES,
  activeFilterCount,
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
 * The Map tab's top bar: the status line ("8 collectors within 10 km"), the "who has this near
 * me" banner, and the filters as compact selects (game, intent, distance bounded by the plan) next
 * to the Map / List switch. Filters never carry a position.
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

  return (
    <View
      style={[
        styles.bar,
        elevation.floating,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
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
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        accessibilityLabel="Map filters"
      >
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
