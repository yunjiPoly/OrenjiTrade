import { Injectable, computed, inject, signal } from '@angular/core';
import { FeedPage, FeedPost, FeedService } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { silentErrors } from '../../core/http/http-context';
import { EmptyKind, FeedFilter, emptyKind, mergePosts } from './home-rules';

/** Posts per page of `GET /feed` and pictures per new-cards post (the web's 6 tiles). */
export const FEED_PAGE_SIZE = 20;
export const FEED_PREVIEWS = 6;

export interface FeedQuery {
  region: string;
  game: string;
  kind: FeedFilter;
}

/**
 * Home's feed (spec 5.4): `GET /feed?region&game&kind` with cursor pages over the window, a quiet
 * check for newer posts (one post read: "New posts · Show" without a number, never sliding them in
 * on its own) and the time of the last read ("Updated 5 min ago"). An answer for an older query
 * (another region, game or chip) is dropped. Provided by the page.
 */
@Injectable()
export class HomeFeedStore {
  private readonly api = inject(FeedService);

  private readonly postsState = signal<FeedPost[]>([]);
  private readonly statusState = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly moreState = signal<'idle' | 'loading' | 'error'>('idle');
  private readonly pageState = signal<FeedPage | null>(null);
  private readonly loadedAtState = signal<number | null>(null);
  private readonly newerState = signal(false);
  private query: FeedQuery | null = null;
  private cursor: string | null = null;
  private generation = 0;
  /** The first page being read (not quietly): the same query again shares it (U7). */
  private inFlight: { query: FeedQuery; promise: Promise<void> } | null = null;

  readonly posts = this.postsState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly more = this.moreState.asReadonly();
  /** When the first page was last read (ms), for "Updated 5 min ago". */
  readonly loadedAt = this.loadedAtState.asReadonly();
  /** Newer posts exist than the first one shown ("New posts · Show"). */
  readonly newer = this.newerState.asReadonly();
  readonly hasMore = computed(() => !!this.pageState()?.hasMore && this.cursor !== null);
  readonly windowDays = computed(() => this.pageState()?.windowDays ?? 30);
  readonly empty = computed<EmptyKind>(() => {
    const page = this.pageState();
    return page && this.statusState() === 'ready'
      ? emptyKind({ ...page, items: this.postsState() })
      : null;
  });
  /** The last page was read: "You're all caught up". */
  readonly atEnd = computed(
    () =>
      this.statusState() === 'ready' &&
      this.postsState().length > 0 &&
      !this.pageState()?.hasMore &&
      this.moreState() === 'idle',
  );

  /**
   * Reads the first page of `query` (the skeletons show unless `quiet`). The same query asked
   * again while its first page is being read shares that read (Home's URL gaining `region` and
   * `game` re-runs the page's effect: one read, never two).
   */
  load(query: FeedQuery, quiet = false): Promise<void> {
    const pending = this.inFlight;
    if (
      !quiet &&
      pending &&
      pending.query.region === query.region &&
      pending.query.game === query.game &&
      pending.query.kind === query.kind
    ) {
      return pending.promise;
    }
    const promise = this.readFirst(query, quiet);
    if (quiet) {
      this.inFlight = null;
      return promise;
    }
    const entry = { query, promise };
    this.inFlight = entry;
    void promise.finally(() => {
      if (this.inFlight === entry) {
        this.inFlight = null;
      }
    });
    return promise;
  }

  private async readFirst(query: FeedQuery, quiet: boolean): Promise<void> {
    const generation = ++this.generation;
    this.query = query;
    this.newerState.set(false);
    this.moreState.set('idle');
    if (!quiet) {
      this.statusState.set('loading');
      this.postsState.set([]);
      this.pageState.set(null);
    }
    try {
      const page = await this.read(query, null, FEED_PAGE_SIZE);
      if (generation !== this.generation) {
        return;
      }
      this.cursor = page.nextCursor ?? null;
      this.pageState.set(page);
      this.postsState.set(mergePosts([], page.items ?? []));
      this.loadedAtState.set(Date.now());
      this.statusState.set('ready');
    } catch {
      if (generation === this.generation) {
        this.statusState.set('error');
      }
    }
  }

  /** The next page ("Couldn't load more" with Try again on a failure). */
  async loadMore(): Promise<void> {
    const query = this.query;
    const cursor = this.cursor;
    if (!query || !cursor || this.moreState() === 'loading' || this.statusState() !== 'ready') {
      return;
    }
    const generation = this.generation;
    this.moreState.set('loading');
    try {
      const page = await this.read(query, cursor, FEED_PAGE_SIZE);
      if (generation !== this.generation) {
        return;
      }
      this.cursor = page.nextCursor ?? null;
      this.pageState.set({ ...page, gameHasPosts: true, regionHasPosts: true });
      this.postsState.update((posts) => mergePosts(posts, page.items ?? []));
      this.moreState.set('idle');
    } catch {
      if (generation === this.generation) {
        this.moreState.set('error');
      }
    }
  }

  /** Reads one post quietly: newer than the first shown? Never changes the list. */
  async checkNewer(): Promise<void> {
    const query = this.query;
    if (!query || this.statusState() !== 'ready' || this.newerState()) {
      return;
    }
    const generation = this.generation;
    try {
      const page = await this.read(query, null, 1);
      if (generation !== this.generation) {
        return;
      }
      const top = page.items?.[0];
      const shown = this.postsState()[0];
      if (top && (!shown || (top.id !== shown.id && Date.parse(top.at) > Date.parse(shown.at)))) {
        this.newerState.set(true);
      } else if (top && shown && top.id === shown.id && Date.parse(top.at) > Date.parse(shown.at)) {
        // The newest post gained cards since it was read.
        this.newerState.set(true);
      }
    } catch {
      // The pill is a bonus: a failed check changes nothing.
    }
  }

  private read(query: FeedQuery, cursor: string | null, limit: number): Promise<FeedPage> {
    return firstValueFrom(
      this.api.getFeed(
        {
          region: query.region,
          game: query.game,
          kind: query.kind,
          limit,
          previews: FEED_PREVIEWS,
          ...(cursor ? { cursor } : {}),
        },
        'body',
        false,
        { context: silentErrors() },
      ),
    );
  }
}
