import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { EMPTY_CARD_SEARCH, useCardSearch, type CardSearchQuery } from '@/src/api/hooks/catalog';
import { useGames } from '@/src/api/hooks/profile';
import { useUid } from '@/src/api/hooks/useUid';
import type { CardSummary } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { Screen } from '@/src/components/ui/Screen';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { TextField } from '@/src/components/ui/TextField';
import { SponsoredSlot } from '@/src/features/ads/SponsoredSlot';
import { CardFiltersSheet } from '@/src/features/catalog/CardFiltersSheet';
import { CardRow } from '@/src/features/catalog/CardRow';
import {
  extraFilterCount,
  hasCriteria,
  withFilter,
  withoutFilters,
  type CardFilterKey,
} from '@/src/features/catalog/cardSearch';
import { RecentSearches } from '@/src/features/catalog/RecentSearches';
import { useRecentSearchesStore } from '@/src/features/catalog/recentSearchesStore';
import {
  boundedQuery,
  PRINTING_CODE,
  QUERY_MAX_LENGTH,
  SEARCH_DEBOUNCE_MS,
} from '@/src/lib/catalog';
import { gamesFrom } from '@/src/lib/profile';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

const ALL_GAMES = '__all__';

type SearchParams = { q?: string; game?: string; set?: string };

/**
 * Search tab: the card catalog across games (the web's `/cards`): live, typo-tolerant search
 * (names, text, printing codes) with game pills and set / rarity / language / edition filters,
 * an infinite list of results with API pictures, and recent searches. Opening a result shows the
 * card detail.
 */
