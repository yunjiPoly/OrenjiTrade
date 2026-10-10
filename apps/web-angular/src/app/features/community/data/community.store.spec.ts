import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  AdminCommunityService,
  CommunityChannel,
  CommunityChannelKindEnum as Kind,
  CommunityService,
  PostResponse,
  PostResponseModerationStateEnum,
  ReplyResponse,
  ReplyResponseModerationStateEnum,
} from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError } from '../../../core/http/api-error';
import { CommunityStore } from './community.store';

const CHANNELS: CommunityChannel[] = [
  {
    id: '1',
    slug: 'americas-north',
    name: 'Americas (North)',
    kind: Kind.Region,
    regionLabel: 'americas-north',
    description: '',
    postCount24h: 1,
  },
  {
    id: '2',
    slug: 'general',
    name: 'General',
    kind: Kind.General,
    description: '',
    postCount24h: 0,
  },
];

function post(
  id: string,
  authorId = 'someone',
  overrides: Partial<PostResponse> = {},
): PostResponse {
  return {
    id,
    channelSlug: 'americas-north',
    author: { id: authorId, handle: authorId, displayName: authorId },
    body: `Post ${id}`,
    payload: {},
    createdAt: '2026-09-30T10:00:00Z',
    replyCount: 0,
    canEdit: authorId === 'me',
    canDelete: authorId === 'me',
    moderationState: PostResponseModerationStateEnum.Ok,
    ...overrides,
  };
}

function reply(id: string, authorId: string): ReplyResponse {
  return {
    id,
    postId: 'p1',
    author: { id: authorId, handle: authorId, displayName: authorId },
    body: `Reply ${id}`,
    createdAt: '2026-09-30T11:00:00Z',
    canDelete: authorId === 'me',
    moderationState: ReplyResponseModerationStateEnum.Ok,
  };
}

function apiError(errorCode: string, status: number): ApiError {
  return new ApiError({ errorCode, message: errorCode, requestId: null, status, fieldErrors: {} });
}

