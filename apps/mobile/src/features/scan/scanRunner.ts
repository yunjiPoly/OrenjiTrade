import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { matchScannedCard } from '@/src/api/hooks/cardScan';

import type { CardCrops } from './frameMapping';
import { getDeviceOcrProvider } from './ocr/deviceOcr';
import type { OcrProvider } from './ocr/types';
import { readCardText, type PhotoSource } from './readCardText';
import { applyOutcome, matchRead, type CardMatcher, type PhotoOutcome } from './scanPipeline';
import {
  addPhoto,
  findTile,
  markReading,
  photoFilesToDelete,
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
 *   (`retryWaiting`: called when the app is online again, and after any match that got through).
 * - Ending the scan (cards added, or the scan left) deletes every photo file it made or copied and
 *   empties the tray; what the reader or the API answers later for that scan is dropped.
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
  store?: Pick<typeof useScanStore, 'getState'>;
}

export interface ScanRunner {
  /** Adds photos to the tray ("Reading…" tiles, newest first) and reads them in turn. */
  addPhotos: (photos: readonly PhotoToRead[]) => string[];
  /** Matches the tiles that wait for the connection again, oldest first. */
  retryWaiting: () => Promise<void>;
  /** Ends the scan: its photo files are deleted and the tray is emptied. */
  endScan: () => void;
  /** Called with each tile once its photo is matched (or found unreadable): its result. */
  onLanded: (listener: (tile: ScanTile) => void) => () => void;
  /** Resolves once every photo added so far is read and matched (tests). */
  idle: () => Promise<void>;
}

export function createScanRunner(deps: ScanRunnerDeps): ScanRunner {
  const store = deps.store ?? useScanStore;
  const listeners = new Set<(tile: ScanTile) => void>();
  const pending = new Set<Promise<unknown>>();
  let reading: Promise<void> = Promise.resolve();
  let retrying = false;

  const state = (): ScanStore => store.getState();
  const track = <T>(work: Promise<T>): Promise<T> => {
    pending.add(work);
    void work.finally(() => pending.delete(work)).catch(() => undefined);
    return work;
  };

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

  function addPhotos(photos: readonly PhotoToRead[]): string[] {
    const generation = state().generation;
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

  function endScan(): void {
    const files = photoFilesToDelete(state().session);
    state().reset();
    for (const uri of files) {
      deps.deleteFile(uri);
    }
  }

  async function idle(): Promise<void> {
    while (pending.size > 0) {
      await Promise.allSettled([...pending]);
    }
  }

  return {
    addPhotos,
    retryWaiting,
    endScan,
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
});
