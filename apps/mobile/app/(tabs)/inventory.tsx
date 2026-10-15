import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useMyBinders } from '@/src/api/hooks/binders';
import {
  useBulkInventory,
  useInventoryItems,
  useInventorySummary,
} from '@/src/api/hooks/inventory';
import { useGames } from '@/src/api/hooks/profile';
import { useUid } from '@/src/api/hooks/useUid';
import type { InventoryItemResponse } from '@/src/api/types';
import { ConfirmSheet } from '@/src/components/ui/ConfirmSheet';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { PillButton } from '@/src/components/ui/PillButton';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text, TextInput } from '@/src/components/ui/Text';
import { UnderlineTabs } from '@/src/components/ui/UnderlineTabs';
import { InventoryBinders } from '@/src/features/binders/InventoryBinders';
import {
  bulkResultMessage,
  toBulkRequest,
  type BulkAction,
} from '@/src/features/inventory/bulkActions';
import { BulkBar } from '@/src/features/inventory/BulkBar';
import { showCardsDeleted } from '@/src/features/inventory/deleteToasts';
import { InventoryCardRow } from '@/src/features/inventory/InventoryCardRow';
import { BULK_COPY, INVENTORY_COPY } from '@/src/features/inventory/inventoryCopy';
import {
  InventoryFilterSheet,
  ownedGameSlugs,
} from '@/src/features/inventory/InventoryFilterSheet';
import { useInventoryUiStore } from '@/src/features/inventory/inventoryUiStore';
import { ListingsPausedBanner } from '@/src/features/inventory/ListingsPausedBanner';
import { NeedsConfirmationNotice } from '@/src/features/inventory/NeedsConfirmationNotice';
import { NotificationBell } from '@/src/features/notifications/NotificationBell';
import { boundedQuery, SEARCH_DEBOUNCE_MS } from '@/src/lib/catalog';
import {
  activeInventoryFilterCount,
  clearedFilters,
  DEFAULT_INVENTORY_FILTERS,
  isFiltered,
  type InventoryFilters,
} from '@/src/lib/inventoryFilters';
import {
  fontFamily,
  fontWeight,
  PINNED_MAX_FONT_SCALE,
  spacing,
  textStyle,
  TITLE_MAX_FONT_SCALE,
  useTheme,
} from '@/src/theme';

type View_ = 'cards' | 'binders';

/**
 * Inventory (owner spec 2026-10-14, section 6, mockup screen 1): the title, the bell and "Add
 * cards"; the switch "Cards {n} | Binders {n}"; on Cards, "Search your cards" with the filter
 * button (how many filters are on), "{n} cards · {n} copies · {n} public" with "Select", and rows
 * of only the picture, the name, the code, the asking price as typed and the copies. A row opens
 * Edit card. Select mode keeps Move to binder, Make public, Make private, Still available and
 * Delete. The listings-paused banner and the freshness notice stay. The Binders side is Inventory ›
 * Binders (section 7, screen 17, stage R3).
 */
export default function InventoryScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
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
  const summary = useInventorySummary();
  const binders = useMyBinders();
  // A text size changed while the app is open: React Native keeps the old measurements of the
  // header and of the list's header (clipped title, summary behind the header) until they mount
  // again, so the screen's content mounts again for each text size.
  const { fontScale } = useWindowDimensions();

  return (
    <View
      key={`text-size-${fontScale}`}
      testID="screen-inventory"
      style={[styles.screen, { backgroundColor: palette.background, paddingTop: insets.top }]}
    >
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
            style={[styles.title, { color: palette.ink }]}
          >
            {INVENTORY_COPY.title}
          </Text>
          <View style={styles.headerActions}>
            <NotificationBell testID="notification-bell-inventory" variant="round" />
            <PillButton
              label={INVENTORY_COPY.addCards}
              icon="plus"
              size="small"
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              onPress={() => router.push('/items/new')}
              testID="inventory-add-card"
            />
          </View>
        </View>
        <UnderlineTabs
          label={INVENTORY_COPY.viewLabel}
          tabs={[
            { value: 'cards', label: INVENTORY_COPY.cards, count: summary.data?.totalItems },
            { value: 'binders', label: INVENTORY_COPY.binders, count: binders.data?.length },
          ]}
          value={view}
          onChange={setView}
          testID="inventory-view"
        />
      </View>
      {view === 'cards' ? <CardsView /> : <InventoryBinders />}
    </View>
  );
}

