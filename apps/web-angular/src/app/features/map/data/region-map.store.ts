import { Injectable, computed, inject, signal } from '@angular/core';
import { MapService, PublicBinderSummary, RegionBinderCounts } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';

/** Binders per page of a state/province panel (the API allows 1–50). */
export const SUBDIVISION_PAGE_SIZE = 20;

/** Binders of one state/province, page after page (cursor). */
export interface SubdivisionBinders {
  code: string;
  items: PublicBinderSummary[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: ApiError | null;
}

/**
 * Data of `/map` (ADR 0017), provided by the page: public binders per state/province of the
 * browsed region (`GET /regions/{region}/binder-counts`) and the binders of the selected
 * state/province (`GET /regions/{region}/subdivisions/{code}/binders`, cursor pages). Answers of
 * an older request (another region or state) are dropped.
 */
@Injectable()
export class RegionMapStore {
  private readonly api = inject(MapService);

  private readonly regionState = signal<string | null>(null);
  private readonly countsState = signal<RegionBinderCounts | null>(null);
  private readonly countsLoadingState = signal(false);
  private readonly countsErrorState = signal<ApiError | null>(null);
  private readonly bindersState = signal<SubdivisionBinders | null>(null);
  private countsRequest = 0;
  private bindersRequest = 0;

  readonly region = this.regionState.asReadonly();
  readonly counts = this.countsState.asReadonly();
  readonly countsLoading = this.countsLoadingState.asReadonly();
  readonly countsError = this.countsErrorState.asReadonly();
  readonly binders = this.bindersState.asReadonly();

  /** Binders per subdivision code (absent = none). */
  readonly countByCode = computed(() => {
    const byCode = new Map<string, number>();
    for (const entry of this.countsState()?.subdivisions ?? []) {
      byCode.set(entry.code, entry.binderCount);
    }
    return byCode;
  });
  readonly total = computed(() => this.countsState()?.total ?? 0);

  /** Shows another region: reloads the counts and closes the state panel. */
  setRegion(region: string): void {
    if (this.regionState() === region) {
      return;
    }
    this.regionState.set(region);
    this.countsState.set(null);
    this.closeSubdivision();
    void this.loadCounts();
  }

  async loadCounts(): Promise<void> {
    const region = this.regionState();
    if (!region) {
      return;
    }
    const request = ++this.countsRequest;
    this.countsLoadingState.set(true);
    this.countsErrorState.set(null);
    try {
      const counts = await firstValueFrom(
        this.api.getRegionBinderCounts({ region }, 'body', false, { context: silentErrors() }),
      );
      if (request === this.countsRequest) {
        this.countsState.set(counts);
      }
    } catch (error) {
      if (request === this.countsRequest) {
        this.countsErrorState.set(toApiError(error));
      }
    } finally {
      if (request === this.countsRequest) {
        this.countsLoadingState.set(false);
      }
    }
  }

  /** Opens the panel of a state/province of the current region (first page). */
  openSubdivision(code: string): void {
    if (this.bindersState()?.code === code && !this.bindersState()?.error) {
      return;
    }
    this.bindersState.set({
      code,
      items: [],
      nextCursor: null,
      loading: true,
      loadingMore: false,
      error: null,
    });
    void this.fetchPage(code, null);
  }

  closeSubdivision(): void {
    this.bindersRequest++;
    this.bindersState.set(null);
  }

  retryBinders(): void {
    const current = this.bindersState();
    if (!current) {
      return;
    }
    const more = current.items.length > 0;
    this.bindersState.set({ ...current, loading: !more, loadingMore: more, error: null });
    void this.fetchPage(current.code, more ? current.nextCursor : null);
  }

  loadMore(): void {
    const current = this.bindersState();
    if (!current || !current.nextCursor || current.loading || current.loadingMore) {
      return;
    }
    this.bindersState.set({ ...current, loadingMore: true, error: null });
    void this.fetchPage(current.code, current.nextCursor);
  }

  private async fetchPage(code: string, cursor: string | null): Promise<void> {
    const region = this.regionState();
    if (!region) {
      return;
    }
    const request = ++this.bindersRequest;
    try {
      const page = await firstValueFrom(
        this.api.listSubdivisionBinders(
          { region, code, limit: SUBDIVISION_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      const current = this.bindersState();
      if (request !== this.bindersRequest || current?.code !== code) {
        return;
      }
      this.bindersState.set({
        code,
        items: cursor ? [...current.items, ...(page.items ?? [])] : (page.items ?? []),
        nextCursor: page.hasMore && page.nextCursor ? page.nextCursor : null,
        loading: false,
        loadingMore: false,
        error: null,
      });
    } catch (error) {
      const current = this.bindersState();
      if (request !== this.bindersRequest || current?.code !== code) {
        return;
      }
      this.bindersState.set({
        ...current,
        loading: false,
        loadingMore: false,
        error: toApiError(error),
      });
    }
  }
}
