import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AdminCommunityService, CommunityService } from '@orenji/api-client';
import { Observable, of, throwError } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { fixturePost } from '../testing/community-fixtures';
import { POSTS_PAGE } from './community-rules';
import { RoomStore } from './room.store';

function problem(status: number, errorCode: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: { errorCode, message: errorCode, requestId: 'r-1' },
  });
}

describe('RoomStore (web WF)', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let admin: Record<string, ReturnType<typeof vi.fn>>;
  let store: RoomStore;

  beforeEach(() => {
    api = {
      listCommunityPosts: vi.fn(() =>
        of({
          items: [
            fixturePost('b', '2026-10-30T10:00:00Z'),
            fixturePost('a', '2026-10-30T09:00:00Z'),
          ],
          nextCursor: 'older',
          hasMore: true,
        }),
      ),
      createCommunityPost: vi.fn(() => of(fixturePost('mine', '2026-10-30T11:00:00Z'))),
      updateCommunityPost: vi.fn(),
      deleteCommunityPost: vi.fn(() => of({})),
    };
    admin = { removeCommunityPost: vi.fn(() => of({})) };
    TestBed.configureTestingModule({
      providers: [
        RoomStore,
        { provide: CommunityService, useValue: api },
        { provide: AdminCommunityService, useValue: admin },
        {
          provide: SessionService,
          useValue: {
            me: signal({ id: 'me' }),
            isModerator: signal(false),
            isAdmin: signal(false),
          },
        },
      ],
    });
    store = TestBed.inject(RoomStore);
  });

  it('opens a room on its first page, newest first, with older posts on request', async () => {
    store.open('americas-north-yugioh');
    expect(api['listCommunityPosts']).toHaveBeenCalledWith(
      { slug: 'americas-north-yugioh', limit: POSTS_PAGE },
      'body',
      false,
      expect.anything(),
    );
    expect(store.status()).toBe('ready');
    expect(store.posts().map((post) => post.id)).toEqual(['b', 'a']);
    expect(store.hasOlder()).toBe(true);
    api['listCommunityPosts'].mockReturnValue(
      of({ items: [fixturePost('old', '2026-10-29T09:00:00Z')], hasMore: false }),
    );
    await store.loadOlder();
    expect(api['listCommunityPosts']).toHaveBeenLastCalledWith(
      { slug: 'americas-north-yugioh', limit: POSTS_PAGE, cursor: 'older' },
      'body',
      false,
      expect.anything(),
    );
    expect(store.posts().map((post) => post.id)).toEqual(['b', 'a', 'old']);
    expect(store.hasOlder()).toBe(false);
  });

  it('an unknown room is "not found", the community off is "disabled", a failure an error', () => {
    api['listCommunityPosts'].mockReturnValue(throwError(() => problem(404, 'NOT_FOUND')));
    store.open('looking-for');
    expect(store.status()).toBe('not-found');
    api['listCommunityPosts'].mockReturnValue(throwError(() => problem(404, 'FEATURE_DISABLED')));
    store.open('americas-north-pokemon');
    expect(store.status()).toBe('disabled');
    api['listCommunityPosts'].mockReturnValue(throwError(() => problem(500, 'INTERNAL_ERROR')));
    store.open('americas-north-mtg');
    expect(store.status()).toBe('error');
  });

  it('reads the first page again: new posts join, a post gone leaves, and reports a change', async () => {
    store.open('americas-north-yugioh');
    api['listCommunityPosts'].mockReturnValue(
      of({
        items: [
          fixturePost('c', '2026-10-30T12:00:00Z'),
          fixturePost('b', '2026-10-30T10:00:00Z'),
          fixturePost('a', '2026-10-30T09:00:00Z'),
        ],
        hasMore: true,
        nextCursor: 'x',
      }),
    );
    expect(await store.refresh()).toBe(true);
    expect(store.posts().map((post) => post.id)).toEqual(['c', 'b', 'a']);
    expect(await store.refresh()).toBe(false);
    // The whole room fits in one page: a post gone from it left the room (a block, a delete).
    api['listCommunityPosts'].mockReturnValue(
      of({ items: [fixturePost('c', '2026-10-30T12:00:00Z')], hasMore: false }),
    );
    expect(await store.refresh()).toBe(true);
    expect(store.posts().map((post) => post.id)).toEqual(['c']);
    expect(store.hasOlder()).toBe(false);
  });

  it('reads every page shown again: a post gone from an older page leaves (WF review P1)', async () => {
    store.open('americas-north-yugioh');
    api['listCommunityPosts'].mockReturnValue(
      of({
        items: [
          fixturePost('old2', '2026-10-29T09:00:00Z'),
          fixturePost('old1', '2026-10-29T08:00:00Z'),
        ],
        nextCursor: 'older-2',
        hasMore: true,
      }),
    );
    await store.loadOlder();
    expect(store.posts().map((post) => post.id)).toEqual(['b', 'a', 'old2', 'old1']);
    // Meanwhile a moderator removed old2, and the author of a blocked the reader elsewhere.
    api['listCommunityPosts'].mockImplementation((request: { cursor?: string }) =>
      of(
        request.cursor === 'p2'
          ? {
              items: [fixturePost('old1', '2026-10-29T08:00:00Z')],
              nextCursor: 'p3',
              hasMore: true,
            }
          : { items: [fixturePost('b', '2026-10-30T10:00:00Z')], nextCursor: 'p2', hasMore: true },
      ),
    );
    expect(await store.refresh()).toBe(true);
    const calls = api['listCommunityPosts'].mock.calls.slice(-2).map((call) => call[0]);
    expect(calls).toEqual([
      { slug: 'americas-north-yugioh', limit: POSTS_PAGE },
      { slug: 'americas-north-yugioh', limit: POSTS_PAGE, cursor: 'p2' },
    ]);
    expect(store.posts().map((post) => post.id)).toEqual(['b', 'old1']);
    // "Show older posts" goes on from the last page read again.
    expect(store.hasOlder()).toBe(true);
    api['listCommunityPosts'].mockReturnValue(of({ items: [], hasMore: false }));
    await store.loadOlder();
    expect(api['listCommunityPosts']).toHaveBeenLastCalledWith(
      { slug: 'americas-north-yugioh', limit: POSTS_PAGE, cursor: 'p3' },
      'body',
      false,
      expect.anything(),
    );
  });

  it('a refresh after a new post adds that post only: older pages wait for "Show older posts" (WF review R1-1)', async () => {
    // A room of 150 posts paged as the API does: newest first, keyset cursors.
    const minute = (n: number) => new Date(Date.UTC(2026, 9, 30, 0, n)).toISOString();
    let room = Array.from({ length: 150 }, (_, n) =>
      fixturePost(`p${String(n).padStart(3, '0')}`, minute(n)),
    ).reverse();
    api['listCommunityPosts'].mockImplementation((request: { cursor?: string; limit: number }) => {
      const start = request.cursor ? room.findIndex((post) => post.id === request.cursor) + 1 : 0;
      const items = room.slice(start, start + request.limit);
      const hasMore = start + request.limit < room.length;
      return of({ items, hasMore, nextCursor: hasMore ? items.at(-1)!.id : undefined });
    });
    store.open('americas-north-onepiece');
    expect(store.posts()).toHaveLength(30);
    const oldest = store.posts().at(-1)!.id;
    expect(oldest).toBe('p120');
    for (let n = 1; n <= 3; n++) {
      room = [fixturePost(`new${n}`, minute(200 + n)), ...room];
      const before = api['listCommunityPosts'].mock.calls.length;
      expect(await store.refresh()).toBe(true);
      // One more post shown each time, the oldest shown unchanged, nothing older read in.
      expect(store.posts()).toHaveLength(30 + n);
      expect(store.posts()[0].id).toBe(`new${n}`);
      expect(store.posts().at(-1)!.id).toBe(oldest);
      expect(store.hasOlder()).toBe(true);
      // Two pages reach the oldest post shown; the reads do not grow with every poll.
      expect(api['listCommunityPosts'].mock.calls.length - before).toBe(2);
    }
    // A quiet poll changes nothing and reads the same two pages.
    const before = api['listCommunityPosts'].mock.calls.length;
    expect(await store.refresh()).toBe(false);
    expect(store.posts()).toHaveLength(33);
    expect(api['listCommunityPosts'].mock.calls.length - before).toBe(2);
    // "Show older posts" goes on just below the oldest post shown.
    await store.loadOlder();
    expect(api['listCommunityPosts']).toHaveBeenLastCalledWith(
      { slug: 'americas-north-onepiece', limit: POSTS_PAGE, cursor: oldest },
      'body',
      false,
      expect.anything(),
    );
    expect(store.posts()).toHaveLength(63);
    expect(store.posts().at(-1)!.id).toBe('p090');
  });

  it('a room of 40 with 30 shown keeps "Show older posts" after a new post (WF review R1-1)', async () => {
    const minute = (n: number) => new Date(Date.UTC(2026, 9, 30, 0, n)).toISOString();
    let room = Array.from({ length: 40 }, (_, n) => fixturePost(`r${n}`, minute(n))).reverse();
    api['listCommunityPosts'].mockImplementation((request: { cursor?: string; limit: number }) => {
      const start = request.cursor ? room.findIndex((post) => post.id === request.cursor) + 1 : 0;
      const items = room.slice(start, start + request.limit);
      const hasMore = start + request.limit < room.length;
      return of({ items, hasMore, nextCursor: hasMore ? items.at(-1)!.id : undefined });
    });
    store.open('americas-north-riftbound');
    room = [fixturePost('fresh', minute(100)), ...room];
    expect(await store.refresh()).toBe(true);
    expect(store.posts()).toHaveLength(31);
    expect(store.posts().at(-1)!.id).toBe('r10');
    expect(store.hasOlder()).toBe(true);
    await store.loadOlder();
    expect(store.posts()).toHaveLength(41);
    expect(store.hasOlder()).toBe(false);
  });

  it('drops a read that a change made here overtook (the next refresh applies)', async () => {
    store.open('americas-north-yugioh');
    let answer!: (page: unknown) => void;
    api['listCommunityPosts'].mockReturnValue(
      new Observable((subscriber) => {
        answer = (page) => {
          subscriber.next(page);
          subscriber.complete();
        };
      }),
    );
    const pending = store.refresh();
    expect(await store.create({ body: 'Hello' })).toBeNull();
    answer({ items: [fixturePost('b', '2026-10-30T10:00:00Z')], hasMore: false });
    expect(await pending).toBe(false);
    expect(store.posts().map((post) => post.id)).toEqual(['mine', 'b', 'a']);
  });

  it('a post joins the room; a refusal says why, and only a network error is retried', async () => {
    store.open('americas-north-yugioh');
    expect(await store.create({ body: 'Hello' })).toBeNull();
    expect(store.posts()[0].id).toBe('mine');
    api['createCommunityPost'].mockReturnValue(throwError(() => problem(429, 'RATE_LIMITED')));
    expect(await store.create({ body: 'Again' })).toEqual({
      message: 'You can post up to 10 times an hour in each room. Try again later.',
      retryable: false,
    });
    api['createCommunityPost'].mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 0 })),
    );
    expect(await store.create({ body: 'Again' })).toEqual({
      message: 'Your post was not sent. Check your connection.',
      retryable: true,
    });
  });

  it("a blocked author's posts leave at once; a deletion and a removal drop the post", async () => {
    store.open('americas-north-yugioh');
    store.hideAuthor('author-a');
    expect(store.posts().map((post) => post.id)).toEqual(['b']);
    expect(await store.delete('b')).toBeNull();
    expect(store.posts()).toEqual([]);
    expect(await store.remove('x', 'Spam')).toBeNull();
    expect(admin['removeCommunityPost']).toHaveBeenCalledWith(
      { id: 'x', removeContentRequest: { reason: 'Spam' } },
      'body',
      false,
      expect.anything(),
    );
  });
});
