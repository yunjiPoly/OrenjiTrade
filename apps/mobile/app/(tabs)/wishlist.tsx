import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useMyLocation, usePrivacySettings, useSavePrivacy } from '@/src/api/hooks/location';
import { useMyPlan } from '@/src/api/hooks/plan';
import { useDeleteWish, useWishlist } from '@/src/api/hooks/wishlist';
import type { WishlistItemResponse } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { WishCard } from '@/src/features/wishlist/WishCard';
import {
  AlertReadinessNotice,
  WishlistSummary,
  WishlistVisibilityRow,
  alertReadiness,
  wishUsage,
} from '@/src/features/wishlist/WishlistNotices';
import { whichCopyLabel } from '@/src/features/wishlist/wishlistLabels';
import { spacing } from '@/src/theme';

/**
 * Wishlist tab (stage S2, the web's `/wishlist`): a clean list of the collector's wishes (card
 * art, which copy, public note, "Near Mint only" and price term chips, edit, remove), the plan
 * usage, the "Let others see what you want" switch (privacy setting `wishlistVisible`) and, without
 * a location, a prompt to set country and state so wishlist alerts can arrive. No matches: a
 * wishlist alert opens the card page.
 */
export default function WishlistScreen() {
  const router = useRouter();
  const snackbar = useSnackbar();
  const wishlist = useWishlist();
  const location = useMyLocation();
  const privacy = usePrivacySettings();
  const savePrivacy = useSavePrivacy();
  const plan = useMyPlan();
  const remove = useDeleteWish();
  const [removing, setRemoving] = useState<WishlistItemResponse | null>(null);
  const items = useMemo(() => wishlist.data ?? [], [wishlist.data]);

  const add = () => router.push('/wishlist/new');

  const setVisible = async (visible: boolean) => {
    if (!privacy.data) {
      return;
    }
    try {
      await savePrivacy.mutateAsync({ ...privacy.data, wishlistVisible: visible });
      snackbar.show(
        visible
          ? 'Others can now see what you want on your profile.'
          : 'Your wishlist is hidden from others.'
      );
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error', duration: 6000 });
    }
  };

  const confirmRemove = async () => {
    if (!removing) {
      return;
    }
    const name = removing.card?.name ?? 'this card';
    const copy = whichCopyLabel(removing.printing, removing.rarity);
    try {
      await remove.mutateAsync({ id: removing.id });
      snackbar.show(`${name} (${copy}) removed from your wishlist.`);
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error', duration: 6000 });
    } finally {
      setRemoving(null);
    }
  };

  const header = (
    <View style={styles.header}>
      <AlertReadinessNotice readiness={alertReadiness(location.data)} />
      {privacy.data ? (
        <WishlistVisibilityRow
          visible={!!privacy.data.wishlistVisible}
          onChange={(visible) => void setVisible(visible)}
          disabled={savePrivacy.isPending}
        />
      ) : null}
    </View>
  );

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
        <SkeletonList rows={3} rowHeight={170} testID="wishlist-loading" />
      </View>
    );
  } else if (items.length === 0) {
    content = (
      <ScrollView contentContainerStyle={[styles.padded, styles.grow]}>
        {header}
        <EmptyState
          testID="wishlist-empty"
          icon="heart-outline"
          title="Your wishlist is empty"
          description="Add the cards you are hunting for. We'll let you know as soon as a collector of your region lists one."
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
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, styles.grow]}
        refreshControl={
          <RefreshControl
            refreshing={wishlist.isRefetching}
            onRefresh={() => {
              void wishlist.refetch();
              void location.refetch();
              void privacy.refetch();
              void plan.refetch();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {header}
            <WishlistSummary count={items.length} usage={wishUsage(plan.data)} />
            <Button label="Add a card" icon="plus" onPress={add} testID="wishlist-add" />
          </View>
        }
        renderItem={({ item }) => (
          <WishCard
            item={item}
            busy={remove.isPending && removing?.id === item.id}
            onEdit={() => router.push({ pathname: '/wishlist/edit', params: { id: item.id } })}
            onRemove={() => setRemoving(item)}
          />
        )}
      />
    );
  }

  return (
    <Screen edgeToEdge testID="screen-wishlist">
      {content}
      <ConfirmDialog
        visible={!!removing}
        title={`Remove ${removing?.card?.name ?? 'this card'}?`}
        message={`The wish for ${removing ? whichCopyLabel(removing.printing, removing.rarity) : 'this card'} is removed. You can add the card again later.`}
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
