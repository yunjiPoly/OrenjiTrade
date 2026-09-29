import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { ADMIN_SECTIONS } from './admin-sections';

interface DashboardTile {
  label: string;
  icon: string;
  phase: number;
}

const TILES: readonly DashboardTile[] = [
  { label: 'Active collectors', icon: 'group', phase: 1 },
  { label: 'Public listings', icon: 'style', phase: 3 },
  { label: 'Open reports', icon: 'flag', phase: 7 },
  { label: 'Stale listings', icon: 'auto_delete', phase: 7 },
];

@Component({
  selector: 'app-admin-dashboard',
  imports: [MatIconModule, PageHeaderComponent],
  template: `
    <div class="page">
      <app-page-header
        title="Admin dashboard"
        subtitle="Overview of collectors, listings, reports and system health."
      />
      <ul class="tiles">
        @for (tile of tiles; track tile.label) {
          <li class="tile">
            <mat-icon class="tile__icon" aria-hidden="true">{{ tile.icon }}</mat-icon>
            <span class="tile__label">{{ tile.label }}</span>
            <span class="tile__value" aria-label="Not available yet">—</span>
            <span class="tile__hint">Data arrives in Phase {{ tile.phase }}</span>
          </li>
        }
      </ul>
      <p class="dashboard__note">
        {{ pendingSections }} admin sections are planned; each becomes available with its
        phase. Every admin action will be recorded in the audit log.
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
    .dashboard__note {
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent {
  protected readonly tiles = TILES;
  protected readonly pendingSections = ADMIN_SECTIONS.filter((s) => s.phase !== null).length;
}
