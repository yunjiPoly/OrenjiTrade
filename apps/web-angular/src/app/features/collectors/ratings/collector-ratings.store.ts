import { Injectable, computed, inject, signal } from '@angular/core';
import {
  RatingEligibility,
  RatingResponse,
  RatingSummaryResponse,
  RatingsService,
  ReferenceResponse,
} from '@orenji/api-client';
import { Subscription, firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import type { RatedCollector } from '../../../shared/ratings/rate-collector-dialog.component';
import { RatingActionsService } from '../../../shared/ratings/rating-actions.service';
import {
  canWriteReference,
  isRatingEditable,
  rateableInteractions,
} from '../../../shared/ratings/rating-labels';

/** Ratings shown per page on the profile ("Show more" loads the next cursor page). */
export const RATINGS_PAGE_SIZE = 5;
const REFERENCES_PAGE_SIZE = 10;

type Status = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Ratings and references of one collector profile (component-scoped): the summary and cursor
 * list of `GET /collectors/{handle}/ratings`, the references, and the caller's eligibility
 * (`GET /ratings/eligibility?userId=`) that decides whether "Rate this collector" and "Write a
 * reference" are offered. Rating, editing and writing a reference go through
 * {@link RatingActionsService}; the list and summary are re-read afterwards.
 */
@Injectable()
export class CollectorRatingsStore {
  private readonly api = inject(RatingsService);
  private readonly actions = inject(RatingActionsService);
  private readonly session = inject(SessionService);

  private readonly collectorState = signal<RatedCollector | null>(null);
  private readonly ownState = signal(false);
  private readonly statusState = signal<Status>('idle');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly summaryState = signal<RatingSummaryResponse | null>(null);
  private readonly ratingsState = signal<RatingResponse[]>([]);
  private readonly cursorState = signal<string | null>(null);
  private readonly loadingMoreState = signal(false);
  private readonly eligibilityState = signal<RatingEligibility | null>(null);
  private readonly referencesState = signal<ReferenceResponse[] | null>(null);
  private readonly referencesCursorState = signal<string | null>(null);
  private readonly referencesFailedState = signal(false);

  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly summary = this.summaryState.asReadonly();
  readonly ratings = this.ratingsState.asReadonly();
  readonly hasMore = computed(() => !!this.cursorState());
  readonly loadingMore = this.loadingMoreState.asReadonly();
  readonly eligibility = this.eligibilityState.asReadonly();
  readonly references = this.referencesState.asReadonly();
  readonly hasMoreReferences = computed(() => !!this.referencesCursorState());
  readonly referencesFailed = this.referencesFailedState.asReadonly();

  /** Interactions the caller can still rate. */
  readonly rateable = computed(() => rateableInteractions(this.eligibilityState()));
  readonly canRate = computed(() => !this.ownState() && this.rateable().length > 0);
  /** The caller already wrote a reference for this collector (one per author). */
  readonly wroteReference = computed(() => {
    const handle = this.session.handle();
    return !!handle && (this.referencesState() ?? []).some((ref) => ref.author.handle === handle);
  });
  readonly canReference = computed(
    () =>
      !this.ownState() &&
      canWriteReference(this.eligibilityState()) &&
      this.referencesState() !== null &&
      !this.wroteReference(),
  );

  private subscription: Subscription | null = null;

  /** Starts (or restarts) for a collector; `own` hides the rate and reference actions. */
  open(collector: RatedCollector & { handle: string }, own: boolean): void {
    this.collectorState.set(collector);
    this.ownState.set(own);
    this.eligibilityState.set(null);
    this.referencesState.set(null);
    this.load();
    this.loadReferences();
    if (!own) {
      void this.loadEligibility();
    }
  }

  /** The caller wrote this rating (by handle, the only rater identity the list carries). */
  isMine(rating: RatingResponse): boolean {
    const handle = this.session.handle();
    return !!handle && rating.rater.handle === handle;
  }

  canEdit(rating: RatingResponse): boolean {
    return this.isMine(rating) && isRatingEditable(rating);
  }

  /** First page and summary. */
  load(): void {
    const collector = this.collectorState();
    if (!collector?.handle) {
      return;
    }
    this.subscription?.unsubscribe();
    this.statusState.set('loading');
    this.errorState.set(null);
    this.subscription = this.api
      .listCollectorRatings({ handle: collector.handle, limit: RATINGS_PAGE_SIZE }, 'body', false, {
        context: silentErrors(),
      })
      .subscribe({
        next: (page) => {
          this.summaryState.set(page.summary);
          this.ratingsState.set(page.items ?? []);
          this.cursorState.set(page.hasMore ? (page.nextCursor ?? null) : null);
          this.statusState.set('ready');
        },
        error: (error: unknown) => {
          this.errorState.set(toApiError(error));
          this.statusState.set('error');
        },
      });
  }

  async loadMore(): Promise<void> {
    const collector = this.collectorState();
    const cursor = this.cursorState();
    if (!collector?.handle || !cursor || this.loadingMoreState()) {
      return;
    }
    this.loadingMoreState.set(true);
    try {
      const page = await firstValueFrom(
        this.api.listCollectorRatings(
          { handle: collector.handle, cursor, limit: RATINGS_PAGE_SIZE },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      const known = new Set(this.ratingsState().map((rating) => rating.id));
      this.ratingsState.update((ratings) => [
        ...ratings,
        ...(page.items ?? []).filter((rating) => !known.has(rating.id)),
      ]);
      this.cursorState.set(page.hasMore ? (page.nextCursor ?? null) : null);
    } catch {
      // The button stays; a second press retries the same cursor.
    } finally {
      this.loadingMoreState.set(false);
    }
  }

  async loadReferences(more = false): Promise<void> {
    const collector = this.collectorState();
    if (!collector?.handle) {
      return;
    }
    this.referencesFailedState.set(false);
    try {
      const page = await firstValueFrom(
        this.api.listCollectorReferences(
          {
            handle: collector.handle,
            limit: REFERENCES_PAGE_SIZE,
            ...(more && this.referencesCursorState()
              ? { cursor: this.referencesCursorState() as string }
              : {}),
          },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      const items = page.items ?? [];
      this.referencesState.update((current) => (more ? [...(current ?? []), ...items] : items));
      this.referencesCursorState.set(page.hasMore ? (page.nextCursor ?? null) : null);
    } catch {
      this.referencesFailedState.set(true);
      if (!more) {
        this.referencesState.set([]);
      }
    }
  }

  async rate(): Promise<void> {
    const collector = this.collectorState();
    if (!collector || !this.canRate()) {
      return;
    }
    if (await this.actions.rate(collector, this.rateable())) {
      this.load();
      await this.loadEligibility();
    }
  }

  async edit(rating: RatingResponse): Promise<void> {
    const collector = this.collectorState();
    if (!collector || !this.canEdit(rating)) {
      return;
    }
    if (await this.actions.edit(collector, rating)) {
      this.load();
    }
  }

  async writeReference(): Promise<void> {
    const collector = this.collectorState();
    if (!collector || !this.canReference()) {
      return;
    }
    if (await this.actions.writeReference(collector)) {
      await this.loadReferences();
    }
  }

  private async loadEligibility(): Promise<void> {
    const collector = this.collectorState();
    if (!collector) {
      return;
    }
    try {
      this.eligibilityState.set(await this.actions.eligibility(collector.id));
    } catch {
      // Without an answer nothing is offered; the API refuses ineligible ratings anyway.
      this.eligibilityState.set({ eligible: false, interactions: [] });
    }
  }
}
