import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError, NETWORK_ERROR_CODE } from '@/src/api/ApiError';
import {
  buildRoomItems,
  canPost,
  EMPTY_ROOM_DRAFT,
  isRetryable,
  isRoomUnread,
  laterOf,
  orderRooms,
  postErrorMessage,
  postPlace,
  postRequest,
  postTime,
  roomPhotoProblem,
  roomPreview,
} from '@/src/features/community/communityHelpers';
import {
  markRoomVisited,
  parseVisits,
  resetRoomVisits,
  ROOM_VISITS_STORAGE_PREFIX,
  useRoomVisitsStore,
} from '@/src/features/community/roomVisits';

import { ONTARIO, ROOMS, postFixture } from '../support/fixtures';

const GAMES = ['yugioh', 'pokemon', 'mtg', 'onepiece', 'riftbound'];

function apiError(status: number, errorCode: string, message = 'refused', extra = {}): ApiError {
  return new ApiError({ status, errorCode, message, ...extra });
}

beforeEach(() => {
  resetRoomVisits();
});

describe('room order (stage R11, screen 32)', () => {
  it('puts the browsed game first, then the others in the games’ order', () => {
    expect(orderRooms(ROOMS, 'yugioh', GAMES).map((room) => room.game)).toEqual(GAMES);
    expect(orderRooms(ROOMS, 'mtg', GAMES).map((room) => room.game)).toEqual([
      'mtg',
      'yugioh',
      'pokemon',
      'onepiece',
      'riftbound',
    ]);
    // The games’ order of GET /games wins over the server's room order.
    const reversed = [...ROOMS].reverse();
    expect(orderRooms(reversed, 'onepiece', GAMES).map((room) => room.game)).toEqual([
      'onepiece',
      'yugioh',
      'pokemon',
      'mtg',
      'riftbound',
    ]);
    // A game the list does not know stays at the end, in the server's order.
    const odd = { ...ROOMS[0]!, id: 'x', slug: 'americas-north-chess', game: 'chess' };
    expect(orderRooms([odd, ...ROOMS], 'pokemon', GAMES).map((room) => room.game)).toEqual([
      'pokemon',
      'yugioh',
      'mtg',
      'onepiece',
      'riftbound',
      'chess',
    ]);
  });
});

describe('unread rooms on this phone', () => {
  const last = ROOMS[0]!.lastPost!;

  it('is bold with a dot while someone else posted after the last visit', () => {
    expect(isRoomUnread(last, null)).toBe(true);
    expect(isRoomUnread(last, '2026-10-05T14:00:00Z')).toBe(true);
    expect(isRoomUnread(last, last.createdAt)).toBe(false);
    expect(isRoomUnread(last, '2026-10-06T00:00:00Z')).toBe(false);
    // Your own newest post, or no post at all, is never new.
    expect(isRoomUnread({ ...last, mine: true }, null)).toBe(false);
    expect(isRoomUnread(undefined, null)).toBe(false);
    expect(isRoomUnread(null, '2026-10-01T00:00:00Z')).toBe(false);
  });

  it('remembers the newest post read per account, never moving back', async () => {
    await markRoomVisited('uid-1', 'americas-north-yugioh', '2026-10-05T14:41:00Z');
    await markRoomVisited('uid-1', 'americas-north-yugioh', '2026-10-01T00:00:00Z');
    await markRoomVisited('uid-2', 'europe-mtg', '2026-10-02T00:00:00Z');
    await markRoomVisited('uid-1', 'Not A Slug', '2026-10-02T00:00:00Z');
    expect(useRoomVisitsStore.getState().visits).toEqual({
      'uid-1': { 'americas-north-yugioh': '2026-10-05T14:41:00Z' },
      'uid-2': { 'europe-mtg': '2026-10-02T00:00:00Z' },
    });
    const stored = await AsyncStorage.getItem(`${ROOM_VISITS_STORAGE_PREFIX}uid-1`);
    expect(parseVisits(stored)).toEqual({ 'americas-north-yugioh': '2026-10-05T14:41:00Z' });
    expect(laterOf('2026-10-05T00:00:00Z', '2026-10-04T00:00:00Z')).toBe('2026-10-05T00:00:00Z');
    expect(laterOf(null, '2026-10-04T00:00:00Z')).toBe('2026-10-04T00:00:00Z');
  });

  it('drops anything malformed it finds on the phone', () => {
    expect(parseVisits(null)).toEqual({});
    expect(parseVisits('not json')).toEqual({});
    expect(parseVisits('[1,2]')).toEqual({});
    expect(
      parseVisits(
        JSON.stringify({
          'europe-yugioh': '2026-10-01T00:00:00Z',
          'Bad Slug': '2026-10-01T00:00:00Z',
          'europe-mtg': 'yesterday',
          'europe-pokemon': 42,
        })
      )
    ).toEqual({ 'europe-yugioh': '2026-10-01T00:00:00Z' });
  });

  it('previews the last post as "{handle}: {text}"', () => {
    expect(roomPreview(ROOMS[0]!.lastPost)).toBe(
      'kaiba_fan: Does anyone ship to New York? Looking for Nibiru.'
    );
    expect(roomPreview(undefined)).toBeNull();
  });
});

