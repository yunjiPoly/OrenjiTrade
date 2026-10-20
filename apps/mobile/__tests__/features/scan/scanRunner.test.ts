import { ApiError } from '@/src/api/ApiError';
import { FakeOcrProvider, type FakeCardText } from '@/src/features/scan/ocr/fakeOcrProvider';
import { memoryScanPhotoJournal } from '@/src/features/scan/scanPhotoJournal';
import {
  createScanRunner,
  SERVER_FAILURES_WHILE_UP,
  type PhotoToRead,
} from '@/src/features/scan/scanRunner';
import { findTile, removeTile, scanCounts, type ScanTile } from '@/src/features/scan/scanSession';
import { useScanStore } from '@/src/features/scan/scanStore';
import type { CardScanMatch, ScanRead } from '@/src/features/scan/types';

import {
  FOUND_YEW,
  notFound,
  PICK_RARITY_LANTERN,
  READ_YEW,
  YEW,
} from '../../support/scanFixtures';

/**
 * The scan's runner (owner spec 2026-10-15, sections 3.2 and 4): photos read in turn while the
 * shutter never waits, waiting tiles matched again, the scan's photo files deleted when it ends.
 * The reader is the fake of the tests and the matcher a jest function: no network, no device.
 */

function library(uri: string): PhotoToRead {
  return { photo: { uri, width: 3000, height: 4000, owned: true }, source: 'LIBRARY' };
}

const YEW_TEXT: FakeCardText = { whole: [YEW.name, 'ZACR-EN036'], turned: {} };
const LANTERN_TEXT: FakeCardText = { whole: ['Endless Lantern', 'ZRA1-EN075'], turned: {} };

function setup(
  cards: Record<string, FakeCardText>,
  matcher: (read: ScanRead) => Promise<CardScanMatch>,
  provider: FakeOcrProvider | null = new FakeOcrProvider(cards),
  extra: Partial<Parameters<typeof createScanRunner>[0]> = {}
) {
  const deleted: string[] = [];
  const match = jest.fn(matcher);
  const runner = createScanRunner({
    provider: () => provider,
    matcher: match,
    deleteFile: (uri) => deleted.push(uri),
    ...extra,
  });
  return { runner, match, deleted, provider };
}

const offline = () => ApiError.network(new TypeError('Network request failed'));
const unavailable = () =>
  new ApiError({ status: 503, errorCode: 'SERVICE_UNAVAILABLE', message: 'Try again later' });

/** Every status the tile takes in the store from now on, its current one first (repeats skipped). */
function watchStatuses(tileId: () => string): { statuses: string[]; stop: () => void } {
  const now = findTile(useScanStore.getState().session, tileId())?.status;
  const statuses: string[] = now ? [now] : [];
  const stop = useScanStore.subscribe((state) => {
    const status = findTile(state.session, tileId())?.status;
    if (status && statuses[statuses.length - 1] !== status) {
      statuses.push(status);
    }
  });
  return { statuses, stop };
}

function tiles(): ScanTile[] {
  return useScanStore.getState().session.tiles;
}

beforeEach(() => {
  useScanStore.getState().reset();
});

