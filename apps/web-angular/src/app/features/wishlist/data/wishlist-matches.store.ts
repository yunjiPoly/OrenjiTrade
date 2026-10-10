import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CursorPageWishlistMatchResponse,
  WishlistMatchResponse,
  WishlistService,
} from '@orenji/api-client';
import { Subscription, filter, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import { NotificationCenter } from '../../../core/notifications/notification-center.service';

/** Matches per page of `GET /wishlist/{id}/matches`. */
export const MATCHES_PAGE = 10;

export type MatchesStatus = 'loading' | 'ready' | 'error';

/**
 * The matches of one wish (`GET /wishlist/{id}/matches`, newest first, cursor pages): each a
 * public item with its owner's marker (state/province and country) and the dismiss action
 * (`POST /wishlist/matches/{id}/dismiss`, optimistic). A WISHLIST_MATCH notification pushed for
 * this wish brings the new match in without a reload.
 *
 * Provided by the matches drawer.
 */
@Injectable()
export class WishlistMatchesStore {
  private readonly api = inject(WishlistService);
  private readonly center = inject(NotificationCenter);
  private readonly destroyRef = inject(DestroyRef);

  private readonly matchesState = signal<WishlistMatchResponse[]>([]);
  private readonly statusState = signal<MatchesStatus>('loading');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly hasMoreState = signal(false);
  private readonly loadingMoreState = signal(false);
  private readonly moreFailedState = signal(false);
  private readonly dismissingState = signal<ReadonlySet<string>>(new Set());
  private readonly changedState = signal(false);

  readonly matches = this.matchesState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly hasMore = this.hasMoreState.asReadonly();
  readonly loadingMore = this.loadingMoreState.asReadonly();
  readonly moreFailed = this.moreFailedState.asReadonly();
  readonly dismissing = this.dismissingState.asReadonly();
  /** A match was dismissed or arrived: the wish's match count changed. */
  readonly changed = this.changedState.asReadonly();

  private wishId: string | null = null;
  private nextCursor: string | null = null;
  private loadSubscription: Subscription | null = null;

  /** Loads the matches of `wishId` and follows new ones. */
  init(wishId: string): void {
    if (this.wishId) {
      return;
    }
    this.wishId = wishId;
    this.load();
    this.center.pushed$
      .pipe(
        filter(
          (notification) =>
            notification.type === 'WISHLIST_MATCH' &&
            notification.data?.['wishlistItemId'] === wishId,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => void this.refresh());
    this.destroyRef.onDestroy(() => this.loadSubscription?.unsubscribe());
  }

  /** (Re)loads the first page, showing the skeleton. */
  load(): void {
    if (!this.wishId) {
      return;
    }
    this.loadSubscription?.unsubscribe();
    this.statusState.set('loading');
    this.errorState.set(null);
    this.moreFailedState.set(false);
    this.loadSubscription = this.api
      .listWishlistMatches({ id: this.wishId, limit: MATCHES_PAGE }, 'body', false, {
        context: silentErrors(),
      })
      .subscribe({
        next: (page) => {
          this.matchesState.set(page.items ?? []);
          this.setCursor(page);
          this.statusState.set('ready');
        },
        error: (error: unknown) => {
          this.errorState.set(toApiError(error));
          this.statusState.set('error');
        },
      });
  }

  loadMore(): void {
    if (!this.wishId || !this.nextCursor || this.loadingMoreState()) {
      return;
    }
    this.loadingMoreState.set(true);
    this.moreFailedState.set(false);
    this.api
      .listWishlistMatches(
        { id: this.wishId, limit: MATCHES_PAGE, cursor: this.nextCursor },
        'body',
        false,
        { context: silentErrors() },
      )
      .subscribe({
        next: (page) => {
          const known = new Set(this.matchesState().map((match) => match.id));
          const added = (page.items ?? []).filter((match) => !known.has(match.id));
          this.matchesState.update((matches) => [...matches, ...added]);
          this.setCursor(page);
          this.loadingMoreState.set(false);
        },
        error: () => {
          this.loadingMoreState.set(false);
          this.moreFailedState.set(true);
        },
      });
  }

  /** Quietly re-reads the first page and puts new matches on top. */
  async refresh(): Promise<void> {
    if (!this.wishId || this.statusState() !== 'ready') {
      return;
    }
    try {
      const page = await firstValueFrom(
        this.api.listWishlistMatches({ id: this.wishId, limit: MATCHES_PAGE }, 'body', false, {
          context: silentErrors(),
        }),
      );
      const known = new Set(this.matchesState().map((match) => match.id));
      const added = (page.items ?? []).filter((match) => !known.has(match.id));
      if (added.length) {
        this.matchesState.update((matches) => [...added, ...matches]);
        this.changedState.set(true);
      }
    } catch {
      // Keep what is shown.
    }
  }

  /** Dismisses a match for good (optimistic); rejects with an `ApiError` after restoring it. */
  async dismiss(match: WishlistMatchResponse): Promise<void> {
    const before = this.matchesState();
    this.matchesState.set(before.filter((candidate) => candidate.id !== match.id));
    this.setDismissing(match.id, true);
    try {
      await firstValueFrom(
        this.api.dismissWishlistMatch({ id: match.id }, 'body', false, {
          context: silentErrors(),
        }),
      );
      this.changedState.set(true);
    } catch (error) {
      this.matchesState.set(before);
      throw toApiError(error);
    } finally {
      this.setDismissing(match.id, false);
    }
  }

  private setCursor(page: CursorPageWishlistMatchResponse): void {
    this.nextCursor = page.nextCursor ?? null;
    this.hasMoreState.set(!!page.hasMore && !!page.nextCursor);
  }

  private setDismissing(id: string, busy: boolean): void {
    this.dismissingState.update((ids) => {
      const next = new Set(ids);
      if (busy) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }
}
