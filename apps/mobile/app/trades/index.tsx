import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { useTrades } from '@/src/api/hooks/trades';
import type { TradeSummary } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import {
  TRADES_FILTERS,
  parseTradesFilter,
  type TradesFilter,
} from '@/src/features/trades/tradeList';
import { TradeSummaryRow } from '@/src/features/trades/TradeSummaryRow';
import { spacing, useTheme } from '@/src/theme';

/**
 * My trades (the web's `/trades`): the deals agreed on, both sides, most recent activity first,
 * with a status filter (All / In progress / Completed / Cancelled), each row saying whose move it
 * is; cursor pages on scroll, pull to refresh, live re-reads on trade notifications.
 */
export default function TradesScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();
  const filter = parseTradesFilter(params.status);
  const trades = useTrades(filter);
  const items = useMemo(
    () => trades.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [trades.data]
  );
  const setFilter = (value: TradesFilter) => router.setParams({ status: value });
  const open = (trade: TradeSummary) =>
    router.push({ pathname: '/trades/[id]', params: { id: trade.id } });

  const header = (
    <View style={styles.header}>
      <ChoiceChips
        label="Trade status"
        hideLabel
        scroll
        options={TRADES_FILTERS}
        value={filter}
        onChange={setFilter}
        testID="trades-filter"
      />
      <Button
        label="My offers"
        icon="tag-outline"
        variant="secondary"
        onPress={() => router.push('/offers')}
        testID="trades-offers"
      />
    </View>
  );

  let empty;
  if (!trades.data) {
    empty = trades.error ? (
      <ErrorState
        testID="trades-error"
        error={trades.error}
        title="Your trades could not load"
        onRetry={() => void trades.refetch()}
      />
    ) : (
      <View accessibilityLabel="Loading trades" aria-busy>
        <SkeletonList rows={4} rowHeight={112} testID="trades-loading" />
      </View>
    );
  } else if (filter !== 'all') {
    empty = (
      <EmptyState
        testID="trades-empty-filter"
        icon="filter-off-outline"
        title="No trades with this status"
        description="Try another status to see the rest of your trades."
        actionLabel="Show all trades"
        onAction={() => setFilter('all')}
      />
    );
  } else {
    empty = (
      <EmptyState
        testID="trades-empty"
        icon="handshake-outline"
        title="No trades yet"
        description="A trade opens when an offer is accepted. Make an offer on a card near you, or answer the ones you receive."
        actionLabel="Open my offers"
        onAction={() => router.push('/offers')}
      />
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: palette.background }]} testID="screen-trades">
      <FlatList
        testID="trades-list"
        accessibilityLabel="Trades"
        data={items}
        keyExtractor={(trade) => trade.id}
        renderItem={({ item }) => <TradeSummaryRow trade={item} onPress={open} />}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          <ListFooter
            loading={trades.isFetchingNextPage}
            failed={trades.isFetchNextPageError}
            onRetry={() => void trades.fetchNextPage()}
            testID="trades-footer"
          />
        }
        onEndReached={() => {
          if (trades.hasNextPage && !trades.isFetchingNextPage && !trades.isFetchNextPageError) {
            void trades.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={trades.isRefetching && !trades.isFetchingNextPage}
            onRefresh={() => void trades.refetch()}
          />
        }
        contentContainerStyle={styles.content}
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing[4], paddingBottom: spacing[10], flexGrow: 1 },
  header: { gap: spacing[3], marginBottom: spacing[3] },
  separator: { height: spacing[2] },
});
