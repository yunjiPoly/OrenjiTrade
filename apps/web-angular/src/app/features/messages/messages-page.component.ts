import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { FEATURE, FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { ShellTabTitleDirective } from '../../core/layout/shell-tab-title.directive';
import { UnreadChats } from '../../core/layout/unread-chats/unread-chats';
import { CommunityPageComponent } from '../community/community-page.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import {
  UnderlineTab,
  UnderlineTabsComponent,
} from '../../shared/ui/underline-tabs/underline-tabs.component';
import { MessengerComponent } from './messenger/messenger.component';
import { RealtimeStatusComponent } from './realtime-status/realtime-status.component';

/** From this width the list and the thread sit side by side. */
const SPLIT_QUERY = '(min-width: 840px)';

/**
 * `/messages` and `/messages/:id`: the full-page messenger. Wide screens show the list beside the
 * thread; narrow screens show one at a time, like the phone. The open conversation lives in the
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
    CommunityPageComponent,
    ShellTabTitleDirective,
  ],
  template: `
    <div class="page messages-page">
      @if (auth.isAuthenticated()) {
        <header class="messages-page__header">
          <div class="messages-page__titles">
            <h1 class="messages-page__title" appShellTabTitle>Messages</h1>
            <app-realtime-status />
          </div>
          @if (communityOn()) {
            <app-underline-tabs label="Messages" [tabs]="tabs()" />
          }
        </header>
        @if (showCommunity()) {
          <app-community-page embedded [slug]="room()" />
        } @else {
          <app-messenger
            class="messages-page__box"
            [split]="split()"
            [conversationId]="id() ?? null"
            (openedChange)="onOpened($event)"
          />
        }
      } @else {
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
      }
    </div>
  `,
  styles: `
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
      font-size: var(--font-size-title);
      font-weight: var(--font-weight-bold);
      letter-spacing: -0.4px;
      line-height: 36px;
    }
    .messages-page__box {
      height: max(480px, calc(100dvh - 64px - 180px));
      overflow: hidden;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      box-shadow: var(--elevation-menu);
    }
    @media (max-width: 959px) {
      .messages-page__box {
        height: max(420px, calc(100dvh - 64px - 64px - 150px));
      }
    }
    @media (max-width: 599px) {
      .messages-page__title {
        font-size: var(--font-size-2xl);
      }
      .messages-page__box {
        margin: 0 calc(-1 * var(--spacing-4));
        border-right: 0;
        border-left: 0;
        border-radius: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesPageComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly breakpoints = inject(BreakpointObserver);

  private readonly flags = inject(FeatureFlagsService);
  private readonly unread = inject(UnreadChats);

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
      {
        id: 'community',
        label: 'Community',
        commands: ['/messages'],
        queryParams: { tab: 'community' },
        active: this.showCommunity(),
      },
    ];
  });

  protected readonly split = toSignal(
    this.breakpoints.observe(SPLIT_QUERY).pipe(map((state) => state.matches)),
    { initialValue: this.breakpoints.isMatched(SPLIT_QUERY) },
  );

  protected onOpened(id: string | null): void {
    void this.router.navigate(id ? ['/messages', id] : ['/messages']);
  }
}
