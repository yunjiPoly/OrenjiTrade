import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
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
import { useMyPlan } from '@/src/api/hooks/plan';
import { useGames } from '@/src/api/hooks/profile';
import { useUid } from '@/src/api/hooks/useUid';
import { meKeys } from '@/src/api/queryKeys';
import type { ImportRow, InventoryImport, UpdateImportRowRequest } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { LimitReachedNotice } from '@/src/features/limits/LimitReachedNotice';
import { isLimitReached, limitReachedInfo } from '@/src/lib/limits';
import { PINNED_MAX_FONT_SCALE, spacing, textStyle, useTheme } from '@/src/theme';

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
  planRoomText,
  pluralLines,
  rowTitle,
} from './importLabels';

/** A preview the API no longer has: it expired (410) or was purged or replaced (404). */
export function isImportGone(error: unknown): boolean {
  const code = (error as ApiError | null)?.errorCode;
  return code === 'IMPORT_EXPIRED' || code === 'NOT_FOUND';
}

export interface ImportPreviewProps {
  preview: InventoryImport;
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
export function ImportPreview({ preview, onGone, onDiscarded, onLateEdit }: ImportPreviewProps) {
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
  const plan = useMyPlan({ fresh: true });
  const listRef = useRef<FlatList<ImportRow>>(null);
  const headerHeight = useRef(0);
  const [printingRowId, setPrintingRowId] = useState<string | null>(null);
  const [editRowId, setEditRowId] = useState<string | null>(null);
  const [conditionSheet, setConditionSheet] = useState(false);
  const [leaveOut, setLeaveOut] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const list = useMemo(() => loadedRows(rows.data), [rows.data]);
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
  const room = plan.data?.limits?.find((limit) => limit.key === 'inventory.items.max');
  const planRoom = planRoomText(preview.summary, room?.limit == null ? null : room.remaining);

  /** A filter from the bar that stays on screen: its first line comes up under the bar. */
  const chooseFilter = (next: ImportRowFilter) => {
    setFilter(next);
    listRef.current?.scrollToOffset({ offset: headerHeight.current, animated: false });
  };

  const header = (
    <View
      onLayout={(event) => {
        headerHeight.current = event.nativeEvent.layout.height;
      }}
    >
      <ImportPreviewHeader
        preview={preview}
        onFilter={chooseFilter}
        onSections={(patch) => updateSections.mutate(patch, { onError: (error) => refused(error) })}
        onMostRecent={mostRecent}
        onCondition={() => setConditionSheet(true)}
        leaveOut={leaveOut}
        onLeaveOut={setLeaveOut}
        busy={wholeBusy}
        lowestGrades={lowestGrades}
        planRoom={planRoom}
      />
    </View>
  );

  return (
    <View style={styles.root} testID="import-preview">
      <View
        testID="import-filter-bar"
        style={[
          styles.filterBar,
          { borderBottomColor: palette.border, backgroundColor: palette.background },
        ]}
      >
        <ChoiceChips
          label={preview.source === 'YDK' ? 'Cards shown' : 'Lines shown'}
          hideLabel
          scroll
          revealSelected
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          options={filterOptions(preview.summary, filter)}
          value={filter}
          onChange={chooseFilter}
          testID="import-filter"
        />
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
          />
        )}
        ItemSeparatorComponent={Separator}
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
            <SkeletonList rows={4} rowHeight={120} testID="import-rows-loading" />
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
          <View style={styles.listFooter}>
            <ListFooter
              loading={rows.isFetchingNextPage}
              failed={!!rows.error && !!rows.data && rows.hasNextPage}
              onRetry={() => void rows.fetchNextPage()}
              testID="import-rows-footer"
            />
            <Button
              label="Discard this import"
              icon="trash-can-outline"
              variant="ghost"
              disabled={committing}
              onPress={() => setConfirmDiscard(true)}
              style={styles.discard}
              testID="import-discard"
            />
          </View>
        }
        onEndReached={() => {
          if (rows.hasNextPage && !rows.isFetchingNextPage && !rows.error) {
            void rows.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.6}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
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
        accessibilityLabel={pluralLines(preview.summary.rows, preview.source)}
      />

      <View
        testID="import-commit-bar"
        style={[
          styles.bar,
          {
            borderTopColor: palette.border,
            backgroundColor: palette.background,
            paddingBottom: insets.bottom + spacing[3],
          },
        ]}
      >
        {failure && limited ? (
          <LimitReachedNotice
            error={failure}
            title="This import does not fit your plan"
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
        {saving || state.reason ? (
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[textStyle('xs'), { color: palette.textMuted }]}
            accessibilityLiveRegion={saving ? 'polite' : undefined}
            testID="import-commit-reason"
          >
            {saving ? SAVING_CHANGES : state.reason}
          </Text>
        ) : null}
        <Button
          label={state.shortLabel}
          accessibilityLabel={state.label}
          loadingLabel="Adding to your inventory…"
          icon="tray-arrow-down"
          disabled={state.disabled || wholeBusy || saving}
          loading={committing}
          onPress={() => void submit()}
          accessibilityHint={(saving ? SAVING_CHANGES : state.reason) ?? undefined}
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          testID="import-commit"
        />
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
      <ConfirmDialog
        visible={confirmDiscard}
        title="Discard this import?"
        message="The choices you made for it are lost. Nothing was added to your inventory."
        confirmLabel="Discard"
        cancelLabel="Keep it"
        tone="danger"
        busy={discard.isPending}
        onConfirm={() => void confirmDiscardNow()}
        onCancel={() => setConfirmDiscard(false)}
        testID="import-discard-dialog"
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  filterBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  listContent: { paddingHorizontal: spacing[4], paddingTop: spacing[4], paddingBottom: spacing[4] },
  listFooter: { gap: spacing[2] },
  discard: { alignSelf: 'flex-start' },
  separator: { height: spacing[2] },
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    gap: spacing[2],
  },
});
