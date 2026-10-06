import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useCard } from '@/src/api/hooks/catalog';
import { useGames } from '@/src/api/hooks/profile';
import { useCardHolders, useDiscoveryCentre } from '@/src/api/hooks/search';
import type { CardDetail } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { Screen } from '@/src/components/ui/Screen';
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { SponsoredSlot } from '@/src/features/ads/SponsoredSlot';
import {
  DEFAULT_HOLDER_FILTERS,
  HOLDER_SORTS,
  activeHolderFilterCount,
  holdersCountLabel,
  isHolderSort,
  type HolderFilters,
} from '@/src/features/holders/holderFilters';
import { HolderFiltersSheet } from '@/src/features/holders/HolderFiltersSheet';
import { HolderRow } from '@/src/features/holders/HolderRow';
import { holdersTarget } from '@/src/features/map/discovery';
import { LimitReachedNotice } from '@/src/features/limits/LimitReachedNotice';
import { printingCode, printingImageUrl } from '@/src/lib/catalog';
import { isLimitReached } from '@/src/lib/limits';
import { gameLabel } from '@/src/lib/profile';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * "Who near me has this card" as a list (the web's `/search?card=|printing=` card-holders view,
 * `GET /search/card-holders`): the card, every filter and sort of the web (a sheet), the matching
 * public copies with their holders (approximate place and distance bucket only), paged. The map
 * stays the alternative view ("Show on the map": the Map tab with the same card filter).
 */
