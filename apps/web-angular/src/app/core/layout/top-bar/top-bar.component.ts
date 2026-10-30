import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { WordmarkComponent } from '../../../shared/ui/wordmark/wordmark.component';
import { AuthService } from '../../auth/auth.service';
import { SessionService } from '../../auth/session.service';
import { GameContext } from '../../game/game-context.service';
import { GLOBAL_SEARCH_ID } from '../../keyboard/keyboard-shortcuts.service';
import { AccountMenuComponent } from '../account-menu/account-menu.component';
import { GamePillComponent } from '../game-pill/game-pill.component';
import { GlobalSearchComponent } from '../global-search/global-search.component';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';
import { RegionPillComponent } from '../region-pill/region-pill.component';
import { ShellIconComponent } from '../shell-icon/shell-icon.component';
import { ShellLayout } from '../shell-layout.service';

/**
 * The top bar (64, sticky; spec 4.2 and 4.3, boards W1, W3, W28 and W29). Left, "where you are":
 * the wordmark, the region pill and the game pill, in the page's pill scope (spec 4.2). Right,
 * "what you do": the global search (400, 320 at md; hidden on Search, whose pane has its own),
 * the bell and the avatar with the account menu; a guest gets a "Sign in" pill instead of the bell
 * and the avatar. Below 960, on the five tabs' own pages, it is the phone's per-tab bar (spec 16,
 * board W29): the tab's title in Sora 28 (Home shows its pills instead), the pills on Home and
 * Search, and the bell; Profile adds the account menu, which holds Settings, Appearance, Admin
 * and Sign out. Every other page below 960 keeps the wordmark, the pills in scope (compact), the
 * bell and the avatar. The tab bar carries the areas, Search among them.
 */
