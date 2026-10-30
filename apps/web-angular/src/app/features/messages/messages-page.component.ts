import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { FEATURE, FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { GameContext } from '../../core/game/game-context.service';
import { RegionContext } from '../../core/region/region-context.service';
import { ShellLayout } from '../../core/layout/shell-layout.service';
import { ShellTabTitleDirective } from '../../core/layout/shell-tab-title.directive';
import { UnreadChats } from '../../core/layout/unread-chats/unread-chats';
import { CommunityViewComponent } from '../community/community-view.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import {
  UnderlineTab,
  UnderlineTabsComponent,
} from '../../shared/ui/underline-tabs/underline-tabs.component';
import { MessengerComponent } from './messenger/messenger.component';
import { RealtimeStatusComponent } from './realtime-status/realtime-status.component';

/**
 * `/messages` and `/messages/:id` (spec 10, boards W18 to W20): the inbox (340) with the page's
 * header (H1 and Chats | Community), the chat and its deal panel (320) at lg; the inbox (300) and
 * the chat at md, the deal panel a drawer; one pane per route below 960, like the phone. The open conversation lives in the
 * URL. The tabs Chats | Community (the phone's since R11; Community while `publicChat` is on):
 * `/messages?tab=community` and `/messages/community/:room` show the community, where old
 * `/community` links land (spec 4.11). Offers and trades left the web (decision 2): old offer
 * messages read as history in the chats.
 */
