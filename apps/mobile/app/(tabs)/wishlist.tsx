import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useMyPlan } from '@/src/api/hooks/discovery';
import { useMyLocation } from '@/src/api/hooks/location';
import { useDeleteWish, useSetWishActive, useWishlist } from '@/src/api/hooks/wishlist';
import type { WishlistItemResponse } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Screen } from '@/src/components/ui/Screen';
import { Segmented } from '@/src/components/ui/Segmented';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { WishCard } from '@/src/features/wishlist/WishCard';
import {
  MatchReadinessNotice,
  WishlistSummary,
  filterWishes,
  matchReadiness,
  wishUsage,
  type WishFilter,
} from '@/src/features/wishlist/WishlistNotices';
import { spacing } from '@/src/theme';

/**
 * Wishlist tab (the web's `/wishlist`): the collector's wishes (card art, printing or "any
 * printing", criteria chips, match count, alerts switch, edit and remove), the plan usage, why
 * matches cannot arrive yet (no trading area, hidden from the map), filters (all, with matches,
 * paused) and "Add a card". Match counts stay live over realtime; each wish opens its matches.
 */
export default function WishlistScreen() {
  const router = useRouter();
  const snackbar = useSnackbar();
  const wishlist = useWishlist();
  const location = useMyLocation();
  const plan = useMyPlan();
  const setActive = useSetWishActive();
  const remove = useDeleteWish();
  const [filter, setFilter] = useState<WishFilter>('all');
  const [removing, setRemoving] = useState<WishlistItemResponse | null>(null);
  const items = useMemo(() => wishlist.data ?? [], [wishlist.data]);
  const visible = useMemo(() => filterWishes(items, filter), [items, filter]);
  const counts = useMemo(
    () => ({
      all: items.length,
      matches: items.filter((item) => item.matchCount > 0).length,
      paused: items.filter((item) => !item.active).length,
    }),
    [items]
  );
  const totalMatches = items.reduce((sum, item) => sum + (item.active ? item.matchCount : 0), 0);
  const busyId = setActive.isPending ? setActive.variables?.item.id : null;

  const add = () => router.push('/wishlist/new');

  const toggle = async (item: WishlistItemResponse, active: boolean) => {
    const name = item.card?.name ?? 'this wish';
    try {
      await setActive.mutateAsync({ item, active });
      snackbar.show(active ? `Alerts on for ${name}.` : `Alerts paused for ${name}.`);
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error', duration: 6000 });
    }
  };

  const confirmRemove = async () => {
    if (!removing) {
      return;
    }
    const name = removing.card?.name ?? 'this card';
    try {
      await remove.mutateAsync({ id: removing.id });
      snackbar.show(`${name} removed from your wishlist.`);
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error', duration: 6000 });
    } finally {
      setRemoving(null);
    }
  };

  let content;
  if (!wishlist.data) {
    content = wishlist.error ? (
      <ErrorState
        testID="wishlist-error"
        error={wishlist.error}
        title="Your wishlist could not load"
        onRetry={() => void wishlist.refetch()}
      />
    ) : (
      <View style={styles.padded} accessibilityLabel="Loading your wishlist" aria-busy>
        <SkeletonList rows={3} rowHeight={190} testID="wishlist-loading" />
      </View>
    );
  } else if (items.length === 0) {
    content = (
      <ScrollView contentContainerStyle={[styles.padded, styles.grow]}>
        <MatchReadinessNotice readiness={matchReadiness(location.data)} />
        <EmptyState
          testID="wishlist-empty"
          icon="heart-outline"
          title="Your wishlist is empty"
          description="Add the cards you are hunting for. We'll let you know as soon as a collector nearby lists one."
          actionLabel="Add a card"
          onAction={add}
        />
        <Button
          label="Browse cards"
          variant="secondary"
          onPress={() => router.navigate('/search')}
          testID="wishlist-browse"
        />
      </ScrollView>
    );
  } else {
    content = (
      <FlatList
        testID="wishlist-list"
        accessibilityLabel="Your wishlist"
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, styles.grow]}
        refreshControl={
          <RefreshControl
            refreshing={wishlist.isRefetching}
            onRefresh={() => {
              void wishlist.refetch();
              void location.refetch();
              void plan.refetch();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <MatchReadinessNotice readiness={matchReadiness(location.data)} />
            <WishlistSummary
              count={counts.all}
              matched={counts.matches}
              totalMatches={totalMatches}
              usage={wishUsage(plan.data)}
            />
            <Button label="Add a card" icon="plus" onPress={add} testID="wishlist-add" />
            <Segmented
              label="Show wishes"
              options={[
                { value: 'all', label: `All (${counts.all})` },
                { value: 'matches', label: `Matches (${counts.matches})` },
                { value: 'paused', label: `Paused (${counts.paused})` },
              ]}
              value={filter}
              onChange={setFilter}
              testID="wishlist-filter"
            />
          </View>
        }
        renderItem={({ item }) => (
          <WishCard
            item={item}
            busy={busyId === item.id || (remove.isPending && removing?.id === item.id)}
            onOpenMatches={() =>
              router.push({ pathname: '/wishlist/[id]', params: { id: item.id } })
            }
            onEdit={() => router.push({ pathname: '/wishlist/edit', params: { id: item.id } })}
            onRemove={() => setRemoving(item)}
            onActiveChange={(active) => void toggle(item, active)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            testID="wishlist-filter-empty"
            icon={filter === 'paused' ? 'bell-sleep-outline' : 'map-search-outline'}
            title={filter === 'paused' ? 'No paused wishes' : 'No matches nearby yet'}
            description={
              filter === 'paused'
                ? 'Every wish has its alerts on.'
                : 'When a collector near you lists a card you want, it shows up here.'
            }
            actionLabel="Show all wishes"
            onAction={() => setFilter('all')}
          />
        }
      />
    );
  }

  return (
    <Screen edgeToEdge testID="screen-wishlist">
      {content}
      <ConfirmDialog
        visible={!!removing}
        title={`Remove ${removing?.card?.name ?? 'this card'}?`}
        message="The wish and its matches are removed. You can add the card again later."
        confirmLabel="Remove"
        tone="danger"
        busy={remove.isPending}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
        testID="wish-remove-dialog"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  padded: { padding: spacing[4], gap: spacing[4] },
  list: { padding: spacing[4], gap: spacing[3] },
  // Empty states fill (and centre in) the rest of the screen instead of collapsing.
  grow: { flexGrow: 1 },
  header: { gap: spacing[3], marginBottom: spacing[1] },
});