export default function SearchScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<SearchParams>();
  const uid = useUid();
  const remember = useRecentSearchesStore((state) => state.remember);
  const gamesQuery = useGames();
  const games = useMemo(() => gamesQuery.data ?? [], [gamesQuery.data]);

  const [text, setText] = useState(params.q ?? '');
  const [query, setQuery] = useState<CardSearchQuery>(() => fromParams(params));
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Links into the tab (a set on the card detail) replace the search, once per new link.
  const linkKey = `${params.q ?? ''}|${params.game ?? ''}|${params.set ?? ''}`;
  const [linked, setLinked] = useState(linkKey);
  if (linkKey !== linked) {
    setLinked(linkKey);
    setText(params.q ?? '');
    setQuery(fromParams(params));
  }

  // Live results while typing (debounced like the web's search field).
  useEffect(() => {
    const q = boundedQuery(text);
    if (q === query.q) {
      return undefined;
    }
    const timer = setTimeout(() => setQuery((current) => ({ ...current, q })), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, query.q]);

  const results = useCardSearch(query);
  const cards = useMemo(
    () => results.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [results.data]
  );
  const total = results.data?.pages[0]?.totalItems ?? 0;

  const search = (value: string) => {
    const q = boundedQuery(value);
    setText(value);
    setQuery((current) => ({ ...current, q }));
    if (uid && q) {
      remember(uid, q);
    }
  };

  const openCard = useCallback(
    (card: CardSummary) => {
      if (uid && query.q) {
        remember(uid, query.q);
      }
      if (card.id) {
        router.push({ pathname: '/cards/[id]', params: { id: card.id } });
      }
    },
    [query.q, remember, router, uid]
  );

  const onFilter = (key: CardFilterKey, value: string | null) =>
    setQuery((current) => withFilter(current, key, value, games));

  const clearAll = () => {
    setText('');
    setQuery(EMPTY_CARD_SEARCH);
  };

  const extra = extraFilterCount(query);
  const showRecent = text.trim().length === 0;

  const header = (
    <View style={styles.header}>
      {showRecent ? <RecentSearches uid={uid} onPick={search} /> : null}
      {results.data ? (
        <View style={styles.summary}>
          <Text
            testID="search-count"
            accessibilityLiveRegion="polite"
            style={[textStyle('sm'), { color: palette.textMuted }]}
          >
            {total} {total === 1 ? 'card' : 'cards'}
            {query.q ? ` for “${query.q}”` : ''}
            {results.isFetching && !results.isFetchingNextPage ? ' · updating…' : ''}
          </Text>
          {PRINTING_CODE.test(query.q) && total === 1 ? (
            <View style={[styles.badge, { backgroundColor: palette.accentContainer }]}>
              <MaterialCommunityIcons name="qrcode" size={14} color={palette.onAccentContainer} />
              <Text
                style={[textStyle('xs'), styles.badgeText, { color: palette.onAccentContainer }]}
              >
                Printing code match
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {query.q ? (
        <SponsoredSlot placement="SEARCH_SPONSORED" game={query.game ?? null} variant="compact" />
      ) : null}
    </View>
  );

  let body;
  if (!results.data && results.error) {
    body = (
      <ErrorState
        testID="search-error"
        error={results.error}
        title="Cards could not load"
        onRetry={() => void results.refetch()}
      />
    );
  } else if (!results.data) {
    body = <SearchSkeleton />;
  } else {
    body = (
      <FlatList
        testID="search-results"
        data={cards}
        keyExtractor={(card, index) => card.id ?? String(index)}
        renderItem={({ item }) => <CardRow card={item} onPress={openCard} />}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            testID="search-empty"
            icon="magnify-close"
            title="No cards match"
            description={
              query.q
                ? `Nothing matches “${query.q}”. Check the spelling, try fewer words or a printing code like AZR-EN001.`
                : 'No card matches these filters. Try another set or rarity.'
            }
            actionLabel={hasCriteria(query) ? 'Clear search and filters' : undefined}
            onAction={hasCriteria(query) ? clearAll : undefined}
          />
        }
        ListFooterComponent={
          <ListFooter
            loading={results.isFetchingNextPage}
            failed={!!results.error && results.hasNextPage}
            onRetry={() => void results.fetchNextPage()}
          />
        }
        onEndReached={() => {
          if (results.hasNextPage && !results.isFetchingNextPage && !results.error) {
            void results.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={results.isRefetching && !results.isFetchingNextPage}
            onRefresh={() => void results.refetch()}
          />
        }
        contentContainerStyle={styles.listContent}
      />
    );
  }

  return (
    <Screen testID="screen-search" style={styles.screen}>
      <View style={styles.controls}>
        <TextField
          label="Find a card"
          placeholder="Card name, text or printing code"
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => search(text)}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          maxLength={QUERY_MAX_LENGTH}
          testID="search-input"
        />
        <ChoiceChips
          label="Game"
          hideLabel
          scroll
          options={[
            { value: ALL_GAMES, label: 'All games' },
            ...gamesFrom(gamesQuery.data).map((game) => ({ value: game.slug, label: game.label })),
          ]}
          value={query.game ?? ALL_GAMES}
          onChange={(value) => onFilter('game', value === ALL_GAMES ? null : value)}
          testID="search-game"
        />
        <View style={styles.filterRow}>
          <Button
            label={extra > 0 ? `Filters (${extra})` : 'Filters'}
            icon="filter-variant"
            variant="secondary"
            onPress={() => setFiltersOpen(true)}
            style={styles.filterButton}
            testID="search-filters"
          />
          {hasCriteria(query) ? (
            <Button
              label="Clear"
              variant="ghost"
              onPress={clearAll}
              style={styles.filterButton}
              testID="search-clear"
            />
          ) : null}
        </View>
      </View>
      <View style={styles.fill}>{body}</View>
      <CardFiltersSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        query={query}
        games={games}
        onFilter={onFilter}
        onClear={() => setQuery((current) => ({ ...withoutFilters(current), game: current.game }))}
      />
    </Screen>
  );
}

function fromParams(params: SearchParams): CardSearchQuery {
  return {
    ...EMPTY_CARD_SEARCH,
    q: boundedQuery(params.q ?? ''),
    game: params.game || null,
    set: params.game && params.set ? params.set : null,
  };
}

function Separator() {
  return <View style={styles.separator} />;
}

function SearchSkeleton() {
  return (
    <View
      testID="search-loading"
      accessibilityLabel="Loading cards"
      aria-busy
      style={styles.skeleton}
    >
      {[0, 1, 2, 3].map((index) => (
        <View key={index} style={styles.skeletonRow}>
          <Skeleton width={56} height={78} radius={radius.sm} />
          <View style={styles.fill}>
            <Skeleton width="70%" height={16} />
            <Skeleton width="45%" height={12} style={styles.skeletonGap} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  controls: { gap: spacing[3], marginBottom: spacing[2] },
  filterRow: { flexDirection: 'row', gap: spacing[2] },
  filterButton: { minHeight: 40, paddingVertical: spacing[2], paddingHorizontal: spacing[4] },
  fill: { flex: 1 },
  header: { gap: spacing[3], marginBottom: spacing[2] },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing[2] },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: { fontWeight: fontWeight.semibold },
  listContent: { paddingBottom: spacing[6] },
  separator: { height: spacing[2] },
  skeleton: { gap: spacing[3], paddingTop: spacing[2] },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  skeletonGap: { marginTop: spacing[2] },
});
