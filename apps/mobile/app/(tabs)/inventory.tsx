import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useMyBinders } from '@/src/api/hooks/binders';
import {
  useBulkInventory,
  useInventoryItems,
  useInventorySummary,
} from '@/src/api/hooks/inventory';
import { usePrivacySettings } from '@/src/api/hooks/location';
import { useGames } from '@/src/api/hooks/profile';
import type { BinderResponse, InventoryItemResponse, PublicInventoryItem } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { Screen } from '@/src/components/ui/Screen';
import { Segmented } from '@/src/components/ui/Segmented';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { SponsoredSlot } from '@/src/features/ads/SponsoredSlot';
import { BinderRow } from '@/src/features/binders/BinderRow';
import { ReorderBindersSheet } from '@/src/features/binders/ReorderBindersSheet';
import {
  BULK_DELETE_MESSAGE,
  bulkDeleteTitle,
  bulkResultMessage,
  toBulkRequest,
  type BulkAction,
} from '@/src/features/inventory/bulkActions';
import { BulkBar } from '@/src/features/inventory/BulkBar';
import { InventoryFiltersBar } from '@/src/features/inventory/InventoryFiltersBar';
import { InventorySummaryStrip } from '@/src/features/inventory/InventorySummaryStrip';
import { ItemRow } from '@/src/features/inventory/ItemRow';
import { ListingsPausedBanner } from '@/src/features/inventory/ListingsPausedBanner';
import { ownerIsVisible } from '@/src/features/inventory/visibilityStatus';
import { boundedQuery, SEARCH_DEBOUNCE_MS } from '@/src/lib/catalog';
import {
  DEFAULT_INVENTORY_FILTERS,
  isFiltered,
  UNFILED,
  type InventoryFilters,
} from '@/src/lib/inventoryFilters';
import { spacing } from '@/src/theme';

type View_ = 'cards' | 'binders';

/**
 * Inventory tab (web: `/inventory`), built for managing cards on a phone: the collector's cards
 * with search, game / intent / visibility / binder filters and sorting, the totals and the cards
 * needing a confirmation, paused listings with "Resume", multi-select bulk actions (visibility,
 * move to a binder, availability, confirm, delete) and their binders (with reordering). Cards
 * open the editor; "Add card" starts the catalog search → printing → details flow.
 */
export default function InventoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<View_>(params.view === 'binders' ? 'binders' : 'cards');
  // A link into the tab (`?view=binders`) switches the view once per new parameter.
  const [linkedView, setLinkedView] = useState(params.view);
  if (params.view !== linkedView) {
    setLinkedView(params.view);
    if (params.view === 'binders' || params.view === 'cards') {
      setView(params.view);
    }
  }

  return (
    <Screen testID="screen-inventory" style={styles.screen}>
      <View style={styles.top}>
        <Segmented
          label="Inventory view"
          options={[
            { value: 'cards', label: 'Cards' },
            { value: 'binders', label: 'Binders' },
          ]}
          value={view}
          onChange={setView}
          style={styles.grow}
          testID="inventory-view"
        />
        {view === 'cards' ? (
          <Button
            label="Add card"
            icon="plus"
            onPress={() => router.push('/items/new')}
            style={styles.add}
            testID="inventory-add-card"
          />
        ) : (
          <Button
            label="New binder"
            icon="plus"
            onPress={() => router.push('/binders/new')}
            style={styles.add}
            testID="inventory-new-binder"
          />
        )}
      </View>
      {view === 'cards' ? <CardsView /> : <BindersView />}
    </Screen>
  );
}

