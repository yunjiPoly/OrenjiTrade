import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ChatDrawerComponent } from '../../../features/messages/drawer/chat-drawer.component';
import { ChatDrawer } from '../../../shared/messaging/chat-drawer.service';
import { ToastHostComponent } from '../../feedback/toast-host.component';
import { GuestActions } from '../../guest/guest-actions.service';
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
 * reading pages, the bottom tab bar below 960 px, the toasts and the chat drawer (web stage WC). It replaces the old toolbar,
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
    ChatDrawerComponent,
  ],
  template: `
    <div class="skip-links">
      <a
        class="skip-link"
        href="#main-content"
        data-testid="skip-content"
        (click)="skipTo($event, 'main-content')"
        >Skip to content</a
      >
      @if (layout.skipMapTarget(); as target) {
        <a
          class="skip-link"
          [attr.href]="'#' + target"
          data-testid="skip-map"
          (click)="skipTo($event, target)"
          >Skip the map</a
        >
      }
    </div>
    @if (layout.console()) {
      <!-- The admin console (spec 15.1): its shell draws the banner, the nav and the main. -->
      <router-outlet />
    } @else {
      @if (!layout.inChat() && !layout.bare()) {
        <app-top-bar />
      }
      <div
        class="shell"
        [class.shell--narrow]="layout.narrow()"
        [class.shell--bare]="layout.bare()"
        [class.shell--drawer]="drawerPushes()"
        [class.shell--chat]="layout.inChat()"
      >
        @if (!layout.narrow() && !layout.bare()) {
          <app-rail class="shell__rail" />
        }
        <div class="shell__content" [attr.data-layout]="layout.layout()">
          <!-- In the content column: the rail keeps its full height under the bar (spec 4.1). -->
          @if (!layout.bare()) {
            <app-session-banner />
          }
          <main id="main-content" class="shell__main" tabindex="-1">
            <router-outlet />
          </main>
          @if (layout.layout() === 'reading' && !layout.bare()) {
            <app-footer class="shell__footer" />
          }
        </div>
      </div>
      @if (layout.narrow() && !layout.inChat() && !layout.bare()) {
        <app-tab-bar />
      }
    }
    <app-toast-host />
    @defer (on idle) {
      <app-unread-chats-probe />
    }
    <!-- The chat drawer (spec 10.6): a lazy chunk shared with Messages, one chat at a time. -->
    @if (chatDrawer.state(); as drawer) {
      @defer (on immediate) {
        <app-chat-drawer [conversation]="drawer.conversation" />
      }
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
    /* The account steps stand alone (spec 14): no rail, bar, tabs or footer around them. */
    .shell--bare,
    .shell--bare.shell--narrow {
      grid-template-columns: minmax(0, 1fr);
    }
    .shell--bare .shell__content,
    .shell--narrow.shell--bare .shell__content {
      min-height: 100dvh;
      padding-bottom: 0;
    }
    /* A chat below 960 opens above the tabs, as on the phone: no tab bar under it. */
    .shell--narrow.shell--chat .shell__content {
      padding-bottom: 0;
    }
    /*
     * At lg and xl the chat drawer pushes the page (spec 4.8): the content reflows beside its 440,
     * so nothing focusable sits under it (WCAG 2.4.11; WC review U1, A3). At md it overlays.
     */
    .shell--drawer .shell__content {
      padding-right: 440px;
    }
    /* sm: the phone's design, centred at 640 (spec 16). */
    @media (min-width: 600px) and (max-width: 959.98px) {
      .shell--narrow:not(.shell--bare) .shell__main {
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
  protected readonly chatDrawer = inject(ChatDrawer);
  private readonly document = inject(DOCUMENT);
  /** The chat drawer is open at lg or xl, where drawers push the content (spec 4.8). */
  protected readonly drawerPushes = computed(
    () => !!this.chatDrawer.state() && !this.layout.narrow() && !this.layout.medium(),
  );

  constructor() {
    inject(KeyboardShortcuts).start();
    // A guest's action finishes once they signed in and are back on its page (spec 14).
    inject(GuestActions).start();
  }

  /**
   * A skip link moves the focus itself: its "#main-content" resolves against `<base href="/">`, so
   * the browser would load Home from any other page (WB review A10).
   */
  protected skipTo(event: Event, id: string): void {
    const target = this.document.getElementById(id);
    if (!target) {
      return;
    }
    event.preventDefault();
    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
    }
    target.focus();
    target.scrollIntoView({ block: 'start' });
  }
}
