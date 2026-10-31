import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import {
  AdminRating,
  AdminRatingsService,
  AdminReference,
  PageResponseAdminRating,
  PageResponseAdminReference,
} from '@orenji/api-client';
import { Observable, Subscription, forkJoin } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ToastService } from '../../../core/feedback/toast.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { breakdownEntries } from '../../../shared/ratings/rating-labels';
import { StarRatingComponent } from '../../../shared/ratings/star-rating.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminIconComponent } from '../console/admin-icon.component';
import { runConsoleAction } from '../console/console-actions';
import { initialsOf } from '../console/console-labels';
import { pageRangeLine } from '../reports/report-filters';
import { askReason, confirmAdminAction } from '../shared/admin-actions';
import {
  RatingsTab,
  ShowFilter,
  peopleOf,
  ratingFollowedLabel,
  ratingsParams,
  ratingsTabOf,
  showFilterOf,
} from './ratings-filters';

const PAGE_SIZE = 20;

/** One row of either tab, read the same way. */
interface Row {
  id: string;
  kind: 'rating' | 'reference';
  author: { handle: string; displayName: string };
  subject: { handle: string; displayName: string };
  /** The rated collector's (or the reference subject's) account id: the filter, the account. */
  subjectId: string;
  overall: number | null;
  line: string;
  createdAt: string;
  text: string | null;
  criteria: { label: string; value: number }[];
  hidden: boolean;
  hiddenReason: string | null;
  hiddenBy: string | null;
  hiddenAt: string | null;
}

function ratingRow(entry: AdminRating): Row {
  return {
    id: entry.rating.id,
    kind: 'rating',
    author: entry.rating.rater,
    subject: entry.ratee,
    subjectId: entry.rateeId,
    overall: entry.rating.overall,
    line: ratingFollowedLabel(entry.rating.interactionKind),
    createdAt: entry.rating.createdAt,
    text: entry.rating.comment ?? null,
    criteria: breakdownEntries(entry.rating.breakdown),
    hidden: entry.moderationState === 'HIDDEN',
    hiddenReason: entry.hiddenReason ?? null,
    hiddenBy: entry.hiddenByHandle ?? null,
    hiddenAt: entry.hiddenAt ?? null,
  };
}

function referenceRow(entry: AdminReference): Row {
  return {
    id: entry.reference.id,
    kind: 'reference',
    author: entry.reference.author,
    subject: entry.subject,
    subjectId: entry.subjectId,
    overall: null,
    line: 'Reference',
    createdAt: entry.reference.createdAt,
    text: entry.reference.body,
    criteria: [],
    hidden: entry.moderationState === 'HIDDEN',
    hiddenReason: entry.hiddenReason ?? null,
    hiddenBy: entry.hiddenByHandle ?? null,
    hiddenAt: entry.hiddenAt ?? null,
  };
}

/**
 * `/admin/ratings` (spec 15.4, board A6; moderators and admins): Ratings and References (a new
 * screen for the existing hide and unhide endpoints), each with the state (All, Visible, Hidden),
 * "Rated collector" and "Rated by" (the API's `rateeId` and `raterId`; "About" and "Written by" on
 * references), all in the URL. People read as name and @handle, never an id; criteria show as
 * stored (old meetup criteria only on old rows). Hide asks for a reason; Restore confirms.
 */
