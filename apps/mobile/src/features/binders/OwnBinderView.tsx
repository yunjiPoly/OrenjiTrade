import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import {
  useBinder,
  useBinderItems,
  useConfirmBinder,
  useDeleteBinder,
  usePublishBinder,
  useUnpublishBinder,
} from '@/src/api/hooks/binders';
import { useUpdateInventoryItem } from '@/src/api/hooks/inventory';
import { usePrivacySettings } from '@/src/api/hooks/location';
import type {
  BinderResponse,
  InventoryItemResponse,
  PublicInventoryItem,
  PublishMode,
} from '@/src/api/types';
import { Badge } from '@/src/components/ui/Badge';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Button } from '@/src/components/ui/Button';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { ItemRow } from '@/src/features/inventory/ItemRow';
import { binderVisibilityStatus, ownerIsVisible } from '@/src/features/inventory/visibilityStatus';
import {
  badgeFreshness,
  binderKindLabel,
  cardCount,
  PUBLISH_OPTIONS,
  publishedMessage,
} from '@/src/lib/inventory';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { AddItemsSheet } from './AddItemsSheet';

export interface OwnBinderViewProps {
  id: string;
}

/**
 * One of the collector's binders (web: the binder header + its cards on `/inventory`): status
 * and freshness, publish (1 hour / 24 hours / until disabled) or make private, rename, confirm,
 * delete, its public page, and its cards with "Add cards" and "Remove from binder".
 */
export function OwnBinderView({ id }: OwnBinderViewProps) {
  const router = useRouter();
  const binder = useBinder(id);
  const items = useBinderItems(id);

  const list = useMemo(
    () => items.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [items.data]
  );
  const open = useCallback(
    (item: InventoryItemResponse | PublicInventoryItem) =>
      router.push({ pathname: '/items/[id]', params: { id: item.id } }),
    [router]
  );

  if (!binder.data) {
    if (binder.error) {
      return binder.error.status === 404 ? (
        <EmptyState
          testID="binder-not-found"
          icon="book-open-page-variant-outline"
          title="Binder not found"
          description="It may have been deleted."
          actionLabel="Back to your binders"
          onAction={() => router.navigate({ pathname: '/inventory', params: { view: 'binders' } })}
        />
      ) : (
        <ErrorState
          testID="binder-error"
          error={binder.error}
          title="This binder could not load"
          onRetry={() => void binder.refetch()}
        />
      );
    }
    return <SkeletonList rows={4} rowHeight={72} testID="binder-loading" />;
  }

  const current = binder.data;
  return (
    <>
      <Stack.Screen options={{ title: current.name }} />
      <FlatList
        testID="binder-items"
        data={list}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ItemRow
            item={item}
            onPress={open}
            action={<RemoveFromBinder item={item} binder={current} />}
          />
        )}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <BinderHeader binder={current} total={items.data?.pages[0]?.totalItems ?? null} />
        }
        ListEmptyComponent={
          items.data ? (
            <EmptyState
              testID="binder-empty"
              icon="cards-outline"
              title="This binder is empty"
              description="Add cards you already have, or a new card from the catalog."
            />
          ) : items.error ? (
            <ErrorState
              compact
              testID="binder-items-error"
              error={items.error}
              title="The cards could not load"
              onRetry={() => void items.refetch()}
            />
          ) : (
            <SkeletonList rows={3} rowHeight={96} testID="binder-items-loading" />
          )
        }
        ListFooterComponent={
          <ListFooter
            loading={items.isFetchingNextPage}
            failed={!!items.error && items.hasNextPage}
            onRetry={() => void items.fetchNextPage()}
          />
        }
        onEndReached={() => {
          if (items.hasNextPage && !items.isFetchingNextPage && !items.error) {
            void items.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={binder.isRefetching || (items.isRefetching && !items.isFetchingNextPage)}
            onRefresh={() => {
              void binder.refetch();
              void items.refetch();
            }}
          />
        }
        contentContainerStyle={styles.content}
      />
    </>
  );
}

