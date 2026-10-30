import { Injectable, computed, inject, signal } from '@angular/core';
import {
  AdminCommunityService,
  CommunityService,
  CreatePostRequest,
  CursorPagePostResponse,
  PostResponse,
} from '@orenji/api-client';
import { Subscription, firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import {
  POSTS_PAGE,
  comparePosts,
  isRetryable,
  mergePosts,
  postErrorMessage,
} from './community-rules';

/**
 * At most this many pages are read again on a refresh (600 posts): older pages shown beyond them
 * stay as they were until the next load.
 */
export const REFRESH_MAX_PAGES = 20;

export type RoomStatus = 'idle' | 'loading' | 'ready' | 'error' | 'not-found' | 'disabled';

/** A post's outcome: `null` when it was published, otherwise what to say and whether to retry. */
export interface PostRefusal {
  message: string;
  retryable: boolean;
}

/**
 * One community room (stage WF, spec 10.7, board W22): its posts newest first in cursor pages
 * (`GET /community/channels/{slug}/posts`; blocks both ways, suspended authors, removed and
 * deleted posts are left out by the API), older pages on request, every page shown read again
 * while the room is on screen (rooms have no push: the phone's infinite query reads its pages again
 * every 15 s too; WF review P1), and the writes: a post, an edit, a delete, a moderator's removal.
 * No reply threads (spec 10.7).
 *
 * Provided by the room view.
 */
@Injectable()
export class RoomStore {
  private readonly api = inject(CommunityService);
  private readonly adminApi = inject(AdminCommunityService);
  private readonly session = inject(SessionService);

  private readonly slugState = signal<string | null>(null);
  private readonly postsState = signal<PostResponse[]>([]);
  private readonly statusState = signal<RoomStatus>('idle');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly hasOlderState = signal(false);
  private readonly loadingOlderState = signal(false);
  private readonly olderFailedState = signal(false);
  private readonly postingState = signal(false);
  private nextCursor: string | null = null;
  private request: Subscription | null = null;
  /** Counts the changes made here (a page, a post, a block): a refresh read before one is dropped. */
  private changes = 0;

  readonly slug = this.slugState.asReadonly();
  /** Newest first, as the API pages them. */
  readonly posts = this.postsState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly hasOlder = this.hasOlderState.asReadonly();
  readonly loadingOlder = this.loadingOlderState.asReadonly();
  readonly olderFailed = this.olderFailedState.asReadonly();
  readonly posting = this.postingState.asReadonly();
  readonly selfId = computed(() => this.session.me()?.id ?? null);
  /** Moderators and admins may remove other collectors' posts (audited with a reason). */
  readonly isModerator = computed(() => this.session.isModerator() || this.session.isAdmin());
  readonly errorMessage = computed(() => {
    const error = this.errorState();
    return error ? friendlyMessage(error) : '';
  });

  /** Shows the room of `slug` (its first page). */
  open(slug: string): void {
    if (slug === this.slugState() && this.statusState() !== 'error') {
      return;
    }
    this.slugState.set(slug);
    this.load();
  }

  /** (Re)loads the first page, showing the skeleton. */
  load(): void {
    const slug = this.slugState();
    if (!slug) {
      return;
    }
    this.request?.unsubscribe();
    this.changes++;
    this.postsState.set([]);
    this.nextCursor = null;
    this.hasOlderState.set(false);
    this.olderFailedState.set(false);
    this.statusState.set('loading');
    this.errorState.set(null);
    this.request = this.api
      .listCommunityPosts({ slug, limit: POSTS_PAGE }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (page) => {
          this.postsState.set(mergePosts([], page.items ?? []));
          this.setCursor(page.nextCursor, page.hasMore);
          this.statusState.set('ready');
        },
        error: (error: unknown) => {
          const apiError = toApiError(error);
          this.errorState.set(apiError);
          this.statusState.set(
            apiError.errorCode === 'FEATURE_DISABLED'
              ? 'disabled'
              : apiError.status === 404
                ? 'not-found'
                : 'error',
          );
        },
      });
  }

  /**
   * Reads again every page shown, newest first, following the cursors down to the oldest post
   * shown (as the phone's infinite query does), and replaces the list: posts made meanwhile
   * appear at the bottom, and a post deleted, removed, hidden by a block (made here or elsewhere,
   * either way) or by its author's suspension leaves, on whichever page it was (WF review P1).
   * Quiet: keeps what is shown on failure, and drops a read that a change made here overtook (the
   * next one applies). Resolves whether something changed.
   */
  async refresh(): Promise<boolean> {
    const slug = this.slugState();
    if (!slug || this.statusState() !== 'ready' || this.loadingOlderState()) {
      return false;
    }
    const changes = this.changes;
    const shown = this.postsState();
    const oldestShown = shown.at(-1) ?? null;
    try {
      const read: PostResponse[] = [];
      let cursor: string | null = null;
      let more = false;
      let covered = false;
      for (let pages = 0; pages < REFRESH_MAX_PAGES; pages++) {
        const page: CursorPagePostResponse = await firstValueFrom(
          this.api.listCommunityPosts(
            cursor ? { slug, limit: POSTS_PAGE, cursor } : { slug, limit: POSTS_PAGE },
            'body',
            false,
            { context: silentErrors() },
          ),
        );
        if (slug !== this.slugState() || changes !== this.changes) {
          return false;
        }
        const items = page.items ?? [];
        read.push(...items);
        cursor = page.nextCursor ?? null;
        more = !!page.hasMore && !!cursor;
        const last = items.at(-1);
        // Done once the room has no more, or the read reached the oldest post shown.
        if (!more || !last || !oldestShown || comparePosts(last, oldestShown) >= 0) {
          covered = true;
          break;
        }
      }
      const lastRead = read.at(-1);
      // Past the pages read again (a very long scroll back), the posts shown stay as they were.
      const beyond =
        covered || !lastRead ? [] : shown.filter((post) => comparePosts(post, lastRead) > 0);
      const next = mergePosts(beyond, read);
      const signature = (posts: readonly PostResponse[]) =>
        posts.map((post) => `${post.id}:${post.editedAt ?? ''}`).join();
      const changed = signature(shown) !== signature(next);
      this.postsState.set(next);
      if (covered) {
        this.setCursor(cursor, more);
      }
      return changed;
    } catch (error) {
      if (toApiError(error).errorCode === 'FEATURE_DISABLED') {
        this.statusState.set('disabled');
      }
      return false;
    }
  }

  async loadOlder(): Promise<void> {
    const slug = this.slugState();
    if (!slug || !this.nextCursor || this.loadingOlderState()) {
      return;
    }
    this.loadingOlderState.set(true);
    this.olderFailedState.set(false);
    this.changes++;
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
      this.postsState.update((posts) => mergePosts(posts, page.items ?? []));
      this.setCursor(page.nextCursor, page.hasMore);
    } catch {
      this.olderFailedState.set(true);
    } finally {
      this.loadingOlderState.set(false);
    }
  }

  /** Publishes a post; resolves `null` once it is in the room, else the refusal. */
  async create(request: CreatePostRequest): Promise<PostRefusal | null> {
    const slug = this.slugState();
    if (!slug || this.postingState()) {
      return null;
    }
    this.postingState.set(true);
    try {
      const post = await firstValueFrom(
        this.api.createCommunityPost({ slug, createPostRequest: request }, 'body', false, {
          context: silentErrors(),
        }),
      );
      if (slug === this.slugState()) {
        this.changes++;
        this.postsState.update((posts) => mergePosts(posts, [post]));
      }
      return null;
    } catch (error) {
      const apiError = toApiError(error);
      return { message: postErrorMessage(apiError), retryable: isRetryable(apiError) };
    } finally {
      this.postingState.set(false);
    }
  }

  /** Edits one's own post; resolves `null` once saved, else the message to show. */
  async update(id: string, body: string): Promise<string | null> {
    try {
      const post = await firstValueFrom(
        this.api.updateCommunityPost({ id, updatePostRequest: { body } }, 'body', false, {
          context: silentErrors(),
        }),
      );
      this.changes++;
      this.postsState.update((posts) => posts.map((item) => (item.id === post.id ? post : item)));
      return null;
    } catch (error) {
      return postErrorMessage(toApiError(error));
    }
  }

  /** Deletes one's own post; resolves `null` once gone, else the message to show. */
  async delete(id: string): Promise<string | null> {
    try {
      await firstValueFrom(
        this.api.deleteCommunityPost({ id }, 'body', false, { context: silentErrors() }),
      );
      this.drop(id);
      return null;
    } catch (error) {
      return friendlyMessage(toApiError(error));
    }
  }

  /** A moderator's removal, audited with the reason. */
  async remove(id: string, reason: string): Promise<string | null> {
    try {
      await firstValueFrom(
        this.adminApi.removeCommunityPost({ id, removeContentRequest: { reason } }, 'body', false, {
          context: silentErrors(),
        }),
      );
      this.drop(id);
      return null;
    } catch (error) {
      return friendlyMessage(toApiError(error));
    }
  }

  /** The posts of a collector the caller just blocked leave the room at once. */
  hideAuthor(authorId: string): void {
    this.changes++;
    this.postsState.update((posts) => posts.filter((post) => post.author.id !== authorId));
  }

  private drop(id: string): void {
    this.changes++;
    this.postsState.update((posts) => posts.filter((post) => post.id !== id));
  }

  private setCursor(cursor: string | null | undefined, hasMore: boolean | undefined): void {
    this.nextCursor = cursor ?? null;
    this.hasOlderState.set(!!hasMore && !!cursor);
  }
}