@Component({
  selector: 'app-admin-ratings-page',
  imports: [
    RouterLink,
    AdminIconComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    RelativeTimePipe,
    SkeletonComponent,
    StarRatingComponent,
  ],
  templateUrl: './admin-ratings-page.component.html',
  styleUrls: [
    '../console/console-page.scss',
    '../console/console-controls.scss',
    './admin-ratings-page.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminRatingsPageComponent {
  private readonly api = inject(AdminRatingsService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  protected readonly session = inject(SessionService);

  /** Query parameters (withComponentInputBinding). */
  readonly tab = input<string | undefined>();
  readonly state = input<string | undefined>();
  readonly rateeId = input<string | undefined>();
  readonly raterId = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly current = computed<RatingsTab>(() => ratingsTabOf(this.tab()));
  protected readonly show = computed<ShowFilter>(() => showFilterOf(this.state()));
  protected readonly params = computed(() =>
    ratingsParams(
      { state: this.state(), rateeId: this.rateeId(), raterId: this.raterId(), page: this.page() },
      PAGE_SIZE,
    ),
  );
  protected readonly rows = signal<Row[] | null>(null);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<string | null>(null);
  /** All, Visible and Hidden counts of the tab with the people filters. */
  protected readonly counts = signal<Record<ShowFilter, number> | null>(null);
  /** People seen on the pages read so far (the pickers' options), by id. */
  protected readonly people = signal<Map<string, { handle: string; displayName: string }>>(
    new Map(),
  );

  protected readonly tabs: readonly { id: RatingsTab; label: string }[] = [
    { id: 'ratings', label: 'Ratings' },
    { id: 'references', label: 'References' },
  ];
  protected readonly shows: readonly { id: ShowFilter; label: string }[] = [
    { id: 'ALL', label: 'All' },
    { id: 'OK', label: 'Visible' },
    { id: 'HIDDEN', label: 'Hidden' },
  ];
  protected readonly initials = initialsOf;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly range = computed(() =>
    pageRangeLine(this.params().page, PAGE_SIZE, this.total()),
  );
  protected readonly lastPage = computed(
    () => (this.params().page + 1) * PAGE_SIZE >= this.total(),
  );
  protected readonly countLine = computed(() => {
    const counts = this.counts();
    const noun = this.current() === 'ratings' ? 'rating' : 'reference';
    const total = this.total();
    const hidden = counts ? ` · ${counts.HIDDEN} hidden` : '';
    return `${total} ${total === 1 ? noun : `${noun}s`}${hidden} · newest first`;
  });
  protected readonly personOptions = computed(() =>
    [...this.people().entries()]
      .map(([id, person]) => ({ id, ...person }))
      .sort((a, b) => a.handle.localeCompare(b.handle)),
  );

  private subscription: Subscription | null = null;
  /** The row whose Hide or Restore ran: its button gets the focus once the list is read again. */
  private focusRow: string | null = null;

  constructor() {
    effect(() => {
      const tab = this.current();
      const params = this.params();
      untracked(() => this.load(tab, params));
    });
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected setTab(tab: RatingsTab): void {
    void this.router.navigate([], {
      queryParams: { tab: tab === 'ratings' ? null : tab, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected onTabKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const next: RatingsTab =
      event.key === 'Home'
        ? 'ratings'
        : event.key === 'End'
          ? 'references'
          : this.current() === 'ratings'
            ? 'references'
            : 'ratings';
    this.setTab(next);
    setTimeout(() => this.document.getElementById(`ratings-tab-${next}`)?.focus());
  }

  protected setShow(show: ShowFilter): void {
    this.navigate({ state: show === 'ALL' ? null : show });
  }

  protected setPerson(key: 'rateeId' | 'raterId', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.navigate({ [key]: value || null });
  }

  /** "@handle" of a row: the list of that collector only (today's shortcut, review fix 1). */
  protected onlyAbout(row: Row): void {
    this.navigate({ rateeId: row.subjectId });
  }

  protected goPage(delta: number): void {
    const next = Math.max(0, this.params().page + delta);
    void this.router.navigate([], {
      queryParams: { page: next || null },
      queryParamsHandling: 'merge',
    });
  }

  protected reload(): void {
    this.load(this.current(), this.params());
  }

  private navigate(changes: Record<string, string | null>): void {
    void this.router.navigate([], {
      queryParams: { ...changes, page: null },
      queryParamsHandling: 'merge',
    });
  }

  private list(
    tab: RatingsTab,
    params: ReturnType<typeof ratingsParams>,
    state: 'OK' | 'HIDDEN' | undefined,
    page: number,
    size: number,
  ): Observable<PageResponseAdminRating | PageResponseAdminReference> {
    const options = { context: silentErrors() };
    return tab === 'ratings'
      ? this.api.listAdminRatings(
          { rateeId: params.rateeId, raterId: params.raterId, state, page, size },
          'body',
          false,
          options,
        )
      : this.api.listAdminReferences(
          { subjectId: params.rateeId, authorId: params.raterId, state, page, size },
          'body',
          false,
          options,
        );
  }

  private load(tab: RatingsTab, params: ReturnType<typeof ratingsParams>): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.subscription = forkJoin([
      this.list(tab, params, params.state, params.page, PAGE_SIZE),
      this.list(tab, params, undefined, 0, 1),
      this.list(tab, params, 'OK', 0, 1),
      this.list(tab, params, 'HIDDEN', 0, 1),
    ]).subscribe({
      next: ([page, all, visible, hidden]) => {
        const rows =
          tab === 'ratings'
            ? ((page.items ?? []) as AdminRating[]).map(ratingRow)
            : ((page.items ?? []) as AdminReference[]).map(referenceRow);
        this.rows.set(rows);
        this.total.set(page.totalItems ?? rows.length);
        this.counts.set({
          ALL: all.totalItems ?? 0,
          OK: visible.totalItems ?? 0,
          HIDDEN: hidden.totalItems ?? 0,
        });
        this.people.update((known) => peopleOf(known, page.items ?? [], tab));
        this.loading.set(false);
        const focus = this.focusRow;
        if (focus) {
          // Once the list is drawn again (review fix 1, WCAG 2.4.3): the row's new button, or
          // the count line when the row left the list (Show: Visible or Hidden).
          this.focusRow = null;
          setTimeout(() =>
            (
              this.document.getElementById(`row-${focus}`) ??
              this.document.getElementById('ratings-count')
            )?.focus(),
          );
        }
      },
      error: (error: unknown) => {
        this.error.set(toApiError(error));
        this.loading.set(false);
      },
    });
  }

  protected async hide(row: Row): Promise<void> {
    const rating = row.kind === 'rating';
    const answer = await askReason(this.dialog, {
      title: rating
        ? `Hide the rating by ${row.author.displayName}?`
        : `Hide the reference by ${row.author.displayName}?`,
      message: rating
        ? 'The rating disappears from the collector’s profile and no longer counts in their ' +
          'average. You can restore it later.'
        : 'The reference disappears from the collector’s profile. You can restore it later.',
      confirmLabel: rating ? 'Hide rating' : 'Hide reference',
      tone: 'danger',
    });
    if (!answer) {
      return;
    }
    await this.act(
      row,
      rating ? 'Rating hidden.' : 'Reference hidden.',
      rating
        ? this.api.hideRating(
            { id: row.id, hideRatingRequest: { reason: answer.reason } },
            'body',
            false,
            { context: silentErrors() },
          )
        : this.api.hideReference(
            { id: row.id, hideRatingRequest: { reason: answer.reason } },
            'body',
            false,
            { context: silentErrors() },
          ),
    );
  }

  protected async unhide(row: Row): Promise<void> {
    const rating = row.kind === 'rating';
    const confirmed = await confirmAdminAction(this.dialog, {
      title: rating
        ? `Restore the rating by ${row.author.displayName}?`
        : `Restore the reference by ${row.author.displayName}?`,
      message: rating
        ? 'It shows on the collector’s profile again and counts in their average.'
        : 'It shows on the collector’s profile again.',
      confirmLabel: rating ? 'Restore rating' : 'Restore reference',
    });
    if (!confirmed) {
      return;
    }
    await this.act(
      row,
      rating ? 'Rating restored.' : 'Reference restored.',
      rating
        ? this.api.unhideRating({ id: row.id }, 'body', false, { context: silentErrors() })
        : this.api.unhideReference({ id: row.id }, 'body', false, { context: silentErrors() }),
    );
  }

  private async act(row: Row, success: string, request: Observable<unknown>): Promise<void> {
    this.busy.set(row.id);
    const done = await runConsoleAction(
      this.toasts,
      request,
      success,
      row.kind === 'rating'
        ? 'Someone already changed this rating.'
        : 'Someone already changed this reference.',
    );
    this.busy.set(null);
    if (done) {
      this.focusRow = row.id;
    }
    this.reload();
  }
}
