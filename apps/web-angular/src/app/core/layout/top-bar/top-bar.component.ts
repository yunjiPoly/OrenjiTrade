import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
 * and the avatar. Below 960 the bar keeps the wordmark, the pills in scope, a search button, the
 * bell and the avatar, and the tab bar carries the areas.
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
      [attr.data-pills]="layout.pills()"
      data-testid="top-bar"
    >
      <div class="bar__where">
        <app-wordmark class="bar__wordmark" />
        @if (layout.pills() !== 'none') {
          <app-region-pill />
          @if (layout.pills() === 'both') {
            <app-game-pill />
          }
        }
      </div>
      <div class="bar__do">
        @if (!layout.hideGlobalSearch()) {
          @if (layout.narrow()) {
            <a
              class="bar__round"
              routerLink="/search"
              aria-label="Search"
              data-testid="narrow-search"
            >
              <app-shell-icon name="search" [size]="20" />
            </a>
          } @else {
            @defer (on idle) {
              <app-global-search class="bar__search" />
            } @placeholder {
              <div class="bar__search bar__search--placeholder">
                <app-shell-icon name="search" [size]="18" />
                <input
                  class="bar__placeholder-input"
                  type="search"
                  [id]="searchId"
                  [attr.aria-label]="placeholder()"
                  [placeholder]="placeholder()"
                />
                <kbd class="bar__key" aria-hidden="true">/</kbd>
              </div>
            }
          }
        }
        @if (auth.isAuthenticated()) {
          <app-notification-bell />
          <app-account-menu />
        } @else if (auth.authState() !== 'loading') {
          <a class="bar__signin" routerLink="/auth/sign-in" data-testid="top-bar-sign-in"
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
    .bar__round {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-ink);
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
    .bar__signin:hover,
    .bar__round:hover {
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
    @media (max-width: 959.98px) {
      .bar {
        gap: 8px;
        height: 56px;
        padding: 0 16px;
      }
      .bar__wordmark {
        margin-right: 4px;
      }
      .bar__do {
        gap: 8px;
      }
    }
  `,
  host: { '(window:scroll)': 'onScroll()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBarComponent {
  protected readonly layout = inject(ShellLayout);
  protected readonly auth = inject(AuthService);
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

  protected onScroll(): void {
    this.scrolled.set((this.document.defaultView?.scrollY ?? 0) > 0);
  }
}
