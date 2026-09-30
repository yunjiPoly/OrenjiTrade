import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import {
  AdminConsoleService,
  AdminDashboard,
  AdminModerationService,
  AdminReportsService,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { ApiError, toApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { silentErrors } from '../../core/http/http-context';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { ADMIN_SECTIONS } from './admin-sections';
import {
  DashboardTile,
  ModeratorCounts,
  adminDashboardTiles,
  moderatorDashboardTiles,
} from './dashboard-tiles';

/**
 * `/admin` dashboard: administrators get the counts of `GET /admin/dashboard` (accounts, activity,
 * listings, reports, flags, stale listings, paused collectors, failures); moderators the report
 * and flag queues they work on. Every tile links to its section, followed by quick links to every
 * section the viewer can open.
 */
@Component({
  selector: 'app-admin-dashboard',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    ErrorStateComponent,
    PageHeaderComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Admin dashboard"
        [subtitle]="
          session.isAdmin()
            ? 'Overview of collectors, listings, reports and system health.'
            : 'Reports and flags waiting for the moderation team.'
        "
      >
        <button actions matButton="outlined" type="button" [disabled]="loading()" (click)="load()">
          <mat-icon aria-hidden="true">refresh</mat-icon>
          Refresh
        </button>
      </app-page-header>

      @if (error(); as error) {
        <app-error-state
          title="The dashboard could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          (retry)="load()"
        />
      } @else if (tiles(); as list) {
        <ul class="tiles" aria-label="Key numbers" data-testid="dashboard-tiles">
          @for (tile of list; track tile.id) {
            <li class="tile" [class.tile--alert]="tile.alert" [attr.data-tile]="tile.id">
              <mat-icon class="tile__icon" aria-hidden="true">{{ tile.icon }}</mat-icon>
              <span class="tile__label">{{ tile.label }}</span>
              <span class="tile__value" data-testid="tile-value">{{ tile.value }}</span>
              <span class="tile__hint">{{ tile.hint }}</span>
              @if (tile.link; as link) {
                <a
                  class="tile__link"
                  [routerLink]="link.path"
                  [queryParams]="link.query"
                  [attr.aria-label]="'Open ' + tile.label.toLowerCase()"
                >
                  Open
                  <mat-icon aria-hidden="true">arrow_forward</mat-icon>
                </a>
              }
            </li>
          }
        </ul>
        @if (generatedAt(); as at) {
          <p class="admin-muted" [title]="at | date: 'medium'">Updated {{ at | relativeTime }}</p>
        }
      } @else {
        <div class="tiles" aria-busy="true">
          <span class="visually-hidden">Loading the dashboard</span>
          @for (bone of bones; track bone) {
            <app-skeleton height="132px" />
          }
        </div>
      }

      <h2 class="links__title">Sections</h2>
      <ul class="links" aria-label="Admin sections">
        @for (section of sections(); track section.id) {
          <li>
            <a class="link" [routerLink]="['/admin', section.path]">
              <mat-icon aria-hidden="true">{{ section.icon }}</mat-icon>
              <span>{{ section.label }}</span>
            </a>
          </li>
        }
      </ul>
      <p class="admin-muted">Every admin and moderator action is recorded in the audit log.</p>
    </div>
  `,
  styleUrls: ['./shared/admin-page.scss'],
  styles: `
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: var(--spacing-3);
      margin: 0 0 var(--spacing-2);
      padding: 0;
      list-style: none;
    }
    .tile {
      position: relative;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--spacing-1) var(--spacing-3);
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      transition: border-color var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .tile:hover {
      border-color: var(--color-border-strong);
    }
    .tile--alert {
      border-color: color-mix(in srgb, var(--color-warning) 60%, var(--color-border));
      background:
        linear-gradient(
          135deg,
          color-mix(in srgb, var(--color-warning) 10%, transparent),
          transparent 60%
        ),
        var(--color-surface);
    }
    .tile__icon {
      grid-row: span 3;
      color: var(--color-primary);
    }
    .tile__label {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .tile__value {
      font-family: var(--font-display);
      font-size: var(--font-size-3xl);
      font-weight: var(--font-weight-semibold);
      line-height: 1.1;
    }
    .tile__hint {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .tile__link {
      display: inline-flex;
      grid-column: 2;
      align-items: center;
      gap: 2px;
      margin-top: var(--spacing-1);
      color: var(--color-accent);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      text-decoration: none;
    }
    .tile__link mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .tile__link:hover {
      text-decoration: underline;
    }
    .links__title {
      margin: var(--spacing-6) 0 var(--spacing-3);
      font-size: var(--font-size-lg);
    }
    .links {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: var(--spacing-2);
      margin: 0 0 var(--spacing-4);
      padding: 0;
      list-style: none;
    }
    .link {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      padding: var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: inherit;
      font-weight: var(--font-weight-medium);
      text-decoration: none;
    }
    .link mat-icon {
      color: var(--color-primary);
    }
    .link:hover {
      border-color: var(--color-primary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent {
  private readonly consoleApi = inject(AdminConsoleService);
  private readonly reportsApi = inject(AdminReportsService);
  private readonly moderationApi = inject(AdminModerationService);
  protected readonly session = inject(SessionService);

  protected readonly bones = [0, 1, 2, 3, 4, 5];
  protected readonly loading = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly tiles = signal<DashboardTile[] | null>(null);
  protected readonly generatedAt = signal<string | null>(null);
  /** Sections the viewer can open (moderators: the moderation area). */
  protected readonly sections = computed(() =>
    ADMIN_SECTIONS.filter(
      (section) =>
        section.phase === null &&
        section.path !== '' &&
        (this.session.isAdmin() || section.area === 'moderation'),
    ),
  );

  constructor() {
    void this.load();
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      if (this.session.isAdmin()) {
        const dashboard: AdminDashboard = await firstValueFrom(
          this.consoleApi.getAdminDashboard('body', false, { context: silentErrors() }),
        );
        this.tiles.set(adminDashboardTiles(dashboard));
        this.generatedAt.set(dashboard.generatedAt);
      } else {
        this.tiles.set(moderatorDashboardTiles(await this.moderatorCounts()));
        this.generatedAt.set(new Date().toISOString());
      }
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async moderatorCounts(): Promise<ModeratorCounts> {
    const options = { context: silentErrors() };
    const [open, underReview, flags] = await Promise.all([
      firstValueFrom(
        this.reportsApi.listReports({ status: 'OPEN', size: 1 }, 'body', false, options),
      ),
      firstValueFrom(
        this.reportsApi.listReports({ status: 'UNDER_REVIEW', size: 1 }, 'body', false, options),
      ),
      firstValueFrom(
        this.moderationApi.listModerationFlags({ state: 'OPEN', size: 1 }, 'body', false, options),
      ),
    ]);
    return {
      open: open.totalItems ?? 0,
      underReview: underReview.totalItems ?? 0,
      flags: flags.totalItems ?? 0,
    };
  }
}