function BinderHeader({ binder, total }: { binder: BinderResponse; total: number | null }) {
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const privacy = usePrivacySettings();
  const publish = usePublishBinder();
  const unpublish = useUnpublishBinder();
  const confirm = useConfirmBinder();
  const remove = useDeleteBinder();
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);
  const status = binderVisibilityStatus(binder, { ownerVisible: ownerIsVisible(privacy.data) });
  const busy = publish.isPending || unpublish.isPending || confirm.isPending || remove.isPending;

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      snackbar.show(success);
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
    }
  };

  const doPublish = (mode: PublishMode) => {
    setPublishing(false);
    void run(
      () => publish.mutateAsync({ id: binder.id, mode }),
      publishedMessage(binder.name, mode)
    );
  };

  const doDelete = async () => {
    try {
      await remove.mutateAsync(binder.id);
      setDeleting(false);
      snackbar.show(`Binder “${binder.name}” deleted.`);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace({ pathname: '/inventory', params: { view: 'binders' } });
      }
    } catch (error) {
      setDeleting(false);
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
    }
  };

  const cards = cardCount(binder.itemCount);
  const counts =
    binder.visibility === 'PRIVATE' ? cards : `${cards} · ${binder.publicItemCount} public`;

  return (
    <View style={styles.header}>
      <View style={styles.titleBlock}>
        <Text
          accessibilityRole="header"
          testID="binder-title"
          style={[textStyle('2xl', 'heading'), styles.title, { color: palette.ink }]}
        >
          {binder.name}
        </Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="binder-counts">
          {binderKindLabel(binder.kind)} · {counts}
        </Text>
        {binder.description ? (
          <Text style={[textStyle('md'), { color: palette.ink }]}>{binder.description}</Text>
        ) : null}
      </View>

      <View
        testID="binder-status"
        style={[
          styles.status,
          {
            backgroundColor: palette.surfaceVariant,
            borderColor: status.pending ? palette.warning : palette.border,
          },
        ]}
      >
        <View style={styles.statusHead}>
          <MaterialCommunityIcons
            name={binder.visibility === 'PRIVATE' ? 'lock-outline' : 'earth'}
            size={18}
            color={status.pending ? palette.warning : palette.ink}
          />
          <Text
            testID="binder-visibility"
            style={[textStyle('md'), styles.bold, { color: palette.ink }]}
          >
            {status.label}
          </Text>
        </View>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{status.note}</Text>
        <View style={styles.statusHead}>
          <Badge variant="freshness" value={badgeFreshness(binder.freshness.state)} />
          <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
            {binder.freshness.label}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          label={binder.visibility === 'PRIVATE' ? 'Publish' : 'Change publication'}
          icon="earth"
          onPress={() => setPublishing(true)}
          disabled={busy}
          loading={publish.isPending}
          style={styles.action}
          testID="binder-publish"
        />
        {binder.visibility !== 'PRIVATE' ? (
          <Button
            label="Make private"
            icon="lock-outline"
            variant="secondary"
            onPress={() =>
              void run(() => unpublish.mutateAsync(binder.id), `“${binder.name}” is private now.`)
            }
            disabled={busy}
            loading={unpublish.isPending}
            style={styles.action}
            testID="binder-unpublish"
          />
        ) : null}
        {binder.freshness.state !== 'ACTIVE' ? (
          <Button
            label="Still up to date"
            icon="check-circle-outline"
            variant="secondary"
            onPress={() =>
              void run(
                () => confirm.mutateAsync(binder.id),
                `“${binder.name}” and its cards are confirmed as still available.`
              )
            }
            disabled={busy}
            loading={confirm.isPending}
            style={styles.action}
            testID="binder-confirm"
          />
        ) : null}
        <Button
          label="Edit"
          icon="pencil-outline"
          variant="secondary"
          onPress={() => router.push({ pathname: '/binders/edit', params: { id: binder.id } })}
          disabled={busy}
          style={styles.action}
          testID="binder-edit"
        />
        {binder.effectivePublic ? (
          <Button
            label="Public page"
            icon="open-in-new"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/binders/[id]', params: { id: binder.id, view: 'public' } })
            }
            style={styles.action}
            testID="binder-public-page"
          />
        ) : null}
        <Button
          label="Delete"
          icon="delete-outline"
          variant="ghost"
          onPress={() => setDeleting(true)}
          disabled={busy}
          style={styles.action}
          testID="binder-delete"
        />
      </View>

      <View style={styles.sectionHead}>
        <Text
          accessibilityRole="header"
          style={[textStyle('lg', 'heading'), styles.bold, { color: palette.ink }]}
        >
          Cards{total !== null ? ` (${total})` : ''}
        </Text>
        <Button
          label="Add cards"
          icon="plus"
          variant="secondary"
          onPress={() => setAdding(true)}
          style={styles.action}
          testID="binder-add-cards"
        />
      </View>

      <BottomSheet
        visible={publishing}
        onClose={() => setPublishing(false)}
        title="Publish this binder"
        testID="binder-publish-sheet"
      >
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          Publishing confirms the binder and its cards. Only cards set to public show to collectors.
        </Text>
        {PUBLISH_OPTIONS.map((option) => (
          <Button
            key={option.mode}
            label={option.label}
            variant="secondary"
            onPress={() => doPublish(option.mode)}
            testID={`binder-publish-${option.mode}`}
          />
        ))}
      </BottomSheet>

      <AddItemsSheet
        binder={binder}
        visible={adding}
        onClose={() => setAdding(false)}
        onNewCard={() => {
          setAdding(false);
          router.push({ pathname: '/items/new', params: { binderId: binder.id } });
        }}
      />

      <ConfirmDialog
        visible={deleting}
        title={`Delete “${binder.name}”?`}
        message={
          binder.itemCount > 0
            ? `Its ${cards} stay in your inventory as unfiled cards (private unless the binder was public without an end date).`
            : 'The binder is empty.'
        }
        confirmLabel="Delete binder"
        tone="danger"
        busy={remove.isPending}
        onConfirm={() => void doDelete()}
        onCancel={() => setDeleting(false)}
        testID="binder-delete-dialog"
      />
    </View>
  );
}

