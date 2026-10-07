import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useDismissMatch, useWishMatches, useWishlist } from '@/src/api/hooks/wishlist';
import { CardImage } from '@/src/components/ui/CardImage';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { useMessageCollector } from '@/src/features/messages/useMessageCollector';
import { WishMatchCard } from '@/src/features/wishlist/WishMatchCard';
import {
  matchCountLabel,
  wishCriteriaChips,
  wishPrintingLabel,
} from '@/src/features/wishlist/wishlistLabels';
import { APPROXIMATE_LOCATION_NOTE } from '@/src/lib/approximateArea';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * The matches of one wish (the web's matches drawer of `/wishlist/:id`, also the deep link of
 * WISHLIST_MATCH notifications): who near you lists the card, newest first, with each
 * collector's approximate place and distance bucket, the listing and Message / View profile /
 * View binder / On the map / Dismiss. Cursor pages; new matches arrive live.
 */
export default function WishMatchesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const wishlist = useWishlist();
  const matches = useWishMatches(id);
  const dismiss = useDismissMatch(id ?? '');
  const { message, startingId } = useMessageCollector();
  const wish = wishlist.data?.find((item) => item.id === id) ?? null;
  const items = useMemo(
    () => matches.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [matches.data]
  );
  const name = wish?.card?.name ?? 'this card';

  const onDismiss = async (matchId: string) => {
    try {
      await dismiss.mutateAsync({ matchId });
      snackbar.show('Match dismissed.');
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
    }
  };

  let content;
  if (!matches.data && (matches.error?.status === 404 || (wishlist.data && !wish))) {
    content = (
      <EmptyState
        testID="wish-matches-not-found"
        icon="heart-off-outline"
        title="This wish no longer exists"
        description="It may have been removed from your wishlist."
        actionLabel="Back to your wishlist"
        onAction={() => router.navigate('/wishlist')}
      />
    );
  } else if (!matches.data && matches.error) {
    content = (
      <ErrorState
        testID="wish-matches-error"
        error={matches.error}
        title="Matches could not load"
        onRetry={() => void matches.refetch()}
      />
    );
  } else {
    content = (
      <FlatList
        testID="wish-matches"
        data={items}
        keyExtractor={(match) => match.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={matches.isRefetching && !matches.isFetchingNextPage}
            onRefresh={() => void matches.refetch()}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {wish ? (
              <View style={styles.wish} testID="wish-matches-head">
                <CardImage
                  src={wish.printing?.images?.[0]?.url ?? wish.card?.imageUrl}
                  alt={name}
                  game={wish.game}
                  size="sm"
                />
                <View style={styles.grow}>
                  <Text style={[textStyle('xs'), styles.strong, { color: palette.primary }]}>
                    Matches nearby
                  </Text>
                  <Text
                    accessibilityRole="header"
                    style={[textStyle('lg', 'heading'), styles.strong, { color: palette.ink }]}
                  >
                    Matches for {name}
                  </Text>
                  <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
                    {wishPrintingLabel(wish.printing)} ·{' '}
                    {wishCriteriaChips(wish)
                      .map((chip) => chip.label)
                      .join(' · ')}
                  </Text>
                </View>
              </View>
            ) : null}
            {matches.data && items.length > 0 ? (
              <Text
                testID="wish-matches-count"
                accessibilityLiveRegion="polite"
                style={[textStyle('sm'), { color: palette.textMuted }]}
              >
                {matchCountLabel(items.length)}
                {matches.hasNextPage ? ' so far' : ''}
              </Text>
            ) : null}
            {!matches.data ? (
              <SkeletonList rows={2} rowHeight={180} testID="wish-matches-loading" />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <WishMatchCard
            match={item}
            messaging={startingId === item.collector.id}
            dismissing={dismiss.isPending && dismiss.variables?.matchId === item.id}
            onMessage={() => void message(item.collector.id)}
            onDismiss={() => void onDismiss(item.id)}
          />
        )}
        onEndReached={() => {
          if (matches.hasNextPage && !matches.isFetchingNextPage && !matches.isFetchNextPageError) {
            void matches.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          matches.data ? (
            <EmptyState
              testID="wish-matches-empty"
              icon="map-search-outline"
              title="No matches yet"
              description={
                wish?.active === false
                  ? 'Alerts are paused for this wish: turn them back on to get matches.'
                  : `When a collector near you lists ${name}, it shows up here. You can also look on the map.`
              }
              actionLabel="Who has it on the map"
              onAction={() =>
                router.navigate({
                  pathname: '/',
                  params: wish?.printing?.id
                    ? { printing: wish.printing.id }
                    : { card: wish?.card?.id ?? '' },
                })
              }
            />
          ) : undefined
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {matches.hasNextPage ? (
              <ListFooter
                loading={matches.isFetchingNextPage}
                failed={matches.isFetchNextPageError}
                onRetry={() => void matches.fetchNextPage()}
                testID="wish-matches-more"
              />
            ) : null}
            <View style={styles.privacy}>
              <MaterialCommunityIcons
                name="shield-account-outline"
                size={16}
                color={palette.textMuted}
              />
              <Text style={[textStyle('xs'), styles.grow, { color: palette.textMuted }]}>
                Places and distances are approximate to protect privacy. {APPROXIMATE_LOCATION_NOTE}
                .
              </Text>
            </View>
          </View>
        }
      />
    );
  }

  return (
    <View
      testID="screen-wish-matches"
      style={[styles.fill, { backgroundColor: palette.background }]}
    >
      <Stack.Screen options={{ title: wish ? `Matches · ${name}` : 'Matches nearby' }} />
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // flexGrow: the empty state fills (and centres in) the rest of the screen.
  list: { padding: spacing[4], gap: spacing[3], flexGrow: 1 },
  header: { gap: spacing[3] },
  wish: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  grow: { flex: 1, gap: 2 },
  strong: { fontWeight: fontWeight.semibold },
  footer: { gap: spacing[3], paddingTop: spacing[2] },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
});