function CardsView() {
  const router = useRouter();
  const snackbar = useSnackbar();
  const [text, setText] = useState('');
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_INVENTORY_FILTERS);
  const games = useGames();
  const binders = useMyBinders();
  const summary = useInventorySummary();
  const items = useInventoryItems(filters);
  const bulk = useBulkInventory();
  // Selection mode (web: the checkboxes of the grid and the bulk bar).
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const q = boundedQuery(text);
    if (q === filters.q) {
      return undefined;
    }
    const timer = setTimeout(
      () => setFilters((current) => ({ ...current, q })),
      SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [text, filters.q]);

  const list = useMemo(
    () => items.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [items.data]
  );
  const total = items.data?.pages[0]?.totalItems ?? 0;
  const unfiledCount = useMemo(() => {
    if (!summary.data || !binders.data) {
      return null;
    }
    const filed = binders.data.reduce((sum, binder) => sum + binder.itemCount, 0);
    return Math.max(0, summary.data.totalItems - filed);
  }, [binders.data, summary.data]);
  const filtered = isFiltered(filters);

  const open = useCallback(
    (item: InventoryItemResponse | PublicInventoryItem) =>
      router.push({ pathname: '/items/[id]', params: { id: item.id } }),
    [router]
  );
  const toggle = useCallback(
    (item: InventoryItemResponse | PublicInventoryItem) =>
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(item.id)) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
        return next;
      }),
    []
  );
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const allSelected = list.length > 0 && list.every((item) => selected.has(item.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(list.map((item) => item.id)));

  const runBulk = async (action: BulkAction) => {
    const ids = [...selected];
    if (ids.length === 0) {
      return;
    }
    if (action.kind === 'delete' && !confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setConfirmDelete(false);
    try {
      const response = await bulk.mutateAsync(toBulkRequest(action, ids));
      snackbar.show(bulkResultMessage(action, response));
      if (action.kind === 'delete') {
        setSelected(new Set());
      }
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
    }
  };

  const clear = () => {
    setText('');
    setFilters((current) => ({ ...DEFAULT_INVENTORY_FILTERS, sort: current.sort }));
  };

  const binderId = filters.binder && filters.binder !== UNFILED ? filters.binder : null;

  let body;
  if (!items.data && items.error) {
    body = (
      <ErrorState
        testID="inventory-error"
        error={items.error}
        title="Your cards could not load"
        onRetry={() => void items.refetch()}
      />
    );
  } else if (!items.data) {
    body = <SkeletonList rows={4} rowHeight={96} testID="inventory-loading" />;
  } else {
    body = (
      <FlatList
        testID="inventory-items"
        data={list}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ItemRow
            item={item}
            onPress={open}
            selectable={selecting}
            selected={selected.has(item.id)}
            onToggle={toggle}
          />
        )}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <View style={styles.header}>
            <ListingsPausedBanner />
            <InventorySummaryStrip />
            <SponsoredSlot placement="INVENTORY_SIDEBAR" game={filters.game} variant="compact" />
          </View>
        }
        ListEmptyComponent={
          filtered ? (
            <EmptyState
              testID="inventory-empty-filtered"
              icon="filter-remove-outline"
              title="No cards match"
              description="Try another search, game, intent or binder."
              actionLabel="Clear filters"
              onAction={clear}
            />
          ) : (
            <EmptyState
              testID="inventory-empty"
              icon="cards-outline"
              title="Your inventory is empty"
              description="Add the cards you own, trade or sell. They start private: publish them when you are ready."
              actionLabel="Add your first card"
              onAction={() => router.push('/items/new')}
            />
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
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={items.isRefetching && !items.isFetchingNextPage}
            onRefresh={() => {
              void items.refetch();
              void summary.refetch();
            }}
          />
        }
        contentContainerStyle={styles.listContent}
        accessibilityLabel={`${total} ${total === 1 ? 'card' : 'cards'}`}
      />
    );
  }

  return (
    <View style={styles.grow}>
      <InventoryFiltersBar
        text={text}
        onText={setText}
        filters={filters}
        onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        onClear={clear}
        games={games.data}
        binders={binders.data ?? []}
        unfiledCount={unfiledCount}
        filtered={filtered}
      />
      {binderId ? (
        <Button
          label="Open this binder"
          icon="book-open-page-variant-outline"
          variant="ghost"
          onPress={() => router.push({ pathname: '/binders/[id]', params: { id: binderId } })}
          style={styles.binderLink}
          testID="inventory-open-binder"
        />
      ) : null}
      {items.data && list.length > 0 ? (
        <Button
          label={selecting ? 'Done selecting' : 'Select'}
          icon={selecting ? 'check' : 'checkbox-multiple-marked-outline'}
          variant="ghost"
          onPress={selecting ? stopSelecting : () => setSelecting(true)}
          style={styles.binderLink}
          testID="inventory-select"
        />
      ) : null}
      <View style={[styles.grow, styles.listTop]}>{body}</View>
      {selecting && selected.size > 0 ? (
        <View style={styles.bulk}>
          <BulkBar
            count={selected.size}
            allSelected={allSelected}
            busy={bulk.isPending}
            binders={binders.data ?? []}
            onAction={(action) => void runBulk(action)}
            onToggleAll={toggleAll}
            onClear={() => setSelected(new Set())}
          />
        </View>
      ) : null}
      <ConfirmDialog
        visible={confirmDelete}
        title={bulkDeleteTitle(selected.size)}
        message={BULK_DELETE_MESSAGE}
        confirmLabel="Delete"
        tone="danger"
        busy={bulk.isPending}
        onConfirm={() => void runBulk({ kind: 'delete' })}
        onCancel={() => setConfirmDelete(false)}
        testID="bulk-delete-dialog"
      />
    </View>
  );
}

