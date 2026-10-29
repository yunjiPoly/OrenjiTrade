import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ConversationSummary,
  MessageResponse,
  MessagingService,
  UploadsService,
} from '@orenji/api-client';
import { Subscription, firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { SKIP_LIMIT_DIALOG, silentErrors } from '../../../core/http/http-context';
import { ReadReceiptNotice, TypingNotice } from '../../../core/realtime/realtime-events';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { MessageDraft, draftProblem, sendRequest } from './message-draft';
import { applyReadReceipt, mergeMessages } from './thread-items';

export type ThreadStatus = 'loading' | 'ready' | 'error' | 'unavailable';

/** Messages per page of `GET /conversations/{id}/messages`. */
export const MESSAGES_PAGE = 30;
/** How long "is typing" stays after the last typing notice. */
export const TYPING_VISIBLE_MS = 5_000;
/** At most one typing notice per this interval while the caller types. */
export const TYPING_THROTTLE_MS = 3_000;

/** Wording of send failures shown under the composer. */
export function sendErrorMessage(error: ApiError): string {
  switch (error.errorCode) {
    case 'PAYLOAD_TOO_LARGE':
      return 'This photo is larger than 8 MB. Choose a smaller one.';
    case 'UNSUPPORTED_MEDIA_TYPE':
      return 'Use a JPEG, PNG or WebP photo.';
    case 'RATE_LIMITED': {
      const seconds = error.problem?.retryAfterSeconds;
      return seconds
        ? `You are sending messages too quickly. Try again in ${seconds} seconds.`
        : 'You are sending messages too quickly. Wait a moment and try again.';
    }
    case 'VALIDATION_FAILED':
      return error.message || 'This message cannot be sent.';
    // The same words for every refusal: a block is never told apart (owner decision 2026-10-28).
    case 'MESSAGING_BLOCKED':
      return 'This collector cannot receive messages right now.';
    default:
      return friendlyMessage(error);
  }
}

/**
 * One conversation on screen: messages oldest → newest (pages of the newest first, older ones on
 * demand through the cursor), sending (text, card link, binder link, photo), read markers,
 * receipts and the typing indicator, kept live by the realtime channel.
 *
 * Provided by the thread view; {@link open} switches conversations.
 */
@Injectable()
export class ThreadStore {
  private readonly api = inject(MessagingService);
  private readonly uploads = inject(UploadsService);
  private readonly realtime = inject(RealtimeService);
  private readonly session = inject(SessionService);
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly conversationState = signal<ConversationSummary | null>(null);
  private readonly messagesState = signal<MessageResponse[]>([]);
  private readonly statusState = signal<ThreadStatus>('loading');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly hasOlderState = signal(false);
  private readonly loadingOlderState = signal(false);
  private readonly sendingState = signal(false);
  private readonly sendErrorState = signal<string | null>(null);
  private readonly blockedState = signal(false);
  private readonly typingState = signal(false);
  private readonly visibleState = signal(true);
  private readonly refreshedState = signal<ConversationSummary | null>(null);

  readonly conversation = this.conversationState.asReadonly();
  readonly messages = this.messagesState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly hasOlder = this.hasOlderState.asReadonly();
  readonly loadingOlder = this.loadingOlderState.asReadonly();
  readonly sending = this.sendingState.asReadonly();
  /** Why the last send failed (shown under the composer). */
  readonly sendError = this.sendErrorState.asReadonly();
  /** The server refused messages in this conversation (403 MESSAGING_BLOCKED). */
  readonly messagingBlocked = this.blockedState.asReadonly();
  /** The other participant is typing. */
  readonly otherTyping = this.typingState.asReadonly();
  readonly selfId = computed(() => this.session.me()?.id ?? null);
  /** The conversation as last read again ({@link refreshConversation}), for the inbox to follow. */
  readonly refreshed = this.refreshedState.asReadonly();

  private olderCursor: string | null = null;
  private loadSubscription: Subscription | null = null;
  private lastMarked: string | null = null;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTypingSent = 0;
  private started = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.loadSubscription?.unsubscribe();
      this.clearTypingTimer();
    });
  }

  /** Shows `conversation` (reloads only when the conversation changes). */
  open(conversation: ConversationSummary): void {
    this.wireRealtime();
    const previous = this.conversationState();
    this.conversationState.set(conversation);
    if (previous?.id === conversation.id) {
      return;
    }
    this.messagesState.set([]);
    this.olderCursor = null;
    this.hasOlderState.set(false);
    this.sendErrorState.set(null);
    this.blockedState.set(false);
    this.typingState.set(false);
    this.lastMarked = null;
    this.load();
  }

  /** Whether the thread is on screen (collapsed map panel, hidden tab: nothing is marked read). */
  setVisible(visible: boolean): void {
    this.visibleState.set(visible);
    if (visible) {
      this.markRead();
    }
  }

  load(): void {
    const conversation = this.conversationState();
    if (!conversation) {
      return;
    }
    this.loadSubscription?.unsubscribe();
    this.statusState.set('loading');
    this.errorState.set(null);
    this.loadSubscription = this.api
      .listMessages({ id: conversation.id, limit: MESSAGES_PAGE }, 'body', false, {
        context: silentErrors(),
      })
      .subscribe({
        next: (page) => {
          this.messagesState.set(mergeMessages([], page.items ?? []));
          this.olderCursor = page.nextCursor ?? null;
          this.hasOlderState.set(!!page.hasMore && !!page.nextCursor);
          this.statusState.set('ready');
          this.markRead();
        },
        error: (error: unknown) => {
          const apiError = toApiError(error);
          this.errorState.set(apiError);
          // 404: hidden by a block or no longer a participant.
          this.statusState.set(apiError.status === 404 ? 'unavailable' : 'error');
        },
      });
  }

  /** The previous page (older messages), for upward infinite scrolling. */
  async loadOlder(): Promise<void> {
    const conversation = this.conversationState();
    if (!conversation || !this.olderCursor || this.loadingOlderState()) {
      return;
    }
    this.loadingOlderState.set(true);
    try {
      const page = await firstValueFrom(
        this.api.listMessages(
          { id: conversation.id, limit: MESSAGES_PAGE, cursor: this.olderCursor },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      if (this.conversationState()?.id !== conversation.id) {
        return;
      }
      this.messagesState.update((messages) => mergeMessages(messages, page.items ?? []));
      this.olderCursor = page.nextCursor ?? null;
      this.hasOlderState.set(!!page.hasMore && !!page.nextCursor);
    } catch {
      // The sentinel stays; scrolling up again retries.
    } finally {
      this.loadingOlderState.set(false);
    }
  }

  /** Sends a draft; resolves `true` when the message was accepted (the composer clears). */
  async send(draft: MessageDraft): Promise<boolean> {
    const problem = await this.deliver(draft, true);
    return problem === null;
  }

  /**
   * Sends a message that is not the composer's draft (a quick reply, the address or e-Transfer
   * email typed in their dialog, a card or binder chosen in a picker): resolves the reason it was
   * not sent, or `null`. With `showError`, the reason also shows under the composer.
   */
  sendDirect(draft: MessageDraft, showError = false): Promise<string | null> {
    return this.deliver(draft, showError);
  }

  private async deliver(draft: MessageDraft, showError: boolean): Promise<string | null> {
    const conversation = this.conversationState();
    const problem = draftProblem(draft);
    if (!conversation) {
      return 'This conversation is not open.';
    }
    if (this.sendingState()) {
      return 'Wait for the last message to be sent.';
    }
    if (problem) {
      if (showError) {
        this.sendErrorState.set(problem);
      }
      return problem;
    }
    this.sendingState.set(true);
    if (showError) {
      this.sendErrorState.set(null);
    }
    try {
      let uploadId: string | undefined;
      if (draft.attachment?.kind === 'image') {
        const upload = await firstValueFrom(
          this.uploads.uploadImage(
            { file: draft.attachment.file, kind: 'MESSAGE' },
            'body',
            false,
            {
              context: silentErrors().set(SKIP_LIMIT_DIALOG, true),
            },
          ),
        );
        uploadId = upload.uploadId;
      }
      const message = await firstValueFrom(
        this.api.sendMessage(
          { id: conversation.id, sendMessageRequest: sendRequest(draft, uploadId) },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.applyMessage(message);
      if (message.payload?.item) {
        // Sharing one's own card pins it as the chat's subject (stage R4).
        void this.refreshConversation();
      }
      return null;
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.errorCode === 'MESSAGING_BLOCKED') {
        this.blockedState.set(true);
      }
      const reason = sendErrorMessage(apiError);
      if (showError) {
        this.sendErrorState.set(reason);
      }
      return reason;
    } finally {
      this.sendingState.set(false);
    }
  }

  /**
   * Reads the open conversation again (`GET /conversations/{id}`): its pinned card after a pin, a
   * sale or its undo. Quiet: what is shown stays on failure.
   */
  async refreshConversation(): Promise<ConversationSummary | null> {
    const conversation = this.conversationState();
    if (!conversation) {
      return null;
    }
    try {
      const fresh = await firstValueFrom(
        this.api.getConversation({ id: conversation.id }, 'body', false, {
          context: silentErrors(),
        }),
      );
      if (this.conversationState()?.id !== fresh.id) {
        return null;
      }
      this.conversationState.set({
        ...fresh,
        unreadCount: this.conversationState()?.unreadCount ?? 0,
      });
      this.refreshedState.set(fresh);
      return fresh;
    } catch {
      return null;
    }
  }

  /** Mute or archive the open conversation (the chat drawer, which has no inbox). */
  async updateConversation(changes: { muted?: boolean; archived?: boolean }): Promise<void> {
    const conversation = this.conversationState();
    if (!conversation) {
      return;
    }
    try {
      const updated = await firstValueFrom(
        this.api.updateConversation(
          { id: conversation.id, updateConversationRequest: changes },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.conversationState.set(updated);
      this.refreshedState.set(updated);
    } catch (error) {
      throw toApiError(error);
    }
  }

  /** The seller undid a sale: its note leaves the thread at once (the push confirms it). */
  dropSale(saleId: string): void {
    this.messagesState.update((messages) =>
      messages.filter((message) => message.payload?.sale?.saleId !== saleId),
    );
  }

  dismissSendError(): void {
    this.sendErrorState.set(null);
  }

  /** The caller is typing: at most one `/app/typing` notice every few seconds. */
  userTyping(): void {
    const conversation = this.conversationState();
    const now = Date.now();
    if (!conversation || now - this.lastTypingSent < TYPING_THROTTLE_MS) {
      return;
    }
    this.lastTypingSent = now;
    this.realtime.sendTyping(conversation.id);
  }

  /** After a local block/unblock: reflect it without waiting for the server. */
  setMessagingBlocked(blocked: boolean): void {
    this.blockedState.set(blocked);
    if (!blocked) {
      this.sendErrorState.set(null);
    }
  }

  /** Moves the read marker to the newest message when something unread is on screen. */
  markRead(): void {
    const conversation = this.conversationState();
    const newest = this.messagesState().at(-1);
    if (
      !conversation ||
      !newest ||
      this.statusState() !== 'ready' ||
      !this.visibleState() ||
      this.doc.visibilityState === 'hidden' ||
      newest.id === this.lastMarked
    ) {
      return;
    }
    const fromOther = !!newest.senderId && newest.senderId !== this.selfId();
    if (!fromOther && conversation.unreadCount === 0) {
      return;
    }
    this.lastMarked = newest.id;
    this.conversationState.set({ ...conversation, unreadCount: 0 });
    this.api
      .markConversationRead(
        { id: conversation.id, markConversationReadRequest: { lastReadMessageId: newest.id } },
        'body',
        false,
        { context: silentErrors() },
      )
      .subscribe({ error: () => (this.lastMarked = null) });
  }

  applyMessage(message: MessageResponse): void {
    if (message.conversationId !== this.conversationState()?.id) {
      return;
    }
    this.messagesState.update((messages) => mergeMessages(messages, [message]));
    if (message.payload?.sale) {
      // A sale or its undo: the pinned card's "Sold" and copies change (stage R4).
      void this.refreshConversation();
    }
    if (message.senderId && message.senderId !== this.selfId()) {
      this.typingState.set(false);
      this.clearTypingTimer();
      this.markRead();
    }
  }

  applyReceipt(receipt: ReadReceiptNotice): void {
    const self = this.selfId();
    if (receipt.conversationId !== this.conversationState()?.id || !self) {
      return;
    }
    if (receipt.userId !== self) {
      this.messagesState.update((messages) =>
        applyReadReceipt(messages, self, receipt.lastReadMessageId, receipt.readAt ?? null),
      );
    }
  }

  applyTyping(notice: TypingNotice): void {
    if (notice.conversationId !== this.conversationState()?.id || notice.userId === this.selfId()) {
      return;
    }
    this.typingState.set(true);
    this.clearTypingTimer();
    this.typingTimer = setTimeout(() => this.typingState.set(false), TYPING_VISIBLE_MS);
  }

  /** After a reconnection: fetch the newest page and merge what was missed. */
  resync(): void {
    const conversation = this.conversationState();
    if (!conversation || this.statusState() !== 'ready') {
      return;
    }
    this.api
      .listMessages({ id: conversation.id, limit: MESSAGES_PAGE }, 'body', false, {
        context: silentErrors(),
      })
      .subscribe({
        next: (page) => {
          if (this.conversationState()?.id !== conversation.id) {
            return;
          }
          this.messagesState.update((messages) => mergeMessages(messages, page.items ?? []));
          this.markRead();
        },
        error: () => undefined,
      });
  }

  private wireRealtime(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.realtime.messages$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => this.applyMessage(message));
    this.realtime.receipts$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((receipt) => this.applyReceipt(receipt));
    this.realtime.typing$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((notice) => this.applyTyping(notice));
    this.realtime.resync$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.resync());
    this.realtime.conversations$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((notice) => {
      if (notice.conversationId === this.conversationState()?.id) {
        void this.refreshConversation();
      }
    });
  }

  private clearTypingTimer(): void {
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
  }
}
