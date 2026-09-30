import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { ConversationSummary } from '@orenji/api-client';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { ConversationListComponent } from '../conversation-list/conversation-list.component';
import { ConversationsStore } from '../data/conversations.store';
import { ThreadViewComponent } from '../thread/thread-view.component';

/**
 * Conversation list + thread, shared by the map's Messages panel (one column: the list, or the
 * open thread with a back button) and the `/messages` page (two columns when `split`). Container
 * of {@link ConversationsStore}.
 */
@Component({
  selector: 'app-messenger',
  imports: [
    MatButtonModule,
    ConversationListComponent,
    EmptyStateComponent,
    SkeletonComponent,
    ThreadViewComponent,
  ],
  providers: [ConversationsStore],
  template: `
    <div class="messenger" [class.messenger--split]="split()">
      @if (split() || !activeId()) {
        <div class="messenger__list">
          <app-conversation-list
            [conversations]="store.conversations()"
            [status]="store.status()"
            [error]="store.error()"
            [activeId]="activeId()"
            [selfId]="store.selfId()"
            [hasMore]="store.hasMore()"
            [loadingMore]="store.loadingMore()"
            (selected)="select($event)"
            (retry)="store.load()"
            (loadMore)="store.loadMore()"
          />
        </div>
      }
      @if (active(); as conversation) {
        <app-thread-view
          class="messenger__thread"
          [conversation]="conversation"
          [visible]="visible()"
          [showBack]="!split()"
          (back)="select(null)"
        />
      } @else if (activeId()) {
        <div class="messenger__thread messenger__missing">
          @if (store.status() === 'loading' || store.searchingActive()) {
            <div class="messenger__pad" aria-busy="true">
              <app-skeleton variant="list" lines="3" />
            </div>
          } @else {
            <app-empty-state
              icon="speaker_notes_off"
              title="Conversation not found"
              description="It may have been archived or hidden because of a block."
            >
              <button actions matButton="filled" type="button" (click)="select(null)">
                All conversations
              </button>
            </app-empty-state>
          }
        </div>
      } @else if (split()) {
        <div class="messenger__thread messenger__missing">
          <app-empty-state
            icon="chat"
            title="Choose a conversation"
            description="Your private conversations with other collectors appear here."
          />
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .messenger {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
    }
    .messenger__list {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
    }
    .messenger__thread {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
    }
    .messenger__missing {
      justify-content: center;
    }
    .messenger__pad {
      padding: var(--spacing-4);
    }
    .messenger--split {
      flex-direction: row;
    }
    .messenger--split .messenger__list {
      flex: 0 0 340px;
      border-right: 1px solid var(--color-border);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessengerComponent {
  protected readonly store = inject(ConversationsStore);

  /** Two columns (list beside the thread). */
  readonly split = input(false);
  /** Whether the messenger is on screen (the map panel can be collapsed). */
  readonly visible = input(true);
  /** Conversation to open (the `/messages/:id` route). */
  readonly conversationId = input<string | null>(null);
  /** A conversation just started from a "Message" button: added to the list and opened. */
  readonly incoming = input<ConversationSummary | null>(null);
  /** The collector opened a conversation (`null`: back to the list). */
  readonly openedChange = output<string | null>();
  /** Unread messages across conversations that are not muted (badges around the messenger). */
  readonly unreadChange = output<number>();

  protected readonly activeId = this.store.activeId;
  protected readonly active = this.store.active;
  constructor() {
    this.store.init();
    effect(() => {
      const id = this.conversationId();
      untracked(() => this.store.open(id));
    });
    effect(() => {
      const conversation = this.incoming();
      if (conversation) {
        untracked(() => {
          this.store.upsert(conversation);
          this.store.open(conversation.id);
        });
      }
    });
    effect(() => {
      const visible = this.visible();
      untracked(() => this.store.setVisible(visible));
    });
    effect(() => {
      if (this.store.searchingActive() && !this.store.loadingMore()) {
        untracked(() => this.store.loadMore());
      }
    });
    effect(() => {
      const unread = this.store.totalUnread();
      untracked(() => this.unreadChange.emit(unread));
    });
  }

  protected select(id: string | null): void {
    this.store.open(id);
    this.openedChange.emit(id);
  }
}
