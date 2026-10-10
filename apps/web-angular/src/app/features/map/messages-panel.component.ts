import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import type { ConversationSummary } from '@orenji/api-client';
import { MessengerComponent } from '../messages/messenger/messenger.component';
import { RealtimeStatusComponent } from '../messages/realtime-status/realtime-status.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';

/**
 * Right-hand Messages panel of the map page: the conversation list and threads (Phase 5), with a
 * live indicator and a link to the full `/messages` page. Signed-out visitors are invited to
 * sign in.
 */
@Component({
  selector: 'app-messages-panel',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    EmptyStateComponent,
    MessengerComponent,
    RealtimeStatusComponent,
  ],
  template: `
    <aside class="messages-panel" id="map-messages-panel" aria-labelledby="map-messages-title">
      <header class="messages-panel__header">
        <h2 id="map-messages-title" class="messages-panel__title">Messages</h2>
        @if (signedIn()) {
          <app-realtime-status />
          <a
            matIconButton
            routerLink="/messages"
            aria-label="Open messages in full page"
            matTooltip="Open full page"
          >
            <mat-icon>open_in_full</mat-icon>
          </a>
        }
        <button
          matIconButton
          type="button"
          aria-label="Close messages panel"
          (click)="closeRequested.emit()"
        >
          <mat-icon>close</mat-icon>
        </button>
      </header>
      @if (signedIn()) {
        <app-messenger
          class="messages-panel__body"
          [visible]="opened()"
          [incoming]="incoming()"
          (unreadChange)="unreadChange.emit($event)"
        />
      } @else {
        <app-empty-state
          icon="forum"
          title="Talk to collectors of your region"
          description="Message a collector from their profile or one of their binders, and keep every trade conversation in one place."
        >
          <a
            actions
            matButton="filled"
            routerLink="/auth/sign-in"
            [queryParams]="{ returnUrl: '/map' }"
          >
            Sign in to message
          </a>
        </app-empty-state>
      }
    </aside>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .messages-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .messages-panel__header {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: var(--spacing-1);
      padding: var(--spacing-2) var(--spacing-2) var(--spacing-2) var(--spacing-4);
      border-bottom: 1px solid var(--color-border);
    }
    .messages-panel__title {
      flex: 1 1 auto;
      font-size: var(--font-size-lg);
    }
    .messages-panel__body {
      flex: 1 1 auto;
      min-height: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesPanelComponent {
  readonly signedIn = input(false);
  /** The panel is open (a collapsed panel marks nothing as read). */
  readonly opened = input(true);
  /** A conversation just started from a collector preview. */
  readonly incoming = input<ConversationSummary | null>(null);
  readonly closeRequested = output<void>();
  /** Unread messages (the map's panel toggle shows a badge). */
  readonly unreadChange = output<number>();
}
