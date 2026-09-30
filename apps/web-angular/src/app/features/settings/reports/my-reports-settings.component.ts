import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { MyReport, ReportsService } from '@orenji/api-client';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import {
  isOpenReport,
  myReportStatusText,
  reportReasonLabel,
  reportStatusLabel,
} from '../../../shared/reports/report-labels';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/ui/section-card/section-card.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; error: ApiError };

/**
 * Settings → My reports (`GET /me/reports`): the collectors the caller reported, with the reason
 * and where the review stands. Decisions stay private: the reporter only learns whether the team
 * took action (the REPORT_DECISION notification links here).
 */
@Component({
  selector: 'app-my-reports-settings',
  imports: [
    DatePipe,
    RouterLink,
    MatIconModule,
    AvatarComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    RelativeTimePipe,
    SectionCardComponent,
    SkeletonComponent,
  ],
  template: `
    <app-section-card
      heading="My reports"
      headingId="my-reports-heading"
      description="Collectors you reported and where each review stands. Reports are confidential: the reported collector is never told who reported them, and the details of a decision stay with the moderation team."
    >
      @switch (state().kind) {
        @case ('loading') {
          <div aria-busy="true">
            <span class="visually-hidden">Loading your reports</span>
            <app-skeleton variant="list" lines="3" />
          </div>
        }
        @case ('error') {
          <app-error-state
            compact
            title="Your reports could not load"
            [message]="errorMessage()"
            (retry)="load()"
          />
        }
        @default {
          @if (reports().length === 0) {
            <app-empty-state
              icon="verified_user"
              title="You have not reported anyone"
              description="If a collector scams, harasses or misleads you, use Report on their profile, in the conversation menu or on their community post."
            />
          } @else {
            <p class="summary" aria-live="polite">
              {{ openCount() }} waiting for a decision · {{ reports().length - openCount() }}
              reviewed
            </p>
            <ul class="reports" aria-labelledby="my-reports-heading">
              @for (report of reports(); track report.id) {
                <li class="report" [attr.data-report]="report.id">
                  <app-avatar
                    [src]="report.reportedUser.avatarUrl"
                    [name]="report.reportedUser.displayName"
                    [decorative]="true"
                  />
                  <div class="report__text">
                    <p class="report__who">
                      <a [routerLink]="['/collectors', report.reportedUser.handle]">{{
                        report.reportedUser.displayName
                      }}</a>
                      <span class="report__reason">{{ reason(report.reason) }}</span>
                    </p>
                    <p class="report__meta">
                      Sent
                      <time
                        [attr.datetime]="report.createdAt"
                        [title]="report.createdAt | date: 'medium'"
                        >{{ report.createdAt | relativeTime }}</time
                      >
                      @if (report.resolvedAt) {
                        · reviewed {{ report.resolvedAt | relativeTime }}
                      }
                    </p>
                    <p class="report__status-text">{{ statusText(report) }}</p>
                  </div>
                  <span
                    class="report__status"
                    [attr.data-status]="report.status"
                    [class.report__status--open]="isOpen(report.status)"
                  >
                    <mat-icon aria-hidden="true">{{
                      isOpen(report.status) ? 'hourglass_top' : 'task_alt'
                    }}</mat-icon>
                    {{ status(report.status) }}
                  </span>
                </li>
              }
            </ul>
          }
        }
      }
    </app-section-card>
  `,
  styles: `
    .summary {
      margin: 0 0 var(--spacing-2);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .reports {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .report {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-3);
      padding: var(--spacing-3) 0;
      border-top: 1px solid var(--color-border);
    }
    .report:first-child {
      border-top: 0;
    }
    .report__text {
      flex: 1 1 auto;
      min-width: 0;
    }
    .report__text p {
      margin: 0;
    }
    .report__who {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
      font-weight: var(--font-weight-semibold);
    }
    .report__reason {
      padding: 0 var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
    }
    .report__meta,
    .report__status-text {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .report__status {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 4px;
      padding: 2px var(--spacing-2);
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--color-success) 16%, var(--color-surface));
      color: var(--color-ink);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .report__status--open {
      background: color-mix(in srgb, var(--color-warning) 18%, var(--color-surface));
    }
    .report__status mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    @media (max-width: 599px) {
      .report {
        flex-wrap: wrap;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyReportsSettingsComponent {
  private readonly api = inject(ReportsService);

  protected readonly state = signal<LoadState>({ kind: 'loading' });
  protected readonly reports = signal<MyReport[]>([]);
  protected readonly openCount = computed(
    () => this.reports().filter((report) => isOpenReport(report.status)).length,
  );
  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? friendlyMessage(state.error) : '';
  });
  protected readonly reason = reportReasonLabel;
  protected readonly status = reportStatusLabel;
  protected readonly statusText = myReportStatusText;
  protected readonly isOpen = isOpenReport;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set({ kind: 'loading' });
    this.api.listMyReports('body', false, { context: silentErrors() }).subscribe({
      next: (reports) => {
        this.reports.set(
          [...(reports ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
        this.state.set({ kind: 'ready' });
      },
      error: (error: unknown) => this.state.set({ kind: 'error', error: toApiError(error) }),
    });
  }
}
