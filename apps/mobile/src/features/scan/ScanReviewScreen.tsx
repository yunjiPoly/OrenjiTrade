import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { useMyBinders } from '@/src/api/hooks/binders';
import { useAddScannedCards } from '@/src/api/hooks/cardScan';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { bindersForGame } from '@/src/features/binders/binderForm';
import { useLeaveGuard } from '@/src/features/inventory/import/useLeaveGuard';
import { InventoryFormScreen } from '@/src/features/inventory/InventoryFormScreen';
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
import { newScanAddKey, useScanReviewOptions } from './scanReviewOptions';
import { REVIEW_FROM_PHOTOS, SCAN_CAMERA_ROUTE, SCAN_SEARCH_ROUTE } from './scanRoutes';
import { scanRunner } from './scanRunner';
import { SCAN_GAME } from './types';
import {
  addRefused,
  addSent,
  batchAddRequest,
  hasCardsToSend,
  isGivenUp,
  reviewGroups,
  scanCounts,
  sentCopies,
  setCopies,
  tilesToSend,
  type PendingAdd,
  type ScanSession,
  type ScanTile,
} from './scanSession';
import { useScanStore } from './scanStore';
import { useScanEffects } from './useScanEffects';
import { useScanTileSheets } from './useScanTileSheets';

/** At most this many placeholder rows while photos are read. */
const READING_ROWS = 3;

/** What the adds of one tap of "Add {n} cards to inventory" wrote. */
interface Added {
  copiesAdded: number;
  copiesNotAdded: number;
}

/** "Saved · {n} cards" (and the copies that did not fit), on Inventory or on the review. */
function showSaved(snackbar: ReturnType<typeof useSnackbar>, added: Added): void {
  if (added.copiesNotAdded > 0) {
    snackbar.show(REVIEW_COPY.copiesNotAdded(added.copiesNotAdded), {
      title: savedToast(added.copiesAdded),
      icon: 'success',
    });
  } else {
    snackbar.show(savedToast(added.copiesAdded), { icon: 'success' });
  }
}

