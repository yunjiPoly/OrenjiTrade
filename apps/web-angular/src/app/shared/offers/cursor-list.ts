import { signal } from '@angular/core';
import { Observable, Subscription, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../core/http/api-error';

/** A cursor page as the API sends it (`CursorPage<T>`). */
export interface CursorSlice<T> {
  items?: T[];
  nextCursor?: string | null;
  hasMore?: boolean;
}

export type CursorListStatus = 'loading' | 'ready' | 'error';

/**
 * Signals of a cursor-paginated list (offers inbox, trades): first page with a skeleton, "Load
 * more" pages appended without duplicates, a quiet refresh of the first page (realtime updates,
 * reconnections) and an error with retry. `fetch` reads the page after `cursor` with the
 * caller's current filters.
 */
export class CursorList<T extends { id: string }> {
  private readonly itemsState = signal<T[]>([]);
  private readonly statusState = signal<CursorListStatus>('loading');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly hasMoreState = signal(false);
  private readonly loadingMoreState = signal(false);
  private readonly moreFailedState = signal(false);

  readonly items = this.itemsState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly hasMore = this.hasMoreState.asReadonly();
  readonly loadingMore = this.loadingMoreState.asReadonly();
  readonly moreFailed = this.moreFailedState.asReadonly();

  private nextCursor: string | null = null;
  private loadSubscription: Subscription | null = null;
  private moreSubscription: Subscription | null = null;
  /** Bumped by every (re)load so late answers of an older query are ignored. */
  private generation = 0;

  constructor(private readonly fetch: (cursor: string | null) => Observable<CursorSlice<T>>) {}

  /** (Re)loads the first page, showing the skeleton. */
  load(): void {
    this.cancel();
    const generation = ++this.generation;
    this.statusState.set('loading');
    this.errorState.set(null);
    this.moreFailedState.set(false);
    this.loadingMoreState.set(false);
    this.loadSubscription = this.fetch(null).subscribe({
      next: (page) => {
        if (generation !== this.generation) {
          return;
        }
        this.itemsState.set(page.items ?? []);
        this.setCursor(page);
        this.statusState.set('ready');
      },
      error: (error: unknown) => {
        if (generation !== this.generation) {
          return;
        }
        this.errorState.set(toApiError(error));
        this.statusState.set('error');
      },
    });
  }

  loadMore(): void {
    if (!this.nextCursor || this.loadingMoreState() || this.statusState() !== 'ready') {
      return;
    }
    const generation = this.generation;
    this.loadingMoreState.set(true);
    this.moreFailedState.set(false);
    this.moreSubscription = this.fetch(this.nextCursor).subscribe({
      next: (page) => {
        if (generation !== this.generation) {
          return;
        }
        const known = new Set(this.itemsState().map((item) => item.id));
        const added = (page.items ?? []).filter((item) => !known.has(item.id));
        this.itemsState.update((items) => [...items, ...added]);
        this.setCursor(page);
        this.loadingMoreState.set(false);
      },
      error: () => {
        this.loadingMoreState.set(false);
        this.moreFailedState.set(true);
      },
    });
  }

  /** Quietly re-reads the first page (older pages are dropped: the order may have changed). */
  async refresh(): Promise<void> {
    if (this.statusState() !== 'ready') {
      return;
    }
    const generation = this.generation;
    try {
      const page = await firstValueFrom(this.fetch(null));
      if (generation === this.generation) {
        this.itemsState.set(page.items ?? []);
        this.setCursor(page);
      }
    } catch {
      // Keep what is on screen; the next refresh or a reload tries again.
    }
  }

  cancel(): void {
    this.loadSubscription?.unsubscribe();
    this.moreSubscription?.unsubscribe();
    this.loadSubscription = null;
    this.moreSubscription = null;
  }

  private setCursor(page: CursorSlice<T>): void {
    this.nextCursor = page.hasMore && page.nextCursor ? page.nextCursor : null;
    this.hasMoreState.set(!!this.nextCursor);
  }
}