describe('a room’s posts', () => {
  it('reads like a chat: oldest first with a separator per day of the phone', () => {
    const now = new Date(2026, 9, 5, 18, 0);
    const today = postFixture({ id: 'p3', createdAt: new Date(2026, 9, 5, 9, 12).toISOString() });
    const later = postFixture({ id: 'p4', createdAt: new Date(2026, 9, 5, 14, 41).toISOString() });
    const yesterday = postFixture({
      id: 'p2',
      createdAt: new Date(2026, 9, 4, 22, 30).toISOString(),
    });
    const older = postFixture({ id: 'p1', createdAt: new Date(2026, 8, 28, 8, 0).toISOString() });
    // Pages come newest first, and a post may arrive twice (the page and the one just posted).
    const items = buildRoomItems([later, today, later, yesterday, older], now);
    expect(items.map((item) => (item.kind === 'day' ? item.label : item.post.id))).toEqual([
      'Monday, September 28',
      'p1',
      'Yesterday',
      'p2',
      'Today',
      'p3',
      'p4',
    ]);
  });

  it('shows the province under the handle, never a city, and the time of day', () => {
    expect(postPlace(postFixture())).toBe('Ontario');
    expect(postPlace(postFixture({ place: undefined }))).toBeNull();
    expect(postPlace({ place: { ...ONTARIO, subdivisionName: '' } })).toBe('Canada');
    expect(postTime(new Date(2026, 9, 5, 9, 12).toISOString())).toBe('9:12 AM');
    expect(postTime('not a date')).toBe('');
  });
});

describe('the message box', () => {
  it('turns the send button orange with text only', () => {
    expect(canPost(EMPTY_ROOM_DRAFT)).toBe(false);
    expect(canPost({ ...EMPTY_ROOM_DRAFT, text: '   ' })).toBe(false);
    expect(canPost({ ...EMPTY_ROOM_DRAFT, text: 'Hi room' })).toBe(true);
    expect(canPost({ ...EMPTY_ROOM_DRAFT, text: 'Hi room' }, true)).toBe(false);
    expect(canPost({ ...EMPTY_ROOM_DRAFT, text: 'x'.repeat(2001) })).toBe(false);
    const photo = {
      uri: 'file:///a.jpg',
      mimeType: 'image/jpeg',
      fileName: 'a.jpg',
      size: 1000,
      width: 10,
      height: 10,
    };
    // Photos alone are not a post: it needs a few words.
    expect(canPost({ ...EMPTY_ROOM_DRAFT, photos: [photo] })).toBe(false);
  });

  it('builds the post with its photos in order, its card and its binder', () => {
    expect(postRequest({ ...EMPTY_ROOM_DRAFT, text: '  Hello  ' })).toEqual({ body: 'Hello' });
    expect(
      postRequest(
        {
          text: 'Moth core is up',
          photos: [],
          card: {
            printingId: 'pr-1',
            cardId: 'c-1',
            name: 'Moth Queen',
            printingCode: 'MQ-EN001',
            imageUrl: null,
            game: 'yugioh',
          },
          binder: { binderId: 'b-1', name: 'Moth core', itemCount: 3 },
        },
        ['u-1', 'u-2']
      )
    ).toEqual({
      body: 'Moth core is up',
      cardPrintingId: 'pr-1',
      binderId: 'b-1',
      photoUploadIds: ['u-1', 'u-2'],
    });
  });

  it('takes JPEG, PNG and WebP photos of 3 MB at most', () => {
    expect(roomPhotoProblem({ mimeType: 'image/jpeg', size: 3 * 1024 * 1024 })).toBeNull();
    expect(roomPhotoProblem({ mimeType: 'image/png', size: null })).toBeNull();
    expect(roomPhotoProblem({ mimeType: 'image/jpeg', size: 3 * 1024 * 1024 + 1 })).toBe(
      'Choose a photo up to 3 MB.'
    );
    expect(roomPhotoProblem({ mimeType: 'video/mp4', size: 1000 })).toBe(
      'Use a JPEG, PNG or WebP photo.'
    );
    expect(roomPhotoProblem({ mimeType: 'image/heic', size: 1000 })).toBe(
      'Use a JPEG, PNG or WebP photo.'
    );
    expect(roomPhotoProblem({ mimeType: 'image/webp', size: 0 })).toBe('This file is empty.');
  });

  it('explains a refused post and offers "Try again" for a network error only', () => {
    expect(postErrorMessage(apiError(429, 'RATE_LIMITED'))).toBe(
      'You can post up to 10 times an hour in each room. Try again later.'
    );
    expect(postErrorMessage(apiError(409, 'DUPLICATE_POST'))).toBe('You already posted this.');
    // The uploads' own hourly limit is not the room's.
    expect(postErrorMessage(apiError(429, 'UPLOAD_RATE_LIMITED'))).toBe(
      'You sent a lot of photos in a short time. Try again later.'
    );
    expect(postErrorMessage(apiError(422, 'POST_BLOCKED'))).toMatch(/community rules/);
    expect(postErrorMessage(apiError(413, 'PAYLOAD_TOO_LARGE'))).toMatch(/larger than 3 MB/);
    expect(postErrorMessage(apiError(404, 'FEATURE_DISABLED'))).toMatch(/closed/);
    expect(
      postErrorMessage(
        apiError(400, 'VALIDATION_FAILED', 'Validation failed', {
          fieldErrors: { photoUploadIds: 'Unknown, used or expired photo upload' },
        })
      )
    ).toMatch(/photos could not be posted/);
    const offline = apiError(0, NETWORK_ERROR_CODE, 'Network request failed');
    expect(postErrorMessage(offline)).toBe('Your post was not sent. Check your connection.');
    expect(isRetryable(offline)).toBe(true);
    expect(isRetryable(apiError(503, 'SERVICE_UNAVAILABLE'))).toBe(true);
    expect(isRetryable(apiError(429, 'RATE_LIMITED'))).toBe(false);
    expect(isRetryable(apiError(409, 'DUPLICATE_POST'))).toBe(false);
  });
});
