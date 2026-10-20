import { ApiError } from '@/src/api/ApiError';
import { FakeOcrProvider } from '@/src/features/scan/ocr/fakeOcrProvider';
import { readCardText, type ReadCardInput } from '@/src/features/scan/readCardText';
import { applyOutcome, matchRead, readAndMatch } from '@/src/features/scan/scanPipeline';
import {
  addPhoto,
  emptyScanSession,
  findTile,
  tilesWaiting,
} from '@/src/features/scan/scanSession';
import type { CardScanMatch } from '@/src/features/scan/types';

const PHOTO = { uri: 'file:///cache/scan/photo-1.jpg', width: 3000, height: 4000 };
const INPUT: ReadCardInput = { photo: PHOTO, source: 'LIBRARY' };

const FOUND: CardScanMatch = {
  status: 'FOUND',
  card: { id: 'card-ii', name: 'Inkshade Interference' },
  printing: {
    id: 'p-za01-075-u',
    printingCode: 'ZA01-EN075',
    setCode: 'ZA01',
    setName: '25th Lanternfall Rarity Collection',
    rarity: 'Ultra Rare',
  },
  rarities: [],
  printings: [],
  otherMatches: [],
  read: { codes: ['ZA01-EN075'], names: ['Inkshade Interference'] },
};

function deviceReader(whole: string[] | Error) {
  const fake = new FakeOcrProvider({ [PHOTO.uri]: { whole, turned: {} } });
  return (input: ReadCardInput) => readCardText(fake, input);
}

describe('one photo, from the reader to its tile', () => {
  it('reads the card, sends what was read, and lands the answer on the tile', async () => {
    const matcher = jest.fn(async () => FOUND);
    const outcome = await readAndMatch(
      deviceReader(['Inkshade Interference', 'ZA01-EN075']),
      matcher,
      INPUT
    );
    expect(matcher).toHaveBeenCalledWith({
      codes: ['ZA01-EN075'],
      names: ['Inkshade Interference'],
    });
    expect(outcome).toEqual({ kind: 'MATCHED', read: FOUND.read, match: FOUND });
    const { session, tileId } = addPhoto(emptyScanSession(), { ...PHOTO, owned: true });
    expect(findTile(applyOutcome(session, tileId, outcome), tileId)?.status).toBe('FOUND');
  });

  it('says "Couldn\'t read" at once when nothing was read, and sends nothing', async () => {
    const matcher = jest.fn(async () => FOUND);
    const outcome = await readAndMatch(deviceReader([]), matcher, INPUT);
    expect(matcher).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      kind: 'UNREAD',
      read: { codes: [], names: [] },
      reason: 'NOTHING_READ',
    });
    const { session, tileId } = addPhoto(emptyScanSession(), { ...PHOTO, owned: true });
    expect(findTile(applyOutcome(session, tileId, outcome), tileId)).toMatchObject({
      status: 'NOT_FOUND',
      notFoundReason: 'NOTHING_READ',
    });
  });

  it('says "Couldn\'t read" when the reader fails', async () => {
    const matcher = jest.fn(async () => FOUND);
    await expect(
      readAndMatch(deviceReader(new Error('engine failed')), matcher, INPUT)
    ).resolves.toEqual({ kind: 'UNREAD', read: null, reason: null });
    expect(matcher).not.toHaveBeenCalled();
  });

  it('waits for the connection when the API cannot be reached, then resolves', async () => {
    const offline = jest.fn(async (): Promise<CardScanMatch> => {
      throw ApiError.network(new TypeError('Network request failed'));
    });
    const outcome = await readAndMatch(
      deviceReader(['Inkshade Interference', 'ZA01-EN075']),
      offline,
      INPUT
    );
    expect(outcome).toEqual({ kind: 'OFFLINE', read: FOUND.read, cause: 'NETWORK' });
    const added = addPhoto(emptyScanSession(), { ...PHOTO, owned: true });
    let session = applyOutcome(added.session, added.tileId, outcome);
    expect(findTile(session, added.tileId)?.status).toBe('WAITING');

    // The connection is back: every waiting tile is matched again with what it read.
    for (const { tileId, read } of tilesWaiting(session)) {
      session = applyOutcome(session, tileId, await matchRead(async () => FOUND, read));
    }
    expect(findTile(session, added.tileId)?.status).toBe('FOUND');
  });

  it('says "Couldn\'t read" when the API refuses (flag off, a bad request, the account)', async () => {
    for (const refusal of [
      new ApiError({ status: 404, errorCode: 'FEATURE_DISABLED', message: 'off' }),
      new ApiError({ status: 400, errorCode: 'VALIDATION_FAILED', message: 'bad' }),
      new ApiError({ status: 403, errorCode: 'ACCOUNT_SUSPENDED', message: 'suspended' }),
    ]) {
      const outcome = await matchRead(async () => Promise.reject(refusal), FOUND.read);
      // The API answered (a refusal): it can be reached.
      expect(outcome).toEqual({ kind: 'UNREAD', read: FOUND.read, reason: null, refused: true });
    }
    // Not an answer of the API: nothing is said of it.
    await expect(
      matchRead(async () => Promise.reject(new Error('not an API error')), FOUND.read)
    ).resolves.toEqual({ kind: 'UNREAD', read: FOUND.read, reason: null });
  });

  it('waits when the API could not answer this time (server error, restart, too many requests)', async () => {
    for (const [status, errorCode] of [
      [500, 'INTERNAL_ERROR'],
      [502, 'BAD_GATEWAY'],
      [503, 'SERVICE_UNAVAILABLE'],
      [504, 'GATEWAY_TIMEOUT'],
      [408, 'REQUEST_TIMEOUT'],
      [429, 'RATE_LIMITED'],
    ] as const) {
      const failure = new ApiError({ status, errorCode, message: 'not now' });
      const outcome = await matchRead(async () => Promise.reject(failure), FOUND.read);
      // The read is kept, to match again later: never "Couldn't read" for a good read.
      expect(outcome).toEqual({ kind: 'OFFLINE', read: FOUND.read, cause: 'SERVER' });
    }
  });
});
