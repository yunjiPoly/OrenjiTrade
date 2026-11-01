import { DOCUMENT, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AdminAuditService,
  AdminCatalogService,
  AdminConsoleService,
  AdminModerationService,
  AdminReportsService,
  AuditLogEntry,
  CardImageCacheStatus,
  ModerationFlag,
  ReportSummary,
  SystemHealth,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { FEATURE, FeatureFlagsService } from '../../../core/feature-flags/feature-flags.service';
import { ToastService } from '../../../core/feedback/toast.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { reportReasonLabel, reportStatusLabel } from '../../../shared/reports/report-labels';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { flagReasonLabel, flagSubjectLabel } from '../community/admin-community-labels';
import { AdminCounts } from '../console/admin-counts.service';
import { AdminIconComponent } from '../console/admin-icon.component';
import { runConsoleAction } from '../console/console-actions';
import {
  chipClass,
  contextPhrase,
  flagRoomLine,
  gameName,
  initialsOf,
} from '../console/console-labels';
import { reportNumberLabel } from '../console/staff-search';
import {
  DashboardTile,
  cacheMeterLine,
  collectorTiles,
  moderatorTiles,
  needsAPersonTiles,
  underReviewLine,
} from '../dashboard-tiles';
import { auditActionLabel } from '../shared/admin-labels';
import { reportStatusTone } from '../reports/report-tones';

/** An unassigned report: nobody holds it and it is still Open ("Assign to me" is offered). */
export function canTakeReport(report: Pick<ReportSummary, 'status' | 'assignee'>): boolean {
  return report.status === 'OPEN' && !report.assignee;
}

/** How many audit entries the Overview reads to find the last five staff actions. */
export const STAFF_AUDIT_WINDOW = 50;

/**
 * The last staff actions of an audit page (review fix 1): entries by an ADMIN actor (staff:
 * moderators and admins act as ADMIN), never a collector's own consent or self-service rows.
 */
export function staffActions<T extends { actor: { type: string } }>(
  entries: readonly T[],
  count = 5,
): T[] {
  return entries.filter((entry) => entry.actor.type === 'ADMIN').slice(0, count);
}

/** One card's data with its own loading and error (each card retries alone). */
interface Section<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
}

function idle<T>(): Section<T> {
  return { data: null, error: null, loading: true };
}

const GAME_COLORS: Readonly<Record<string, string>> = {
  yugioh: 'var(--game-tile-yugioh-background)',
  pokemon: 'var(--game-tile-pokemon-background)',
  mtg: 'var(--game-tile-mtg-background)',
  onepiece: 'var(--game-tile-onepiece-background)',
  riftbound: 'var(--game-tile-riftbound-background)',
};

/**
 * `/admin`, the Overview (spec 15.3; boards A1 for administrators and A24 for moderators): what
 * needs a person (open reports counted Open and Under review together, open flags, listings to
 * review, failed notifications; disputes and webhook failures only while `protectedPayments` is
 * on), the report queue with "Assign to me" on unassigned reports, the open flags, the system
 * card with the card image meter, the last five staff actions and the collectors' numbers. A
 * moderator sees the team's queues, "Assigned to you", "Unassigned" and what moderators decide.
 * Every card loads, fails and retries on its own; Refresh reads them all again.
 */
