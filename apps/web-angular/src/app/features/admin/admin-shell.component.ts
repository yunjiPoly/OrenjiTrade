import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { FEATURE, FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { AccountMenuComponent } from '../../core/layout/account-menu/account-menu.component';
import { SessionBannerComponent } from '../../core/layout/session-banner/session-banner.component';
import { ShellLayout } from '../../core/layout/shell-layout.service';
import { WordmarkComponent } from '../../shared/ui/wordmark/wordmark.component';
import { AdminCounts } from './console/admin-counts.service';
import { AdminIconComponent } from './console/admin-icon.component';
import {
  AdminCountKey,
  ROLE_LABELS,
  adminNavFor,
  openCountLabel,
  staffRoleOf,
} from './console/admin-nav';
import { StaffSearchComponent } from './console/staff-search.component';

/**
 * The admin console's own frame (spec 15.1, boards A1 and A24; web stage WH1): the top bar (64)
 * with the wordmark and "Admin console" (the wordmark opens the Overview), the staff search
 * ("/"), the role pill, "Back to OrenjiTrade" and the avatar's account menu; the grouped nav
 * (260) with the open counts of Reports and Flags and rules and its audit line; the page in
 * `main`. There are no region or game pills: admin lists filter per page. Moderators see the
 * Overview and the four MODERATION items; PAYMENTS shows only while `protectedPayments` is on.
 * Below 960 the nav becomes a grid of items above the page, as before.
 */
@Component({
  selector: 'app-admin-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    AccountMenuComponent,
    AdminIconComponent,
    SessionBannerComponent,
    StaffSearchComponent,
    WordmarkComponent,
  ],
  providers: [AdminCounts],
  template: `
    <header class="ct" data-testid="admin-top-bar">
      <div class="ct__where">
        <a class="ct__brand" routerLink="/admin" aria-label="OrenjiTrade admin console, Overview">
          <app-wordmark [link]="false" />
          <span class="ct__divider" aria-hidden="true"></span>
          <span class="ct__console">Admin console</span>
        </a>
      </div>
      <div class="ct__do">
        <app-staff-search class="ct__search" />
        @if (roleLabel(); as role) {
          <span class="ct__role" data-testid="admin-role">
            <app-admin-icon name="shield" [size]="16" />
            <span class="visually-hidden">Role: </span>{{ role }}
          </span>
        }
        <a class="ct__back" routerLink="/" data-testid="admin-back" title="Back to OrenjiTrade">
          <app-admin-icon name="arrowLeft" [size]="18" />
          <span class="ct__back-text">Back to OrenjiTrade</span>
        </a>
        <app-account-menu />
      </div>
    </header>
    <div class="cs" [class.cs--narrow]="layout.narrow()">
      <nav class="cs__nav" aria-label="Admin sections">
        @for (group of nav(); track group.id) {
          @if (group.label; as label) {
            <p class="cs__group" [id]="'admin-nav-' + group.id">{{ label }}</p>
          }
          <ul
            class="cs__items"
            [attr.aria-labelledby]="group.label ? 'admin-nav-' + group.id : null"
          >
            @for (item of group.items; track item.id) {
              <li>
                <a
                  class="cs__item"
                  [routerLink]="item.path ? ['/admin', item.path] : '/admin'"
                  routerLinkActive="cs__item--active"
                  ariaCurrentWhenActive="page"
                  [routerLinkActiveOptions]="{ exact: item.path === '' }"
                  [attr.data-nav]="item.id"
                >
                  <app-admin-icon [name]="item.icon" [size]="20" />
                  <span class="cs__label">{{ item.label }}</span>
                  @if (item.count && countOf(item.count); as count) {
                    <span class="cs__count" data-testid="nav-count">
                      <span aria-hidden="true">{{ count }}</span>
                      <span class="visually-hidden">, {{ openLabel(count) }}</span>
                    </span>
                  }
                </a>
              </li>
            }
          </ul>
        }
        <p class="cs__foot">Every staff action is recorded in the audit log.</p>
      </nav>
      <main id="main-content" class="cs__main" tabindex="-1">
        <app-session-banner />
        <router-outlet />
      </main>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
    }
    .ct {
      position: sticky;
      top: 0;
      z-index: 30;
      display: flex;
      align-items: center;
      gap: 12px 16px;
      height: 64px;
      padding: 0 24px;
      border-bottom: 1px solid var(--color-border);
      background: color-mix(in srgb, var(--color-background) 88%, transparent);
      -webkit-backdrop-filter: blur(16px);
      backdrop-filter: blur(16px);
    }
    .ct__where {
      display: flex;
      align-items: center;
      min-width: 0;
    }
    .ct__brand {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      color: inherit;
      text-decoration: none;
      border-radius: var(--radius-sm);
    }
    .ct__brand:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 4px;
    }
    .ct__divider {
      width: 1px;
      height: 20px;
      background: var(--color-border-strong);
    }
    .ct__console {
      color: var(--color-text-secondary);
      font-family: var(--font-display);
      font-size: 15px;
      font-weight: var(--font-weight-semibold);
      white-space: nowrap;
    }
    .ct__do {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      margin-left: auto;
    }
    .ct__search {
      flex: 0 1 360px;
      width: 360px;
    }
    .ct__role {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 12px;
      border-radius: var(--radius-pill);
      background: var(--color-accent-tint);
      color: light-dark(var(--color-on-accent-container), var(--color-accent));
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      white-space: nowrap;
    }
    .ct__back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 40px;
      padding: 0 16px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
      white-space: nowrap;
    }
    .ct__back:hover {
      background: var(--color-surface-variant);
    }
    .ct__back:focus-visible,
    .cs__item:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: var(--focus-offset);
    }
    .cs {
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr);
      flex: 1 1 auto;
      min-height: 0;
    }
    .cs__nav {
      position: sticky;
      top: 64px;
      align-self: start;
      display: flex;
      flex-direction: column;
      height: calc(100dvh - 64px);
      overflow-y: auto;
      padding: 16px 12px;
      border-right: 1px solid var(--color-border);
      background: var(--color-background);
    }
    .cs__group {
      margin: 16px 12px 6px;
      color: var(--color-text-secondary);
      font-size: 11px;
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .cs__items {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .cs__item {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 40px;
      padding: 0 12px;
      border-radius: 12px;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      text-decoration: none;
    }
    .cs__item:hover {
      background: var(--color-surface-variant);
    }
    /* In light the label is ink on the tint (orange text there is 2.4:1; review fix 1). */
    .cs__item--active,
    .cs__item--active:hover {
      background: var(--color-primary-tint);
      color: light-dark(var(--color-ink), var(--color-primary));
      font-weight: var(--font-weight-semibold);
    }
    .cs__label {
      flex: 1 1 auto;
      min-width: 0;
    }
    .cs__count {
      display: inline-grid;
      place-items: center;
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: var(--color-on-primary);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-bold);
    }
    .cs__foot {
      margin: auto 12px 0;
      padding-top: 16px;
      border-top: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
      line-height: 1.5;
    }
    .cs__main {
      display: flex;
      flex-direction: column;
      min-width: 0;
      outline: none;
    }
    /* md: the search narrows, the back button keeps its arrow. */
    @media (max-width: 1279.98px) {
      .ct__search {
        flex-basis: 260px;
        width: 260px;
      }
      .ct__back-text {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      .ct__back {
        width: 40px;
        padding: 0;
        justify-content: center;
      }
    }
    /*
     * Below 960: the nav is a grid of items above the page; the search takes its own row. The
     * bar, three rows tall there, scrolls away with the page (review fix 1, WCAG 2.4.11: kept
     * sticky it hid focused controls under it at 200% zoom and at 390).
     */
    @media (max-width: 959.98px) {
      .ct {
        position: static;
        flex-wrap: wrap;
        height: auto;
        padding: 10px 16px;
      }
      .ct__console {
        font-size: 13px;
      }
      .ct__do {
        flex: 1 1 auto;
        justify-content: flex-end;
        gap: 8px;
      }
      .ct__search {
        order: 10;
        flex: 1 1 100%;
        width: 100%;
      }
      .ct__do {
        flex-wrap: wrap;
      }
      .cs {
        grid-template-columns: minmax(0, 1fr);
      }
      .cs__nav {
        position: static;
        height: auto;
        padding: 8px 16px 12px;
        border-right: 0;
        border-bottom: 1px solid var(--color-border);
      }
      .cs__group {
        margin: 10px 4px 4px;
      }
      .cs__items {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      }
      .cs__foot {
        margin: 12px 4px 0;
        padding-top: 10px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent {
  protected readonly layout = inject(ShellLayout);
  private readonly session = inject(SessionService);
  private readonly flags = inject(FeatureFlagsService);
  private readonly counts = inject(AdminCounts);

  private readonly role = computed(() => staffRoleOf(this.session.roles()));
  protected readonly roleLabel = computed(() => {
    const role = this.role();
    return role ? ROLE_LABELS[role] : null;
  });
  private readonly paymentsOn = this.flags.enabled(FEATURE.protectedPayments);
  protected readonly nav = computed(() => adminNavFor(this.role(), this.paymentsOn()));
  protected readonly openLabel = openCountLabel;

  constructor() {
    void this.counts.refresh();
  }

  /** The open count of a queue (none while it is 0 or not read yet). */
  protected countOf(key: AdminCountKey): number {
    const counts = this.counts.counts();
    if (!counts) {
      return 0;
    }
    return key === 'reports' ? counts.reports : counts.flags;
  }
}