/**
 * Review (mockup screen 30, owner spec 2026-10-15, section 4): every card of the scan, "To check"
 * above "Ready", each with its quick fix in place (28, the rarity list, the printing list, the
 * search inside the scan). "Private"/"Public" and "No binder" choose how the cards are added;
 * "Add {n} cards to inventory" adds the ready cards only, in one request that writes everything
 * or nothing; the cards it added leave the scan (their photos are deleted), and once no ready card
 * is left the scan ends and Inventory opens with "Saved · {n} cards". A refusal keeps the scan as
 * it was and says how to go on, above the button (and to the screen reader).
 *
 * Without an answer the review cannot tell whether the cards were added: what was sent is kept
 * with its key (the scan's `pendingAdd`), its rows say "Not confirmed yet" and stay as they were
 * sent, and the pills show what was sent. The next tap sends that same add again under the same
 * key first (the API answers it once, new or repeated: nothing is added twice, and nothing sent
 * can change), then, under a new key, the other ready cards the button counted at that tap, as
 * they were then: a card that becomes ready or changes while the first add is on its way waits for
 * the next tap. While a tap's adds are on their way, the button says "Adding…", on a review opened
 * again meanwhile too.
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
  const trying = useScanStore((state) => state.trying);
  // A tap of "Add {n} cards" on its way, from this review or one closed meanwhile.
  const adding = useScanStore((state) => state.adding);
  const apply = useScanStore((state) => state.apply);
  const options = useScanReviewOptions();
  const binders = useMyBinders();
  // The scan reads Yu-Gi-Oh! cards: only Yu-Gi-Oh! binders can take them (stage G).
  const scanBinders = useMemo(
    () => (binders.data ? bindersForGame(binders.data, SCAN_GAME) : undefined),
    [binders.data]
  );
  const add = useAddScannedCards();

  // Once added, the screen keeps showing what it added while it leaves (the scan is emptied).
  const [saved, setSaved] = useState<{ session: ScanSession; result: Added } | null>(null);
  const [failure, setFailure] = useState<AddFailure | null>(null);
  const [choosingBinder, setChoosingBinder] = useState(false);
  const [toCamera, setToCamera] = useState(false);

  useScanEffects();

  const session = saved?.session ?? live;
  const counts = scanCounts(session);
  const groups = reviewGroups(session);
  const progress = readingProgress(session);
  const readingTiles = session.tiles.filter((tile) => tile.status === 'READING').length;
  const saving = adding || saved !== null;
  // An add sent without an answer: the pills show what it sent until it is answered.
  const pending = live.pendingAdd;

  const chosenBinder = options.binderId
    ? (scanBinders?.find((binder) => binder.id === options.binderId) ?? null)
    : null;
  // A binder deleted meanwhile (or turned to another game) is no binder any more, once the list
  // says so.
  const binderToSend = options.binderId && (chosenBinder || !scanBinders) ? options.binderId : null;
  const shownVisibility = pending ? (pending.body.visibility ?? 'PRIVATE') : options.visibility;
  // An add sent without an answer says so whenever the review shows it (opened again from the
  // camera too), not only right after the tap; while it is still on its way, the button says
  // "Adding…" instead.
  const shownFailure: AddFailure | null =
    failure ??
    (pending && !adding && saved === null ? { kind: 'UNSURE', message: REVIEW_COPY.unsure } : null);
  const shownBinderName = pending ? pending.binderName : (chosenBinder?.name ?? null);

  // Opened from the photo picker, nothing is under this screen but Add cards: leaving with cards
  // asks first, like the camera's Close.
  const hasCards = live.tiles.length > 0;
  const guard = useLeaveGuard(fromPhotos && hasCards && !toCamera && saved === null);

  // A scan left with nothing in it ends here, like the camera's (every row removed, then back):
  // the photos of the removed rows are deleted.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (useScanStore.getState().session.tiles.length === 0) {
        scanRunner.endScan();
      }
    };
  }, []);

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
    showSaved(snackbar, saved.result);
    router.dismissTo('/inventory');
  }, [live.tiles.length, router, saved, snackbar]);

  const { openTile, sheets } = useScanTileSheets({
    onSearch: (tileId) => router.push({ pathname: SCAN_SEARCH_ROUTE, params: { tileId } }),
    onTakeAgain: backToScanning,
  });

  /**
   * Sends one add (`pendingAdd` of the scan): answered, its cards leave the scan (their photos are
   * deleted); refused, nothing was added and its cards can be changed again; without an answer it
   * stays as it was sent. `replay`: it was sent before without an answer. Returns what it wrote, or
   * why it failed (shown above the button; `submit` has it said).
   */
  const send = async (
    pendingAdd: PendingAdd,
    replay: boolean
  ): Promise<{ added: Added } | { failure: AddFailure | null }> => {
    const scan = useScanStore.getState().generation;
    try {
      const result = await add.mutateAsync({
        body: pendingAdd.body,
        idempotencyKey: pendingAdd.key,
      });
      if (useScanStore.getState().generation === scan) {
        scanRunner.addAnswered(pendingAdd.key);
      }
      return { added: result };
    } catch (error) {
      if (useScanStore.getState().generation !== scan) {
        return { failure: null }; // The scan was left meanwhile.
      }
      const found = addFailure(error as ApiError, !!pendingAdd.body.binderId, replay);
      if (found.kind !== 'UNSURE') {
        // A refusal: nothing was added, the cards can be changed and added again.
        apply((current) => addRefused(current, pendingAdd.key));
      }
      if (found.kind === 'BINDER_GONE') {
        options.setBinderId(null);
        void binders.refetch();
      }
      setFailure(found);
      return { failure: found };
    }
  };

  const submit = async () => {
    const start = useScanStore.getState().session;
    // The cards the button counts besides an add sent before: this tap adds them as they are now.
    const chosen = tilesToSend(start);
    if (
      (!start.pendingAdd && chosen.length === 0) ||
      progress ||
      saving ||
      useScanStore.getState().adding
    ) {
      return;
    }
    const scan = useScanStore.getState().generation;
    useScanStore.getState().setAdding(true);
    setFailure(null);
    const added: Added = { copiesAdded: 0, copiesNotAdded: 0 };
    const count = (result: Added) => {
      added.copiesAdded += result.copiesAdded;
      added.copiesNotAdded += result.copiesNotAdded;
    };
    // Whether an add of this tap failed, and why (null: the scan was left meanwhile).
    const stopped: { failed: boolean; failure: AddFailure | null } = {
      failed: false,
      failure: null,
    };
    const settle = (outcome: { added: Added } | { failure: AddFailure | null }) => {
      if ('added' in outcome) {
        count(outcome.added);
      } else {
        stopped.failed = true;
        stopped.failure = outcome.failure;
      }
    };
    try {
      // First the add sent before without an answer: exactly what was sent, under its key.
      const earlier = start.pendingAdd;
      if (earlier) {
        settle(await send(earlier, true));
      }
      // Then the cards the button counted at the tap, still ready and as they were then, under a
      // new key, with the pills as shown. A card that became ready or changed meanwhile (a match
      // landed, a fix on the camera) stays in the scan for the next add.
      const now = useScanStore.getState();
      const body =
        !stopped.failed && now.generation === scan
          ? batchAddRequest(
              now.session,
              { visibility: options.visibility, binderId: binderToSend },
              chosen
            )
          : null;
      if (body) {
        const next: PendingAdd = {
          key: newScanAddKey(),
          body,
          tileIds: tilesToSend(now.session, chosen).map((tile) => tile.id),
          binderName: body.binderId ? (chosenBinder?.name ?? null) : null,
        };
        apply((current) => addSent(current, next));
        if (useScanStore.getState().session.pendingAdd?.key === next.key) {
          settle(await send(next, false));
        }
      }
    } finally {
      if (useScanStore.getState().generation === scan) {
        useScanStore.getState().setAdding(false);
      }
    }
    if (useScanStore.getState().generation !== scan) {
      return; // The scan was left meanwhile.
    }
    const after = useScanStore.getState().session;
    if (!stopped.failed && !after.pendingAdd && !hasCardsToSend(after) && mounted.current) {
      // Nothing ready is left: the scan ends (its photos are deleted), off to Inventory. (Back on
      // the camera meanwhile, the scan goes on there with what is left.)
      setSaved({ session: start, result: added });
      scanRunner.endScan();
      return;
    }
    const some = added.copiesAdded > 0 || added.copiesNotAdded > 0;
    if (some) {
      // Some cards were added; the others stay in the scan.
      showSaved(snackbar, added);
    }
    const said = stopped.failure;
    if (said) {
      // iOS says nothing of an alert by itself: the screen reader hears what went wrong (last, so
      // that the toast's own words do not cut it off; with what was saved, when something was).
      const wrong =
        said.kind === 'LIMIT' ? `${REVIEW_COPY.limitTitle}. ${said.message}` : said.message;
      AccessibilityInfo.announceForAccessibility(
        some ? `${savedToast(added.copiesAdded)}. ${wrong}` : wrong
      );
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
      trying={trying.includes(tile.id)}
      sent={pending?.tileIds.includes(tile.id) ?? false}
      onRetry={(target) =>
        void (isGivenUp(target)
          ? scanRunner.retryGivenUp(target.id)
          : scanRunner.retryWaiting({ explicit: true }))
      }
      onCopies={(target, copies) => apply((current) => setCopies(current, target.id, copies))}
      // Its photo files are deleted at once.
      onRemove={(target) => scanRunner.removeTile(target.id)}
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
          {/* While photos are read, they count too ("Review 12 cards", "Reading 8 of 12…"). */}
          {reviewTitle({ ...counts, cards: counts.cards + counts.reading })}
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
        footer={
          <ReviewFooter
            counts={counts}
            visibility={shownVisibility}
            onToggleVisibility={() =>
              options.setVisibility(options.visibility === 'PRIVATE' ? 'PUBLIC' : 'PRIVATE')
            }
            binderName={shownBinderName}
            onBinder={() => setChoosingBinder(true)}
            reading={progress !== null}
            saving={saving}
            locked={pending !== null}
            failure={shownFailure}
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
        </View>
      </InventoryFormScreen>
      {sheets}
      <BinderPickerSheet
        visible={choosingBinder}
        binders={scanBinders}
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
        sent={sentCopies(live)}
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
