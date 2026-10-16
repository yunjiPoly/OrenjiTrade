import { ApiError } from '@/src/api/ApiError';
import { FakeOcrProvider, type FakeCardText } from '@/src/features/scan/ocr/fakeOcrProvider';
import { createScanRunner, type PhotoToRead } from '@/src/features/scan/scanRunner';
import { findTile, removeTile, type ScanTile } from '@/src/features/scan/scanSession';
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
  provider: FakeOcrProvider | null = new FakeOcrProvider(cards)
) {
  const deleted: string[] = [];
  const match = jest.fn(matcher);
  const runner = createScanRunner({
    provider: () => provider,
    matcher: match,
    deleteFile: (uri) => deleted.push(uri),
  });
  return { runner, match, deleted, provider };
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
