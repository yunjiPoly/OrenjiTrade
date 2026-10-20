import { onlineManager } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { matchScannedCard } from '@/src/api/hooks/cardScan';
import { afterModals } from '@/src/components/ui/modalTurns';

import type { CardCrops } from './frameMapping';
import { getDeviceOcrProvider } from './ocr/deviceOcr';
import type { OcrProvider } from './ocr/types';
import { storedScanPhotoJournal, type ScanPhotoJournal } from './scanPhotoJournal';
import { readCardText, type PhotoSource } from './readCardText';
import { applyOutcome, matchRead, type CardMatcher, type PhotoOutcome } from './scanPipeline';
import {
  addAnswered as addAnsweredTo,
  addPhoto,
  findTile,
  forgetPhotos,
  isGivenUp,
  isSent,
  photoFilesToDelete,
  removeTile as removeTileFrom,
  reopenMatch,
  sentPhotoFiles,
  tilesWaiting,
  type ScanPhoto,
  type ScanSession,
  type ScanTile,
} from './scanSession';
import { useScanStore, type ScanStore } from './scanStore';

/**
 * The scan's work behind its screens (owner spec 2026-10-15, sections 3.2 and 4): each photo gets
 * a "Reading…" tile at once (the shutter never waits), then the photos are read on the phone in
 * turn, one after another, and each read is matched by the API without holding up the next one.
 *
 * - A tile whose match could not reach the API, or that the API could not answer this time (a
 *   server error, a restart), waits for the connection ("Waiting for connection"); the waiting
 *   tiles are matched again when the connection is back (`retryWaiting`): when the phone is online
 *   again, after any match that got through, when a scan screen comes back or the app returns to
 *   the front, when the collector taps "Try again", and on a timer that waits longer each time
 *   (5 s, 10 s, 20 s, 40 s, then every minute) while a scan screen is open (`watchWaiting`). The
 *   phone can be online while the API cannot be reached, so the timer does not wait for the phone
 *   to say it is back; it only skips its try while the phone says it is offline. (What the phone
 *   says is NetInfo's: the root layout wires TanStack Query's `onlineManager` to it through
 *   `connectQueryManagers`, `src/api/queryClient.ts`.)
 * - A round of tries goes from the oldest waiting tile to the newest, and stops only when a match
 *   could not reach the API (no connection: the others would not reach it either); a server error
 *   for one tile does not hold back the next one.
 * - A waiting tile stays "Waiting for connection" while it is tried again (the store's `trying`
 *   says that a try is under way): the tray, the review's counts and its add do not change until
 *   the answer lands, and the screen reader hears a tile again only when its result changed (or
 *   when the collector asked with "Try again").
 * - A tile whose match fails with a server error again after the API answered the scan's other
 *   photos (`SERVER_FAILURES_WHILE_UP` times), or whose match failed with a server error
 *   `SERVER_FAILURES_MAX` times whatever the other photos do, is given up: "Couldn't match"
 *   (`MATCH_FAILED`), the search one tap away, rather than waiting for ever on an error that does
 *   not go away. A match that could not reach the API (no connection) never gives a tile up. "Try
 *   again" on a card given up asks for its match once more (`retryGivenUp`): another server error
 *   leaves it given up, no connection makes it wait for the connection.
 * - A removed tile's photo files are deleted once no sheet shows them any more (`removeTile`).
 * - The tiles of an add that was answered leave the scan, and their photo files are deleted at
 *   once (`addAnswered`); the rest of the scan goes on.
 * - Ending the scan (cards added, or the scan left) deletes every photo file it made or copied and
 *   empties the tray; what the reader or the API answers later for that scan is dropped, and so is
 *   a photo the camera hands over after its scan ended (its file is deleted).
 * - The scan's photo files are written down while it runs (`scanPhotoJournal.ts`): a scan lost
 *   when the app was closed has its files deleted at the next start of the app
 *   (`app/_layout.tsx`).
 * - Nothing of a photo leaves the phone: only the text read goes to the API.
 */

