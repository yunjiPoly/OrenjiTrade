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