@Component({
  selector: 'app-top-bar',
  imports: [
    RouterLink,
    WordmarkComponent,
    RegionPillComponent,
    GamePillComponent,
    GlobalSearchComponent,
    NotificationBellComponent,
    AccountMenuComponent,
    ShellIconComponent,
  ],
  template: `
    <header
      class="bar"
      [class.bar--line]="line()"
      [class.bar--tab]="layout.tabBar()"
      [attr.data-pills]="layout.pills()"
      data-testid="top-bar"
    >
      <div class="bar__where">
        @if (!layout.tabBar()) {
          <app-wordmark class="bar__wordmark" />
        } @else if (layout.tabTitle(); as title) {
          <!-- The tab's title (the page's own h1 steps back meanwhile: ShellTabTitleDirective). -->
          <span class="bar__title" data-testid="tab-title">{{ title }}</span>
        }
        @if (layout.pills() !== 'none') {
          <app-region-pill />
          @if (layout.pills() === 'both') {
            <app-game-pill />
          }
        }
      </div>
      <div class="bar__do">
        @if (!layout.hideGlobalSearch()) {
          @if (!layout.narrow()) {
            @defer (on idle) {
              <app-global-search class="bar__search" />
            } @placeholder {
              <div class="bar__search bar__search--placeholder">
                <app-shell-icon name="search" [size]="18" />
                <input
                  #early
                  class="bar__placeholder-input"
                  type="search"
                  [id]="searchId"
                  [attr.aria-label]="placeholder()"
                  [placeholder]="placeholder()"
                  (focus)="layout.searchHandoff.focused = true"
                  (blur)="onEarlyBlur($event)"
                  (input)="layout.searchHandoff.text = early.value"
                />
                <kbd class="bar__key" aria-hidden="true">/</kbd>
              </div>
            }
          }
        }
        @if (auth.isAuthenticated()) {
          <app-notification-bell />
          @if (!layout.tabBar() || layout.area() === 'profile') {
            <app-account-menu />
          }
        } @else if (auth.authState() !== 'loading') {
          <!-- Back to this very page after signing in ("Not now" too; spec 14). -->
          <a
            class="bar__signin"
            routerLink="/auth/sign-in"
            [queryParams]="{ returnUrl: returnUrl() }"
            data-testid="top-bar-sign-in"
            >Sign in</a
          >
        }
      </div>
    </header>
  `,
  styles: `
    :host {
      position: sticky;
      top: 0;
      z-index: 30;
      display: block;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 12px 16px;
      height: 64px;
      padding: 0 24px;
      border-bottom: 1px solid transparent;
      background: color-mix(in srgb, var(--color-background) 85%, transparent);
      -webkit-backdrop-filter: blur(16px);
      backdrop-filter: blur(16px);
    }
    /* Always on workspace pages, after a scroll on reading pages (spec 2.3). */
    .bar--line {
      border-bottom-color: var(--color-border);
    }
    .bar__where {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .bar__wordmark {
      margin-right: 24px;
    }
    .bar__do {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      margin-left: auto;
    }
    .bar__search {
      flex: 0 1 400px;
      width: 400px;
      min-width: 0;
      margin-right: 4px;
    }
    .bar__search--placeholder {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 40px;
      padding: 0 8px 0 14px;
      border: 1px solid var(--color-border-input);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-text-muted);
    }
    .bar__placeholder-input {
      flex: 1 1 auto;
      min-width: 0;
      border: 0;
      outline: none;
      background: none;
      color: var(--color-ink);
      font: inherit;
      font-size: var(--font-size-sm);
    }
    .bar__key {
      display: inline-grid;
      place-items: center;
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-sm);
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
    }
    .bar__signin {
      display: inline-flex;
      align-items: center;
      height: 36px;
      padding: 0 16px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
    }
    .bar__signin:hover {
      background: var(--color-surface-variant);
    }
    @media (min-width: 960px) and (max-width: 1279.98px) {
      .bar__search {
        flex-basis: 320px;
        width: 320px;
      }
      .bar__wordmark {
        margin-right: 16px;
      }
    }
    /* The phone's per-tab title (spec 16, board W29): Sora 28 on 36, never cut. */
    .bar__title {
      flex: none;
      margin-right: 4px;
      color: var(--color-ink);
      font-family: var(--font-display);
      font-size: var(--font-size-title);
      font-weight: var(--font-weight-bold);
      letter-spacing: -0.4px;
      line-height: 36px;
      white-space: nowrap;
    }
    @media (max-width: 959.98px) {
      .bar {
        gap: 8px;
        padding: 0 16px;
      }
      .bar__wordmark {
        margin-right: 4px;
      }
      .bar__do {
        gap: 8px;
      }
    }
    @media (max-width: 599.98px) {
      .bar__wordmark {
        --wordmark-size: var(--font-size-lg);
      }
    }
    @media (max-width: 359.98px) {
      .bar__title {
        font-size: var(--font-size-2xl);
      }
    }
  `,
  host: { '(window:scroll)': 'onScroll()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBarComponent {
  protected readonly layout = inject(ShellLayout);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  /** The page's address: "Sign in" comes back to it. */
  protected readonly returnUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  private readonly session = inject(SessionService);
  private readonly game = inject(GameContext);
  protected readonly searchId = GLOBAL_SEARCH_ID;
  private readonly document = inject(DOCUMENT);
  private readonly scrolled = signal(false);
  protected readonly line = computed(() => this.layout.layout() === 'workspace' || this.scrolled());
  protected readonly placeholder = computed(() =>
    this.session.status() === 'ready'
      ? `Search ${this.game.info().shortLabel} cards or collectors`
      : `Search ${this.game.info().shortLabel} cards`,
  );

  /** Focus left for another control (not the chunk's swap, which has no target). */
  protected onEarlyBlur(event: FocusEvent): void {
    if (event.relatedTarget) {
      this.layout.searchHandoff.focused = false;
    }
  }

  protected onScroll(): void {
    this.scrolled.set((this.document.defaultView?.scrollY ?? 0) > 0);
  }
}