describe('reading photos', () => {
  it('adds a "Reading…" tile at once for each photo, newest first, and lands each answer', async () => {
    const { runner, match } = setup(
      { 'file:///a.jpg': YEW_TEXT, 'file:///b.jpg': LANTERN_TEXT },
      async (read) => (read.codes[0] === 'ZACR-EN036' ? FOUND_YEW : PICK_RARITY_LANTERN)
    );
    const ids = runner.addPhotos([library('file:///a.jpg'), library('file:///b.jpg')]);
    expect(tiles().map((tile) => [tile.id, tile.status])).toEqual([
      [ids[1], 'READING'],
      [ids[0], 'READING'],
    ]);
    await runner.idle();
    expect(tiles().map((tile) => tile.status)).toEqual(['PICK_RARITY', 'FOUND']);
    expect(match).toHaveBeenCalledWith(READ_YEW);
  });

  it('reads the photos one after another, in the order they were added', async () => {
    const provider = new FakeOcrProvider({ 'file:///a.jpg': YEW_TEXT, 'file:///b.jpg': YEW_TEXT });
    const { runner } = setup({}, async () => FOUND_YEW, provider);
    runner.addPhotos([library('file:///a.jpg'), library('file:///b.jpg')]);
    await runner.idle();
    const uris = provider.calls.map((call) => call.uri);
    expect(uris.indexOf('file:///b.jpg')).toBeGreaterThan(uris.lastIndexOf('file:///a.jpg'));
  });

  it('groups a card found again with the same printing: ×2 on one tile', async () => {
    const { runner } = setup(
      { 'file:///a.jpg': YEW_TEXT, 'file:///b.jpg': YEW_TEXT },
      async () => FOUND_YEW
    );
    const landed: ScanTile[] = [];
    runner.onLanded((tile) => landed.push(tile));
    runner.addPhotos([library('file:///a.jpg'), library('file:///b.jpg')]);
    await runner.idle();
    expect(tiles()).toHaveLength(1);
    expect(tiles()[0]?.copies).toBe(2);
    // The second photo landed in the first one's tile: its result is that tile.
    expect(landed.map((tile) => tile.copies)).toEqual([1, 2]);
  });

  it('says "Couldn\'t read" when the photo held nothing, without calling the API', async () => {
    const { runner, match } = setup({ 'file:///a.jpg': { whole: [], turned: {} } }, async () =>
      notFound(READ_YEW)
    );
    runner.addPhotos([library('file:///a.jpg')]);
    await runner.idle();
    expect(tiles()[0]?.status).toBe('NOT_FOUND');
    expect(tiles()[0]?.notFoundReason).toBe('NOTHING_READ');
    expect(match).not.toHaveBeenCalled();
  });

  it('says "Couldn\'t read" when this build has no reader (Expo Go, the web)', async () => {
    const { runner, match } = setup({}, async () => FOUND_YEW, null);
    runner.addPhotos([library('file:///a.jpg')]);
    await runner.idle();
    expect(tiles()[0]?.status).toBe('NOT_FOUND');
    expect(match).not.toHaveBeenCalled();
  });

  it('says "Couldn\'t read" when the reader fails', async () => {
    const { runner } = setup(
      { 'file:///a.jpg': { whole: new Error('Vision failed'), turned: {} } },
      async () => FOUND_YEW
    );
    runner.addPhotos([library('file:///a.jpg')]);
    await runner.idle();
    expect(tiles()[0]?.status).toBe('NOT_FOUND');
  });
});

