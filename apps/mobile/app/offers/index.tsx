import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useOffers } from '@/src/api/hooks/offers';
import type { OfferSummary } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { Segmented } from '@/src/components/ui/Segmented';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import {
  INBOX_FILTERS,
  INBOX_TABS,
  parseInboxQuery,
  type InboxFilter,
  type InboxQuery,
  type InboxTab,
} from '@/src/features/offers/offerInbox';
import { OfferSummaryRow } from '@/src/features/offers/OfferSummaryRow';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * My offers (the web's `/offers`): Received (offers on the caller's cards) and Sent, a status
 * filter (All / Active / Accepted / Closed, so EXPIRED, DECLINED and withdrawn offers stay
 * reachable), how many wait for the caller's answer, links to the trades and the offer
 * settings; cursor pages on scroll, pull to refresh, live re-reads on offer notifications.
 */
export default function OffersScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; status?: string }>();
  const query = parseInboxQuery(params);
  const offers = useOffers(query);
  const items = useMemo(
    () => offers.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [offers.data]
  );
  const yourTurn = items.filter((offer) => offer.yourTurn).length;

  const change = (next: Partial<InboxQuery>) => {
    const merged = { ...query, ...next };
    router.setParams({ tab: merged.tab, status: merged.filter });
  };
  const open = (offer: OfferSummary) =>
    router.push({ pathname: '/offers/[id]', params: { id: offer.id } });

  const header = (
    <View style={styles.header}>
      <Segmented
        label="Offer lists"
        options={INBOX_TABS}
        value={query.tab}
        onChange={(tab: InboxTab) => change({ tab })}
        testID="offers-tab"
      />
      <ChoiceChips
        label="Offer status"
        hideLabel
        scroll
        options={INBOX_FILTERS}
        value={query.filter}
        onChange={(filter: InboxFilter) => change({ filter })}
        testID="offers-filter"
      />
      {yourTurn > 0 ? (
        <View style={styles.turns} accessibilityLiveRegion="polite" testID="offers-your-turn">
          <MaterialCommunityIcons name="bell-ring-outline" size={18} color={palette.primary} />
          <Text style={[textStyle('sm'), styles.strong, { color: palette.primary }]}>
            {yourTurn} {yourTurn === 1 ? 'offer waits' : 'offers wait'} for your answer
          </Text>
        </View>
      ) : null}
      <View style={styles.links}>
        <Button
          label="My trades"
          icon="swap-horizontal-bold"
          variant="secondary"
          onPress={() => router.push('/trades')}
          style={styles.grow}
          testID="offers-trades"
        />
        <Button
          label="Offer settings"
          icon="tune-variant"
          variant="ghost"
          onPress={() => router.push('/settings/offers')}
          style={styles.grow}
          testID="offers-settings"
        />
      </View>
    </View>
  );

  let empty;
  if (!offers.data) {
    empty = offers.error ? (
      <ErrorState
        testID="offers-error"
        error={offers.error}
        title="Your offers could not load"
        onRetry={() => void offers.refetch()}
      />
    ) : (
      <View accessibilityLabel="Loading offers" aria-busy>
        <SkeletonList rows={4} rowHeight={112} testID="offers-loading" />
      </View>
    );
  } else if (query.filter !== 'all') {
    empty = (
      <EmptyState
        testID="offers-empty-filter"
        icon="filter-off-outline"
        title="No offers with this status"
        description="Try another status to see the rest of your offers."
        actionLabel="Show all offers"
        onAction={() => change({ filter: 'all' })}
      />
    );
  } else if (query.tab === 'sent') {
    empty = (
      <EmptyState
        testID="offers-empty-sent"
        icon="tag-outline"
        title="You have not made any offer yet"
        description="Find a card near you on the map or in a public binder, then press “Make an offer”."
        actionLabel="Explore the map"
        onAction={() => router.navigate('/')}
      />
    );
  } else {
    empty = (
      <EmptyState
        testID="offers-empty-received"
        icon="inbox-arrow-down-outline"
        title="No offers on your cards yet"
        description="Publish cards that accept offers: collectors nearby can then make you one."
        actionLabel="Open my inventory"
        onAction={() => router.navigate('/inventory')}
      />
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: palette.background }]} testID="screen-offers">
      <FlatList
        testID="offers-list"
        accessibilityLabel={query.tab === 'sent' ? 'Offers you sent' : 'Offers you received'}
        data={items}
        keyExtractor={(offer) => offer.id}
        renderItem={({ item }) => <OfferSummaryRow offer={item} onPress={open} />}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          <ListFooter
            loading={offers.isFetchingNextPage}
            failed={offers.isFetchNextPageError}
            onRetry={() => void offers.fetchNextPage()}
            testID="offers-footer"
          />
        }
        onEndReached={() => {
          if (offers.hasNextPage && !offers.isFetchingNextPage && !offers.isFetchNextPageError) {
            void offers.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={offers.isRefetching && !offers.isFetchingNextPage}
            onRefresh={() => void offers.refetch()}
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
  turns: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  strong: { fontWeight: fontWeight.semibold },
  links: { flexDirection: 'row', gap: spacing[2] },
  grow: { flex: 1 },
  separator: { height: spacing[2] },
});