function RemoveFromBinder({
  item,
  binder,
}: {
  item: InventoryItemResponse | PublicInventoryItem;
  binder: BinderResponse;
}) {
  const { palette } = useTheme();
  const snackbar = useSnackbar();
  const update = useUpdateInventoryItem();
  const remove = async () => {
    try {
      await update.mutateAsync({ id: item.id, patch: { binderId: null } });
      snackbar.show(`${item.card.name} removed from “${binder.name}”. It is unfiled now.`);
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
    }
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Remove ${item.card.name} from the binder`}
      disabled={update.isPending}
      onPress={() => void remove()}
      hitSlop={6}
      testID={`binder-remove-${item.id}`}
      style={({ pressed }) => [styles.remove, (pressed || update.isPending) && styles.pressed]}
    >
      <MaterialCommunityIcons name="folder-remove-outline" size={22} color={palette.textMuted} />
    </Pressable>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  content: { padding: spacing[4], paddingBottom: spacing[8] },
  header: { gap: spacing[4], marginBottom: spacing[3] },
  titleBlock: { gap: spacing[1] },
  title: { fontWeight: fontWeight.bold },
  bold: { fontWeight: fontWeight.semibold },
  status: { gap: spacing[2], padding: spacing[3], borderRadius: radius.md, borderWidth: 1 },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  action: { minHeight: 40, paddingVertical: spacing[2], paddingHorizontal: spacing[3] },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.5 },
  separator: { height: spacing[2] },
});
