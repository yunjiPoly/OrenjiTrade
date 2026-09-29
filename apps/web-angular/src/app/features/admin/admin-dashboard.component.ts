import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AdminUsersService, ListUsersRequestParams } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { silentErrors } from '../../core/http/http-context';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { ADMIN_SECTIONS } from './admin-sections';

interface DashboardTile {
  id: string;
  label: string;
  icon: string;
  /** Roadmap phase that provides the number; `null` when it is live. */
  phase: number | null;
  /** Filter of `GET /admin/users` counting this tile (live tiles only). */
  filter?: Pick<ListUsersRequestParams, 'status'>;
  link?: { path: string; query?: Record<string, string> };
}

const TILES: readonly DashboardTile[] = [
  {
    id: 'accounts',
    label: 'Accounts',
    icon: 'group',
    phase: null,
    filter: {},
    link: { path: '/admin/users' },
  },
  {
    id: 'suspended',
    label: 'Suspended',
    icon: 'block',
    phase: null,
    filter: { status: 'SUSPENDED' },
    link: { path: '/admin/users', query: { status: 'SUSPENDED' } },
  },
  { id: 'listings', label: 'Public listings', icon: 'style', phase: 3 },
  { id: 'reports', label: 'Open reports', icon: 'flag', phase: 7 },
];

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink, MatButtonModule, MatIconModule, PageHeaderComponent],
  template: `
    <div class="page">
      <app-page-header
        title="Admin dashboard"
        subtitle="Overview of collectors, listings, reports and system health."
      />
      <ul class="tiles">
        @for (tile of tiles; track tile.id) {
          @let live = tile.phase === null && session.isAdmin();
          <li class="tile">
            <mat-icon class="tile__icon" aria-hidden="true">{{ tile.icon }}</mat-icon>
            <span class="tile__label">{{ tile.label }}</span>
            <span class="tile__value">
              @if (live && counts()[tile.id] !== undefined) {
                {{ counts()[tile.id] }}
              } @else {
                <span aria-label="Not available yet">—</span>
              }
            </span>
            @if (live && tile.link) {
              <a class="tile__hint" [routerLink]="tile.link.path" [queryParams]="tile.link.query">
                View accounts
              </a>
            } @else {
              <span class="tile__hint">
                {{ tile.phase ? 'Data arrives in Phase ' + tile.phase : 'Administrators only' }}
              </span>
            }
          </li>
        }
      </ul>
      <p class="dashboard__note">
        {{ pendingSections }} admin sections are planned; each becomes available with its phase.
        Every admin action is recorded in the audit log.
      </p>
    </div>
  `,
  styles: `
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: var(--spacing-3);
      list-style: none;
      margin: 0 0 var(--spacing-6);
      padding: 0;
    }
    .tile {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--spacing-1) var(--spacing-3);
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
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
      line-height: 1;
    }
    .tile__hint {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    a.tile__hint {
      color: var(--color-accent);
    }
    .dashboard__note {
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent {
  private readonly usersApi = inject(AdminUsersService);
  protected readonly session = inject(SessionService);
  protected readonly tiles = TILES;
  protected readonly pendingSections = ADMIN_SECTIONS.filter((s) => s.phase !== null).length;
  protected readonly counts = signal<Record<string, number>>({});

  constructor() {
    if (this.session.isAdmin()) {
      void this.loadCounts();
    }
  }

  private async loadCounts(): Promise<void> {
    for (const tile of TILES) {
      if (tile.phase !== null || !tile.filter) {
        continue;
      }
      try {
        const page = await firstValueFrom(
          this.usersApi.listUsers({ ...tile.filter, page: 0, size: 1 }, 'body', false, {
            context: silentErrors(),
          }),
        );
        this.counts.update((counts) => ({ ...counts, [tile.id]: page.totalItems ?? 0 }));
      } catch {
        // The tile keeps its placeholder; the users page shows the error with a retry.
      }
    }
  }
}
