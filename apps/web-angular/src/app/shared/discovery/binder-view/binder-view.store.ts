import { HttpContext } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CollectorsService, PublicBindersService } from '@orenji/api-client';
import type {
  CollectorRating,
  PublicBinderResponse,
  PublicInventoryItem,
} from '@orenji/api-client';
import { Subscription, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import {
  ATTACH_ID_TOKEN,
  SKIP_ERROR_TOAST,
  SKIP_LIMIT_DIALOG,
} from '../../../core/http/http-context';
import { LimitReachedInfo, limitReachedInfo } from '../../../core/limits/limit-reached';

/** Cards per page of a binder (`GET /public/binders/{id}/items`, "Load more"). */
export const BINDER_PAGE_SIZE = 24;

/** The sort pill of a binder (spec 8.2): Recently added (the default), Name, Price. */
export type BinderSort = 'recent' | 'name' | 'price';
export const BINDER_SORTS: readonly { value: BinderSort; label: string }[] = [
  { value: 'recent', label: 'Recently added' },
  { value: 'name', label: 'Name' },
  { value: 'price', label: 'Price' },
];

export function isBinderSort(value: unknown): value is BinderSort {
  return value === 'recent' || value === 'name' || value === 'price';
}

export type BinderViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; binder: PublicBinderResponse }
  | { kind: 'not-found' }
  | { kind: 'limit'; info: LimitReachedInfo }
  | { kind: 'error'; error: ApiError };

/**
 * Public reads carry the collector's token when signed in: the API counts
 * `binder.views.per_day` (once per binder and day), applies blocks and keys rate limits by
 * account. The page explains the limit itself, so the global limit dialog stays closed.
 */
function publicContext(): HttpContext {
  return new HttpContext()
    .set(ATTACH_ID_TOKEN, true)
    .set(SKIP_ERROR_TOAST, true)
    .set(SKIP_LIMIT_DIALOG, true);
}

/**
 * "You've opened 30 public binders today. Every collector has the same limits. More tomorrow at
 * 8:00 PM." (spec 6.5; the limit and the time come from the server's 429).
 */
export function binderLimitMessage(info: LimitReachedInfo | null, locale = 'en-CA'): string {
  const count = info?.limit ?? null;
  const opened = count
    ? `You've opened ${count} public binders today.`
    : "You've opened today's public binders.";
  let when = 'More tomorrow.';
  if (info?.resetsAt) {
    const date = new Date(info.resetsAt);
    if (!Number.isNaN(date.getTime())) {
      when = `More tomorrow at ${date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}.`;
    }
  }
  return `${opened} Every collector has the same limits. ${when}`;
}

/** "Updated today", "Updated yesterday", "Updated 3 days ago", "Updated Oct 2". */
export function updatedLabel(iso: string | null | undefined, now = new Date()): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const day = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days <= 0) {
    return 'Updated today';
  }
  if (days === 1) {
    return 'Updated yesterday';
  }
  if (days < 7) {
    return `Updated ${days} days ago`;
  }
  return `Updated ${date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`;
}

/**
 * One public binder or deck core and its cards, for its page (`/binders/:id`) and Search's
 * drill-in (spec 6.5 and 8). `open()` is the only read of the binder itself and spends one public
 * binder view (decision 14: only on an explicit open, never on hover or prefetch); its cards
 * (search, sort, "Load more") and the owner's rating are reads that spend none.
 */
@Injectable()
export class BinderViewStore {
  private readonly api = inject(PublicBindersService);
  private readonly collectors = inject(CollectorsService);
  private readonly auth = inject(AuthService);

  private readonly stateSignal = signal<BinderViewState>({ kind: 'loading' });
  private readonly itemsSignal = signal<PublicInventoryItem[]>([]);
  private readonly itemsStatus = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  private readonly totalPages = signal(0);
  private readonly page = signal(0);
  private readonly ratingSignal = signal<CollectorRating | null>(null);
  private readonly querySignal = signal('');
  private readonly sortSignal = signal<BinderSort>('recent');
  private binderSub: Subscription | null = null;
  private itemsSub: Subscription | null = null;
  private itemsRequest = 0;
  private openedId: string | null = null;

