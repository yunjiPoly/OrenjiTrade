import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { ToastService } from '../../core/feedback/toast.service';
import {
  ShellIconComponent,
  ShellIconName,
} from '../../core/layout/shell-icon/shell-icon.component';
import { ThemeService } from '../../core/theme/theme.service';
import { MyLocationStore } from '../../shared/location/my-location.store';
import { AvatarComponent } from '../../shared/ui/avatar/avatar.component';

interface SettingsLink {
  path: string;
  label: string;
  icon: ShellIconName;
  /** Shown only while this feature flag is on. */
  feature?: string;
}

interface SettingsGroup {
  label: string;
  links: readonly SettingsLink[];
}

/** The nav of spec 13 (board W25): four groups; Profile is the mini card's "Edit profile". */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    label: 'Where you ship from',
    links: [
      { path: 'location', label: 'Location', icon: 'mapPin' },
      { path: 'shipping', label: 'Shipping details', icon: 'truck' },
    ],
  },
  {
    label: 'App',
    links: [
      { path: 'notifications', label: 'Notifications', icon: 'bell' },
      { path: 'privacy', label: 'Privacy', icon: 'eye' },
      { path: 'appearance', label: 'Appearance', icon: 'moon' },
    ],
  },
  {
    label: 'Safety',
    links: [
      { path: 'blocked', label: 'Blocked', icon: 'ban' },
      { path: 'reports', label: 'My reports', icon: 'flag' },
    ],
  },
  {
    label: 'Account',
    links: [
      { path: 'account', label: 'Account', icon: 'profile' },
      { path: 'legal', label: 'Legal', icon: 'fileText' },
    ],
  },
];

/** Every section of the nav, Profile first (its tests and the old flat list). */
export const SETTINGS_LINKS: readonly SettingsLink[] = [
  { path: 'profile', label: 'Profile', icon: 'profile' },
  ...SETTINGS_GROUPS.flatMap((group) => group.links),
];

const THEME_LABELS: Record<string, string> = {
  system: 'Same as the system',
  light: 'Light',
  dark: 'Dark',
};

/**
 * `/settings/:section` (spec 13, board W25): container 1040, a sticky nav of 248 (the mini profile
 * card with "Edit profile", the groups Where you ship from, App, Safety and Account with a line
 * under Location and Appearance, then Sign out and the web's version), a 64 gap and the section
 * (680, forms at most 640). Offers and Payouts are gone (decision 2).
 */
