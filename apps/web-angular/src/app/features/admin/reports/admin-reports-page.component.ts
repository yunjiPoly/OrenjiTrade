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
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { AdminReportsService, PageResponseReportSummary, ReportSummary } from '@orenji/api-client';
import { Subscription, filter } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { REPORT_REASONS, reportReasonLabel } from '../../../shared/reports/report-labels';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminCounts } from '../console/admin-counts.service';
import { AdminIconComponent } from '../console/admin-icon.component';
import { contextPhrase, initialsOf } from '../console/console-labels';
import { reportNumberLabel } from '../console/staff-search';
import {
  REPORT_TABS,
  ReportTab,
  pageRangeLine,
  reportCountLine,
  reportListParams,
  reportTabOf,
  scopedQuery,
} from './report-filters';
import { ReportsSync } from './reports-sync.service';

const PAGE_SIZE = 20;

/**
 * `/admin/reports` and `/admin/reports/:id` (spec 15.4, board A2; moderators and admins): one
 * split view instead of a list page and a detail page. The left list (400) has the status tabs
 * (Open, Under review, Action taken, Dismissed, All), Reason, "Assigned to me" and "Only @handle"
 * when filtered to one collector, all in the URL; its rows show the reported collector (a red
 * "3 open" pill when several), the reason, the context, the time, the number and the assignee.
 * The open report fills the right (its route, `:id`). Below 1280 one pane shows at a time.
 */