  readonly state = this.stateSignal.asReadonly();
  readonly items = this.itemsSignal.asReadonly();
  readonly itemsState = this.itemsStatus.asReadonly();
  readonly rating = this.ratingSignal.asReadonly();
  readonly query = this.querySignal.asReadonly();
  readonly sort = this.sortSignal.asReadonly();
  readonly binder = computed(() => {
    const state = this.stateSignal();
    return state.kind === 'ready' ? state.binder : null;
  });
  readonly hasMore = computed(() => this.page() + 1 < this.totalPages());

  /** Opens a binder: the one read that spends a binder view. */
  async open(id: string): Promise<void> {
    this.binderSub?.unsubscribe();
    this.itemsSub?.unsubscribe();
    this.openedId = id;
    this.stateSignal.set({ kind: 'loading' });
    this.itemsSignal.set([]);
    this.itemsStatus.set('idle');
    this.ratingSignal.set(null);
    await this.auth.ready();
    if (this.openedId !== id) {
      return;
    }
    this.binderSub = this.api
      .getPublicBinder({ id }, 'body', false, { context: publicContext() })
      .subscribe({
        next: (binder) => {
          if (this.openedId !== id) {
            return;
          }
          this.stateSignal.set({ kind: 'ready', binder });
          this.loadItems(0);
          void this.loadRating(binder.owner?.handle ?? null);
        },
        error: (error: unknown) => {
          if (this.openedId !== id) {
            return;
          }
          const apiError = toApiError(error);
          if (apiError.errorCode === 'LIMIT_REACHED') {
            this.stateSignal.set({ kind: 'limit', info: limitReachedInfo(apiError) });
          } else if (apiError.status === 404 || apiError.errorCode === 'VALIDATION_FAILED') {
            this.stateSignal.set({ kind: 'not-found' });
          } else {
            this.stateSignal.set({ kind: 'error', error: apiError });
          }
        },
      });
  }

  /** Search this binder and the sort pill (spend no view). */
  setFilters(query: string, sort: BinderSort): void {
    const changed = query !== this.querySignal() || sort !== this.sortSignal();
    this.querySignal.set(query);
    this.sortSignal.set(sort);
    if (changed && this.binder()) {
      this.loadItems(0);
    }
  }

  loadMore(): void {
    if (this.itemsStatus() === 'loading') {
      return;
    }
    this.loadItems(this.itemsSignal().length === 0 ? 0 : this.page() + 1);
  }

  retryItems(): void {
    this.loadItems(this.itemsSignal().length === 0 ? 0 : this.page() + 1);
  }

  close(): void {
    this.openedId = null;
    this.binderSub?.unsubscribe();
    this.itemsSub?.unsubscribe();
  }

  private loadItems(page: number): void {
    const binder = this.binder();
    if (!binder) {
      return;
    }
    this.itemsSub?.unsubscribe();
    const request = ++this.itemsRequest;
    this.itemsStatus.set('loading');
    const query = this.querySignal().trim();
    this.itemsSub = this.api
      .listPublicBinderItems(
        {
          id: binder.id,
          page,
          size: BINDER_PAGE_SIZE,
          sort: this.sortSignal(),
          ...(query ? { query } : {}),
        },
        'body',
        false,
        { context: publicContext() },
      )
      .subscribe({
        next: (result) => {
          if (request !== this.itemsRequest) {
            return;
          }
          const items = result.items ?? [];
          this.itemsSignal.set(page === 0 ? items : [...this.itemsSignal(), ...items]);
          this.page.set(result.page ?? page);
          this.totalPages.set(result.totalPages ?? 0);
          this.itemsStatus.set('ready');
        },
        error: () => {
          if (request === this.itemsRequest) {
            this.itemsStatus.set('error');
          }
        },
      });
  }

  private async loadRating(handle: string | null): Promise<void> {
    if (!handle) {
      return;
    }
    try {
      const profile = await firstValueFrom(
        this.collectors.getCollector({ handle }, 'body', false, { context: publicContext() }),
      );
      if (this.binder()?.owner?.handle === handle) {
        this.ratingSignal.set(profile.rating ?? null);
      }
    } catch {
      // The rating is a bonus beside the owner: the binder stays without it.
    }
  }
}
