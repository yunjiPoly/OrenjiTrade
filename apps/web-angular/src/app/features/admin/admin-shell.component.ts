import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ADMIN_SECTIONS } from './admin-sections';

/** Admin console frame: section navigation on the left, routed content on the right. */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatListModule, MatIconModule, MatTooltipModule],
  template: `
    <div class="admin">
      <nav class="admin__nav" aria-label="Admin sections">
        <p class="admin__eyebrow">Admin console</p>
        <mat-nav-list class="admin__list">
          @for (section of sections; track section.id) {
            @if (section.phase === null) {
              <a
                mat-list-item
                [routerLink]="['/admin', section.path]"
                routerLinkActive="admin__item--active"
                ariaCurrentWhenActive="page"
                [routerLinkActiveOptions]="{ exact: true }"
              >
                <mat-icon matListItemIcon aria-hidden="true">{{ section.icon }}</mat-icon>
                <span matListItemTitle>{{ section.label }}</span>
              </a>
            } @else {
              <a
                mat-list-item
                disabled
                aria-disabled="true"
                [matTooltip]="'Arrives in Phase ' + section.phase"
              >
                <mat-icon matListItemIcon aria-hidden="true">{{ section.icon }}</mat-icon>
                <span matListItemTitle>{{ section.label }}</span>
              </a>
            }
          }
        </mat-nav-list>
      </nav>
      <section class="admin__content">
        <router-outlet />
      </section>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .admin {
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr);
      min-height: 100%;
    }
    .admin__nav {
      border-right: 1px solid var(--color-border);
      background: var(--color-surface);
      padding: var(--spacing-3) 0;
    }
    .admin__eyebrow {
      margin: 0 var(--spacing-4) var(--spacing-2);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }
    .admin__item--active {
      --mat-list-list-item-label-text-color: var(--color-primary);
      --mat-list-list-item-leading-icon-color: var(--color-primary);
      background: var(--color-primary-container);
    }
    .admin__content {
      min-width: 0;
    }
    @media (max-width: 959px) {
      .admin {
        grid-template-columns: 1fr;
      }
      .admin__nav {
        border-right: 0;
        border-bottom: 1px solid var(--color-border);
      }
      .admin__list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent {
  protected readonly sections = ADMIN_SECTIONS;
}
