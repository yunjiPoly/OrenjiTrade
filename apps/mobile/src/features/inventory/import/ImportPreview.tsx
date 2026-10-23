import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import {
  loadedRows,
  useBulkImport,
  useCommitImport,
  useDiscardImport,
  useImportEditsPending,
  useImportRows,
  useUpdateImportRow,
  useUpdateImportSections,
  type ImportRowFilter,
} from '@/src/api/hooks/inventoryImport';
import { useMyLimits } from '@/src/api/hooks/limits';
import { useGames } from '@/src/api/hooks/profile';
import { useUid } from '@/src/api/hooks/useUid';
import { meKeys } from '@/src/api/queryKeys';
import type { ImportRow, InventoryImport, UpdateImportRowRequest } from '@/src/api/types';
import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { ConfirmSheet } from '@/src/components/ui/ConfirmSheet';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { PillButton } from '@/src/components/ui/PillButton';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { LimitReachedNotice } from '@/src/features/limits/LimitReachedNotice';
import { SettingsTopBar } from '@/src/features/settings/SettingsPage';
import { isLimitReached, limitReachedInfo } from '@/src/lib/limits';
import { PINNED_MAX_FONT_SCALE, fontWeight, spacing, useTheme } from '@/src/theme';

import { IMPORT_COPY } from './importCopy';
import { ImportConditionSheet } from './ImportConditionSheet';
import { ImportPreviewHeader } from './ImportPreviewHeader';
import { ImportPrintingSheet } from './ImportPrintingSheet';
import { ImportRowCard } from './ImportRowCard';
import { ImportRowEditDialog } from './ImportRowEditDialog';
import {
  SAVING_CHANGES,
  commitState,
  conditionSetMessage,
  emptyFilterText,
  filterOptions,
  limitRefusalText,
  lineNoun,
  mostRecentMessage,
  limitRoomText,
  needPrintingBar,
  pluralLines,
  rowTitle,
  sectionsLine,
} from './importLabels';

/** A preview the API no longer has: it expired (410) or was purged or replaced (404). */
export function isImportGone(error: unknown): boolean {
  const code = (error as ApiError | null)?.errorCode;
  return code === 'IMPORT_EXPIRED' || code === 'NOT_FOUND';
}

export interface ImportPreviewProps {
  preview: InventoryImport;
  /** The name of the file this phone sent, when it sent one (memory only). */
  fileName?: string | null;
  /** The top bar's back (the screen's leave guard asks first). */
  onBack: () => void;
  /** The preview expired or is gone: the flow starts over. */
  onGone: () => void;
  /** The preview was discarded by the collector. */
  onDiscarded: () => void;
  /**
   * A change of this card reached the API after the import had been added (it was committed
   * elsewhere meanwhile): the change is not in it, and the result says so.
   */
  onLateEdit?: (card: string | null) => void;
}

/**
 * The preview of an import: its counts and bulk actions on top, its lines as a long list that
 * stays fast (a virtualised list fed page by page), and the commit at the bottom, always in reach.
 *
 * The filter stays on screen above the list, and choosing one brings its first line up: the lines
 * that need the collector are one press away from anywhere in a long file, and so are the lines
 * whose copy was assumed for them, for as long as one is unchecked.
 *
 * Every edit is sent as it is made and answers with the new counts. The commit button says what a
 * press does; while lines still need a printing it is disabled and says why, unless the collector
 * ticked "leave them out": no card is left out without it having been said. While an edit is
 * still being saved the button waits ("Saving your changes…"), and the commit itself queues
 * behind the edits: what the collector sees as left out is never imported.
 */