describe('waiting for the connection', () => {
  it('waits while the API cannot be reached, and resolves once a match gets through', async () => {
    let online = false;
    const { runner, match } = setup(
      { 'file:///a.jpg': YEW_TEXT, 'file:///b.jpg': LANTERN_TEXT },
      async (read) => {
        if (!online) {
          throw ApiError.network(new TypeError('Network request failed'));
        }
        return read.codes[0] === 'ZACR-EN036' ? FOUND_YEW : PICK_RARITY_LANTERN;
      }
    );
    const [first] = runner.addPhotos([library('file:///a.jpg')]);
    await runner.idle();
    expect(findTile(useScanStore.getState().session, first ?? '')?.status).toBe('WAITING');

    online = true;
    // The next photo's match gets through: the waiting tile is matched again by itself.
    runner.addPhotos([library('file:///b.jpg')]);
    await runner.idle();
    expect(tiles().map((tile) => tile.status)).toEqual(['PICK_RARITY', 'FOUND']);
    expect(match).toHaveBeenCalledTimes(3);
  });

  it('tries the waiting tiles again on a timer while a scan screen is open, the phone online all along', async () => {
    jest.useFakeTimers();
    try {
      // The phone stays online: only the API could not be reached for a while.
      let reachable = false;
      const { runner, match } = setup({ 'file:///a.jpg': YEW_TEXT }, async () => {
        if (!reachable) {
          throw offline();
        }
        return FOUND_YEW;
      });
      const stop = runner.watchWaiting();
      runner.addPhotos([library('file:///a.jpg')]);
      await jest.advanceTimersByTimeAsync(0);
      expect(tiles()[0]?.status).toBe('WAITING');
      expect(match).toHaveBeenCalledTimes(1);

      // First try after 5 s: still unreachable, the tile waits again.
      await jest.advanceTimersByTimeAsync(4_999);
      expect(match).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(match).toHaveBeenCalledTimes(2);
      expect(tiles()[0]?.status).toBe('WAITING');

      // The next try waits longer (10 s); the API is back meanwhile: no new photo needed.
      reachable = true;
      await jest.advanceTimersByTimeAsync(9_999);
      expect(match).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(1);
      expect(match).toHaveBeenCalledTimes(3);
      expect(tiles()[0]?.status).toBe('FOUND');

      // Nothing waits any more: no more tries.
      await jest.advanceTimersByTimeAsync(120_000);
      expect(match).toHaveBeenCalledTimes(3);
      stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops trying on its timer once no scan screen is open, and when the scan ends', async () => {
    jest.useFakeTimers();
    try {
      const { runner, match } = setup({ 'file:///a.jpg': YEW_TEXT }, async () => {
        throw offline();
      });
      const stop = runner.watchWaiting();
      runner.addPhotos([library('file:///a.jpg')]);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(match).toHaveBeenCalledTimes(2);
      stop();
      await jest.advanceTimersByTimeAsync(300_000);
      expect(match).toHaveBeenCalledTimes(2);

      // Open again: the delays start again from the shortest, until the scan ends.
      const again = runner.watchWaiting();
      runner.addPhotos([library('file:///a.jpg')]);
      await jest.advanceTimersByTimeAsync(0);
      const before = match.mock.calls.length;
      runner.endScan();
      await jest.advanceTimersByTimeAsync(300_000);
      expect(match).toHaveBeenCalledTimes(before);
      again();
    } finally {
      jest.useRealTimers();
    }
  });

  it('plans no try while no scan screen is open', async () => {
    jest.useFakeTimers();
    try {
      const { runner, match } = setup({ 'file:///a.jpg': YEW_TEXT }, async () => {
        throw offline();
      });
      runner.addPhotos([library('file:///a.jpg')]);
      await jest.advanceTimersByTimeAsync(10 * 60_000);
      expect(tiles()[0]?.status).toBe('WAITING');
      expect(match).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('matches the waiting tiles again when asked (the connection is back)', async () => {
    let online = false;
    const { runner } = setup({ 'file:///a.jpg': YEW_TEXT }, async () => {
      if (!online) {
        throw ApiError.network(new TypeError('Network request failed'));
      }
      return FOUND_YEW;
    });
    runner.addPhotos([library('file:///a.jpg')]);
    await runner.idle();
    expect(tiles()[0]?.status).toBe('WAITING');
    await runner.retryWaiting();
    expect(tiles()[0]?.status).toBe('WAITING');
    online = true;
    await runner.retryWaiting();
    await runner.idle();
    expect(tiles()[0]?.status).toBe('FOUND');
  });
});

describe('the API could not answer this time (a server error)', () => {
  it('waits, then resolves by itself once the API answers again: never "Couldn\'t read" for a good read', async () => {
    jest.useFakeTimers();
    try {
      let up = false;
      const { runner, match } = setup({ 'file:///a.jpg': YEW_TEXT }, async () => {
        if (!up) {
          throw unavailable();
        }
        return FOUND_YEW;
      });
      const stop = runner.watchWaiting();
      runner.addPhotos([library('file:///a.jpg')]);
      await jest.advanceTimersByTimeAsync(0);
      expect(tiles()[0]).toMatchObject({ status: 'WAITING', read: READ_YEW });

      // The API is back (a restart is over): the timer's next try finds the card, no new photo.
      up = true;
      await jest.advanceTimersByTimeAsync(5_000);
      expect(tiles()[0]?.status).toBe('FOUND');
      expect(match).toHaveBeenCalledTimes(2);
      stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps waiting through a long outage, however many tries fail', async () => {
    jest.useFakeTimers();
    try {
      const { runner, match } = setup({ 'file:///a.jpg': YEW_TEXT }, async () => {
        throw unavailable();
      });
      const stop = runner.watchWaiting();
      runner.addPhotos([library('file:///a.jpg')]);
      await jest.advanceTimersByTimeAsync(10 * 60_000);
      expect(match.mock.calls.length).toBeGreaterThan(SERVER_FAILURES_WHILE_UP + 2);
      expect(tiles()[0]?.status).toBe('WAITING');
      stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it('gives a tile up whose match keeps failing while the API answers the other photos', async () => {
    const { runner, match } = setup(
      {
        'file:///bad.jpg': LANTERN_TEXT,
        'file:///a.jpg': YEW_TEXT,
        'file:///b.jpg': YEW_TEXT,
        'file:///c.jpg': YEW_TEXT,
      },
      async (read) => {
        if (read.codes[0] === 'ZRA1-EN075') {
          throw unavailable(); // Always, for this read only.
        }
        return FOUND_YEW;
      }
    );
    const [bad] = runner.addPhotos([library('file:///bad.jpg')]);
    await runner.idle();
    expect(findTile(useScanStore.getState().session, bad ?? '')?.status).toBe('WAITING');
    // Each photo the API answers tries the waiting tile again.
    for (const uri of ['file:///a.jpg', 'file:///b.jpg']) {
      runner.addPhotos([library(uri)]);
      await runner.idle();
    }
    const given = findTile(useScanStore.getState().session, bad ?? '');
    expect(given).toMatchObject({ status: 'NOT_FOUND', notFoundReason: null });
    // Its read is kept: the search opens with it.
    expect(given?.read).toEqual({ codes: ['ZRA1-EN075'], names: ['Endless Lantern'] });
    const triesOfBad = match.mock.calls.filter(([read]) => read.codes[0] === 'ZRA1-EN075');
    expect(triesOfBad).toHaveLength(1 + SERVER_FAILURES_WHILE_UP);
    // Given up: no more tries for it.
    runner.addPhotos([library('file:///c.jpg')]);
    await runner.idle();
    expect(match.mock.calls.filter(([read]) => read.codes[0] === 'ZRA1-EN075')).toHaveLength(
      1 + SERVER_FAILURES_WHILE_UP
    );
  });
});

describe('trying a waiting tile again', () => {
  it('keeps it "Waiting for connection" while it is tried, and marks the try under way', async () => {
    jest.useFakeTimers();
    try {
      // A network that stalls: each try hangs 20 s before it fails.
      const { runner } = setup(
        { 'file:///a.jpg': YEW_TEXT, 'file:///b.jpg': YEW_TEXT },
        () =>
          new Promise<CardScanMatch>((_resolve, reject) =>
            setTimeout(() => reject(ApiError.timeout(20_000)), 20_000)
          )
      );
      const ids = runner.addPhotos([library('file:///a.jpg')]);
      await jest.advanceTimersByTimeAsync(20_000);
      const waiting = ids[0] ?? '';
      expect(findTile(useScanStore.getState().session, waiting)?.status).toBe('WAITING');
      const before = scanCounts(useScanStore.getState().session);
      const watched = watchStatuses(() => waiting);

      const stop = runner.watchWaiting();
      await jest.advanceTimersByTimeAsync(5_000 + 1_000);
      // The try is under way: the tile still waits, the counts (and the add) are unchanged.
      expect(useScanStore.getState().trying).toEqual([waiting]);
      expect(findTile(useScanStore.getState().session, waiting)?.status).toBe('WAITING');
      expect(scanCounts(useScanStore.getState().session)).toEqual(before);
      await jest.advanceTimersByTimeAsync(19_000);
      expect(useScanStore.getState().trying).toEqual([]);
      await jest.advanceTimersByTimeAsync(5 * 60_000);
      // Never "Reading…" again: tried several times, it waited all along.
      expect(watched.statuses).toEqual(['WAITING']);
      watched.stop();
      stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it('says a tile again only when its result changed, or when the collector asked', async () => {
    jest.useFakeTimers();
    try {
      let reachable = false;
      const { runner, match } = setup({ 'file:///a.jpg': YEW_TEXT }, async () => {
        if (!reachable) {
          throw offline();
        }
        return FOUND_YEW;
      });
      const landed: string[] = [];
      runner.onLanded((tile) => landed.push(tile.status));
      const stop = runner.watchWaiting();
      runner.addPhotos([library('file:///a.jpg')]);
      await jest.advanceTimersByTimeAsync(5 * 60_000);
      expect(match.mock.calls.length).toBeGreaterThan(5);
      // Read, then waiting: said once, not at every try that changed nothing.
      expect(landed).toEqual(['WAITING']);

      // "Try again": the collector hears that it still waits.
      await runner.retryWaiting({ explicit: true });
      expect(landed).toEqual(['WAITING', 'WAITING']);

      reachable = true;
      await jest.advanceTimersByTimeAsync(60_000);
      expect(landed).toEqual(['WAITING', 'WAITING', 'FOUND']);
      stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it("skips the timer's tries while the phone says it is offline", async () => {
    jest.useFakeTimers();
    try {
      let online = false;
      const { runner, match } = setup(
        { 'file:///a.jpg': YEW_TEXT },
        async () => {
          throw offline();
        },
        undefined,
        { isOnline: () => online }
      );
      const stop = runner.watchWaiting();
      runner.addPhotos([library('file:///a.jpg')]);
      await jest.advanceTimersByTimeAsync(10 * 60_000);
      expect(match).toHaveBeenCalledTimes(1);
      // Online again (the screens also try at once): the timer tries again.
      online = true;
      await jest.advanceTimersByTimeAsync(60_000);
      expect(match).toHaveBeenCalledTimes(2);
      stop();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ending the scan', () => {
  it('deletes every photo file the scan made or copied, removed tiles included', async () => {
    const { runner, deleted } = setup(
      { 'file:///a.jpg': YEW_TEXT, 'file:///b.jpg': LANTERN_TEXT },
      async (read) => (read.codes[0] === 'ZACR-EN036' ? FOUND_YEW : PICK_RARITY_LANTERN)
    );
    const [, second] = runner.addPhotos([
      library('file:///a.jpg'),
      library('file:///b.jpg'),
      {
        photo: { uri: 'file:///not-mine.jpg', width: 10, height: 10, owned: false },
        source: 'LIBRARY',
      },
    ]);
    await runner.idle();
    useScanStore.getState().apply((session) => removeTile(session, second ?? ''));
    runner.endScan();
    expect(deleted.sort()).toEqual(['file:///a.jpg', 'file:///b.jpg']);
    expect(tiles()).toEqual([]);
  });

  it("never lands a late answer of an ended scan on the next scan's tile of the same id", async () => {
    // Tile ids start again at scan-1 in every scan: only the scan's generation tells them apart.
    const answers: ((match: CardScanMatch) => void)[] = [];
    const { runner } = setup(
      { 'file:///a.jpg': YEW_TEXT, 'file:///b.jpg': LANTERN_TEXT },
      () => new Promise<CardScanMatch>((resolve) => answers.push(resolve))
    );
    const [first] = runner.addPhotos([library('file:///a.jpg')]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(answers).toHaveLength(1);
    runner.endScan();

    const [second] = runner.addPhotos([library('file:///b.jpg')]);
    expect(second).toBe(first);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(answers).toHaveLength(2);

    // The ended scan's answer comes back late: the new tile is not touched.
    answers[0]?.(FOUND_YEW);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(findTile(useScanStore.getState().session, second ?? '')?.status).toBe('READING');
    expect(findTile(useScanStore.getState().session, second ?? '')?.card).toBeNull();

    answers[1]?.(PICK_RARITY_LANTERN);
    await runner.idle();
    expect(findTile(useScanStore.getState().session, second ?? '')?.card?.name).toBe(
      'Endless Lantern'
    );
  });

  it('deletes a photo the camera hands over after its scan ended, and reads nothing of it', async () => {
    const { runner, deleted, provider } = setup(
      { 'file:///late.jpg': YEW_TEXT },
      async () => FOUND_YEW
    );
    const scan = runner.currentScan();
    runner.endScan();
    expect(runner.addPhotos([library('file:///late.jpg')], scan)).toEqual([]);
    await runner.idle();
    expect(deleted).toEqual(['file:///late.jpg']);
    expect(tiles()).toEqual([]);
    expect(provider?.calls).toEqual([]);
    // A photo for the scan going on is added as usual.
    expect(runner.addPhotos([library('file:///late.jpg')], runner.currentScan())).toHaveLength(1);
  });

  it('drops what the reader and the API answer for a scan that ended', async () => {
    let answer: (match: CardScanMatch) => void = () => undefined;
    const { runner } = setup(
      { 'file:///a.jpg': YEW_TEXT },
      () => new Promise<CardScanMatch>((resolve) => (answer = resolve))
    );
    runner.addPhotos([library('file:///a.jpg')]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    runner.endScan();
    answer(FOUND_YEW);
    await runner.idle();
    expect(tiles()).toEqual([]);
  });
});

describe('removing a tile', () => {
  it('deletes its photo files once no sheet shows them, and the scan forgets them', async () => {
    let sheetsGone: () => void = () => undefined;
    const sheets = new Promise<void>((resolve) => (sheetsGone = resolve));
    const journal = memoryScanPhotoJournal();
    const { runner, deleted } = setup(
      { 'file:///a.jpg': YEW_TEXT, 'file:///b.jpg': LANTERN_TEXT },
      async (read) => (read.codes[0] === 'ZACR-EN036' ? FOUND_YEW : PICK_RARITY_LANTERN),
      undefined,
      { afterSheets: () => sheets, journal }
    );
    const [yew] = runner.addPhotos([library('file:///a.jpg'), library('file:///b.jpg')]);
    await runner.idle();
    runner.removeTile(yew ?? '');
    expect(tiles()).toHaveLength(1);
    // Its sheet is still sliding away: the file waits.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleted).toEqual([]);

    sheetsGone();
    await runner.idle();
    expect(deleted).toEqual(['file:///a.jpg']);
    expect(useScanStore.getState().session.discarded).toEqual([]);
    expect(journal.uris).toEqual(['file:///b.jpg']);

    // The scan ends: the other photo is deleted, the removed one is not deleted twice.
    runner.endScan();
    expect(deleted).toEqual(['file:///a.jpg', 'file:///b.jpg']);
  });

  it('leaves the files to the end of the scan when it ended before the sheets left', async () => {
    let sheetsGone: () => void = () => undefined;
    const sheets = new Promise<void>((resolve) => (sheetsGone = resolve));
    const { runner, deleted } = setup(
      { 'file:///a.jpg': YEW_TEXT },
      async () => FOUND_YEW,
      undefined,
      {
        afterSheets: () => sheets,
      }
    );
    const [yew] = runner.addPhotos([library('file:///a.jpg')]);
    await runner.idle();
    runner.removeTile(yew ?? '');
    runner.endScan();
    expect(deleted).toEqual(['file:///a.jpg']);
    sheetsGone();
    await runner.idle();
    expect(deleted).toEqual(['file:///a.jpg']);
  });
});

describe('a scan lost when the app was closed', () => {
  it('writes down the photo files it owns while it runs, and forgets them when it ends', async () => {
    const journal = memoryScanPhotoJournal();
    const deleted: string[] = [];
    const runner = createScanRunner({
      provider: () => new FakeOcrProvider({ 'file:///a.jpg': YEW_TEXT }),
      matcher: async () => FOUND_YEW,
      deleteFile: (uri) => deleted.push(uri),
      journal,
    });
    runner.addPhotos([
      library('file:///a.jpg'),
      {
        photo: { uri: 'file:///not-mine.jpg', width: 1, height: 1, owned: false },
        source: 'LIBRARY',
      },
    ]);
    await runner.idle();
    expect(journal.uris).toEqual(['file:///a.jpg']);
    runner.endScan();
    await runner.idle();
    expect(deleted).toEqual(['file:///a.jpg']);
    expect(journal.uris).toEqual([]);
  });

  it('deletes the files an earlier run wrote down, once, keeping the files of this scan', async () => {
    const journal = memoryScanPhotoJournal(['file:///earlier-1.jpg', 'file:///earlier-2.jpg']);
    const deleted: string[] = [];
    const runner = createScanRunner({
      provider: () => new FakeOcrProvider({ 'file:///a.jpg': YEW_TEXT }),
      matcher: async () => FOUND_YEW,
      deleteFile: (uri) => deleted.push(uri),
      journal,
    });
    // A photo added before the first sweep: the earlier files are deleted all the same.
    runner.addPhotos([library('file:///a.jpg')]);
    await runner.sweepLeftovers();
    await runner.idle();
    expect(deleted).toEqual(['file:///earlier-1.jpg', 'file:///earlier-2.jpg']);
    expect(journal.uris).toEqual(['file:///a.jpg']);
    await runner.sweepLeftovers();
    expect(deleted).toHaveLength(2);
  });
});