function BindersView() {
  const router = useRouter();
  const binders = useMyBinders();
  const privacy = usePrivacySettings();
  const ownerVisible = ownerIsVisible(privacy.data);
  const [reordering, setReordering] = useState(false);
  const open = (binder: BinderResponse) =>
    router.push({ pathname: '/binders/[id]', params: { id: binder.id } });

  if (!binders.data && binders.error) {
    return (
      <ErrorState
        testID="binders-error"
        error={binders.error}
        title="Your binders could not load"
        onRetry={() => void binders.refetch()}
      />
    );
  }
  if (!binders.data) {
    return <SkeletonList rows={3} rowHeight={80} testID="binders-loading" />;
  }
  return (
    <FlatList
      testID="binders-list"
      data={binders.data}
      keyExtractor={(binder) => binder.id}
      renderItem={({ item }) => (
        <BinderRow binder={item} ownerVisible={ownerVisible} onPress={open} />
      )}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={
        <>
          <ListingsPausedBanner />
          {binders.data.length > 1 ? (
            <Button
              label="Reorder"
              icon="swap-vertical"
              variant="ghost"
              onPress={() => setReordering(true)}
              style={styles.binderLink}
              testID="binders-reorder"
            />
          ) : null}
          <ReorderBindersSheet
            visible={reordering}
            binders={binders.data}
            onClose={() => setReordering(false)}
          />
        </>
      }
      ListHeaderComponentStyle={styles.header}
      ListEmptyComponent={
        <EmptyState
          testID="binders-empty"
          icon="book-open-page-variant-outline"
          title="No binders yet"
          description="Binders group your cards (a trade binder, cards for sale, a deck). New binders are private until you publish them."
          actionLabel="Create a binder"
          onAction={() => router.push('/binders/new')}
        />
      }
      refreshControl={
        <RefreshControl
          refreshing={binders.isRefetching}
          onRefresh={() => void binders.refetch()}
        />
      }
      contentContainerStyle={styles.listContent}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, gap: spacing[3] },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  grow: { flex: 1 },
  add: { minHeight: 44, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  binderLink: { alignSelf: 'flex-start', minHeight: 36, paddingVertical: spacing[1] },
  listTop: { marginTop: spacing[2] },
  bulk: { paddingBottom: spacing[2] },
  header: { gap: spacing[3], marginBottom: spacing[3] },
  listContent: { paddingBottom: spacing[6] },
  separator: { height: spacing[2] },
});