export interface PhotoToRead {
  photo: ScanPhoto;
  source: PhotoSource;
  /** A camera photo's areas under the frame (`cropsUnderFrame`); none: the whole photo is read. */
  crops?: CardCrops | null;
}

export interface ScanRunnerDeps {
  /** The reader of this build, or null (Expo Go, the web): the photo is then "Couldn't read". */
  provider: () => OcrProvider | null;
  matcher: CardMatcher;
  /** Deletes one photo file the scan made or copied (never throws). */
  deleteFile: (uri: string) => void;
  /** Where the scan's photo files are written down while it runs (none: not written down). */
  journal?: ScanPhotoJournal;
  store?: Pick<typeof useScanStore, 'getState'>;
  /** Resolves once no sheet is on screen (a removed tile's photo may show in a sheet sliding away). */
  afterSheets?: () => Promise<void>;
  /** How long the waiting tiles wait before each new try, in ms (the last one repeats). */
  retryDelaysMs?: readonly number[];
  /**
   * Whether the phone says it is online (the app: NetInfo, through `onlineManager`); the timer
   * skips its try while it is not (the scan screens try again as soon as it is). Online when not
   * given.
   */
  isOnline?: () => boolean;
}

/** The waiting tiles are tried again after 5 s, 10 s, 20 s, 40 s, then every minute. */
export const RETRY_DELAYS_MS: readonly number[] = [5_000, 10_000, 20_000, 40_000, 60_000];

/**
 * A tile whose match fails with a server error, again, after the API answered another photo of the
 * scan since its last try, this many times, is given up ("Couldn't match").
 */
export const SERVER_FAILURES_WHILE_UP = 2;

/**
 * A tile whose match failed with a server error this many times is given up ("Couldn't match"),
 * whatever the other photos do: on the timer alone, about 75 s after its first failure (0, 5, 15,
 * 35 and 75 s), long enough for a restart of the API.
 */
export const SERVER_FAILURES_MAX = 5;

export interface RetryOptions {
  /**
   * The collector asked ("Try again", a tap on a waiting tile): each tile tried is said again by
   * the screen reader even when it still waits.
   */
  explicit?: boolean;
}
export interface ScanRunner {
  /** The scan going on now (it changes when a scan ends). */
  currentScan: () => number;
  /**
   * Adds photos to the tray ("Reading…" tiles, newest first) and reads them in turn. Given the
   * scan they were taken for (`currentScan()` before the camera took them), photos that arrive
   * after that scan ended are deleted instead, and nothing of them is read or sent.
   */
  addPhotos: (photos: readonly PhotoToRead[], forScan?: number) => string[];
  /**
   * Matches the tiles that wait for the connection again, oldest first, until one cannot reach the
   * API (a server error for one tile goes on to the next). A try already under way is not doubled
   * (an explicit one then has its results said).
   */
  retryWaiting: (options?: RetryOptions) => Promise<void>;
  /**
   * While a scan screen is open: the tiles that wait for the connection are tried again on a
   * timer that waits longer each time. Returns the function to call when the screen closes.
   */
  watchWaiting: () => () => void;
  /**
   * "Remove": the tile leaves the tray, and its photo files are deleted once no sheet shows them. A
   * tile of the add sent and not answered yet stays.
   */
  removeTile: (tileId: string) => void;
  /**
   * The add of this key was answered (`addAnswered` of the session): its tiles leave the scan and
   * their photo files are deleted at once. The rest of the scan stays.
   */
  addAnswered: (key: string) => void;
  /**
   * "Try again" on a card given up after server errors ("Couldn't match"): its match is asked for
   * once more (the store's `trying` says so meanwhile), and the answer lands on it, said by the
   * screen reader. Another server error leaves it given up; no connection makes it wait for the
   * connection like any other card.
   */
  retryGivenUp: (tileId: string) => Promise<void>;
  /** Ends the scan: its photo files are deleted and the tray is emptied. */
  endScan: () => void;
  /** Called with each tile once its photo is matched (or found unreadable): its result. */
  onLanded: (listener: (tile: ScanTile) => void) => () => void;
  /**
   * Deletes the photo files an earlier run of the app wrote down and never deleted (its scan was
   * lost when the app was closed). Done once per run, before anything else is written down.
   */
  sweepLeftovers: () => Promise<void>;
  /** Resolves once every photo added so far is read and matched, and written down (tests). */
  idle: () => Promise<void>;
}