describe('CommunityStore', () => {
  let store: CommunityStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let adminApi: Record<string, ReturnType<typeof vi.fn>>;
  const roles = signal<string[]>([]);

  beforeEach(async () => {
    roles.set([]);
    api = {
      listCommunityChannels: vi.fn(() => of(CHANNELS)),
      listCommunityPosts: vi.fn(({ cursor }) =>
        of(
          cursor
            ? { items: [post('p3')], hasMore: false }
            : { items: [post('p1', 'me'), post('p2', 'troll')], hasMore: true, nextCursor: 'next' },
        ),
      ),
      createCommunityPost: vi.fn(({ createPostRequest }) =>
        of(post('new', 'me', { body: createPostRequest.body })),
      ),
      updateCommunityPost: vi.fn(({ id, updatePostRequest }) =>
        of(post(id, 'me', { body: updatePostRequest.body, editedAt: '2026-09-30T12:00:00Z' })),
      ),
      deleteCommunityPost: vi.fn(() => of({})),
      listCommunityReplies: vi.fn(() => of({ items: [reply('r1', 'troll')], hasMore: false })),
      createCommunityReply: vi.fn(({ createReplyRequest }) =>
        of({ ...reply('r2', 'me'), body: createReplyRequest.body }),
      ),
      deleteCommunityReply: vi.fn(() => of({})),
    };
    adminApi = {
      removeCommunityPost: vi.fn(() => of({})),
      removeCommunityReply: vi.fn(() => of({})),
    };
    TestBed.configureTestingModule({
      providers: [
        CommunityStore,
        { provide: CommunityService, useValue: api },
        { provide: AdminCommunityService, useValue: adminApi },
        {
          provide: SessionService,
          useValue: {
            me: signal({ id: 'me' }),
            status: signal('ready'),
            isModerator: computed(() => roles().includes('MODERATOR')),
            isAdmin: computed(() => roles().includes('ADMIN')),
          },
        },
      ],
    });
    store = TestBed.inject(CommunityStore);
    expect(await store.loadChannels()).toBe('americas-north');
    store.select('americas-north');
  });

  it('loads the channels and the selected channel feed', async () => {
    expect(store.channelsStatus()).toBe('ready');
    expect(store.channel()?.name).toBe('Americas (North)');
    expect(store.postsStatus()).toBe('ready');
    expect(store.posts().map((p) => p.id)).toEqual(['p1', 'p2']);
    await store.loadMore();
    expect(store.posts().map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(store.hasMore()).toBe(false);
  });

  it('reports a turned-off community and unknown channels', async () => {
    api['listCommunityChannels'].mockReturnValueOnce(
      throwError(() => apiError('FEATURE_DISABLED', 404)),
    );
    expect(await store.loadChannels()).toBeNull();
    expect(store.channelsStatus()).toBe('disabled');
    api['listCommunityPosts'].mockReturnValueOnce(throwError(() => apiError('NOT_FOUND', 404)));
    store.select('gone');
    expect(store.postsStatus()).toBe('not-found');
  });

  it('prepends a new post and counts it for today', async () => {
    expect(await store.createPost({ body: 'Looking for Azure-Eyes' })).toBeNull();
    expect(store.posts()[0]).toMatchObject({ id: 'new', body: 'Looking for Azure-Eyes' });
    expect(store.channel()?.postCount24h).toBe(2);
  });

  it('returns the inline message of a refused post', async () => {
    api['createCommunityPost'].mockReturnValueOnce(
      throwError(() => apiError('DUPLICATE_POST', 409)),
    );
    expect(await store.createPost({ body: 'Same again' })).toContain('last 24 hours');
    expect(store.posting()).toBe(false);
    expect(store.posts()).toHaveLength(2);
  });

  it('edits and deletes own posts', async () => {
    expect(await store.updatePost('p1', 'Edited')).toBeNull();
    expect(store.posts()[0]).toMatchObject({ body: 'Edited', editedAt: '2026-09-30T12:00:00Z' });
    expect(await store.deletePost('p1')).toBeNull();
    expect(store.posts().map((p) => p.id)).toEqual(['p2']);
  });

  it('loads replies once, adds a reply and keeps the count in step', async () => {
    await store.loadReplies('p1');
    await store.loadReplies('p1');
    expect(api['listCommunityReplies']).toHaveBeenCalledTimes(1);
    expect(store.replies()['p1']?.items.map((r) => r.id)).toEqual(['r1']);
    expect(await store.createReply('p1', 'Count me in')).toBeNull();
    expect(store.replies()['p1']?.items.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(store.posts()[0]).toMatchObject({ replyCount: 1, lastReplyAt: '2026-09-30T11:00:00Z' });
    expect(await store.deleteReply('p1', 'r2')).toBeNull();
    expect(store.posts()[0].replyCount).toBe(0);
  });

  it('keeps a refused reply message on the thread', async () => {
    api['createCommunityReply'].mockReturnValueOnce(
      throwError(() => apiError('POST_BLOCKED', 422)),
    );
    const problem = await store.createReply('p1', 'bad words');
    expect(problem).toContain('community guidelines');
    expect(store.replies()['p1']).toMatchObject({ sending: false, error: problem });
  });

  it('lets moderators remove content with a reason', async () => {
    expect(store.isModerator()).toBe(false);
    roles.set(['USER', 'MODERATOR']);
    expect(store.isModerator()).toBe(true);
    expect(await store.removePost('p2', 'Spam')).toBeNull();
    expect(adminApi['removeCommunityPost']).toHaveBeenCalledWith(
      { id: 'p2', removeContentRequest: { reason: 'Spam' } },
      'body',
      false,
      expect.anything(),
    );
    expect(store.posts().map((p) => p.id)).toEqual(['p1']);
    await store.loadReplies('p1');
    expect(await store.deleteReply('p1', 'r1', 'Abuse')).toBeNull();
    expect(adminApi['removeCommunityReply']).toHaveBeenCalled();
    expect(api['deleteCommunityReply']).not.toHaveBeenCalled();
  });

  it('hides the posts and replies of a collector the caller blocked', async () => {
    await store.loadReplies('p1');
    store.hideAuthor('troll');
    expect(store.posts().map((p) => p.id)).toEqual(['p1']);
    expect(store.replies()['p1']?.items).toEqual([]);
  });
});
