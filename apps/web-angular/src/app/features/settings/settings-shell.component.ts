import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { AvatarComponent } from '../../shared/ui/avatar/avatar.component';

interface SettingsLink {
  path: string;
  label: string;
  icon: string;
}

export const SETTINGS_LINKS: readonly SettingsLink[] = [
  { path: 'profile', label: 'Profile', icon: 'person' },
  { path: 'privacy', label: 'Privacy', icon: 'shield_person' },
  { path: 'notifications', label: 'Notifications', icon: 'notifications' },
  { path: 'trading-area', label: 'Trading area', icon: 'location_on' },
  { path: 'offers', label: 'Offers', icon: 'local_offer' },
  { path: 'blocked', label: 'Blocked users', icon: 'block' },
  { path: 'reports', label: 'My reports', icon: 'flag' },
  { path: 'account', label: 'Account', icon: 'manage_accounts' },
  { path: 'appearance', label: 'Appearance', icon: 'palette' },
];

/** `/settings` frame: identity header, section navigation, routed section. */
@Component({
  selector: 'app-settings-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, AvatarComponent],
  template: `
    <div class="page settings">
      <header class="settings__header">
        <app-avatar
          size="lg"
          [src]="session.me()?.avatarUrl"
          [name]="session.displayName()"
          [decorative]="true"
        />
        <div>
          <h1 class="settings__title">Settings</h1>
          <p class="settings__who">
            {{ session.displayName() }}
            @if (session.handle(); as handle) {
              · <a [routerLink]="['/collectors', handle]">&#64;{{ handle }}</a>
            }
          </p>
        </div>
      </header>

      <div class="settings__layout">
        <nav class="settings__nav" aria-label="Settings sections">
          @for (link of links; track link.path) {
            <a
              class="settings__link"
              [routerLink]="link.path"
              routerLinkActive="settings__link--active"
              ariaCurrentWhenActive="page"
            >
              <mat-icon aria-hidden="true">{{ link.icon }}</mat-icon>
              <span>{{ link.label }}</span>
            </a>
          }
        </nav>
        <div class="settings__content">
          <router-outlet />
        </div>
      </div>
    </div>
  `,
  styles: `
    .settings__header {
      display: flex;
      align-items: center;
      gap: var(--spacing-4);
      margin-bottom: var(--spacing-6);
    }
    .settings__title {
      font-size: var(--font-size-3xl);
    }
    .settings__who {
      margin: var(--spacing-1) 0 0;
      color: var(--color-text-muted);
    }
    .settings__layout {
      display: grid;
      grid-template-columns: 220px minmax(0, 1fr);
      gap: var(--spacing-6);
      align-items: start;
    }
    .settings__nav {
      position: sticky;
      top: 80px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .settings__link {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-pill);
      color: var(--color-text-muted);
      font-weight: var(--font-weight-medium);
      text-decoration: none;
      transition: background var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .settings__link:hover {
      background: var(--color-surface-variant);
      color: var(--color-ink);
    }
    .settings__link--active {
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
    }
    .settings__content {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--spacing-5);
    }
    @media (max-width: 839px) {
      .settings__layout {
        grid-template-columns: 1fr;
        gap: var(--spacing-4);
      }
      .settings__nav {
        position: static;
        flex-direction: row;
        overflow-x: auto;
        padding-bottom: var(--spacing-1);
        scrollbar-width: thin;
      }
      .settings__link {
        flex: 0 0 auto;
        padding: var(--spacing-2) var(--spacing-3);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsShellComponent {
  protected readonly session = inject(SessionService);
  protected readonly links = SETTINGS_LINKS;
}
