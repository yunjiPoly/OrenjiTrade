import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AdminCatalogService,
  AdminConsoleService,
  CardImageCacheStatus,
  SystemHealth,
} from '@orenji/api-client';
import { FEATURE, FeatureFlagsService } from '../../../core/feature-flags/feature-flags.service';
import { mbText, meterSegments } from '../card-data/card-data';
import { AdminIconComponent } from '../console/admin-icon.component';
import { gameName } from '../console/console-labels';
import { JOBS, JOB_ORDER, jobName } from './job-labels';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
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

/** What each component is (board A21). */
const COMPONENT_HELP: Record<string, string> = {
  db: 'Accounts, cards, binders and messages',
  redis: 'Rate limits, presence and cached settings',
  diskSpace: 'Room for the card image cache and uploads',
  livenessState: 'The API process is running',
  readinessState: 'The API accepts requests',
  ping: 'The API answers health checks',
  ssl: 'Valid and not close to expiry',
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
    RouterLink,
    AdminChipComponent,
    AdminIconComponent,
    ErrorStateComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  template: `
    <div class="cp">
      <header class="cp__head">
        <div class="cp__heading">
          <p class="cp__eyebrow">System</p>
          <h1 class="cp__title">System health</h1>
          <p class="cp__sub">
            Is everything running? The API's parts, background events and scheduled jobs.
          </p>
        </div>
        <div class="cp__actions">
          <button
            type="button"
            class="cb cb--outline"
            [attr.aria-disabled]="loading() ? 'true' : null"
            (click)="loading() || load()"
          >
            <app-admin-icon name="refresh" [size]="18" />
            {{ loading() ? 'Checking…' : 'Refresh' }}
          </button>
        </div>
      </header>

      @if (error(); as error) {
        <app-error-state
          title="Health could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          retryLabel="Try again"
          (retry)="load()"
        />
      } @else if (health(); as h) {
        <div class="overall" [attr.data-status]="h.status" role="status">
          <app-admin-icon [name]="h.status === 'UP' ? 'checkCircle' : 'alert'" [size]="28" />
          <div class="overall__text">
            <p class="overall__title" data-testid="health-status">
              {{ h.status === 'UP' ? 'All systems operational' : 'Status: ' + h.status }}
            </p>
            <p class="overall__line">
              Checked {{ h.checkedAt | relativeTime }} · {{ h.checkedAt | date: 'mediumDate' }}
            </p>
          </div>
          <p class="overall__facts">
            {{ upCount() }} of {{ components().length }} components up ·
            {{ h.outbox.incomplete }} events waiting · {{ failures() }} job
            {{ failures() === 1 ? 'failure' : 'failures' }} in 24 h
          </p>
        </div>

        <div class="grid">
          <section class="cp-card hc" aria-labelledby="health-components">
            <h2 class="cp-card__title" id="health-components">Components</h2>
            <p class="hc__sub">The API's own health check</p>
            <ul class="list">
              @for (component of components(); track component.name) {
                <li>
                  <span>
                    <span class="list__name">{{ component.label }}</span>
                    @if (component.help) {
                      <span class="list__help">{{ component.help }}</span>
                    }
                  </span>
                  <app-admin-chip [tone]="tone(component.status)">{{
                    statusWord(component.status)
                  }}</app-admin-chip>
                </li>
              }
            </ul>
          </section>
          <div class="col">
            <section class="cp-card hc" aria-labelledby="health-queues">
              <h2 class="cp-card__title" id="health-queues">Events and queues</h2>
              <ul class="list">
                <li>
                  <span>
                    <span class="list__name">Events waiting in the outbox</span>
                    <span class="list__help">Recorded with their change, not yet handled</span>
                  </span>
                  <strong>{{ h.outbox.incomplete }}</strong>
                </li>
                <li>
                  <span>
                    <span class="list__name">Failed event publications</span>
                    <span class="list__help">A listener could not handle them</span>
                  </span>
                  <app-admin-chip [tone]="h.outbox.failed > 0 ? 'danger' : 'success'">{{
                    h.outbox.failed
                  }}</app-admin-chip>
                </li>
                <li>
                  <span>
                    <span class="list__name">Oldest waiting event</span>
                    <span class="list__help">How long the oldest one has waited</span>
                  </span>
                  <span class="cp-muted">{{
                    h.outbox.oldestPublishedAt
                      ? (h.outbox.oldestPublishedAt | relativeTime)
                      : 'none'
                  }}</span>
                </li>
                <li>
                  <span>
                    <span class="list__name">Notifications waiting for dispatch</span>
                    <span class="list__help">Push and email not sent yet</span>
                  </span>
                  <strong>{{ h.notificationsPendingDispatch }}</strong>
                </li>
              </ul>
            </section>
            <section class="cp-card hc" aria-labelledby="health-storage">
              <div class="hc__head">
                <h2 class="cp-card__title" id="health-storage">Storage</h2>
                @if (cache(); as c) {
                  <app-admin-chip [tone]="c.remainingMb > 0 ? 'success' : 'warning'">{{
                    c.remainingMb > 0 ? 'Under the cap' : 'At the cap'
                  }}</app-admin-chip>
                }
              </div>
              @if (cache(); as c) {
                <p class="hc__meter-line">
                  <span class="list__name">Card images</span>
                  <span>{{ mbText(c.usedMb) }} of {{ c.limitMb.toLocaleString('en-US') }} MB</span>
                </p>
                <div
                  class="meter"
                  role="img"
                  [attr.aria-label]="mbText(c.usedMb) + ' of ' + c.limitMb + ' MB used'"
                >
                  @for (seg of segments(); track seg.game) {
                    <span
                      [style.width.%]="seg.percent"
                      [style.background]="'var(--game-tile-' + seg.game + '-foreground)'"
                    ></span>
                  }
                </div>
                @if (segments().length) {
                  <ul class="legend">
                    @for (seg of segments(); track seg.game) {
                      <li>{{ gameLabel(seg.game) }} {{ mbText(seg.mb) }} MB</li>
                    }
                  </ul>
                }
                <p class="list__help">
                  {{ percentUsed() }}% used · reserved {{ mbText(c.reservedMb) }} MB ·
                  {{ c.files.toLocaleString('en-US') }} files
                  @if (c.reconciledAt) {
                    · reconciled {{ c.reconciledAt | date: 'MMM d' }}
                  }
                </p>
              } @else if (cacheError()) {
                <p class="list__help">The card image cache could not load.</p>
              } @else {
                <app-skeleton variant="list" lines="2" />
              }
              <a class="cp-link" routerLink="/admin/card-data"
                >Card data and images <app-admin-icon name="arrowRight" [size]="16"
              /></a>
            </section>
          </div>
        </div>

        <section class="cp-card hc jobs" aria-labelledby="health-jobs">
          <h2 class="cp-card__title" id="health-jobs">Scheduled jobs</h2>
          <p class="hc__sub">{{ jobsLine() }}</p>
          <div class="ct">
            <table class="table" aria-label="Scheduled jobs">
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
                @for (row of jobRows(); track row.key) {
                  <tr>
                    <th scope="row">
                      <span class="list__name">{{ row.info.name }}</span>
                      <span class="list__help">{{ row.info.when }} · {{ row.info.what }}</span>
                    </th>
                    @if (row.job; as job) {
                      <td [title]="job.lastStartedAt | date: 'medium'">
                        {{ job.lastStartedAt | relativeTime }}
                        <span class="list__help">{{
                          job.lastStartedAt | date: 'MMM d, HH:mm'
                        }}</span>
                      </td>
                      <td>
                        <app-admin-chip [tone]="tone(job.lastStatus)">{{
                          statusWord(job.lastStatus)
                        }}</app-admin-chip>
                      </td>
                      <td>
                        {{ job.lastSucceededAt ? (job.lastSucceededAt | relativeTime) : '—' }}
                      </td>
                      <td>
                        <app-admin-chip [tone]="job.failuresLast24h > 0 ? 'danger' : 'success'">{{
                          job.failuresLast24h
                        }}</app-admin-chip>
                      </td>
                    } @else {
                      <td>Never</td>
                      <td><app-admin-chip tone="neutral">No run yet</app-admin-chip></td>
                      <td>—</td>
                      <td>0</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (!paymentsOn()) {
            <p class="list__help jobs__note">
              Offer expiry and payout release jobs appear only while protectedPayments is on.
            </p>
          }
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
  styleUrls: [
    '../console/console-page.scss',
    '../console/console-controls.scss',
    '../console/console-table.scss',
    './admin-system-health-page.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSystemHealthPageComponent {
  private readonly api = inject(AdminConsoleService);

  protected readonly health = signal<SystemHealth | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly tone = healthTone;
  protected readonly components = computed(() =>
    Object.entries(this.health()?.components ?? {}).map(([name, status]) => ({
      name,
      status,
      label: COMPONENT_LABELS[name] ?? name,
      help: COMPONENT_HELP[name] ?? null,
    })),
  );
  protected readonly upCount = computed(
    () => this.components().filter((component) => component.status === 'UP').length,
  );
  protected readonly paymentsOn = inject(FeatureFlagsService).enabled(FEATURE.protectedPayments);
  /** Every job named and explained (spec 15.7), the ones that never ran included. */
  protected readonly jobRows = computed(() => {
    const jobs = this.health()?.jobs ?? [];
    const known = JOB_ORDER.filter((key) => this.paymentsOn() || !JOBS[key].payments).map(
      (key) => ({ key, info: JOBS[key], job: jobs.find((job) => job.name === key) ?? null }),
    );
    const others = jobs
      .filter((job) => !JOBS[job.name])
      .map((job) => ({
        key: job.name,
        info: { name: jobName(job.name), when: '', what: '' },
        job,
      }));
    return [...known, ...others];
  });
  protected readonly failures = computed(() =>
    (this.health()?.jobs ?? []).reduce((sum, job) => sum + (job.failuresLast24h ?? 0), 0),
  );
  /** "9 jobs · 8 succeeded on their last run, 1 has never run · 0 failures in 24 h". */
  protected readonly jobsLine = computed(() => {
    const rows = this.jobRows();
    const succeeded = rows.filter((row) => row.job?.lastStatus === 'SUCCEEDED').length;
    const never = rows.filter((row) => !row.job).length;
    const parts = [`${succeeded} succeeded on their last run`];
    if (never) {
      parts.push(`${never} ${never === 1 ? 'has' : 'have'} never run`);
    }
    return `${rows.length} jobs · ${parts.join(', ')} · ${this.failures()} ${
      this.failures() === 1 ? 'failure' : 'failures'
    } in 24 h`;
  });
  protected readonly cache = signal<CardImageCacheStatus | null>(null);
  protected readonly cacheError = signal(false);
  protected readonly segments = computed(() => {
    const cache = this.cache();
    return cache ? meterSegments(cache) : [];
  });
  protected readonly percentUsed = computed(() => {
    const cache = this.cache();
    return cache ? Math.round((cache.usedMb / Math.max(1, cache.limitMb)) * 100) : 0;
  });
  protected readonly mbText = mbText;
  private readonly catalogApi = inject(AdminCatalogService);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.cacheError.set(false);
    this.catalogApi.getCardImageCacheStatus('body', false, { context: silentErrors() }).subscribe({
      next: (cache) => this.cache.set(cache),
      error: () => this.cacheError.set(true),
    });
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

  protected statusWord(status: string | null | undefined): string {
    switch (status) {
      case 'UP':
        return 'Up';
      case 'DOWN':
        return 'Down';
      case 'SUCCEEDED':
        return 'Succeeded';
      case 'FAILED':
        return 'Failed';
      case 'RUNNING':
        return 'Running';
      case 'OUT_OF_SERVICE':
        return 'Out of service';
      default:
        return status ? status.charAt(0) + status.slice(1).toLowerCase() : 'Unknown';
    }
  }

  protected gameLabel(slug: string): string {
    return gameName(slug) ?? slug;
  }
}
