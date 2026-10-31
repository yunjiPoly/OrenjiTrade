import { Injectable, computed, inject, signal } from '@angular/core';
import {
  AdminConsoleService,
  AdminDashboard,
  AdminModerationService,
  AdminReportsService,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';

/** The queues that need a person (spec 15.3), counted as the dashboard does. */
export interface QueueCounts {
  /** Open and Under review together: taking a report moves it from Open to Under review. */
  reports: number;
  /** Open and nobody's (the dashboard's `unassignedReports`; a moderator's Open count). */
  unassigned: number;
  underReview: number;
  flags: number;
}

/** A moderator's counts from the report and flag lists (the dashboard is ADMIN only). */
export function moderatorQueueCounts(
  open: number,
  underReview: number,
  flags: number,
): QueueCounts {
  return { reports: open + underReview, unassigned: open, underReview, flags };
}

/** An administrator's counts from `GET /admin/dashboard`. */
export function dashboardQueueCounts(dashboard: AdminDashboard): QueueCounts {
  return {
    reports: dashboard.openReports,
    unassigned: dashboard.unassignedReports,
    underReview: Math.max(0, dashboard.openReports - dashboard.unassignedReports),
    flags: dashboard.openModerationFlags,
  };
}

/**
 * The console's open counts (the nav's orange counts and the Overview's tiles), provided by the
 * console's shell: administrators read `GET /admin/dashboard` (kept for the Overview), moderators
 * the report and flag lists. Refreshed by the Overview's Refresh and after a decision.
 */
@Injectable()
export class AdminCounts {
  private readonly consoleApi = inject(AdminConsoleService);
  private readonly reportsApi = inject(AdminReportsService);
  private readonly moderationApi = inject(AdminModerationService);
  private readonly session = inject(SessionService);

  private readonly countsState = signal<QueueCounts | null>(null);
  private readonly dashboardState = signal<AdminDashboard | null>(null);
  private readonly errorState = signal<ApiError | null>(null);
  private readonly loadingState = signal(false);
  private readonly loadedAtState = signal<string | null>(null);
  private inflight: Promise<void> | null = null;

  readonly counts = this.countsState.asReadonly();
  readonly dashboard = this.dashboardState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  /** When the counts were read (the Overview's "Updated … ago"). */
  readonly loadedAt = this.loadedAtState.asReadonly();
  readonly ready = computed(() => this.countsState() !== null);

  /** Reads the counts again (one request at a time). */
  refresh(): Promise<void> {
    this.inflight ??= this.load().finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async load(): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);
    const options = { context: silentErrors() };
    try {
      if (this.session.isAdmin()) {
        const dashboard = await firstValueFrom(
          this.consoleApi.getAdminDashboard('body', false, options),
        );
        this.dashboardState.set(dashboard);
        this.countsState.set(dashboardQueueCounts(dashboard));
        this.loadedAtState.set(dashboard.generatedAt);
      } else {
        const [open, underReview, flags] = await Promise.all([
          firstValueFrom(
            this.reportsApi.listReports({ status: 'OPEN', size: 1 }, 'body', false, options),
          ),
          firstValueFrom(
            this.reportsApi.listReports(
              { status: 'UNDER_REVIEW', size: 1 },
              'body',
              false,
              options,
            ),
          ),
          firstValueFrom(
            this.moderationApi.listModerationFlags(
              { state: 'OPEN', size: 1 },
              'body',
              false,
              options,
            ),
          ),
        ]);
        this.countsState.set(
          moderatorQueueCounts(
            open.totalItems ?? 0,
            underReview.totalItems ?? 0,
            flags.totalItems ?? 0,
          ),
        );
        this.loadedAtState.set(new Date().toISOString());
      }
    } catch (error) {
      this.errorState.set(toApiError(error));
    } finally {
      this.loadingState.set(false);
    }
  }
}
