import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MOBILE_NAV_LINKS } from '../nav-links';

/** Bottom navigation bar shown under 960px (mirrors the mobile app's tabs). */
@Component({
  selector: 'app-bottom-nav',
  imports: [MatIconModule, RouterLink, RouterLinkActive],
  template: `
    <nav class="bottom-nav" aria-label="Mobile navigation">
      @for (link of links; track link.path) {
        <a
          class="bottom-nav__item"
          [routerLink]="link.path"
          routerLinkActive="bottom-nav__item--active"
          ariaCurrentWhenActive="page"
        >
          <mat-icon class="bottom-nav__icon" aria-hidden="true">{{ link.icon }}</mat-icon>
          <span class="bottom-nav__label">{{ link.label }}</span>
        </a>
      }
    </nav>
  `,
  styles: `
    :host {
      display: block;
      position: fixed;
      inset: auto 0 0 0;
      z-index: 100;
    }
    .bottom-nav {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      height: 64px;
      padding-bottom: env(safe-area-inset-bottom);
      background: var(--color-surface);
      border-top: 1px solid var(--color-border);
      box-shadow: var(--elevation-sheet);
    }
    .bottom-nav__item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      color: var(--color-text-muted);
      text-decoration: none;
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
    }
    .bottom-nav__item--active {
      color: var(--color-primary);
    }
    .bottom-nav__icon {
      font-size: 24px;
    }
    @media (min-width: 960px) {
      :host {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BottomNavComponent {
  protected readonly links = MOBILE_NAV_LINKS;
}