@Component({
  selector: 'app-admin-overview',
  imports: [
    DatePipe,
    RouterLink,
    AdminIconComponent,
    ErrorStateComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  templateUrl: './admin-overview.component.html',
  styleUrls: [
    '../console/console-page.scss',
    '../console/console-controls.scss',
    './admin-overview.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOverviewComponent {
  private readonly reportsApi = inject(AdminReportsService);
  private readonly moderationApi = inject(AdminModerationService);
  private readonly consoleApi = inject(AdminConsoleService);
  private readonly catalogApi = inject(AdminCatalogService);
  private readonly auditApi = inject(AdminAuditService);
  private readonly toasts = inject(ToastService);
  private readonly flags = inject(FeatureFlagsService);
  private readonly document = inject(DOCUMENT);
  protected readonly session = inject(SessionService);
  protected readonly counts = inject(AdminCounts);

  protected readonly admin = computed(() => this.session.isAdmin());
  private readonly paymentsOn = this.flags.enabled(FEATURE.protectedPayments);
  private readonly myId = computed(() => this.session.me()?.id ?? null);

  protected readonly queue = signal<Section<ReportSummary[]>>(idle());
  protected readonly openFlags = signal<Section<ModerationFlag[]>>(idle());
  protected readonly health = signal<Section<SystemHealth>>(idle());
  protected readonly cache = signal<Section<CardImageCacheStatus>>(idle());
  protected readonly audit = signal<Section<AuditLogEntry[]>>(idle());
  protected readonly mine = signal<Section<ReportSummary[]>>(idle());
  protected readonly unassigned = signal<Section<ReportSummary[]>>(idle());
  private readonly reviewers = signal<(string | null | undefined)[]>([]);
  protected readonly assigning = signal<string | null>(null);

  protected readonly needsTiles = computed<DashboardTile[] | null>(() => {
    const dashboard = this.counts.dashboard();
    return dashboard ? needsAPersonTiles(dashboard, this.paymentsOn()) : null;
  });
  protected readonly collectors = computed<DashboardTile[] | null>(() => {
    const dashboard = this.counts.dashboard();
    return dashboard ? collectorTiles(dashboard) : null;
  });
  protected readonly teamTiles = computed<DashboardTile[] | null>(() => {
    const counts = this.counts.counts();
    return counts
      ? moderatorTiles(counts, underReviewLine(this.reviewers(), this.session.me()?.handle ?? null))
      : null;
  });
  protected readonly countsError = computed(() => this.counts.error());
  protected readonly queueLine = computed(() => {
    const counts = this.counts.counts();
    if (!counts) {
      return '';
    }
    return `${counts.reports} open ${counts.reports === 1 ? 'report' : 'reports'} · ${counts.unassigned} unassigned · ${counts.underReview} under review`;
  });

  protected readonly reason = reportReasonLabel;
  protected readonly statusLabel = reportStatusLabel;
  protected readonly statusChip = (status: string) => chipClass(reportStatusTone(status));
  protected readonly context = contextPhrase;
  protected readonly initials = initialsOf;
  protected readonly number = reportNumberLabel;
  protected readonly flagReason = flagReasonLabel;
  protected readonly flagSubject = flagSubjectLabel;
  protected readonly auditLabel = auditActionLabel;
  protected readonly bones = [0, 1, 2, 3];

  constructor() {
    void this.loadAll();
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected async refresh(): Promise<void> {
    await this.loadAll();
  }

  private async loadAll(): Promise<void> {
    const work: Promise<unknown>[] = [this.counts.refresh()];
    if (this.admin()) {
      work.push(
        this.loadQueue(),
        this.loadFlags(),
        this.loadHealth(),
        this.loadCache(),
        this.loadAudit(),
      );
    } else {
      work.push(this.loadMine(), this.loadUnassigned(), this.loadReviewers());
    }
    await Promise.all(work);
  }

  /** Runs one card's request into its section. */
  private async into<T>(
    section: ReturnType<typeof signal<Section<T>>>,
    request: () => Promise<T>,
  ): Promise<void> {
    section.update((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await request();
      section.set({ data, error: null, loading: false });
    } catch (error) {
      section.set({ data: null, error: toApiError(error), loading: false });
    }
  }

  private get options() {
    return { context: silentErrors() };
  }

  protected loadQueue(): Promise<void> {
    return this.into(this.queue, async () => {
      const [open, review] = await Promise.all([
        firstValueFrom(
          this.reportsApi.listReports({ status: 'OPEN', size: 5 }, 'body', false, this.options),
        ),
        firstValueFrom(
          this.reportsApi.listReports(
            { status: 'UNDER_REVIEW', size: 5 },
            'body',
            false,
            this.options,
          ),
        ),
      ]);
      return [...(open.items ?? []), ...(review.items ?? [])]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5);
    });
  }

  protected loadFlags(): Promise<void> {
    return this.into(this.openFlags, async () => {
      const page = await firstValueFrom(
        this.moderationApi.listModerationFlags(
          { state: 'OPEN', size: 5 },
          'body',
          false,
          this.options,
        ),
      );
      return page.items ?? [];
    });
  }

  protected loadHealth(): Promise<void> {
    return this.into(this.health, () =>
      firstValueFrom(this.consoleApi.getSystemHealth('body', false, this.options)),
    );
  }

  protected loadCache(): Promise<void> {
    return this.into(this.cache, () =>
      firstValueFrom(this.catalogApi.getCardImageCacheStatus('body', false, this.options)),
    );
  }

  protected loadAudit(): Promise<void> {
    return this.into(this.audit, async () => {
      const page = await firstValueFrom(
        this.auditApi.listAuditLogs({ size: STAFF_AUDIT_WINDOW }, 'body', false, this.options),
      );
      return staffActions(page.items ?? []);
    });
  }

  /** The caller's desk: their Under review (and Open) reports, asked by status (review fix 1). */
  protected loadMine(): Promise<void> {
    return this.into(this.mine, async () => {
      const me = this.myId();
      if (!me) {
        return [];
      }
      const [review, open] = await Promise.all(
        (['UNDER_REVIEW', 'OPEN'] as const).map((status) =>
          firstValueFrom(
            this.reportsApi.listReports(
              { assignedTo: me, status, size: 20 },
              'body',
              false,
              this.options,
            ),
          ),
        ),
      );
      return [...(review.items ?? []), ...(open.items ?? [])].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
    });
  }

  protected loadUnassigned(): Promise<void> {
    return this.into(this.unassigned, async () => {
      const page = await firstValueFrom(
        this.reportsApi.listReports({ status: 'OPEN', size: 10 }, 'body', false, this.options),
      );
      return (page.items ?? []).filter((report) => !report.assignee);
    });
  }

  private async loadReviewers(): Promise<void> {
    try {
      const page = await firstValueFrom(
        this.reportsApi.listReports(
          { status: 'UNDER_REVIEW', size: 100 },
          'body',
          false,
          this.options,
        ),
      );
      this.reviewers.set((page.items ?? []).map((report) => report.assignee?.handle));
    } catch {
      this.reviewers.set([]);
    }
  }

  protected readonly canTake = canTakeReport;

  protected assigneeLabel(report: ReportSummary): string {
    if (!report.assignee) {
      return 'Unassigned';
    }
    return report.assignee.id === this.myId() ? 'You' : `@${report.assignee.handle}`;
  }

  protected async assignToMe(report: ReportSummary): Promise<void> {
    this.assigning.set(report.id);
    const done = await runConsoleAction(
      this.toasts,
      this.reportsApi.assignReport({ id: report.id, assignReportRequest: {} }, 'body', false, {
        context: silentErrors(),
      }),
      `Report ${reportNumberLabel(report.number)} is assigned to you.`,
      'This report was already decided.',
    );
    this.assigning.set(null);
    if (done) {
      await this.loadAll();
      // The button went away (review fix 1, WCAG 2.4.3): the focus goes to the report, now on
      // the caller's desk or marked "You" in the queue.
      setTimeout(() =>
        (
          this.document.querySelector<HTMLElement>(`[data-mine="${report.id}"]`) ??
          this.document.querySelector<HTMLElement>(`[data-queue="${report.id}"]`) ??
          this.document.getElementById(this.admin() ? 'ov-queue' : 'ov-mine')
        )?.focus(),
      );
    }
  }

  /** "Banned term · Community post by @spam_bot42" */
  protected flagTitle(flag: ModerationFlag): string {
    const by = flag.authorHandle ? ` by @${flag.authorHandle}` : '';
    return `${flagReasonLabel(flag.reason)} · ${flagSubjectLabel(flag.subjectType)}${by}`;
  }

  /** The room of a community flag ("Americas (North) · Yu-Gi-Oh!"), never its codes. */
  protected readonly flagRoom = flagRoomLine;

  /** The system's components as rows (database, cache), statuses only. */
  protected components(health: SystemHealth): { name: string; status: string }[] {
    const names: Record<string, string> = { db: 'Database', redis: 'Cache' };
    return Object.entries(health.components)
      .filter(([key]) => key in names)
      .map(([key, status]) => ({ name: names[key], status }));
  }

  protected freshness(health: SystemHealth): { status: string; at: string } | null {
    const job = health.jobs.find((entry) => entry.name === 'freshness');
    return job ? { status: job.lastStatus, at: job.lastFinishedAt ?? job.lastStartedAt } : null;
  }

  protected jobStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      SUCCEEDED: 'Succeeded',
      FAILED: 'Failed',
      RUNNING: 'Running',
      SKIPPED: 'Skipped',
    };
    return labels[status] ?? status;
  }

  protected meter(cache: CardImageCacheStatus): {
    line: string;
    parts: { game: string; name: string; mb: number; percent: number; color: string }[];
  } {
    const limit = cache.limitBytes || 1;
    return {
      line: cacheMeterLine(cache.usedMb, cache.limitMb),
      parts: cache.games
        .filter((entry) => entry.cachedBytes > 0)
        .map((entry) => ({
          game: entry.game,
          name: gameName(entry.game) ?? 'Other',
          mb: Math.round(entry.cachedBytes / (1024 * 1024)),
          percent: Math.max(0.5, (entry.cachedBytes / limit) * 100),
          color: GAME_COLORS[entry.game] ?? 'var(--color-text-faint)',
        })),
    };
  }

  /** "@admin" or "System" for an audit row. */
  protected actorLabel(entry: AuditLogEntry): string {
    if (entry.actor.handle) {
      return `@${entry.actor.handle}`;
    }
    return entry.actor.type === 'SYSTEM' ? 'System' : 'A collector';
  }
}
