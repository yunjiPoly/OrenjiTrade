import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { useMyBinders } from '@/src/api/hooks/binders';
import { useAddScannedCards } from '@/src/api/hooks/cardScan';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { useLeaveGuard } from '@/src/features/inventory/import/useLeaveGuard';
import { InventoryFormScreen } from '@/src/features/inventory/InventoryFormScreen';
import { LimitReachedNotice } from '@/src/features/limits/LimitReachedNotice';
import { fontWeight, TITLE_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { BinderPickerSheet } from './BinderPickerSheet';
import { LeaveScanSheet } from './LeaveScanSheet';
import { ReviewFooter } from './ReviewFooter';
import { ReviewRow } from './ReviewRow';
import {
  readingProgressText,
  readyTitle,
  REVIEW_COPY,
  reviewSummary,
  reviewTitle,
  savedToast,
  summaryNeedsAttention,
  toCheckTitle,
} from './scanCopy';
import { addFailure, readingProgress, type AddFailure } from './scanReview';
import { useScanReviewOptions } from './scanReviewOptions';
import { REVIEW_FROM_PHOTOS, SCAN_CAMERA_ROUTE, SCAN_SEARCH_ROUTE } from './scanRoutes';
import { scanRunner } from './scanRunner';
import {
  batchAddRequest,
  removeTile,
  reviewGroups,
  scanCounts,
  setCopies,
  type ScanSession,
  type ScanTile,
} from './scanSession';
import { useScanStore } from './scanStore';
import type { AddInventoryItemsBatchResponse } from './types';
import { useScanEffects } from './useScanEffects';
import { useScanTileSheets } from './useScanTileSheets';

/** At most this many placeholder rows while photos are read. */
const READING_ROWS = 3;

/**
 * Review (mockup screen 30, owner spec 2026-10-15, section 4): every card of the scan, "To check"
 * above "Ready", each with its quick fix in place (28, the rarity list, the printing list, the
 * search inside the scan). "Private"/"Public" and "No binder" choose how the cards are added;
 * "Add {n} cards to inventory" adds the ready cards only, in one request that writes everything
 * or nothing, then ends the scan (its photos are deleted) and opens Inventory with "Saved · {n}
 * cards". A refusal keeps the scan as it was and says how to go on.
 *
 * Opened from the camera's "Review {n}", "Back to scanning" goes back to the camera. Opened from
 * Add cards' "Choose from photos" (`from=photos`), it shows "Reading 3 of 12…" while the photos are
 * read, "Back to scanning" opens the camera in its place, and leaving with cards asks first.
 */
export function ScanReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const fromPhotos = params.from === REVIEW_FROM_PHOTOS;
  const snackbar = useSnackbar();
  const { palette } = useTheme();
  const live = useScanStore((state) => state.session);
  const apply = useScanStore((state) => state.apply);
  const options = useScanReviewOptions();
  const binders = useMyBinders();
  const add = useAddScannedCards();

  // Once added, the screen keeps showing what it added while it leaves (the scan is emptied).
  const [saved, setSaved] = useState<{
    session: ScanSession;
    result: AddInventoryItemsBatchResponse;
  } | null>(null);
  const [failure, setFailure] = useState<(AddFailure & { error: ApiError }) | null>(null);
  const [failures, setFailures] = useState(0);
  const [choosingBinder, setChoosingBinder] = useState(false);
  const [toCamera, setToCamera] = useState(false);

  useScanEffects();

  const session = saved?.session ?? live;
  const counts = scanCounts(session);
  const groups = reviewGroups(session);
  const progress = readingProgress(session);
  const readingTiles = session.tiles.filter((tile) => tile.status === 'READING').length;
  const saving = add.isPending || saved !== null;

  const chosenBinder = options.binderId
    ? (binders.data?.find((binder) => binder.id === options.binderId) ?? null)
    : null;
  // A binder deleted meanwhile is no binder any more, once the list says so.
  const binderToSend =
    options.binderId && (chosenBinder || !binders.data) ? options.binderId : null;

  // Opened from the photo picker, nothing is under this screen but Add cards: leaving with cards
  // asks first, like the camera's Close.
  const hasCards = live.tiles.length > 0;
  const guard = useLeaveGuard(fromPhotos && hasCards && !toCamera && saved === null);

  const backToScanning = () => {
    if (!fromPhotos && router.canGoBack()) {
      router.back();
    } else {
      setToCamera(true);
    }
  };
  // The camera takes this screen's place once the guard has let go of it.
  useEffect(() => {
    if (toCamera) {
      router.replace(SCAN_CAMERA_ROUTE);
    }
  }, [router, toCamera]);

  // Added: the scan ended (its photos deleted); off to Inventory once no screen holds it.
  const left = useRef(false);
  useEffect(() => {
    if (!saved || live.tiles.length > 0 || left.current) {
      return;
    }
    left.current = true;
    const { copiesAdded, copiesNotAdded } = saved.result;
    if (copiesNotAdded > 0) {
      snackbar.show(REVIEW_COPY.copiesNotAdded(copiesNotAdded), {
        title: savedToast(copiesAdded),
        icon: 'success',
      });
    } else {
      snackbar.show(savedToast(copiesAdded), { icon: 'success' });
    }
    router.dismissTo('/inventory');
  }, [live.tiles.length, router, saved, snackbar]);

  const { openTile, sheets } = useScanTileSheets({
    onSearch: (tileId) => router.push({ pathname: SCAN_SEARCH_ROUTE, params: { tileId } }),
    onTakeAgain: backToScanning,
  });

  const submit = async () => {
    const body = batchAddRequest(live, {
      visibility: options.visibility,
      binderId: binderToSend,
    });
    if (!body || progress || saving) {
      return;
    }
    setFailure(null);
    try {
      const result = await add.mutateAsync(body);
      setSaved({ session: live, result });
      scanRunner.endScan();
    } catch (error) {
      const apiError = error as ApiError;
      const found = addFailure(apiError, binderToSend !== null);
      if (found.kind === 'BINDER_GONE') {
        options.setBinderId(null);
        void binders.refetch();
      }
      setFailure({ ...found, error: apiError });
      setFailures((count) => count + 1);
    }
  };

  const confirmLeave = () => {
    scanRunner.endScan();
    guard.leave();
  };

  const row = (tile: ScanTile) => (
    <ReviewRow
      key={tile.id}
      tile={tile}
      onOpen={openTile}
      onSearch={(target) =>
        router.push({ pathname: SCAN_SEARCH_ROUTE, params: { tileId: target.id } })
      }
      onCopies={(target, copies) => apply((current) => setCopies(current, target.id, copies))}
      onRemove={(target) => apply((current) => removeTile(current, target.id))}
    />
  );

  const empty = session.tiles.length === 0;
  const header = (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={REVIEW_COPY.backToScanning}
        onPress={backToScanning}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        testID="review-back"
      >
        <MaterialCommunityIcons name="chevron-left" size={26} color={palette.ink} />
      </Pressable>
      <View style={styles.headerTexts}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[styles.title, { color: palette.ink }]}
        >
          {reviewTitle(counts)}
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[
            styles.summary,
            {
              color:
                !progress && summaryNeedsAttention(counts) ? palette.warning : palette.textMuted,
            },
          ]}
          testID="review-summary"
        >
          {progress ? readingProgressText(progress.current, progress.total) : reviewSummary(counts)}
        </Text>
      </View>
    </View>
  );

  return (
    <>
      <InventoryFormScreen
        header={header}
        showEnd={failures}
        footer={
          <ReviewFooter
            counts={counts}
            visibility={options.visibility}
            onToggleVisibility={() =>
              options.setVisibility(options.visibility === 'PRIVATE' ? 'PUBLIC' : 'PRIVATE')
            }
            binderName={chosenBinder?.name ?? null}
            onBinder={() => setChoosingBinder(true)}
            reading={progress !== null}
            saving={saving}
            onAdd={() => void submit()}
          />
        }
        testID="screen-scan-review"
      >
        <View style={styles.list} pointerEvents={saving ? 'none' : 'auto'}>
          {readingTiles > 0 ? (
            <SkeletonList
              rows={Math.min(READING_ROWS, readingTiles)}
              rowHeight={82}
              testID="review-reading"
            />
          ) : null}
          {groups.toCheck.length > 0 ? (
            <Text
              accessibilityRole="header"
              maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
              style={[styles.section, { color: palette.warning }]}
              testID="review-to-check"
            >
              {toCheckTitle(counts).toUpperCase()}
            </Text>
          ) : null}
          {groups.toCheck.map(row)}
          {groups.ready.length > 0 ? (
            <Text
              accessibilityRole="header"
              maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
              style={[styles.section, styles.readySection, { color: palette.textMuted }]}
              testID="review-ready"
            >
              {readyTitle(counts).toUpperCase()}
            </Text>
          ) : null}
          {groups.ready.map(row)}
          {empty && !saved ? (
            <EmptyState
              icon="cards-outline"
              title={reviewSummary(counts)}
              actionLabel={REVIEW_COPY.backToScanning}
              onAction={backToScanning}
              testID="review-empty"
            />
          ) : null}
          {failure?.kind === 'LIMIT' ? (
            <LimitReachedNotice
              error={failure.error}
              title={REVIEW_COPY.limitTitle}
              message={failure.message}
              testID="review-limit"
            />
          ) : failure ? (
            <FormMessage testID="review-add-error">{failure.message}</FormMessage>
          ) : null}
        </View>
      </InventoryFormScreen>
      {sheets}
      <BinderPickerSheet
        visible={choosingBinder}
        binders={binders.data}
        error={binders.error}
        onRetry={() => void binders.refetch()}
        value={chosenBinder?.id ?? null}
        onPick={(binderId) => {
          setChoosingBinder(false);
          options.setBinderId(binderId);
          setFailure((current) => (current?.kind === 'BINDER_GONE' ? null : current));
        }}
        onClose={() => setChoosingBinder(false)}
      />
      <LeaveScanSheet
        visible={guard.asking}
        counts={{ ...counts, cards: counts.cards + counts.reading }}
        onStay={guard.stay}
        onLeave={confirmLeave}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -8 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTexts: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: fontWeight.semibold },
  summary: { fontSize: 13, lineHeight: 18 },
  list: { gap: 8 },
  section: {
    marginHorizontal: 4,
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.6,
  },
  readySection: { marginTop: 12 },
  pressed: { opacity: 0.7 },
});
