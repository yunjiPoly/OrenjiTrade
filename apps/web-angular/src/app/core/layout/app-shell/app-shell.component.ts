import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHostComponent } from '../../feedback/toast-host.component';
import { KeyboardShortcuts } from '../../keyboard/keyboard-shortcuts.service';
import { FooterComponent } from '../footer/footer.component';
import { RailComponent } from '../rail/rail.component';
import { SessionBannerComponent } from '../session-banner/session-banner.component';
import { ShellLayout } from '../shell-layout.service';
import { TabBarComponent } from '../tab-bar/tab-bar.component';
import { TopBarComponent } from '../top-bar/top-bar.component';
import { UnreadChatsProbeComponent } from '../unread-chats/unread-chats-probe.component';

/**
 * The application frame of the web redesign (spec 4, boards W1, W28 and W29): the skip links
 * ("Skip to content", and "Skip the map" while a page shows the map), the top bar (64), the
 * session banner, the rail (72) beside the routed content at 960 px and wider, the footer of
 * reading pages, the bottom tab bar below 960 px, and the toasts. It replaces the old toolbar,
 * the top-bar search box, the map page's side panel and the bottom navigation (spec 2.7).
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    TopBarComponent,
    SessionBannerComponent,
    RailComponent,
    TabBarComponent,
    FooterComponent,
    ToastHostComponent,
    UnreadChatsProbeComponent,
  ],
  template: `
    <div class="skip-links">
      <a class="skip-link" href="#main-content" data-testid="skip-content">Skip to content</a>
      @if (layout.skipMapTarget(); as target) {
        <a class="skip-link" [attr.href]="'#' + target" data-testid="skip-map">Skip the map</a>
      }
    </div>
    <app-top-bar />
    <div class="shell" [class.shell--narrow]="layout.narrow()">
      @if (!layout.narrow()) {
        <app-rail class="shell__rail" />
      }
      <div class="shell__content" [attr.data-layout]="layout.layout()">
        <!-- In the content column: the rail keeps its full height under the bar (spec 4.1). -->
        <app-session-banner />
        <main id="main-content" class="shell__main" tabindex="-1">
          <router-outlet />
        </main>
        @if (layout.layout() === 'reading') {
          <app-footer class="shell__footer" />
        }
      </div>
    </div>
    @if (layout.narrow()) {
      <app-tab-bar />
    }
    <app-toast-host />
    @defer (on idle) {
      <app-unread-chats-probe />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
    }
    .skip-links {
      position: absolute;
      top: 0;
      left: 0;
      z-index: 1000;
    }
    .shell {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
      flex: 1 1 auto;
      min-height: 0;
    }
    .shell--narrow {
      grid-template-columns: minmax(0, 1fr);
    }
    .shell__rail {
      position: sticky;
      top: 64px;
      align-self: start;
      height: calc(100dvh - 64px);
      border-right: 1px solid var(--color-border);
      background: var(--color-background);
      overflow-y: auto;
    }
    .shell__content {
      /* Its own stacking context: page layers (the map's panes) stay under the top bar's menus. */
      position: relative;
      z-index: 0;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: calc(100dvh - 64px);
    }
    .shell__main {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      outline: none;
    }
    .shell__main > :not(router-outlet) {
      flex: 1 1 auto;
      min-height: 0;
    }
    .shell--narrow .shell__content {
      padding-bottom: calc(64px + env(safe-area-inset-bottom));
    }
    /* sm: the phone's design, centred at 640 (spec 16). */
    @media (min-width: 600px) and (max-width: 959.98px) {
      .shell--narrow .shell__main {
        width: 100%;
        max-width: 640px;
        margin-inline: auto;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  protected readonly layout = inject(ShellLayout);

  constructor() {
    inject(KeyboardShortcuts).start();
  }
}