export function createScanRunner(deps: ScanRunnerDeps): ScanRunner {
  const store = deps.store ?? useScanStore;
  const listeners = new Set<(tile: ScanTile) => void>();
  const pending = new Set<Promise<unknown>>();
  let reading: Promise<void> = Promise.resolve();
  let retrying = false;
  let journaling: Promise<void> = Promise.resolve();
  let swept = false;
  const retryDelays = deps.retryDelaysMs ?? RETRY_DELAYS_MS;
  let watchers = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retries = 0;
  let explicitRetry = false;
  // Answers the API gave (a match, or a refusal: a 4xx): a server error after one is not the API
  // being down.
  let answered = 0;
  // The tiles of this scan whose match failed with a server error: the answers counted at their
  // last failure, how many of their failures came after the API answered another photo, and how
  // many there were.
  const serverFailures = new Map<string, { seen: number; whileUp: number; count: number }>();
  const isOnline = deps.isOnline ?? (() => true);

  const state = (): ScanStore => store.getState();
  const track = <T>(work: Promise<T>): Promise<T> => {
    pending.add(work);
    void work.finally(() => pending.delete(work)).catch(() => undefined);
    return work;
  };

  /**
   * Writes down the scan's photo files as they are now; the first time in this run, first deletes
   * the files an earlier run wrote down that this scan does not hold.
   */
  function writeDown(): Promise<void> {
    const journal = deps.journal;
    if (!journal) {
      return Promise.resolve();
    }
    journaling = journaling
      .then(async () => {
        if (!swept) {
          swept = true;
          const current = new Set(photoFilesToDelete(state().session));
          for (const uri of await journal.read()) {
            if (!current.has(uri)) {
              deps.deleteFile(uri);
            }
          }
        }
        await journal.write(photoFilesToDelete(state().session));
      })
      .catch(() => undefined);
    return track(journaling);
  }

  /** The tile a landed photo now lives in: its own, or the tile its repeat was grouped into. */
  function landedTile(session: ScanSession, tileId: string, photoUri: string | null) {
    return (
      findTile(session, tileId) ??
      (photoUri
        ? (session.tiles.find((tile) => tile.photos.some((photo) => photo.uri === photoUri)) ??
          null)
        : null)
    );
  }

  function stopRetryTimer(): void {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  /**
   * Plans the next try of the waiting tiles while a scan screen is open: each one waits longer than
   * the one before. Nothing waits any more: the delays start again from the shortest.
   */
  function planRetry(): void {
    if (tilesWaiting(state().session).length === 0) {
      stopRetryTimer();
      retries = 0;
      return;
    }
    if (watchers === 0 || retryTimer !== null) {
      return;
    }
    const delay = retryDelays[Math.min(retries, retryDelays.length - 1)] ?? 60_000;
    retries += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (!isOnline()) {
        // The phone says it is offline: no try now (the screens try again once it is online).
        planRetry();
        return;
      }
      void retryWaiting().finally(planRetry);
    }, delay);
  }

  /**
   * What an outcome becomes for its tile: a server error waits for the connection, unless the
   * tile's match failed that way again and again while the API answered the scan's other photos,
   * or too many times (`SERVER_FAILURES_MAX`), or the tile was given up already (`givenUp`: the
   * collector's "Try again"). No connection always waits.
   */
  function settle(tileId: string, outcome: PhotoOutcome, givenUp = false): PhotoOutcome {
    if (outcome.kind === 'MATCHED') {
      answered += 1;
      serverFailures.delete(tileId);
      return outcome;
    }
    if (outcome.kind === 'UNREAD') {
      if (outcome.refused) {
        answered += 1;
      }
      serverFailures.delete(tileId);
      return outcome;
    }
    if (outcome.cause !== 'SERVER') {
      return outcome;
    }
    const gaveUp: PhotoOutcome = { kind: 'UNREAD', read: outcome.read, reason: 'MATCH_FAILED' };
    if (givenUp) {
      return gaveUp;
    }
    const last = serverFailures.get(tileId);
    const whileUp = (last?.whileUp ?? 0) + (last && answered > last.seen ? 1 : 0);
    const count = (last?.count ?? 0) + 1;
    if (whileUp >= SERVER_FAILURES_WHILE_UP || count >= SERVER_FAILURES_MAX) {
      serverFailures.delete(tileId);
      return gaveUp;
    }
    serverFailures.set(tileId, { seen: answered, whileUp, count });
    return outcome;
  }

  /**
   * Lands an answer on its tile. The screen reader hears the tile when its result changed (a photo
   * read, a waiting tile matched), or when the collector asked (`explicit`). `givenUp`: the answer
   * of a "Try again" on a card given up, which it reopens (`reopenMatch`) to land. Returns what
   * landed.
   */
  function land(
    generation: number,
    tileId: string,
    answer: PhotoOutcome,
    explicit = false,
    givenUp = false
  ): PhotoOutcome {
    if (state().generation !== generation) {
      return answer;
    }
    const outcome = settle(tileId, answer, givenUp);
    const before = findTile(state().session, tileId);
    const photoUri = before?.photos[0]?.uri ?? null;
    state().apply((session) =>
      applyOutcome(givenUp ? reopenMatch(session, tileId) : session, tileId, outcome)
    );
    const tile = landedTile(state().session, tileId, photoUri);
    if (
      tile &&
      before &&
      tile.status !== 'READING' &&
      (explicit || tile.status !== before.status)
    ) {
      for (const listener of [...listeners]) {
        listener(tile);
      }
    }
    if (outcome.kind === 'MATCHED' || (outcome.kind === 'UNREAD' && outcome.refused)) {
      // The API answered: tiles that waited for the connection can be matched now.
      void retryWaiting();
    }
    planRetry();
    return outcome;
  }

  async function readOne(generation: number, tileId: string, input: PhotoToRead): Promise<void> {
    if (state().generation !== generation || !findTile(state().session, tileId)) {
      return; // The scan ended, or the tile was removed while it waited for its turn.
    }
    const provider = deps.provider();
    if (!provider) {
      land(generation, tileId, { kind: 'UNREAD', read: null, reason: null });
      return;
    }
    let outcome: Promise<PhotoOutcome>;
    try {
      const read = await readCardText(provider, {
        photo: input.photo,
        source: input.source,
        crops: input.crops ?? null,
      });
      outcome = matchRead(deps.matcher, read);
    } catch {
      outcome = Promise.resolve({ kind: 'UNREAD', read: null, reason: null });
    }
    // The next photo is read while this one is matched.
    void track(outcome.then((answer) => land(generation, tileId, answer)));
  }

  function addPhotos(photos: readonly PhotoToRead[], forScan?: number): string[] {
    const generation = state().generation;
    if (forScan !== undefined && forScan !== generation) {
      // Taken for a scan that ended meanwhile: it never joins the next one.
      for (const { photo } of photos) {
        if (photo.owned) {
          deps.deleteFile(photo.uri);
        }
      }
      return [];
    }
    const ids: string[] = [];
    for (const input of photos) {
      let tileId = '';
      state().apply((session) => {
        const added = addPhoto(session, input.photo);
        tileId = added.tileId;
        return added.session;
      });
      ids.push(tileId);
      reading = reading.then(() => readOne(generation, tileId, input)).catch(() => undefined);
      void track(reading);
    }
    void writeDown();
    return ids;
  }

  async function retryWaiting({ explicit = false }: RetryOptions = {}): Promise<void> {
    if (explicit) {
      explicitRetry = true;
    }
    if (retrying) {
      return; // Under way already (an explicit ask has its results said).
    }
    retrying = true;
    const generation = state().generation;
    try {
      for (const { tileId, read } of tilesWaiting(state().session)) {
        if (state().generation !== generation) {
          return;
        }
        if (findTile(state().session, tileId)?.status !== 'WAITING') {
          continue; // Removed while an older tile was tried.
        }
        // The tile stays "Waiting for connection" while it is tried: only `trying` says so.
        state().setTrying(tileId, true);
        const outcome = await track(matchRead(deps.matcher, read));
        if (state().generation === generation) {
          state().setTrying(tileId, false);
        }
        const landed = land(generation, tileId, outcome, explicitRetry);
        if (landed.kind === 'OFFLINE' && landed.cause === 'NETWORK') {
          return; // Still no connection: the others keep waiting.
        }
        // A server error for this tile: the next one may be answered.
      }
    } finally {
      retrying = false;
      explicitRetry = false;
    }
  }

  async function retryGivenUp(tileId: string): Promise<void> {
    const generation = state().generation;
    const tile = findTile(state().session, tileId);
    if (!tile?.read || !isGivenUp(tile) || state().trying.includes(tileId)) {
      return; // Not given up (fixed, removed, matched), or tried already.
    }
    state().setTrying(tileId, true);
    const outcome = await track(matchRead(deps.matcher, tile.read));
    if (state().generation !== generation) {
      return; // The scan ended meanwhile.
    }
    state().setTrying(tileId, false);
    land(generation, tileId, outcome, true, true);
  }

  function removeTile(tileId: string): void {
    const generation = state().generation;
    const tile = findTile(state().session, tileId);
    if (!tile || isSent(state().session, tileId)) {
      return; // Gone already, or sent: it stays as it was sent until the add is answered.
    }
    state().apply((session) => removeTileFrom(session, tileId));
    planRetry();
    const files = tile.photos.filter((photo) => photo.owned).map((photo) => photo.uri);
    if (files.length === 0) {
      return;
    }
    void track(
      (deps.afterSheets ?? (() => Promise.resolve()))()
        .then(() => {
          if (state().generation !== generation) {
            return undefined; // The scan ended: its files are already deleted.
          }
          for (const uri of files) {
            deps.deleteFile(uri);
          }
          state().apply((session) => forgetPhotos(session, files));
          return writeDown();
        })
        .catch(() => undefined)
    );
  }

  function addAnswered(key: string): void {
    const session = state().session;
    if (session.pendingAdd?.key !== key) {
      return; // Another scan, or answered already.
    }
    const files = sentPhotoFiles(session);
    state().apply((current) => addAnsweredTo(current, key));
    for (const uri of files) {
      deps.deleteFile(uri);
    }
    planRetry();
    void writeDown();
  }

  function watchWaiting(): () => void {
    watchers += 1;
    planRetry();
    let watching = true;
    return () => {
      if (!watching) {
        return;
      }
      watching = false;
      watchers -= 1;
      if (watchers === 0) {
        stopRetryTimer();
      }
    };
  }

  function endScan(): void {
    const files = photoFilesToDelete(state().session);
    stopRetryTimer();
    retries = 0;
    serverFailures.clear();
    state().reset();
    for (const uri of files) {
      deps.deleteFile(uri);
    }
    void writeDown();
  }

  async function idle(): Promise<void> {
    while (pending.size > 0) {
      await Promise.allSettled([...pending]);
    }
  }

  return {
    currentScan: () => state().generation,
    addPhotos,
    retryWaiting,
    watchWaiting,
    removeTile,
    addAnswered,
    retryGivenUp,
    endScan,
    sweepLeftovers: writeDown,
    onLanded: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    idle,
  };
}

/**
 * Deletes a photo file of the scan (a camera photo, or the picker's copy of a library photo, both
 * in the app's cache). A file that is already gone, or that cannot be deleted, is left to the
 * system, which clears the cache anyway. The web has no such files.
 */
export function deleteScanPhotoFile(uri: string): void {
  if (Platform.OS === 'web' || !uri.startsWith('file:')) {
    return;
  }
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Left to the system's cache clean-up.
  }
}

/** The app's scan runner: the device's reader, the API's matcher. */
export const scanRunner: ScanRunner = createScanRunner({
  provider: () => getDeviceOcrProvider(),
  matcher: (read) => matchScannedCard(read),
  deleteFile: deleteScanPhotoFile,
  journal: storedScanPhotoJournal,
  afterSheets: afterModals,
  isOnline: () => onlineManager.isOnline(),
});
