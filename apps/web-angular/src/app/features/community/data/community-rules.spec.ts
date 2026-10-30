import { CommunityChannelKindEnum as Kind } from '@orenji/api-client';
import { ApiError } from '../../../core/http/api-error';
import {
  POST_MAX_LENGTH,
  buildRoomItems,
  canPost,
  gameOfSlug,
  isRetryable,
  isRoomUnread,
  laterOf,
  mergePosts,
  orderRooms,
  postErrorMessage,
  postPlace,
  postRequest,
  readRulesPane,
  readVisits,
  regionOfSlug,
  roomPreview,
  roomTime,
  saveRulesPane,
  toLastPost,
  writeVisits,
} from './community-rules';
import { fixturePost, fixtureRoom } from '../testing/community-fixtures';

const room = fixtureRoom;
const post = fixturePost;

function apiError(errorCode: string, status: number): ApiError {
  return new ApiError({
    errorCode,
    message: `server says ${errorCode}`,
    requestId: null,
    status,
    fieldErrors: {},
  });
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

describe('community rules (web WF, spec 10.7)', () => {
  it("orders the region's game rooms: the browsed game first, then the games' order", () => {
    const rooms = [
      room('pokemon'),
      room('riftbound'),
      room('yugioh'),
      room('mtg'),
      room('onepiece'),
      room('unknown'),
      { ...room('topic'), kind: Kind.LookingFor },
      { ...room('nogame'), game: null },
    ];
    const order = ['yugioh', 'pokemon', 'mtg', 'onepiece', 'riftbound'];
    expect(orderRooms(rooms, 'mtg', order).map((r) => r.game)).toEqual([
      'mtg',
      'yugioh',
      'pokemon',
      'onepiece',
      'riftbound',
      'unknown',
    ]);
    expect(orderRooms(rooms, null, order)[0].game).toBe('yugioh');
  });

  it("a room is unread when someone else posted after the last visit, never for one's own post", () => {
    const last = {
      id: 'p',
      authorHandle: 'maya',
      body: 'Hi',
      createdAt: '2026-10-30T10:00:00Z',
      mine: false,
    };
    expect(isRoomUnread(null, null)).toBe(false);
    expect(isRoomUnread(last, null)).toBe(true);
    expect(isRoomUnread(last, '2026-10-30T09:00:00Z')).toBe(true);
    expect(isRoomUnread(last, '2026-10-30T10:00:00Z')).toBe(false);
    expect(isRoomUnread({ ...last, mine: true }, null)).toBe(false);
    expect(laterOf('2026-10-30T10:00:00Z', '2026-10-30T09:00:00Z')).toBe('2026-10-30T10:00:00Z');
    expect(laterOf(null, '2026-10-30T09:00:00Z')).toBe('2026-10-30T09:00:00Z');
  });

  it('previews the last post as "{handle}: {text}", "You: …" for one\'s own', () => {
    const last = { id: 'p', authorHandle: 'maya', body: 'Hi all', createdAt: '', mine: false };
    expect(roomPreview(last)).toBe('maya: Hi all');
    expect(roomPreview({ ...last, mine: true })).toBe('You: Hi all');
    expect(roomPreview(undefined)).toBeNull();
  });

  it("words a room's time: the clock today, Yesterday, the weekday, then the date", () => {
    const now = new Date(2026, 9, 30, 15, 0);
    expect(roomTime(new Date(2026, 9, 30, 9, 31).toISOString(), now)).toBe('9:31 AM');
    expect(roomTime(new Date(2026, 9, 29, 20, 0).toISOString(), now)).toBe('Yesterday');
    expect(roomTime(new Date(2026, 9, 25, 20, 0).toISOString(), now)).toBe('Sun');
    expect(roomTime(new Date(2026, 8, 28, 20, 0).toISOString(), now)).toBe('Sep 28');
    expect(roomTime('not a date', now)).toBe('');
  });

  it("a post's place is its state or province, never a city; nothing when not shared", () => {
    const place = {
      regionCode: 'americas-north',
      countryCode: 'CA',
      countryName: 'Canada',
      subdivisionCode: 'CA-QC',
      subdivisionName: 'Quebec',
      label: 'Quebec, Canada',
    };
    expect(postPlace({ place })).toBe('Quebec');
    expect(postPlace({ place: { ...place, subdivisionName: '' } })).toBe('Canada');
    expect(postPlace({})).toBeNull();
  });

  it('reads like a chat: oldest first, a day separator per day, a post seen twice kept once', () => {
    const now = new Date(2026, 9, 30, 15, 0);
    const today = new Date(2026, 9, 30, 9, 12).toISOString();
    const yesterday = new Date(2026, 9, 29, 20, 15).toISOString();
    const items = buildRoomItems(
      [post('c', today), post('b', yesterday), post('c', today), post('a', yesterday)],
      now,
    );
    expect(items.map((item) => (item.kind === 'day' ? item.label : item.post.id))).toEqual([
      'Yesterday',
      'a',
      'b',
      'Today',
      'c',
    ]);
    const last = items.at(-1);
    expect(last?.kind === 'post' && last.day).toBe('Today');
  });

  it('merges pages newest first, the incoming copy of a post winning', () => {
    const merged = mergePosts(
      [post('a', '2026-10-30T09:00:00Z'), post('b', '2026-10-30T10:00:00Z')],
      [post('a', '2026-10-30T09:00:00Z', { body: 'edited' }), post('c', '2026-10-30T11:00:00Z')],
    );
    expect(merged.map((p) => p.id)).toEqual(['c', 'b', 'a']);
    expect(merged[2].body).toBe('edited');
  });

  it('posts only with some text within 2,000 characters; the request carries the card or binder', () => {
    expect(canPost('')).toBe(false);
    expect(canPost('   ')).toBe(false);
    expect(canPost('Hi')).toBe(true);
    expect(canPost('Hi', true)).toBe(false);
    expect(canPost('x'.repeat(POST_MAX_LENGTH + 1))).toBe(false);
    expect(postRequest('  Hello  ', null)).toEqual({ body: 'Hello' });
    expect(
      postRequest('Spare', {
        kind: 'card',
        card: {
          printingId: 'pr-1',
          cardId: 'c-1',
          name: 'Ash',
          printingCode: 'X',
          imageUrl: null,
          game: 'yugioh',
        },
      }),
    ).toEqual({ body: 'Spare', cardPrintingId: 'pr-1' });
    expect(
      postRequest('Core', {
        kind: 'binder',
        binder: { binderId: 'b-1', name: 'Core', itemCount: 3 },
        deckCore: true,
        price: '$95',
      }),
    ).toEqual({ body: 'Core', binderId: 'b-1' });
  });

  it('words a refused post as the phone does; only a network or server error is retried', () => {
    expect(postErrorMessage(apiError('RATE_LIMITED', 429))).toBe(
      'You can post up to 10 times an hour in each room. Try again later.',
    );
    expect(postErrorMessage(apiError('DUPLICATE_POST', 409))).toBe('You already posted this.');
    expect(postErrorMessage(apiError('POST_BLOCKED', 422))).toContain('breaks the community rules');
    expect(postErrorMessage(apiError('FEATURE_DISABLED', 404))).toBe(
      'The community is closed right now.',
    );
    expect(postErrorMessage(apiError('NOT_FOUND', 404))).toBe('This room is no longer open.');
    expect(postErrorMessage(apiError('NETWORK_ERROR', 0))).toBe(
      'Your post was not sent. Check your connection.',
    );
    expect(isRetryable(apiError('NETWORK_ERROR', 0))).toBe(true);
    expect(isRetryable(apiError('INTERNAL_ERROR', 503))).toBe(true);
    expect(isRetryable(apiError('RATE_LIMITED', 429))).toBe(false);
  });

  it("reads a room's region and game from its slug", () => {
    const regions = ['americas-north', 'americas-south', 'europe'];
    expect(regionOfSlug('americas-north-yugioh', regions)).toBe('americas-north');
    expect(regionOfSlug('europe-onepiece', regions)).toBe('europe');
    expect(regionOfSlug('looking-for', regions)).toBeNull();
    expect(gameOfSlug('americas-south-mtg', 'americas-south')).toBe('mtg');
    expect(gameOfSlug('europe-mtg', 'americas-south')).toBeNull();
  });

  it('keeps the visits per account and the rules pane in this browser; bad values are ignored', () => {
    const storage = memoryStorage();
    expect(readVisits(storage, 'fb-1')).toEqual({});
    writeVisits(storage, 'fb-1', { 'americas-north-yugioh': '2026-10-30T10:00:00Z' });
    expect(readVisits(storage, 'fb-1')).toEqual({
      'americas-north-yugioh': '2026-10-30T10:00:00Z',
    });
    expect(readVisits(storage, 'fb-2')).toEqual({});
    storage.setItem('orenji.community.visits.fb-3', '{"a":"nope","b":3}');
    expect(readVisits(storage, 'fb-3')).toEqual({});
    storage.setItem('orenji.community.visits.fb-4', 'not json');
    expect(readVisits(storage, 'fb-4')).toEqual({});
    expect(readRulesPane(storage)).toBe(true);
    saveRulesPane(storage, false);
    expect(readRulesPane(storage)).toBe(false);
    expect(readRulesPane(null)).toBe(true);
  });

  it("turns the newest post into the list's last post: one line, 140 characters", () => {
    const last = toLastPost(
      post('n', '2026-10-30T10:00:00Z', {
        author: { id: 'me', handle: 'sam', displayName: 'Sam' },
        body: `Line one\n${'x'.repeat(200)}`,
      }),
      'me',
    );
    expect(last?.mine).toBe(true);
    expect(last?.authorHandle).toBe('sam');
    expect(last?.body.length).toBe(140);
    expect(last?.body.endsWith('…')).toBe(true);
    expect(last?.body.startsWith('Line one x')).toBe(true);
    expect(toLastPost(null, 'me')).toBeNull();
  });
});