@Component({
  selector: 'app-settings-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AvatarComponent, ShellIconComponent],
  template: `
    <div class="st">
      <header class="st__header">
        <h1 class="st__title">Settings</h1>
        @if (email(); as mail) {
          <p class="st__who">Signed in as {{ mail }}</p>
        }
      </header>
      <div class="st__layout">
        <nav class="st__nav" aria-label="Settings sections">
          <a
            class="st__me"
            routerLink="profile"
            routerLinkActive="st__me--active"
            ariaCurrentWhenActive="page"
            aria-label="Edit profile"
          >
            <app-avatar class="st__avatar" [src]="session.me()?.avatarUrl" [name]="session.displayName()" [decorative]="true" />
            <span class="st__me-text">
              <span class="st__me-name">{{ session.displayName() }}</span>
              @if (session.handle(); as handle) {
                <span class="st__me-handle">&#64;{{ handle }}</span>
              }
              <span class="st__me-edit">Edit profile</span>
            </span>
          </a>
          @for (group of groups(); track group.label) {
            <p class="st__group" [id]="'settings-group-' + $index">{{ group.label }}</p>
            <ul class="st__links" [attr.aria-labelledby]="'settings-group-' + $index">
              @for (link of group.links; track link.path) {
                <li>
                  <a
                    class="st__link"
                    [routerLink]="link.path"
                    routerLinkActive="st__link--active"
                    ariaCurrentWhenActive="page"
                  >
                    <app-shell-icon [name]="link.icon" [size]="20" />
                    <span class="st__link-text">
                      <span>{{ link.label }}</span>
                      @if (sub(link.path); as line) {
                        <span class="st__link-sub">{{ line }}</span>
                      }
                    </span>
                  </a>
                </li>
              }
            </ul>
          }
          <div class="st__foot">
            <button type="button" class="st__signout" (click)="signOut()">
              <app-shell-icon name="logOut" [size]="20" />
              Sign out
            </button>
            <p class="st__version">OrenjiTrade web 1.0.0</p>
          </div>
        </nav>
        <div class="st__content">
          <router-outlet />
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .st {
      max-width: 1040px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }
    .st__header {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 12px;
      margin-bottom: 24px;
    }
    .st__title {
      margin: 0;
      font-family: var(--font-display);
      font-size: 30px;
      font-weight: var(--font-weight-bold);
      letter-spacing: -0.5px;
    }
    .st__who {
      margin: 0;
      color: var(--color-text-secondary);
    }
    .st__layout {
      display: grid;
      grid-template-columns: 248px minmax(0, 680px);
      gap: 64px;
      align-items: start;
    }
    .st__nav {
      position: sticky;
      top: 88px;
      display: flex;
      flex-direction: column;
    }
    .st__me {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px;
      border: 1px solid var(--color-border);
      border-radius: 14px;
      background: var(--color-surface);
      color: var(--color-ink);
      text-decoration: none;
    }
    .st__me:hover,
    .st__me--active {
      border-color: var(--color-border-strong);
    }
    .st__avatar {
      --avatar-size: 48px;
    }
    .st__me-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .st__me-name {
      overflow: hidden;
      font-weight: var(--font-weight-semibold);
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .st__me-handle {
      overflow: hidden;
      color: var(--color-text-secondary);
      font-size: 13px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .st__me-edit {
      color: var(--color-accent);
      font-size: 13px;
      font-weight: var(--font-weight-semibold);
    }
    .st__group {
      margin: 24px 12px 8px;
      color: var(--color-text-secondary);
      font-size: 12px;
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .st__links {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .st__link {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 44px;
      padding: 6px 12px;
      border-radius: 12px;
      color: var(--color-text-secondary);
      font-weight: var(--font-weight-medium);
      text-decoration: none;
    }
    .st__link:hover {
      background: var(--color-surface-variant);
      color: var(--color-ink);
    }
    .st__link--active {
      background: var(--color-surface-variant);
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .st__link-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .st__link-sub {
      overflow: hidden;
      color: var(--color-text-secondary);
      font-size: 12px;
      font-weight: var(--font-weight-regular);
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .st__foot {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--color-border);
    }
    .st__signout {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      min-height: 44px;
      padding: 0 12px;
      border: 0;
      border-radius: 12px;
      background: transparent;
      color: var(--color-danger);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .st__signout:hover {
      background: var(--color-surface-variant);
    }
    .st__version {
      margin: 8px 12px 0;
      color: var(--color-text-muted);
      font-size: 12px;
    }
    .st__content {
      min-width: 0;
      max-width: 680px;
      display: flex;
      flex-direction: column;
      gap: var(--spacing-5);
    }
    @media (max-width: 1279.98px) {
      .st__layout {
        grid-template-columns: 220px minmax(0, 1fr);
        gap: 40px;
      }
    }
    @media (max-width: 959.98px) {
      .st {
        padding: 16px 16px 32px;
      }
      .st__title {
        font-size: 24px;
      }
      .st__layout {
        grid-template-columns: minmax(0, 1fr);
        gap: 20px;
      }
      .st__nav {
        position: static;
      }
      .st__links {
        flex-direction: row;
        flex-wrap: wrap;
        gap: 6px;
      }
      .st__link {
        min-height: 40px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-pill);
      }
      .st__link-sub {
        display: none;
      }
      .st__group {
        margin: 16px 4px 6px;
      }
      .st__foot {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsShellComponent {
  protected readonly session = inject(SessionService);
  private readonly flags = inject(FeatureFlagsService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly theme = inject(ThemeService);
  private readonly locations = inject(MyLocationStore);

  protected readonly groups = computed(() =>
    SETTINGS_GROUPS.map((group) => ({
      ...group,
      links: group.links.filter((link) => !link.feature || this.flags.enabled(link.feature)()),
    })),
  );
  protected readonly email = computed(() => this.auth.user()?.email ?? null);
  /** The line under a nav row: where you ship from, the theme. */
  private readonly lines = computed<Record<string, string | null>>(() => {
    const location = this.locations.location();
    const where = location?.location;
    return {
      location: where
        ? `${where.label}${location?.discoverable ? ' · On the map' : ' · Hidden from the map'}`
        : location
          ? 'Not chosen yet'
          : null,
      shipping: 'Phone app only',
      appearance: THEME_LABELS[this.theme.preference()] ?? null,
    };
  });

  constructor() {
    if (!this.locations.location() && !this.locations.loading()) {
      void this.locations.load();
    }
  }

  protected sub(path: string): string | null {
    return this.lines()[path] ?? null;
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.toasts.show({ title: 'You are signed out. See you soon!' });
    await this.router.navigateByUrl('/');
  }
}