export function ImportPreview({
  preview,
  fileName = null,
  onBack,
  onGone,
  onDiscarded,
  onLateEdit,
}: ImportPreviewProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const uid = useUid();
  const [filter, setFilter] = useState<ImportRowFilter>('ALL');
  const rows = useImportRows(preview.id, filter);
  const games = useGames();
  const updateRow = useUpdateImportRow(preview.id);
  const updateSections = useUpdateImportSections(preview.id);
  const bulk = useBulkImport(preview.id);
  const commit = useCommitImport(preview.id);
  const discard = useDiscardImport();
  // Edits that are on their way to the API, or wait their turn behind another one.
  const saving = useImportEditsPending(preview.id) > 0;
  const limits = useMyLimits({ fresh: true });
  const listRef = useRef<FlatList<ImportRow>>(null);
  const [printingRowId, setPrintingRowId] = useState<string | null>(null);
  const [editRowId, setEditRowId] = useState<string | null>(null);
  const [conditionSheet, setConditionSheet] = useState(false);
  const [leaveOut, setLeaveOut] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const list = useMemo(() => loadedRows(rows.data), [rows.data]);
  // Cards that stand on more than one line: those lines say what the file said (stage R14).
  const twins = useMemo(() => {
    const seen = new Set<string>();
    const twice = new Set<string>();
    for (const row of list) {
      const id = row.card?.id;
      if (id) {
        if (seen.has(id)) {
          twice.add(id);
        }
        seen.add(id);
      }
    }
    return twice;
  }, [list]);
  const printingRow = list.find((row) => row.id === printingRowId) ?? null;
  const editRow = list.find((row) => row.id === editRowId) ?? null;
  const committing = commit.isPending;
  const wholeBusy = updateSections.isPending || bulk.isPending || committing;

  /**
   * What an edit the API refused means: start over, show the result, or just say it. `row` is the
   * line the edit was about, when it was about one.
   */
  const refused = useCallback(
    (error: unknown, row?: ImportRow) => {
      const apiError = error as ApiError;
      if (isImportGone(apiError)) {
        onGone();
        return;
      }
      if (apiError.errorCode === 'IMPORT_ALREADY_COMMITTED') {
        // Committed elsewhere in the meantime: the change came too late and is not in the import.
        // The import is read again and shows its result, which says so.
        onLateEdit?.(row ? rowTitle(row) : null);
        void queryClient.invalidateQueries({ queryKey: meKeys.importOne(uid, preview.id) });
        return;
      }
      snackbar.show(friendlyMessage(apiError), { tone: 'error' });
    },
    [onGone, onLateEdit, preview.id, queryClient, snackbar, uid]
  );

  const { mutateAsync: sendRow } = updateRow;
  const patchRow = useCallback(
    (row: ImportRow, patch: UpdateImportRowRequest, done?: () => void) => {
      // Awaited call by call: several lines can be edited before the first answer is back, and
      // each refusal is said.
      sendRow({ row, patch }).then(
        () => {
          setFailure(null);
          done?.();
        },
        (error: unknown) => refused(error, row)
      );
    },
    [refused, sendRow]
  );

  const toggle = useCallback(
    (row: ImportRow) => patchRow(row, { included: !row.included }),
    [patchRow]
  );
  const openPrinting = useCallback((row: ImportRow) => setPrintingRowId(row.id), []);
  const openEdit = useCallback((row: ImportRow) => setEditRowId(row.id), []);

  const mostRecent = () =>
    bulk.mutate(
      { action: 'USE_MOST_RECENT_PRINTING' },
      {
        onSuccess: ({ updated, assumed, undecided }) => {
          setFailure(null);
          snackbar.show(mostRecentMessage(updated, assumed, undecided, preview.source));
        },
        onError: (error) => refused(error),
      }
    );

  const setCondition = (condition: string) => {
    setConditionSheet(false);
    bulk.mutate(
      { action: 'SET_CONDITION', condition },
      {
        onSuccess: ({ updated }) => snackbar.show(conditionSetMessage(updated, condition)),
        onError: (error) => refused(error),
      }
    );
  };

  const submit = async () => {
    if (saving) {
      // The counts on screen are not the API's yet: the button waits for the edits.
      return;
    }
    setFailure(null);
    try {
      await commit.mutateAsync({ skipUnresolved: leaveOut && preview.summary.toChoose > 0 });
    } catch (error) {
      const apiError = error as ApiError;
      if (isImportGone(apiError)) {
        onGone();
        return;
      }
      // The answer may have been lost on its way back: the import says where it stands (a commit
      // that went through shows its result; pressing again never adds anything twice).
      void queryClient.invalidateQueries({ queryKey: meKeys.importOne(uid, preview.id) });
      if (apiError.errorCode === 'IMPORT_ROWS_UNRESOLVED') {
        void queryClient.invalidateQueries({ queryKey: meKeys.importRows(uid, preview.id) });
      }
      setFailure(apiError);
    }
  };

  const confirmDiscardNow = async () => {
    try {
      await discard.mutateAsync(preview.id);
      setConfirmDiscard(false);
      snackbar.show('Import discarded. Nothing was added.');
      onDiscarded();
    } catch (error) {
      setConfirmDiscard(false);
      if (isImportGone(error)) {
        onGone();
      } else {
        refused(error);
      }
    }
  };

  const state = commitState(preview.summary, leaveOut, preview.source);
  const limited: boolean = isLimitReached(failure);
  const schemaOf = (game: string | null | undefined) =>
    games.data?.find((candidate) => candidate.slug === game)?.schema?.conditions;
  const empty = emptyFilterText(filter);
  // The lowest grade of each game: where a line whose file names no condition starts.
  const lowestGrades = (games.data ?? [])
    .map((game) => game.schema?.conditions?.slice(-1)[0])
    .filter((grade): grade is string => !!grade);
  const room = limits.data?.limits?.find((limit) => limit.key === 'inventory.items.max');
  const limitRoom = limitRoomText(preview.summary, room?.limit == null ? null : room.remaining);
  const { summary } = preview;
  const what = [
    fileName ?? IMPORT_COPY.fileFallback[preview.source],
    preview.sections ? sectionsLine(preview.sections) : pluralLines(summary.rows, preview.source),
  ];

  /** A filter from the chips that stay on screen: the list starts at its first line. */
  const chooseFilter = (next: ImportRowFilter) => {
    setFilter(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  // Mockup v50 screen 67: the lines come right under the amber bar. What the limit has no room
  // for is said first (before printings are chosen for a long file); the other choices follow
  // the lines.
  const header = limitRoom ? (
    <View style={styles.limitRoom}>
      <FormMessage tone="info" testID="import-limit-room">
        {limitRoom}
      </FormMessage>
    </View>
  ) : null;
  const more = (
    <ImportPreviewHeader
      preview={preview}
      onFilter={chooseFilter}
      onSections={(patch) => updateSections.mutate(patch, { onError: (error) => refused(error) })}
      onCondition={() => setConditionSheet(true)}
      leaveOut={leaveOut}
      onLeaveOut={setLeaveOut}
      busy={wholeBusy}
      lowestGrades={lowestGrades}
      limitRoom={null}
    />
  );

  const discardButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={IMPORT_COPY.discard}
      disabled={committing}
      onPress={() => setConfirmDiscard(true)}
      testID="import-discard"
      style={({ pressed }) => [styles.trash, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name="trash-can-outline" size={22} color={palette.textMuted} />
    </Pressable>
  );

  return (
    <View
      style={[styles.root, { backgroundColor: palette.background, paddingTop: insets.top }]}
      testID="import-preview"
    >
      <Stack.Screen options={{ headerShown: false, title: IMPORT_COPY.checkTitle }} />
      <SettingsTopBar
        title={IMPORT_COPY.checkTitle}
        onBack={onBack}
        backLabel={IMPORT_COPY.back}
        right={discardButton}
      />
      <View testID="import-filter-bar" style={styles.fixed}>
        <Text
          style={[styles.what, { color: palette.textMuted }]}
          testID="import-summary"
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        >
          <Text style={[styles.whatName, { color: palette.ink }]}>{what[0]}</Text>
          {` · ${what[1]}`}
        </Text>
        <ChoiceChips
          label={IMPORT_COPY.filterLabel}
          hideLabel
          scroll
          revealSelected
          variant="pill"
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          options={filterOptions(summary, filter, preview.source)}
          value={filter}
          onChange={chooseFilter}
          testID="import-filter"
        />
        {summary.toChoose > 0 ? (
          <View
            testID="import-unchosen"
            style={[
              styles.amber,
              {
                backgroundColor: palette.settings.draftBackground,
                borderColor: palette.settings.draftBorder,
              },
            ]}
          >
            <Text
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              style={[styles.amberText, { color: palette.settings.draftText }]}
            >
              {needPrintingBar(summary.toChoose, preview.source)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityHint={IMPORT_COPY.useNewestHint}
              disabled={wholeBusy}
              onPress={mostRecent}
              testID="import-bulk-recent"
              style={({ pressed }) => [
                styles.newest,
                { borderColor: palette.settings.draftIcon },
                (pressed || wholeBusy) && styles.pressed,
              ]}
            >
              <Text
                maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
                style={[styles.newestText, { color: palette.settings.draftIcon }]}
              >
                {IMPORT_COPY.useNewest}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <FlatList
        ref={listRef}
        testID="import-rows"
        data={rows.data ? list : []}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => (
          <ImportRowCard
            row={item}
            onChoosePrinting={openPrinting}
            onEdit={openEdit}
            onToggle={toggle}
            disabled={committing}
            showSource={!!item.card?.id && twins.has(item.card.id)}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !rows.data && rows.error ? (
            <ErrorState
              compact
              testID="import-rows-error"
              error={rows.error}
              title="The list could not load"
              onRetry={() => void rows.refetch()}
            />
          ) : !rows.data ? (
            <SkeletonList rows={4} rowHeight={72} testID="import-rows-loading" />
          ) : (
            <EmptyState
              testID="import-rows-empty"
              icon="check-circle-outline"
              title={empty.title}
              description={empty.description}
              actionLabel={
                filter === 'ALL' ? undefined : `Show all ${lineNoun(preview.source).many}`
              }
              onAction={filter === 'ALL' ? undefined : () => setFilter('ALL')}
            />
          )
        }
        ListFooterComponent={
          <>
            <ListFooter
              loading={rows.isFetchingNextPage}
              failed={!!rows.error && !!rows.data && rows.hasNextPage}
              onRetry={() => void rows.fetchNextPage()}
              testID="import-rows-footer"
            />
            {more}
          </>
        }
        onEndReached={() => {
          if (rows.hasNextPage && !rows.isFetchingNextPage && !rows.error) {
            void rows.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.6}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={9}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={rows.isRefetching && !rows.isFetchingNextPage}
            onRefresh={() => {
              void rows.refetch();
              void queryClient.invalidateQueries({ queryKey: meKeys.importOne(uid, preview.id) });
            }}
          />
        }
        contentContainerStyle={styles.listContent}
        accessibilityLabel={pluralLines(summary.rows, preview.source)}
      />

      <View
        testID="import-commit-bar"
        style={[
          styles.bar,
          {
            borderTopColor: palette.border,
            backgroundColor: palette.background,
            paddingBottom: Math.max(insets.bottom, spacing[3]) + spacing[2],
          },
        ]}
      >
        {failure && limited ? (
          <LimitReachedNotice
            error={failure}
            title="This import does not fit the inventory limit"
            message={limitRefusalText(limitReachedInfo(failure))}
            testID="import-limit"
          />
        ) : failure ? (
          <FormMessage testID="import-commit-error">
            {failure.errorCode === 'IMPORT_ROWS_UNRESOLVED'
              ? 'Something still needs a printing. Choose one for each, or leave those out.'
              : friendlyMessage(failure)}
          </FormMessage>
        ) : null}
        <PillButton
          label={state.shortLabel}
          accessibilityLabel={state.label}
          loadingLabel="Adding to your inventory…"
          disabled={state.disabled || wholeBusy || saving}
          loading={committing}
          onPress={() => void submit()}
          accessibilityHint={(saving ? SAVING_CHANGES : state.reason) ?? undefined}
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          testID="import-commit"
        />
        {saving || state.reason ? (
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.reason, { color: palette.textMuted }]}
            accessibilityLiveRegion={saving ? 'polite' : undefined}
            testID="import-commit-reason"
          >
            {saving ? SAVING_CHANGES : state.reason}
          </Text>
        ) : null}
      </View>

      <ImportPrintingSheet
        row={printingRow}
        busy={updateRow.isPending}
        onChoose={(row, printingId) => {
          setPrintingRowId(null);
          patchRow(row, { printingId });
        }}
        onClose={() => setPrintingRowId(null)}
      />
      <ImportRowEditDialog
        row={editRow}
        conditions={schemaOf(editRow?.card?.game)}
        busy={updateRow.isPending}
        onSave={(row, patch) => patchRow(row, patch, () => setEditRowId(null))}
        onClose={() => setEditRowId(null)}
      />
      <ImportConditionSheet
        visible={conditionSheet}
        conditions={preview.source === 'YDK' ? schemaOf('yugioh') : undefined}
        onChoose={setCondition}
        onClose={() => setConditionSheet(false)}
      />
      <ConfirmSheet
        visible={confirmDiscard}
        title={IMPORT_COPY.discardTitle}
        message={IMPORT_COPY.discardBody}
        confirmLabel={IMPORT_COPY.discardConfirm}
        cancelLabel={IMPORT_COPY.keepChecking}
        busy={discard.isPending}
        onConfirm={() => void confirmDiscardNow()}
        onCancel={() => setConfirmDiscard(false)}
        testID="import-discard-dialog"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  trash: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  fixed: { paddingHorizontal: spacing[4], paddingTop: 12, paddingBottom: 4, gap: 10 },
  what: { fontSize: 13, lineHeight: 18 },
  whatName: { fontWeight: fontWeight.semibold },
  amber: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  amberText: { flex: 1, minWidth: 160, fontSize: 13, lineHeight: 18 },
  newest: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newestText: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.bold },
  listContent: { paddingHorizontal: spacing[4], paddingBottom: spacing[4] },
  limitRoom: { paddingTop: 10, paddingBottom: 4 },
  bar: { borderTopWidth: 1, paddingHorizontal: spacing[4], paddingTop: 12, gap: 6 },
  reason: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
