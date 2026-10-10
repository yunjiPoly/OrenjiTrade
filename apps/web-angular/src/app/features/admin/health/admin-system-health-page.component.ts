import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AdminConsoleService, SystemHealth } from '@orenji/api-client';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminChipComponent, ChipTone } from '../shared/admin-chip.component';

const COMPONENT_LABELS: Record<string, string> = {
  db: 'Database (PostgreSQL)',
  redis: 'Cache (Redis)',
  diskSpace: 'Disk space',
  livenessState: 'Liveness',
  readinessState: 'Readiness',
  ping: 'Ping',
  ssl: 'TLS certificates',
};

const JOB_LABELS: Record<string, string> = {
  freshness: 'Listing freshness (hourly)',
  delist: 'Strikes and pauses (nightly)',
  'account-deletion': 'Account deletion',
  'upload-cleanup': 'Upload clean-up',
  ping: 'Scheduler ping',
};

/** Chip tone of an actuator status or a job's last status. */
export function healthTone(status: string | null | undefined): ChipTone {
  switch (status) {
    case 'UP':
    case 'SUCCEEDED':
      return 'success';
    case 'RUNNING':
    case 'UNKNOWN':
    case 'OUT_OF_SERVICE':
      return 'warning';
    case 'DOWN':
    case 'FAILED':
      return 'danger';
    default:
      return 'neutral';
  }
}

/**
 * `/admin/system-health` (administrators): the API's actuator status and components (no
 * details), the event outbox backlog, notifications waiting for dispatch and the last runs of
 * every scheduled job (`GET /admin/system/health`). Refresh re-reads it.
 */
@Component({
  selector: 'app-admin-system-health-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    AdminChipComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="System health"
        subtitle="Is everything running? Components of the API, background events and scheduled jobs."
      >
        <button actions matButton="outlined" type="button" [disabled]="loading()" (click)="load()">
          <mat-icon aria-hidden="true">refresh</mat-icon>
          Refresh
        </button>
      </app-page-header>

      @if (error(); as error) {
        <app-error-state
          title="Health could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          (retry)="load()"
        />
      } @else if (health(); as h) {
        <div class="overall" [attr.data-status]="h.status" role="status">
          <mat-icon aria-hidden="true">{{ h.status === 'UP' ? 'check_circle' : 'error' }}</mat-icon>
          <div>
            <p class="overall__title" data-testid="health-status">
              {{ h.status === 'UP' ? 'All systems operational' : 'Status: ' + h.status }}
            </p>
            <p class="admin-muted">Checked {{ h.checkedAt | relativeTime }}</p>
          </div>
        </div>

        <div class="grid">
          <section class="admin-card" aria-labelledby="health-components">
            <h2 id="health-components">Components</h2>
            <ul class="list">
              @for (component of components(); track component.name) {
                <li>
                  <span>{{ component.label }}</span>
                  <app-admin-chip [tone]="tone(component.status)">{{
                    component.status
                  }}</app-admin-chip>
                </li>
              }
            </ul>
          </section>
          <section class="admin-card" aria-labelledby="health-queues">
            <h2 id="health-queues">Queues</h2>
            <ul class="list">
              <li>
                <span>Events waiting in the outbox</span>
                <strong>{{ h.outbox.incomplete }}</strong>
              </li>
              <li>
                <span>Failed event publications</span>
                <app-admin-chip [tone]="h.outbox.failed > 0 ? 'danger' : 'success'">{{
                  h.outbox.failed
                }}</app-admin-chip>
              </li>
              <li>
                <span>Oldest waiting event</span>
                <span class="admin-muted">{{
                  h.outbox.oldestPublishedAt ? (h.outbox.oldestPublishedAt | relativeTime) : 'none'
                }}</span>
              </li>
              <li>
                <span>Notifications waiting for dispatch</span>
                <strong>{{ h.notificationsPendingDispatch }}</strong>
              </li>
            </ul>
          </section>
        </div>

        <section class="admin-card jobs" aria-labelledby="health-jobs">
          <h2 id="health-jobs">Scheduled jobs</h2>
          <div class="table-wrap">
            <table class="table" aria-labelledby="health-jobs">
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Last run</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last success</th>
                  <th scope="col">Failures (24 h)</th>
                </tr>
              </thead>
              <tbody>
                @for (job of h.jobs; track job.name) {
                  <tr>
                    <th scope="row">{{ jobLabel(job.name) }}</th>
                    <td [title]="job.lastStartedAt | date: 'medium'">
                      {{ job.lastStartedAt | relativeTime }}
                    </td>
                    <td>
                      <app-admin-chip [tone]="tone(job.lastStatus)">{{
                        job.lastStatus
                      }}</app-admin-chip>
                    </td>
                    <td>{{ job.lastSucceededAt ? (job.lastSucceededAt | relativeTime) : '—' }}</td>
                    <td>
                      <app-admin-chip [tone]="job.failuresLast24h > 0 ? 'danger' : 'success'">{{
                        job.failuresLast24h
                      }}</app-admin-chip>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="admin-muted">No job has run yet.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      } @else {
        <div aria-busy="true">
          <span class="visually-hidden">Loading system health</span>
          <app-skeleton height="80px" />
          <app-skeleton variant="list" lines="6" />
        </div>
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .overall {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      margin-bottom: var(--spacing-4);
      padding: var(--spacing-4);
      border: 1px solid color-mix(in srgb, var(--color-success) 45%, var(--color-border));
      border-radius: var(--radius-lg);
      background: color-mix(in srgb, var(--color-success) 10%, var(--color-surface));
    }
    .overall mat-icon {
      width: 32px;
      height: 32px;
      font-size: 32px;
      color: var(--color-success);
    }
    .overall:not([data-status='UP']) {
      border-color: color-mix(in srgb, var(--color-danger) 45%, var(--color-border));
      background: color-mix(in srgb, var(--color-danger) 10%, var(--color-surface));
    }
    .overall:not([data-status='UP']) mat-icon {
      color: var(--color-danger);
    }
    .overall p {
      margin: 0;
    }
    .overall__title {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: var(--spacing-4);
      margin-bottom: var(--spacing-4);
    }
    .list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .list li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-3);
      padding: var(--spacing-2) 0;
      border-bottom: 1px solid var(--color-border);
      font-size: var(--font-size-sm);
    }
    .list li:last-child {
      border-bottom: 0;
    }
    .table-wrap {
      overflow-x: auto;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--font-size-sm);
    }
    .table th,
    .table td {
      padding: var(--spacing-2);
      border-bottom: 1px solid var(--color-border);
      text-align: left;
      white-space: nowrap;
    }
    .table thead th {
      color: var(--color-text-muted);
      font-weight: var(--font-weight-medium);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSystemHealthPageComponent {
  private readonly api = inject(AdminConsoleService);

  protected readonly health = signal<SystemHealth | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly tone = healthTone;
  protected readonly components = computed(() =>
    Object.entries(this.health()?.components ?? {})
      .map(([name, status]) => ({ name, status, label: COMPONENT_LABELS[name] ?? name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getSystemHealth('body', false, { context: silentErrors() }).subscribe({
      next: (health) => {
        this.health.set(health);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(toApiError(error));
        this.loading.set(false);
      },
    });
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected jobLabel(name: string): string {
    return JOB_LABELS[name] ?? name;
  }
}
