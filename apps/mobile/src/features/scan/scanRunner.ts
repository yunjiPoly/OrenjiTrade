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
  addPhoto,
  findTile,
  forgetPhotos,
  markReading,
  photoFilesToDelete,
  removeTile as removeTileFrom,
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
 * - A tile whose match could not reach the API waits for the connection ("Waiting for
 *   connection"); the waiting tiles are matched again when the connection is back
 *   (`retryWaiting`): when the phone is online again, after any match that got through, when a
 *   scan screen comes back or the app returns to the front, when the collector taps "Try again",
 *   and on a timer that waits longer each time (5 s, 10 s, 20 s, 40 s, then every minute) while a
 *   scan screen is open (`watchWaiting`). The phone can be online while the API cannot be
 *   reached, so the timer does not wait for the phone to say it is back.
 * - A removed tile's photo files are deleted once no sheet shows them any more (`removeTile`).
 * - Ending the scan (cards added, or the scan left) deletes every photo file it made or copied and
 *   empties the tray; what the reader or the API answers later for that scan is dropped, and so is
 *   a photo the camera hands over after its scan ended (its file is deleted).
 * - The scan's photo files are written down while it runs (`scanPhotoJournal.ts`): a scan lost
 *   when the app was closed has its files deleted in a later run, as soon as Add cards or a scan
 *   screen opens.
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
}

/** The waiting tiles are tried again after 5 s, 10 s, 20 s, 40 s, then every minute. */
export const RETRY_DELAYS_MS: readonly number[] = [5_000, 10_000, 20_000, 40_000, 60_000];

export interface ScanRunner {
  /** The scan going on now (it changes when a scan ends). */
  currentScan: () => number;
  /**
   * Adds photos to the tray ("Reading…" tiles, newest first) and reads them in turn. Given the
   * scan they were taken for (`currentScan()` before the camera took them), photos that arrive
   * after that scan ended are deleted instead, and nothing of them is read or sent.
   */
  addPhotos: (photos: readonly PhotoToRead[], forScan?: number) => string[];
  /** Matches the tiles that wait for the connection again, oldest first. */
  retryWaiting: () => Promise<void>;
  /**
   * While a scan screen is open: the tiles that wait for the connection are tried again on a
   * timer that waits longer each time. Returns the function to call when the screen closes.
   */
  watchWaiting: () => () => void;
  /** "Remove": the tile leaves the tray, and its photo files are deleted once no sheet shows them. */
  removeTile: (tileId: string) => void;
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
      void retryWaiting().finally(planRetry);
    }, delay);
  }

  function land(generation: number, tileId: string, outcome: PhotoOutcome): void {
    if (state().generation !== generation) {
      return;
    }
    const before = findTile(state().session, tileId);
    const photoUri = before?.photos[0]?.uri ?? null;
    state().apply((session) => applyOutcome(session, tileId, outcome));
    const tile = landedTile(state().session, tileId, photoUri);
    if (tile && before && tile.status !== 'READING') {
      for (const listener of [...listeners]) {
        listener(tile);
      }
    }
    if (outcome.kind === 'MATCHED') {
      // The API answered: tiles that waited for the connection can be matched now.
      void retryWaiting();
    }
    planRetry();
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

  async function retryWaiting(): Promise<void> {
    if (retrying) {
      return;
    }
    retrying = true;
    const generation = state().generation;
    try {
      for (const { tileId, read } of tilesWaiting(state().session)) {
        if (state().generation !== generation) {
          return;
        }
        state().apply((session) => markReading(session, tileId));
        const outcome = await track(matchRead(deps.matcher, read));
        land(generation, tileId, outcome);
        if (outcome.kind === 'OFFLINE') {
          return; // Still no connection: the others keep waiting.
        }
      }
    } finally {
      retrying = false;
    }
  }

  function removeTile(tileId: string): void {
    const generation = state().generation;
    const tile = findTile(state().session, tileId);
    if (!tile) {
      return;
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
});