function CardsView() {
  const router = useRouter();
  const { palette } = useTheme();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const uid = useUid();
  const [text, setText] = useState('');
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_INVENTORY_FILTERS);
  const [sheet, setSheet] = useState(false);
  const games = useGames();
  const binders = useMyBinders();
  const summary = useInventorySummary();
  const items = useInventoryItems(filters);
  const bulk = useBulkInventory();
  const lastSavedId = useInventoryUiStore((state) => state.lastSavedId);
  const markSaved = useInventoryUiStore((state) => state.markSaved);
  // Selection mode (the bulk bar).
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pulling, setPulling] = useState(false);

  // The orange ring of the card saved last lasts while the tab is on screen.
  useFocusEffect(useCallback(() => () => markSaved(null), [markSaved]));

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
  const filtered = isFiltered(filters);
  const filterCount = activeInventoryFilterCount(filters);
  const owned = useMemo(
    () => ownedGameSlugs(summary.data?.byGame, games.data),
    [games.data, summary.data?.byGame]
  );

  const open = useCallback(
    (item: InventoryItemResponse) =>
      router.push({ pathname: '/items/[id]', params: { id: item.id } }),
    [router]
  );
  const toggle = useCallback(
    (item: InventoryItemResponse) =>
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
      if (action.kind === 'delete') {
        setSelected(new Set());
        const skipped = new Set(response.skipped.map((entry) => entry.itemId));
        const deleted = ids.filter((id) => !skipped.has(id));
        if (deleted.length > 0) {
          showCardsDeleted({ snackbar, queryClient, uid, markSaved }, deleted);
        } else {
          snackbar.show(bulkResultMessage(action, response));
        }
      } else {
        snackbar.show(bulkResultMessage(action, response));
      }
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
    }
  };

  const clear = () => {
    setText('');
    setFilters(clearedFilters({ ...filters, q: '' }));
  };

  // No totals over an empty inventory ("0 cards · 0 copies"): its empty state says it.
  const totals =
    summary.data && summary.data.totalItems > 0
      ? INVENTORY_COPY.summary(
          summary.data.totalItems,
          summary.data.totalQuantity,
          summary.data.byVisibility.PUBLIC + summary.data.byVisibility.TEMPORARILY_PUBLIC
        )
      : null;

  let body;
  if (!items.data && items.error) {
    body = (
      <ErrorState
        testID="inventory-error"
        error={items.error}
        title={INVENTORY_COPY.loadError}
        onRetry={() => void items.refetch()}
      />
    );
  } else if (!items.data) {
    body = <SkeletonList rows={5} rowHeight={76} testID="inventory-loading" />;
  } else {
    body = (
      <FlatList
        testID="inventory-items"
        data={list}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <InventoryCardRow
            item={item}
            onPress={open}
            selectable={selecting}
            selected={selected.has(item.id)}
            onToggle={toggle}
            highlighted={item.id === lastSavedId}
          />
        )}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <View style={styles.header}>
            <ListingsPausedBanner />
            <NeedsConfirmationNotice />
            {list.length > 0 || totals ? (
              <View style={styles.summaryRow}>
                {totals ? (
                  <Text
                    testID="inventory-summary-totals"
                    style={[styles.summary, { color: palette.textMuted }]}
                  >
                    <Text style={[styles.summaryStrong, { color: palette.ink }]}>
                      {totals.cards}
                    </Text>
                    {totals.rest}
                  </Text>
                ) : (
                  <View style={styles.grow} />
                )}
                {list.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      selecting ? INVENTORY_COPY.doneSelecting : INVENTORY_COPY.select
                    }
                    onPress={selecting ? stopSelecting : () => setSelecting(true)}
                    hitSlop={8}
                    testID="inventory-select"
                    style={({ pressed }) => [styles.select, pressed && styles.pressed]}
                  >
                    <Text
                      maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
                      style={[styles.selectLabel, { color: palette.accent }]}
                    >
                      {selecting ? INVENTORY_COPY.doneSelecting : INVENTORY_COPY.select}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          filtered ? (
            <EmptyState
              testID="inventory-empty-filtered"
              icon="filter-remove-outline"
              title={INVENTORY_COPY.noMatchTitle}
              description={INVENTORY_COPY.noMatchBody}
              actionLabel={INVENTORY_COPY.noMatchAction}
              onAction={clear}
            />
          ) : (
            <EmptyState
              testID="inventory-empty"
              icon="cards-outline"
              title={INVENTORY_COPY.emptyTitle}
              description={INVENTORY_COPY.emptyBody}
              actionLabel={INVENTORY_COPY.emptyAction}
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
            // Only a pull shows the spinner: a refresh after a save happens out of sight.
            refreshing={pulling}
            onRefresh={() => {
              setPulling(true);
              void Promise.all([items.refetch(), summary.refetch()]).finally(() =>
                setPulling(false)
              );
            }}
          />
        }
        contentContainerStyle={styles.listContent}
      />
    );
  }

  return (
    <View style={styles.grow}>
      <View style={styles.tools}>
        <View
          style={[styles.search, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          <MaterialCommunityIcons name="magnify" size={18} color={palette.textMuted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={INVENTORY_COPY.searchPlaceholder}
            placeholderTextColor={palette.textMuted}
            accessibilityLabel={INVENTORY_COPY.searchPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            testID="inventory-search"
            style={[styles.searchInput, { color: palette.ink }]}
          />
          {text ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear the search"
              onPress={() => setText('')}
              hitSlop={8}
              testID="inventory-search-clear"
            >
              <MaterialCommunityIcons name="close-circle" size={18} color={palette.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={INVENTORY_COPY.filters(filterCount)}
          onPress={() => setSheet(true)}
          testID="inventory-filters-open"
          style={({ pressed }) => [
            styles.filterButton,
            { backgroundColor: palette.surface, borderColor: palette.border },
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons name="tune-variant" size={20} color={palette.ink} />
          {filterCount > 0 ? (
            <View
              style={[styles.badge, { backgroundColor: palette.primary }]}
              testID="inventory-filters-count"
            >
              <Text style={[styles.badgeText, { color: palette.onPrimary }]}>{filterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      <View style={styles.grow}>{body}</View>
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
      <InventoryFilterSheet
        visible={sheet}
        filters={filters}
        ownedGames={owned}
        games={games.data}
        binders={binders.data ?? []}
        onApply={(next) => {
          setSheet(false);
          setFilters({ ...next, q: filters.q });
        }}
        onClose={() => setSheet(false)}
      />
      <ConfirmSheet
        visible={confirmDelete}
        title={BULK_COPY.deleteTitle(selected.size)}
        message={BULK_COPY.deleteBody}
        confirmLabel={BULK_COPY.deleteConfirm}
        cancelLabel={BULK_COPY.keep}
        busy={bulk.isPending}
        onConfirm={() => void runBulk({ kind: 'delete' })}
        onCancel={() => setConfirmDelete(false)}
        testID="bulk-delete-sheet"
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[5],
    paddingBottom: spacing[3],
    gap: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.4,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  grow: { flex: 1 },
  tools: { flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[4] },
  search: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
  },
  searchInput: { flex: 1, minHeight: 42, fontSize: 15, paddingVertical: 0 },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: fontWeight.bold },
  header: { gap: spacing[3], marginBottom: spacing[2], marginTop: spacing[3] },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  summary: { ...textStyle('sm'), fontSize: 13, flexShrink: 1 },
  summaryStrong: { fontWeight: fontWeight.semibold },
  select: { minHeight: 32, justifyContent: 'center' },
  selectLabel: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  listContent: { paddingHorizontal: spacing[4], paddingBottom: spacing[6] },
  bulk: { paddingHorizontal: spacing[4], paddingBottom: spacing[2] },
  separator: { height: spacing[2] },
  pressed: { opacity: 0.8 },
});
