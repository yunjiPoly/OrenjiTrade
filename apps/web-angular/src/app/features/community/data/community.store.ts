import { Injectable, computed, inject, signal } from '@angular/core';
import {
  AdminCommunityService,
  CommunityChannel,
  CommunityService,
  CreatePostRequest,
  PostResponse,
  ReplyResponse,
} from '@orenji/api-client';
import { Subscription, firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import { defaultChannel, postErrorMessage } from './community-helpers';

export type ChannelsStatus = 'loading' | 'ready' | 'error' | 'disabled';
export type PostsStatus = 'idle' | 'loading' | 'ready' | 'error' | 'not-found';

/** Posts per page of `GET /community/channels/{slug}/posts`. */
export const POSTS_PAGE = 20;
/** Replies per page of `GET /community/posts/{id}/replies`. */
export const REPLIES_PAGE = 50;

/** The replies of one post, loaded when its thread is opened. */
export interface ReplyThread {
  status: 'loading' | 'ready' | 'error';
  items: ReplyResponse[];
  nextCursor: string | null;
  sending: boolean;
  error: string | null;
}

const EMPTY_THREAD: ReplyThread = {
  status: 'loading',
  items: [],
  nextCursor: null,
  sending: false,
  error: null,
};

/** Outcome of a write: `null` when it worked, otherwise the message to show. */
export type WriteResult = string | null;

/**
 * State of `/community` (Phase 5 contract "Community chat"): channels, the selected channel's
 * posts (newest first, cursor pages), inline reply threads, and the writes (post, edit, delete,
 * reply, moderator removal). Writes resolve with the message to show inline when refused
 * (409 DUPLICATE_POST, 422 POST_BLOCKED, 429 RATE_LIMITED, ...).
 */
@Injectable()
export class CommunityStore {
  private readonly api = inject(CommunityService);
  private readonly adminApi = inject(AdminCommunityService);
  private readonly session = inject(SessionService);

  private readonly channelsState = signal<CommunityChannel[]>([]);
  private readonly channelsStatusState = signal<ChannelsStatus>('loading');
  private readonly channelsErrorState = signal<ApiError | null>(null);
  private readonly slugState = signal<string | null>(null);
  private readonly postsState = signal<PostResponse[]>([]);
  private readonly postsStatusState = signal<PostsStatus>('idle');
  private readonly postsErrorState = signal<ApiError | null>(null);
  private readonly hasMoreState = signal(false);
  private readonly loadingMoreState = signal(false);
  private readonly postingState = signal(false);
  private readonly repliesState = signal<Readonly<Partial<Record<string, ReplyThread>>>>({});

  readonly channels = this.channelsState.asReadonly();
  readonly channelsStatus = this.channelsStatusState.asReadonly();
  readonly channelsError = this.channelsErrorState.asReadonly();
  readonly slug = this.slugState.asReadonly();
  readonly channel = computed(
    () => this.channelsState().find((channel) => channel.slug === this.slugState()) ?? null,
  );
  readonly posts = this.postsState.asReadonly();
  readonly postsStatus = this.postsStatusState.asReadonly();
  readonly postsError = this.postsErrorState.asReadonly();
  readonly hasMore = this.hasMoreState.asReadonly();
  readonly loadingMore = this.loadingMoreState.asReadonly();
  readonly posting = this.postingState.asReadonly();
  readonly replies = this.repliesState.asReadonly();
  readonly selfId = computed(() => this.session.me()?.id ?? null);
  /** Moderators and admins may remove other members' posts and replies. */
  readonly isModerator = computed(() => this.session.isModerator() || this.session.isAdmin());

  private nextCursor: string | null = null;
  private postsSubscription: Subscription | null = null;

  /** Loads the channels; resolves the slug to open when none was asked for. */
  async loadChannels(): Promise<string | null> {
    this.channelsStatusState.set('loading');
    this.channelsErrorState.set(null);
    try {
      const channels = await firstValueFrom(
        this.api.listCommunityChannels({}, 'body', false, { context: silentErrors() }),
      );
      this.channelsState.set(channels ?? []);
      this.channelsStatusState.set('ready');
      return defaultChannel(channels ?? [])?.slug ?? null;
    } catch (error) {
      const apiError = toApiError(error);
      this.channelsErrorState.set(apiError);
      this.channelsStatusState.set(
        apiError.errorCode === 'FEATURE_DISABLED' ? 'disabled' : 'error',
      );
      return null;
    }
  }

  /** Shows a channel's feed (no-op when it is already shown). */
  select(slug: string): void {
    if (slug === this.slugState() && this.postsStatusState() !== 'error') {
      return;
    }
    this.slugState.set(slug);
    this.repliesState.set({});
    this.loadPosts();
  }

  loadPosts(): void {
    const slug = this.slugState();
    if (!slug) {
      return;
    }
    this.postsSubscription?.unsubscribe();
    this.postsState.set([]);
    this.postsStatusState.set('loading');
    this.postsErrorState.set(null);
    this.postsSubscription = this.api
      .listCommunityPosts({ slug, limit: POSTS_PAGE }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (page) => {
          this.postsState.set(page.items ?? []);
          this.nextCursor = page.nextCursor ?? null;
          this.hasMoreState.set(!!page.hasMore && !!page.nextCursor);
          this.postsStatusState.set('ready');
        },
        error: (error: unknown) => {
          const apiError = toApiError(error);
          this.postsErrorState.set(apiError);
          this.postsStatusState.set(apiError.status === 404 ? 'not-found' : 'error');
        },
      });
  }

  async loadMore(): Promise<void> {
    const slug = this.slugState();
    if (!slug || !this.nextCursor || this.loadingMoreState()) {
      return;
    }
    this.loadingMoreState.set(true);
    try {
      const page = await firstValueFrom(
        this.api.listCommunityPosts(
          { slug, limit: POSTS_PAGE, cursor: this.nextCursor },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      if (slug !== this.slugState()) {
        return;
      }
      const known = new Set(this.postsState().map((post) => post.id));
      this.postsState.update((posts) => [
        ...posts,
        ...(page.items ?? []).filter((post) => !known.has(post.id)),
      ]);
      this.nextCursor = page.nextCursor ?? null;
      this.hasMoreState.set(!!page.hasMore && !!page.nextCursor);
    } catch {
      // The button stays; pressing it again retries.
    } finally {
      this.loadingMoreState.set(false);
    }
  }

  async createPost(request: CreatePostRequest): Promise<WriteResult> {
    const slug = this.slugState();
    if (!slug || this.postingState()) {
      return 'Choose a channel first.';
    }
    this.postingState.set(true);
    try {
      const post = await firstValueFrom(
        this.api.createCommunityPost({ slug, createPostRequest: request }, 'body', false, {
          context: silentErrors(),
        }),
      );
      if (slug === this.slugState()) {
        this.postsState.update((posts) => [post, ...posts.filter((item) => item.id !== post.id)]);
        this.channelsState.update((channels) =>
          channels.map((channel) =>
            channel.slug === slug
              ? { ...channel, postCount24h: channel.postCount24h + 1 }
              : channel,
          ),
        );
      }
      return null;
    } catch (error) {
      return postErrorMessage(toApiError(error));
    } finally {
      this.postingState.set(false);
    }
  }

  async updatePost(id: string, body: string): Promise<WriteResult> {
    try {
      const post = await firstValueFrom(
        this.api.updateCommunityPost({ id, updatePostRequest: { body } }, 'body', false, {
          context: silentErrors(),
        }),
      );
      this.replacePost(post);
      return null;
    } catch (error) {
      return postErrorMessage(toApiError(error));
    }
  }

  async deletePost(id: string): Promise<WriteResult> {
    try {
      await firstValueFrom(
        this.api.deleteCommunityPost({ id }, 'body', false, { context: silentErrors() }),
      );
      this.dropPost(id);
      return null;
    } catch (error) {
      return postErrorMessage(toApiError(error));
    }
  }

  /** Moderator removal (audited with the reason). */
  async removePost(id: string, reason: string): Promise<WriteResult> {
    try {
      await firstValueFrom(
        this.adminApi.removeCommunityPost({ id, removeContentRequest: { reason } }, 'body', false, {
          context: silentErrors(),
        }),
      );
      this.dropPost(id);
      return null;
    } catch (error) {
      return postErrorMessage(toApiError(error));
    }
  }

  /** Hides the posts of a collector the caller just blocked. */
  hideAuthor(authorId: string): void {
    this.postsState.update((posts) => posts.filter((post) => post.author.id !== authorId));
    this.repliesState.update((threads) => {
      const next: Partial<Record<string, ReplyThread>> = {};
      for (const [postId, thread] of Object.entries(threads)) {
        if (!thread) {
          continue;
        }
        next[postId] = {
          ...thread,
          items: thread.items.filter((reply) => reply.author.id !== authorId),
        };
      }
      return next;
    });
  }

  /** Opens (loading when needed) or keeps the reply thread of a post. */
  async loadReplies(postId: string, more = false): Promise<void> {
    const current = this.repliesState()[postId];
    if (current && !more && current.status !== 'error') {
      return;
    }
    const cursor = more ? current?.nextCursor : null;
    if (more && !cursor) {
      return;
    }
    this.patchThread(postId, {
      status: more ? 'ready' : 'loading',
      items: more ? (current?.items ?? []) : [],
      nextCursor: more ? (current?.nextCursor ?? null) : null,
      error: null,
    });
    try {
      const page = await firstValueFrom(
        this.api.listCommunityReplies(
          { id: postId, limit: REPLIES_PAGE, cursor: cursor ?? undefined },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      const known = new Set((this.repliesState()[postId]?.items ?? []).map((reply) => reply.id));
      this.patchThread(postId, {
        status: 'ready',
        items: [
          ...(this.repliesState()[postId]?.items ?? []),
          ...(page.items ?? []).filter((reply) => !known.has(reply.id)),
        ],
        nextCursor: page.hasMore ? (page.nextCursor ?? null) : null,
      });
    } catch {
      this.patchThread(postId, { status: 'error' });
    }
  }

  async createReply(postId: string, body: string): Promise<WriteResult> {
    this.patchThread(postId, { sending: true, error: null });
    try {
      const reply = await firstValueFrom(
        this.api.createCommunityReply({ id: postId, createReplyRequest: { body } }, 'body', false, {
          context: silentErrors(),
        }),
      );
      const thread = this.repliesState()[postId];
      this.patchThread(postId, {
        status: 'ready',
        items: [...(thread?.items ?? []).filter((item) => item.id !== reply.id), reply],
        sending: false,
      });
      this.postsState.update((posts) =>
        posts.map((post) =>
          post.id === postId
            ? { ...post, replyCount: post.replyCount + 1, lastReplyAt: reply.createdAt }
            : post,
        ),
      );
      return null;
    } catch (error) {
      const message = postErrorMessage(toApiError(error));
      this.patchThread(postId, { sending: false, error: message });
      return message;
    }
  }

  async deleteReply(
    postId: string,
    replyId: string,
    moderatorReason?: string,
  ): Promise<WriteResult> {
    try {
      if (moderatorReason) {
        await firstValueFrom(
          this.adminApi.removeCommunityReply(
            { id: replyId, removeContentRequest: { reason: moderatorReason } },
            'body',
            false,
            { context: silentErrors() },
          ),
        );
      } else {
        await firstValueFrom(
          this.api.deleteCommunityReply({ id: replyId }, 'body', false, {
            context: silentErrors(),
          }),
        );
      }
      const thread = this.repliesState()[postId];
      this.patchThread(postId, {
        items: (thread?.items ?? []).filter((reply) => reply.id !== replyId),
      });
      this.postsState.update((posts) =>
        posts.map((post) =>
          post.id === postId ? { ...post, replyCount: Math.max(0, post.replyCount - 1) } : post,
        ),
      );
      return null;
    } catch (error) {
      return postErrorMessage(toApiError(error));
    }
  }

  private replacePost(post: PostResponse): void {
    this.postsState.update((posts) => posts.map((item) => (item.id === post.id ? post : item)));
  }

  private dropPost(id: string): void {
    this.postsState.update((posts) => posts.filter((post) => post.id !== id));
    this.repliesState.update((threads) => {
      const next = { ...threads };
      delete next[id];
      return next;
    });
  }

  private patchThread(postId: string, changes: Partial<ReplyThread>): void {
    this.repliesState.update((threads) => ({
      ...threads,
      [postId]: { ...(threads[postId] ?? EMPTY_THREAD), ...changes },
    }));
  }
}
