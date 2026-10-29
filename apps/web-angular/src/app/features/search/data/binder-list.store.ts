import { Injectable, inject, signal } from '@angular/core';
import { MapService } from '@orenji/api-client';
import type { PublicBinderSummary } from '@orenji/api-client';
import { Subscription } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { ATTACH_ID_TOKEN, silentErrors } from '../../../core/http/http-context';

/** Rows per page of Search › Binders (cursor pages with "Load more"; the API allows 1 to 50). */
export const BINDER_LIST_PAGE_SIZE = 20;

/** What Search › Binders lists: a state (or the whole region), binders or deck cores, a text. */
export interface BinderListQuery {
  region: string;
  game: string;
  /** A subdivision code, or null for the whole region. */
  state: string | null;
  deckCores: boolean;
  q: string;
}

export function sameBinderQuery(a: BinderListQuery | null, b: BinderListQuery | null): boolean {
  return (
    !!a &&
    !!b &&
    a.region === b.region &&
    a.game === b.game &&
    a.state === b.state &&
    a.deckCores === b.deckCores &&
    a.q === b.q
  );
}

/**
 * The rows of Search › Binders (spec 6.3): `GET /regions/{region}/subdivisions/{code}/binders` for
 * a state, `GET /regions/{region}/binders` for the whole region, each with `deckCore`, `q` and
 * `game` (stage G), most recently updated first, page after page. Listing spends no binder view:
 * only opening one does (decision 14). Blocks are left out by the API in SQL.
 */
@Injectable()
export class BinderListStore {
  private readonly api = inject(MapService);

  private readonly querySignal = signal<BinderListQuery | null>(null);
  private readonly itemsSignal = signal<PublicBinderSummary[]>([]);
  private readonly statusSignal = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  private readonly errorSignal = signal<ApiError | null>(null);
  private readonly cursorSignal = signal<string | null>(null);
  private request = 0;
  private subscription: Subscription | null = null;

  readonly query = this.querySignal.asReadonly();
  readonly items = this.itemsSignal.asReadonly();
  readonly status = this.statusSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly hasMore = () => !!this.cursorSignal();

  load(query: BinderListQuery): void {
    if (sameBinderQuery(this.querySignal(), query) && this.statusSignal() !== 'error') {
      return;
    }
    this.querySignal.set(query);
    this.itemsSignal.set([]);
    this.cursorSignal.set(null);
    this.fetch(null);
  }

  loadMore(): void {
    if (this.statusSignal() === 'loading' || !this.cursorSignal()) {
      return;
    }
    this.fetch(this.cursorSignal());
  }

  retry(): void {
    this.fetch(this.itemsSignal().length > 0 ? this.cursorSignal() : null);
  }

  clear(): void {
    this.request++;
    this.subscription?.unsubscribe();
    this.querySignal.set(null);
    this.itemsSignal.set([]);
    this.statusSignal.set('idle');
  }

  private fetch(cursor: string | null): void {
    const query = this.querySignal();
    if (!query) {
      return;
    }
    this.subscription?.unsubscribe();
    const request = ++this.request;
    this.statusSignal.set('loading');
    this.errorSignal.set(null);
    const params = {
      region: query.region,
      game: query.game,
      deckCore: query.deckCores,
      limit: BINDER_LIST_PAGE_SIZE,
      ...(query.q ? { q: query.q } : {}),
      ...(cursor ? { cursor } : {}),
    };
    // Signed in, the token lets the API leave out collectors blocked either way.
    const options = { context: silentErrors().set(ATTACH_ID_TOKEN, true) };
    const page$ = query.state
      ? this.api.listSubdivisionBinders({ ...params, code: query.state }, 'body', false, options)
      : this.api.listRegionBinders(params, 'body', false, options);
    this.subscription = page$.subscribe({
      next: (page) => {
        if (request !== this.request) {
          return;
        }
        this.itemsSignal.set(
          cursor ? [...this.itemsSignal(), ...(page.items ?? [])] : (page.items ?? []),
        );
        this.cursorSignal.set(page.hasMore && page.nextCursor ? page.nextCursor : null);
        this.statusSignal.set('ready');
      },
      error: (error: unknown) => {
        if (request !== this.request) {
          return;
        }
        this.errorSignal.set(toApiError(error));
        this.statusSignal.set('error');
      },
    });
  }
}