@Component({
  selector: 'app-messages-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    EmptyStateComponent,
    MessengerComponent,
    RealtimeStatusComponent,
    UnderlineTabsComponent,
    CommunityViewComponent,
    ShellTabTitleDirective,
  ],
  template: `
    @if (auth.isAuthenticated()) {
      @if (showCommunity()) {
        <app-community-view
          class="messages"
          [class.messages--chat]="layout.inChat()"
          [split]="split()"
          [slug]="room() ?? null"
        >
          <header inboxHeader class="inbox-head">
            <div class="messages-page__titles">
              <h1 class="messages-page__title" appShellTabTitle>Messages</h1>
              <app-realtime-status />
            </div>
            <app-underline-tabs label="Messages" [tabs]="tabs()" />
          </header>
        </app-community-view>
      } @else {
        <app-messenger
          class="messages"
          [class.messages--chat]="layout.inChat()"
          [split]="split()"
          [conversationId]="id() ?? null"
          [focusChat]="chatFocus()"
          (chatFocused)="chatFocus.set(null)"
          (openedChange)="onOpened($event)"
        >
          <header inboxHeader class="inbox-head">
            <div class="messages-page__titles">
              <h1 class="messages-page__title" appShellTabTitle>Messages</h1>
              <app-realtime-status />
            </div>
            @if (communityOn()) {
              <app-underline-tabs label="Messages" [tabs]="tabs()" />
            }
          </header>
        </app-messenger>
      }
    } @else {
      <div class="page messages-page">
        <app-empty-state
          icon="lock_person"
          title="Messages are for members"
          description="Sign in to talk privately with collectors."
        >
          <a
            actions
            matButton="filled"
            routerLink="/auth/sign-in"
            [queryParams]="{ returnUrl: '/messages' }"
          >
            Sign in
          </a>
        </app-empty-state>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .messages-page {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
    }
    .messages-page__header {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
    }
    .messages-page__titles {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-3);
    }
    .messages-page__title {
      margin: 0;
      font-size: var(--font-size-title);
      font-weight: var(--font-weight-bold);
      letter-spacing: -0.4px;
      line-height: 36px;
    }
    /* Inbox 340 | chat | deal panel 320, the full height under the top bar (spec 10.1). */
    .messages {
      height: calc(100dvh - 64px);
      min-height: 480px;
      overflow: hidden;
    }
    .inbox-head {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      padding: var(--spacing-6) var(--spacing-6) 0;
    }
    @media (max-width: 1279.98px) {
      .inbox-head {
        padding-inline: var(--spacing-4);
      }
    }
    /*
     * One pane per route below 960: the inbox between the phone's bars; a chat above the tabs, the
     * whole height (it never makes the page scroll: no min-height beyond the window).
     */
    @media (max-width: 959.98px) {
      .messages {
        height: calc(100dvh - 64px - 64px - env(safe-area-inset-bottom));
        min-height: 0;
      }
      .messages--chat {
        height: 100dvh;
      }
      .inbox-head {
        padding-top: var(--spacing-2);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesPageComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly layout = inject(ShellLayout);

  private readonly flags = inject(FeatureFlagsService);
  private readonly unread = inject(UnreadChats);
  private readonly region = inject(RegionContext);
  private readonly game = inject(GameContext);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  /** A chat opened from a community room: it takes the focus once on screen (WF review A2). */
  protected readonly chatFocus = signal<string | null>(null);
  /** Whether Community was shown (`undefined`: nothing yet). */
  private shownCommunity: boolean | undefined = undefined;

  /** `:id` route parameter (withComponentInputBinding). */
  readonly id = input<string | undefined>();
  /** `?tab=community` (old `/community` links land here). */
  readonly tab = input<string | undefined>();
  /** `/messages/community/:room`. */
  readonly room = input<string | undefined>();

  protected readonly communityOn = this.flags.enabled(FEATURE.publicChat);
  protected readonly showCommunity = computed(
    () => this.communityOn() && (this.tab() === 'community' || !!this.room()),
  );
  protected readonly tabs = computed<UnderlineTab[]>(() => {
    const unread = this.unread.count();
    return [
      {
        id: 'chats',
        label: 'Chats',
        commands: ['/messages'],
        active: !this.showCommunity(),
        dot: unread > 0,
        dotLabel: unread > 0 ? `, ${unread} unread` : undefined,
      },
      // At 960 and wider Community opens the browsed game's room of the browsed region at once
      // (spec 10.7); below, the list of the five rooms first, as on the phone.
      this.split()
        ? {
            id: 'community',
            label: 'Community',
            commands: ['/messages', 'community', `${this.region.current()}-${this.game.current()}`],
            active: this.showCommunity(),
          }
        : {
            id: 'community',
            label: 'Community',
            commands: ['/messages'],
            queryParams: { tab: 'community' },
            active: this.showCommunity(),
          },
    ];
  });

  /** The inbox beside the chat at 960 px and wider; one pane per route below (spec 10.1, 16). */
  protected readonly split = computed(() => !this.layout.narrow());

  constructor() {
    // A chat or a room below 960 opens above the tabs (no per-tab bar, no tab bar), as on the
    // phone.
    effect(() =>
      this.layout.setChatOpen(
        this.auth.isAuthenticated() && (this.showCommunity() ? !!this.room() : !!this.id()),
      ),
    );
    inject(DestroyRef).onDestroy(() => this.layout.setChatOpen(false));
    // Community switched off (publicChat): a room's address, or "?tab=community", is replaced by
    // the Chats inbox's own address once the flags are known (WF leftover F9). A guest keeps the
    // address: signing in comes back to it.
    effect(() => {
      const known = this.flags.ready();
      const on = this.communityOn();
      const asked = this.tab() === 'community' || !!this.room();
      const member = this.auth.isAuthenticated();
      untracked(() => {
        if (known && !on && asked && member) {
          void this.router.navigate(['/messages'], { replaceUrl: true });
        }
      });
    });
    // Chats | Community swap the whole column, the tabs with it: the focus would fall to the page
    // (WF review U8). It goes to the tab now active, or to the chat a room's "Message {h}" opened.
    effect(() => {
      const community = this.showCommunity();
      untracked(() => {
        const previous = this.shownCommunity;
        this.shownCommunity = community;
        if (previous === undefined || previous === community) {
          return;
        }
        const id = this.id();
        if (!community && id) {
          this.chatFocus.set(id);
          return;
        }
        afterNextRender(
          () => {
            const active = this.document.activeElement;
            if (active && active !== this.document.body && active.isConnected) {
              return;
            }
            this.host.nativeElement
              .querySelector<HTMLElement>(
                `[data-testid="tab-link-${community ? 'community' : 'chats'}"]`,
              )
              ?.focus();
          },
          { injector: this.injector },
        );
      });
    });
  }

  protected onOpened(id: string | null): void {
    void this.router.navigate(id ? ['/messages', id] : ['/messages']);
  }
}