@Component({
  selector: 'app-admin-reports-page',
  imports: [
    RouterLink,
    RouterOutlet,
    AdminIconComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  providers: [ReportsSync],
  templateUrl: './admin-reports-page.component.html',
  styleUrls: [
    '../console/console-page.scss',
    '../console/console-controls.scss',
    './admin-reports-page.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReportsPageComponent {
  private readonly api = inject(AdminReportsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);
  private readonly sync = inject(ReportsSync);
  private readonly document = inject(DOCUMENT);
  protected readonly counts = inject(AdminCounts);
  protected readonly layout = inject(ShellLayout);

  /** Query parameters (bound by the router). */
  readonly status = input<string | undefined>();
  readonly reason = input<string | undefined>();
  readonly mine = input<string | undefined>();
  readonly reportedUserId = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly tabs = REPORT_TABS;
  protected readonly reasons = REPORT_REASONS;
  protected readonly reasonLabel = reportReasonLabel;
  protected readonly context = contextPhrase;
  protected readonly initials = initialsOf;
  protected readonly number = reportNumberLabel;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly result = signal<PageResponseReportSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  /** The report the panel shows (its route's id), `null` without one. */
  protected readonly openId = signal<string | null>(null);

  protected readonly tab = computed<ReportTab>(() =>
    reportTabOf(
      this.status(),
      scopedQuery({ mine: this.mine(), reportedUserId: this.reportedUserId() }),
    ),
  );
  protected readonly params = computed(() =>
    reportListParams(
      {
        status: this.status(),
        reason: this.reason(),
        mine: this.mine(),
        reportedUserId: this.reportedUserId(),
        page: this.page(),
      },
      this.session.me()?.id ?? null,
      PAGE_SIZE,
    ),
  );
  protected readonly hasFilters = computed(() => {
    const params = this.params();
    return !!(params.reason || params.reportedUserId || params.assignedTo);
  });
  protected readonly items = computed(() => this.result()?.items ?? []);
  protected readonly total = computed(() => this.result()?.totalItems ?? 0);
  protected readonly countLine = computed(() => reportCountLine(this.tab(), this.total()));
  protected readonly rangeLine = computed(() =>
    pageRangeLine(this.params().page ?? 0, PAGE_SIZE, this.total()),
  );
  protected readonly lastPage = computed(
    () => ((this.params().page ?? 0) + 1) * PAGE_SIZE >= this.total(),
  );
  /** "Only @handle" when the list is one collector's. */
  protected readonly onlyHandle = computed(() => {
    if (!this.params().reportedUserId) {
      return null;
    }
    const first = this.items()[0];
    return first ? `@${first.reportedUser.handle}` : 'one collector';
  });
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });
  /** Below 1280 the list and the report share the page: one shows at a time. */
  protected readonly onePane = computed(() => this.layout.narrow() || this.layout.medium());

  private subscription: Subscription | null = null;
  /** After Clear filters or the "Only @handle" chip, the focus goes to the count line. */
  private focusAfterLoad = false;

  constructor() {
    effect(() => {
      const params = this.params();
      this.sync.version();
      untracked(() => this.load(params));
    });
    this.readOpenId();
    const navigations = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.readOpenId());
    inject(DestroyRef).onDestroy(() => {
      this.subscription?.unsubscribe();
      navigations.unsubscribe();
    });
  }

  protected tabCount(tab: ReportTab): number | null {
    const counts = this.counts.counts();
    if (!counts) {
      return null;
    }
    if (tab === 'OPEN') {
      return counts.unassigned;
    }
    return tab === 'UNDER_REVIEW' ? counts.underReview : null;
  }

  protected setTab(tab: ReportTab): void {
    // Open is the URL's default, except for a scoped list ("mine", one collector): All is.
    const scoped = scopedQuery({ mine: this.mine(), reportedUserId: this.reportedUserId() });
    this.navigate({ status: tab === (scoped ? 'ALL' : 'OPEN') ? null : tab });
  }

  protected setReason(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.navigate({ reason: value || null });
  }

  protected toggleMine(): void {
    // The tab on screen stays the tab of the URL (its default changes with the scope).
    this.navigate({ mine: this.mine() === '1' ? null : '1', status: this.explicitStatus() });
  }

  protected clearSubject(): void {
    this.focusAfterLoad = true;
    this.navigate({ reportedUserId: null, status: this.explicitStatus() });
  }

  protected clear(): void {
    this.focusAfterLoad = true;
    const status = this.tab();
    void this.router.navigate(['/admin/reports'], {
      queryParams: { status: status === 'OPEN' ? null : status },
    });
  }

  /** The tab on screen written into the URL (Open as the default), so a scope change keeps it. */
  private explicitStatus(): string | null {
    const tab = this.tab();
    return tab === 'OPEN' ? null : tab;
  }

  protected goPage(delta: number): void {
    const next = Math.max(0, (this.params().page ?? 0) + delta);
    void this.router.navigate([], {
      queryParams: { page: next || null },
      queryParamsHandling: 'merge',
    });
  }

  protected reload(): void {
    this.load(this.params());
  }

  /** Refresh: the list and the open counts again. */
  protected refresh(): void {
    this.reload();
    void this.counts.refresh();
  }

  /**
   * The open report's id from the child route: read on every navigation, since the router keeps
   * the same panel when only the id changes (another row of the list).
   */
  private readOpenId(): void {
    const previous = this.openId();
    const next = this.route.snapshot?.firstChild?.paramMap.get('id') ?? null;
    this.openId.set(next);
    if (previous && !next && this.onePane()) {
      // "All reports" in one pane (review fix 1): the focus goes back to the row that was open.
      setTimeout(() => {
        const row = this.document.querySelector<HTMLElement>(`[data-report="${previous}"]`);
        (row ?? this.document.getElementById('reports-count'))?.focus();
      });
    }
  }

  protected assigneeLabel(report: ReportSummary): string {
    if (!report.assignee) {
      return 'Unassigned';
    }
    return report.assignee.id === this.session.me()?.id ? 'You' : `@${report.assignee.handle}`;
  }

  private navigate(changes: Record<string, string | null>): void {
    void this.router.navigate([], {
      queryParams: { ...changes, page: null },
      queryParamsHandling: 'merge',
    });
  }

  private load(params: ReturnType<typeof reportListParams>): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.subscription = this.api
      .listReports(params, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.loading.set(false);
          if (this.focusAfterLoad) {
            this.focusAfterLoad = false;
            setTimeout(() => this.document.getElementById('reports-count')?.focus());
          }
        },
        error: (error: unknown) => {
          this.error.set(toApiError(error));
          this.loading.set(false);
        },
      });
  }
}
