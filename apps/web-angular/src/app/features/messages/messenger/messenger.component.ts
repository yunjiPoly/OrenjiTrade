import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { ConversationSummary } from '@orenji/api-client';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { ConversationListComponent } from '../conversation-list/conversation-list.component';
import { ConversationsStore } from '../data/conversations.store';
import { ThreadViewComponent } from '../thread/thread-view.component';

/**
 * The inbox beside the chat (spec 10.1, board W18): at 960 px and wider the inbox column (340 at
 * lg, 300 at md, with the page's header projected on top as `[inboxHeader]`) beside the chat and
 * its deal panel; below 960 one pane per route, the phone's way: the inbox, or the open chat with a
 * back button. Esc in the chat gives the focus back to the inbox row. Container of
 * {@link ConversationsStore}.
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
          <ng-content select="[inboxHeader]" />
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
          (keydown.escape)="onEscape($event)"
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
              description="It may have been archived, or the collector can no longer receive messages."
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
      background: var(--color-background);
    }
    .messenger__thread {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }
    .messenger__missing {
      justify-content: center;
      background: var(--color-background);
    }
    .messenger__pad {
      padding: var(--spacing-4);
    }
    .messenger--split {
      flex-direction: row;
    }
    .messenger--split .messenger__list {
      flex: 0 0 340px;
      width: 340px;
      border-right: 1px solid var(--color-border);
    }
    @media (max-width: 1279.98px) {
      .messenger--split .messenger__list {
        flex-basis: 300px;
        width: 300px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessengerComponent {
  protected readonly store = inject(ConversationsStore);
  private readonly list = viewChild(ConversationListComponent);
  private readonly thread = viewChild(ThreadViewComponent);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  /** The chat on screen (`null`: the inbox, `undefined`: nothing yet). */
  private shown: string | null | undefined = undefined;

  /** Two columns (the inbox beside the chat). */
  readonly split = input(false);
  /** Whether the messenger is on screen. */
  readonly visible = input(true);
  /** Conversation to open (the `/messages/:id` route). */
  readonly conversationId = input<string | null>(null);
  /** A conversation just started from a "Message" button: added to the list and opened. */
  readonly incoming = input<ConversationSummary | null>(null);
  /** The collector opened a conversation (`null`: back to the list). */
  readonly openedChange = output<string | null>();
  /** Unread messages across conversations that are not muted (badges around the messenger). */
  readonly unreadChange = output<number>();
  /**
   * A chat opened from elsewhere on the page ("Message {h}" in a community room): once it is on
   * screen it takes the focus, when nothing else holds it (WF review A2).
   */
  readonly focusChat = input<string | null>(null);
  /** The chat of {@link focusChat} took the focus (or kept it elsewhere): the request is done. */
  readonly chatFocused = output<void>();

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
    // One pane per route below 960: the pane that held the focus leaves when a chat opens or Back
    // closes it. The focus goes to the chat's Back, or back to that chat's row (WC review A1).
    effect(() => {
      const shown = this.shownChat();
      const split = this.split();
      untracked(() => {
        const previous = this.shown;
        this.shown = shown;
        if (split || previous === shown) {
          return;
        }
        afterNextRender(
          () => {
            const active = this.document.activeElement;
            if (active && active !== this.document.body && active.isConnected) {
              return;
            }
            if (shown) {
              this.thread()?.focusStart();
            } else if (previous) {
              this.list()?.focusRow(previous);
            }
          },
          { injector: this.injector },
        );
      });
    });
  }

  private readonly focusRequest = effect(() => {
    const wanted = this.focusChat();
    const shown = this.shownChat();
    untracked(() => {
      if (!wanted || shown !== wanted) {
        return;
      }
      afterNextRender(
        () => {
          const active = this.document.activeElement;
          if (!active || active === this.document.body || !active.isConnected) {
            this.thread()?.focusStart();
          }
          this.chatFocused.emit();
        },
        { injector: this.injector },
      );
    });
  });

  /** The chat on screen, or `null` for the inbox. */
  private readonly shownChat = computed(() => this.active()?.id ?? null);

  protected select(id: string | null): void {
    this.store.open(id);
    this.openedChange.emit(id);
  }

  /** Esc in the chat (nothing else took it): the focus goes back to the inbox (spec 10.2). */
  protected onEscape(event: Event): void {
    if (event.defaultPrevented || !this.split()) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('[role="dialog"], .mat-mdc-menu-panel')) {
      return;
    }
    event.preventDefault();
    this.list()?.focusActive();
  }
}