export default function HoldersScreen() {
  const params = useLocalSearchParams<{ card?: string; printing?: string }>();
  const target = useMemo(() => holdersTarget(params), [params]);
  const [filters, setFilters] = useState<HolderFilters>(DEFAULT_HOLDER_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const router = useRouter();
  const { palette } = useTheme();
  const games = useGames();
  const centre = useDiscoveryCentre();
  const holders = useCardHolders(target, filters);
  // The card: its picture, name and game schema (for the condition / edition / language values).
  const cardId = target?.kind === 'card' ? target.id : null;
  const card = useCard(cardId ?? resolvedCardId(holders.data?.pages[0]?.items));
  const printingOf = (detail: CardDetail | undefined) =>
    target?.kind === 'printing'
      ? (detail?.printings ?? []).find((printing) => printing.id === target.id)
      : undefined;
  const printing = printingOf(card.data);
  const schema = games.data?.find((game) => game.slug === card.data?.game)?.schema ?? null;
  const name = card.data?.name ?? 'this card';
  const heading = `Who has ${name}${printing ? ` (${printingCode(printing)})` : ''} near you`;
  const rows = useMemo(
    () => holders.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [holders.data]
  );
  const total = holders.data?.pages[0]?.totalItems ?? null;
  const active = activeHolderFilterCount(filters);
  const mapParams = target ? { [target.kind]: target.id } : {};

  if (!target) {
    return (
      <Screen safeBottom testID="screen-holders">
        <Stack.Screen options={{ title: 'Card holders' }} />
        <EmptyState
          testID="holders-no-card"
          icon="cards-outline"
          title="Choose a card first"
          description="Open a card and ask who has it near you."
          actionLabel="Search the catalog"
          onAction={() => router.navigate('/search')}
        />
      </Screen>
    );
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.hero}>
        <CardImage
          src={printingImageUrl(printing) ?? card.data?.primaryImageUrl ?? null}
          alt={name}
          game={card.data?.game}
          size="md"
        />
        <View style={styles.grow}>
          {card.data?.game ? (
            <Text style={[textStyle('xs'), styles.eyebrow, { color: palette.primary }]}>
              {gameLabel(card.data.game)}
            </Text>
          ) : null}
          <Text
            accessibilityRole="header"
            testID="holders-title"
            style={[textStyle('xl', 'heading'), styles.strong, { color: palette.ink }]}
          >
            {heading}
          </Text>
          <Text testID="holders-subtitle" style={[textStyle('sm'), { color: palette.textMuted }]}>
            {centre.city
              ? `Around ${centre.city.label}. Set your trading area to search near you.`
              : 'Collectors around your trading area. Places and distances are approximate.'}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          label="Show on the map"
          icon="map-marker-radius-outline"
          variant="secondary"
          onPress={() => router.navigate({ pathname: '/', params: mapParams })}
          style={styles.action}
          testID="holders-map"
        />
        {card.data?.id ? (
          <Button
            label="Card details"
            icon="cards-outline"
            variant="ghost"
            onPress={() =>
              router.push({ pathname: '/cards/[id]', params: { id: card.data?.id ?? '' } })
            }
            style={styles.action}
            testID="holders-card"
          />
        ) : null}
        <Button
          label="Add to wishlist"
          icon="heart-plus-outline"
          variant="ghost"
          onPress={() =>
            router.push({
              pathname: '/wishlist/new',
              params: {
                cardId: card.data?.id ?? '',
                printingId: target.kind === 'printing' ? target.id : '',
              },
            })
          }
          style={styles.action}
          testID="holders-wishlist"
        />
      </View>
      <View style={styles.toolbar}>
        <SelectSheet
          compact
          label="Sort"
          options={HOLDER_SORTS}
          value={filters.sort}
          onChange={(sort) =>
            setFilters((current) => ({ ...current, sort: isHolderSort(sort) ? sort : 'distance' }))
          }
          testID="holders-sort"
        />
        <Button
          label={active > 0 ? `Filters (${active})` : 'Filters'}
          icon="filter-variant"
          variant="secondary"
          onPress={() => setFiltersOpen(true)}
          style={styles.filterButton}
          testID="holders-filters"
        />
      </View>
      <Text
        testID="holders-count"
        accessibilityLiveRegion="polite"
        style={[textStyle('sm'), styles.strong, { color: palette.ink }]}
      >
        {holdersCountLabel(total)}
        {holders.isFetching && !holders.isFetchingNextPage && total !== null ? ' · updating…' : ''}
      </Text>
      <SponsoredSlot
        placement="SEARCH_SPONSORED"
        game={card.data?.game ?? null}
        variant="compact"
      />
    </View>
  );

  let body;
  if (!holders.data && holders.error) {
    body = isLimitReached(holders.error) ? (
      <View style={styles.pad}>
        <LimitReachedNotice error={holders.error} />
      </View>
    ) : (
      <ErrorState
        testID="holders-error"
        error={holders.error}
        title="Holders could not load"
        onRetry={() => void holders.refetch()}
      />
    );
  } else if (!holders.data) {
    body = <SkeletonList rows={3} rowHeight={150} testID="holders-loading" />;
  } else {
    body = (
      <FlatList
        testID="holders-list"
        data={rows}
        keyExtractor={(result) => result.item.id}
        renderItem={({ item }) => <HolderRow result={item} />}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={
          <EmptyState
            testID="holders-empty"
            icon="magnify-close"
            title="Nobody nearby lists this card with these filters"
            description="Widen the filters, or add it to your wishlist: we'll tell you when a collector nearby lists it."
            actionLabel={active > 0 ? 'Clear filters' : undefined}
            onAction={
              active > 0
                ? () => setFilters((current) => ({ ...DEFAULT_HOLDER_FILTERS, sort: current.sort }))
                : undefined
            }
          />
        }
        ListFooterComponent={
          <ListFooter
            loading={holders.isFetchingNextPage}
            failed={!!holders.error && holders.hasNextPage}
            onRetry={() => void holders.fetchNextPage()}
          />
        }
        onEndReached={() => {
          if (holders.hasNextPage && !holders.isFetchingNextPage && !holders.error) {
            void holders.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={holders.isRefetching && !holders.isFetchingNextPage}
            onRefresh={() => void holders.refetch()}
          />
        }
        contentContainerStyle={styles.listContent}
      />
    );
  }

  return (
    <Screen testID="screen-holders" style={styles.screen}>
      <Stack.Screen options={{ title: 'Card holders' }} />
      {header}
      <View style={styles.grow}>{body}</View>
      <HolderFiltersSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        conditions={schema?.conditions}
        editions={schema?.editions}
        languages={schema?.languages}
        onChange={setFilters}
      />
    </Screen>
  );
}

/** The card id of a printing target, read from the first result (the printing's card). */
function resolvedCardId(items: { item: { card: { id: string } } }[] | undefined): string | null {
  return items?.[0]?.item.card.id ?? null;
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  header: { gap: spacing[3], marginBottom: spacing[2] },
  hero: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' },
  grow: { flex: 1 },
  eyebrow: { fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  strong: { fontWeight: fontWeight.semibold },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  action: { minHeight: 40, paddingVertical: spacing[2], paddingHorizontal: spacing[3] },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  filterButton: { minHeight: 36, paddingVertical: spacing[1], paddingHorizontal: spacing[3] },
  pad: { paddingVertical: spacing[4] },
  listContent: { paddingBottom: spacing[6] },
  separator: { height: spacing[2] },
});
