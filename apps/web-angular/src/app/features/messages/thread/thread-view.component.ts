import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { ConversationSummary } from '@orenji/api-client';
import { toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { BlockActionsService } from '../../../shared/messaging/block-actions.service';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { MessageComposerComponent } from '../composer/message-composer.component';
import { ConversationsStore } from '../data/conversations.store';
import { MessageDraft } from '../data/message-draft';
import { ThreadStore } from '../data/thread.store';
import { MessageListComponent } from './message-list.component';
import { ThreadHeaderComponent, ThreadMenuAction } from './thread-header.component';

/**
 * One conversation: header with the conversation menu, the message history and the composer.
 * Container of {@link ThreadStore}; talks to the surrounding {@link ConversationsStore} for mute,
 * archive and block.
 */
@Component({
  selector: 'app-thread-view',
  imports: [
    MatButtonModule,
    MatIconModule,
    EmptyStateComponent,
    ErrorStateComponent,
    MessageComposerComponent,
    MessageListComponent,
    SkeletonComponent,
    ThreadHeaderComponent,
  ],
  providers: [ThreadStore],
  template: `
    @let c = conversation();
    <section class="thread" [attr.aria-label]="'Conversation with ' + c.other.displayName">
      <app-thread-header
        [conversation]="c"
        [typing]="store.otherTyping()"
        [blocked]="blockedByMe()"
        [showBack]="showBack()"
        (back)="back.emit()"
        (action)="onAction($event)"
      />

      @if (blockedByMe()) {
        <div class="banner" role="status">
          <mat-icon aria-hidden="true">block</mat-icon>
          <span>
            You blocked {{ c.other.displayName }}. Neither of you can send messages and this
            conversation is hidden from your inbox.
          </span>
          <button matButton type="button" (click)="onAction('unblock')">Unblock</button>
        </div>
      } @else if (store.messagingBlocked()) {
        <div class="banner" role="status">
          <mat-icon aria-hidden="true">speaker_notes_off</mat-icon>
          <span>You can no longer message {{ c.other.displayName }}.</span>
        </div>
      }

      <div class="thread__body">
        @switch (store.status()) {
          @case ('loading') {
            <div class="thread__skeleton" aria-busy="true">
              <span class="visually-hidden">Loading messages</span>
              <app-skeleton width="55%" height="40px" />
              <app-skeleton class="thread__skeleton-own" width="45%" height="40px" />
              <app-skeleton width="62%" height="56px" />
              <app-skeleton class="thread__skeleton-own" width="38%" height="40px" />
            </div>
          }
          @case ('error') {
            <div class="thread__pad">
              <app-error-state
                title="Messages could not load"
                [message]="errorMessage()"
                [requestId]="store.error()?.requestId ?? null"
                (retry)="store.load()"
              />
            </div>
          }
          @case ('unavailable') {
            <app-empty-state
              icon="speaker_notes_off"
              title="This conversation is not available"
              description="It may be hidden because of a block, or the collector left OrenjiTrade."
            />
          }
          @default {
            @if (store.messages().length === 0) {
              <app-empty-state
                icon="waving_hand"
                [title]="'Say hello to ' + c.other.displayName"
                description="Ask about a card, share one from the catalog or one of your public binders."
              />
            } @else {
              <app-message-list
                class="thread__list"
                [messages]="store.messages()"
                [other]="c.other"
                [selfId]="store.selfId()"
                [hasOlder]="store.hasOlder()"
                [loadingOlder]="store.loadingOlder()"
                [typing]="store.otherTyping()"
                (loadOlder)="store.loadOlder()"
              />
            }
          }
        }
      </div>

      <app-message-composer
        [busy]="store.sending()"
        [disabled]="cannotSend()"
        [error]="store.sendError()"
        [placeholder]="composerPlaceholder()"
        (send)="onSend($event)"
        (typing)="store.userTyping()"
      />
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .thread {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
    }
    .thread__body {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      background: var(--color-background);
    }
    .thread__list {
      flex: 1 1 auto;
    }
    .thread__pad {
      padding: var(--spacing-4);
    }
    .thread__skeleton {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      padding: var(--spacing-4);
    }
    .thread__skeleton-own {
      align-self: flex-end;
    }
    .banner {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      padding: var(--spacing-2) var(--spacing-3);
      border-bottom: 1px solid var(--color-border);
      background: color-mix(in srgb, var(--color-warning) 14%, var(--color-surface));
      font-size: var(--font-size-sm);
    }
    .banner span {
      flex: 1 1 auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThreadViewComponent {
  protected readonly store = inject(ThreadStore);
  private readonly conversations = inject(ConversationsStore);
  private readonly blocks = inject(BlockActionsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly doc = inject(DOCUMENT);
  private readonly composer = viewChild(MessageComposerComponent);

  readonly conversation = input.required<ConversationSummary>();
  /** The thread is on screen (the map panel may be collapsed). */
  readonly visible = input(true);
  readonly showBack = input(true);
  readonly back = output<void>();

  /** The caller blocked the other collector from this thread. */
  protected readonly blockedByMe = signal(false);
  private readonly pageVisible = signal(this.doc.visibilityState !== 'hidden');
  protected readonly cannotSend = computed(
    () =>
      this.blockedByMe() || this.store.messagingBlocked() || this.store.status() === 'unavailable',
  );
  protected readonly composerPlaceholder = computed(() =>
    this.cannotSend()
      ? `You cannot message ${this.conversation().other.displayName}`
      : `Message ${this.conversation().other.displayName}`,
  );
  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });

  constructor() {
    effect(() => {
      const conversation = this.conversation();
      untracked(() => {
        if (this.store.conversation()?.id !== conversation.id) {
          this.blockedByMe.set(false);
        }
        this.store.open(conversation);
      });
    });
    effect(() => {
      const visible = this.visible() && this.pageVisible();
      untracked(() => this.store.setVisible(visible));
    });
    const onVisibility = () => this.pageVisible.set(this.doc.visibilityState !== 'hidden');
    this.doc.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() =>
      this.doc.removeEventListener('visibilitychange', onVisibility),
    );
  }

  protected async onSend(draft: MessageDraft): Promise<void> {
    if (await this.store.send(draft)) {
      this.composer()?.reset();
    }
  }

  protected async onAction(action: ThreadMenuAction): Promise<void> {
    const conversation = this.conversation();
    const target = { id: conversation.other.id, displayName: conversation.other.displayName };
    switch (action) {
      case 'mute':
      case 'unmute':
        await this.update(
          conversation,
          { muted: action === 'mute' },
          action === 'mute' ? 'Conversation muted.' : 'Conversation unmuted.',
        );
        break;
      case 'archive':
        if (
          await this.update(
            conversation,
            { archived: true },
            'Conversation archived. A new message brings it back.',
          )
        ) {
          this.back.emit();
        }
        break;
      case 'block':
        if (await this.blocks.block(target)) {
          this.blockedByMe.set(true);
          this.store.setMessagingBlocked(true);
          this.conversations.remove(conversation.id, true);
        }
        break;
      case 'unblock':
        if (await this.blocks.unblock(target)) {
          this.blockedByMe.set(false);
          this.store.setMessagingBlocked(false);
          this.conversations.upsert(this.conversation());
          this.store.load();
        }
        break;
    }
  }

  private async update(
    conversation: ConversationSummary,
    changes: { muted?: boolean; archived?: boolean },
    confirmation: string,
  ): Promise<boolean> {
    try {
      await this.conversations.update(conversation.id, changes);
      this.snackBar.open(confirmation, 'OK', { duration: 4000 });
      return true;
    } catch (error) {
      this.snackBar.open(friendlyMessage(toApiError(error)), 'OK', { duration: 6000 });
      return false;
    }
  }
}
