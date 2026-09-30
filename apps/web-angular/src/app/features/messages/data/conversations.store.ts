import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ConversationParticipantOnlineStatusEnum,
  ConversationSummary,
  CursorPageConversationSummary,
  MessageResponse,
  MessagingService,
} from '@orenji/api-client';
import { Subscription, firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import { PresenceNotice, ReadReceiptNotice } from '../../../core/realtime/realtime-events';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { activityOf, sortByActivity, toLastMessage } from './message-text';

export type ConversationListStatus = 'loading' | 'ready' | 'error';

/** Conversations per page of `GET /conversations`. */
export const CONVERSATIONS_PAGE = 30;

/**
 * The caller's inbox (`GET /conversations`, most recent activity first, cursor pages) kept live
 * by the realtime channel: a new message moves its conversation to the top with its preview and,
 * unless the conversation is open on screen, one more unread message; the caller's own read
 * receipts (another tab) clear the count; partners' presence updates their online dot. A message
 * of a conversation the list does not hold yet (a collector wrote for the first time) and every
 * reconnection re-read the first page.
 *
 * Provided by the messenger component (map panel, `/messages`).
 */
@Injectable()
export class ConversationsStore {
  private readonly api = inject(MessagingService);
  private readonly realtime = inject(RealtimeService);
  private readonly session = inject(SessionService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly conversationsState = signal<ConversationSummary[]>([]);
  private readonly statusState = signal<ConversationListStatus>('loading');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly hasMoreState = signal(false);
  private readonly loadingMoreState = signal(false);
  private readonly moreFailedState = signal(false);
  private readonly activeIdState = signal<string | null>(null);
  private readonly visibleState = signal(true);
  /** The open conversation after it left the list (blocked from the thread): still shown. */
  private readonly detachedState = signal<ConversationSummary | null>(null);

  readonly conversations = this.conversationsState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly hasMore = this.hasMoreState.asReadonly();
  readonly loadingMore = this.loadingMoreState.asReadonly();
  /** The last older page failed (no automatic retry; the button retries). */
  readonly moreFailed = this.moreFailedState.asReadonly();
  /**
   * The open conversation (a `/messages/:id` link) is not loaded yet but may be on an older page:
   * the messenger keeps paging until it is found or the inbox ends.
   */
  readonly searchingActive = computed(
    () =>
      !!this.activeIdState() &&
      !this.active() &&
      this.statusState() === 'ready' &&
      this.hasMoreState() &&
      !this.moreFailedState(),
  );
  /** The conversation open in the thread view. */
  readonly activeId = this.activeIdState.asReadonly();
  readonly selfId = computed(() => this.session.me()?.id ?? null);
  readonly active = computed(() => {
    const id = this.activeIdState();
    const detached = this.detachedState();
    return (
      this.conversationsState().find((item) => item.id === id) ??
      (detached?.id === id ? detached : null)
    );
  });
  /** Unread messages across conversations that are not muted. */
  readonly totalUnread = computed(() =>
    this.conversationsState().reduce((sum, item) => sum + (item.muted ? 0 : item.unreadCount), 0),
  );

  private nextCursor: string | null = null;
  private loadSubscription: Subscription | null = null;
  private started = false;
  private refreshQueued = false;

  /** First load and realtime wiring; idempotent. */
  init(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.load();
    this.realtime.messages$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => this.applyMessage(message));
    this.realtime.receipts$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((receipt) => this.applyReceipt(receipt));
    this.realtime.presence$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((presence) => this.applyPresence(presence));
    this.realtime.resync$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.refresh());
  }

  /** (Re)loads the first page, showing the skeleton. */
  load(): void {
    this.loadSubscription?.unsubscribe();
    this.statusState.set('loading');
    this.errorState.set(null);
    this.moreFailedState.set(false);
    this.loadSubscription = this.api
      .listConversations({ limit: CONVERSATIONS_PAGE }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (page) => {
          this.replaceFirstPage(page);
          this.statusState.set('ready');
        },
        error: (error: unknown) => {
          this.errorState.set(toApiError(error));
          this.statusState.set('error');
        },
      });
  }

  /** Quietly re-reads the first page and merges it (missed pushes, new conversations). */
  async refresh(): Promise<void> {
    if (this.statusState() !== 'ready') {
      if (this.statusState() === 'error') {
        this.load();
      }
      return;
    }
    if (this.refreshQueued) {
      return;
    }
    this.refreshQueued = true;
    try {
      const page = await firstValueFrom(
        this.api.listConversations({ limit: CONVERSATIONS_PAGE }, 'body', false, {
          context: silentErrors(),
        }),
      );
      this.mergeFirstPage(page);
    } catch {
      // Keep what is shown; the next push or reconnection tries again.
    } finally {
      this.refreshQueued = false;
    }
  }

  loadMore(): void {
    if (!this.nextCursor || this.loadingMoreState()) {
      return;
    }
    this.loadingMoreState.set(true);
    this.moreFailedState.set(false);
    this.api
      .listConversations({ limit: CONVERSATIONS_PAGE, cursor: this.nextCursor }, 'body', false, {
        context: silentErrors(),
      })
      .subscribe({
        next: (page) => {
          const known = new Set(this.conversationsState().map((item) => item.id));
          const added = (page.items ?? []).filter((item) => !known.has(item.id));
          this.conversationsState.update((items) => [...items, ...added]);
          this.nextCursor = page.nextCursor ?? null;
          this.hasMoreState.set(!!page.hasMore && !!page.nextCursor);
          this.loadingMoreState.set(false);
        },
        error: () => {
          this.loadingMoreState.set(false);
          this.moreFailedState.set(true);
        },
      });
  }

  /** Opens a conversation (or closes the thread with `null`); its unread count is cleared. */
  open(id: string | null): void {
    if (id !== this.activeIdState()) {
      this.detachedState.set(null);
    }
    this.activeIdState.set(id);
    if (id && this.visibleState()) {
      this.patch(id, { unreadCount: 0 });
    }
  }

  /** Whether the open thread is on screen (the map panel can be collapsed). */
  setVisible(visible: boolean): void {
    this.visibleState.set(visible);
    const id = this.activeIdState();
    if (visible && id) {
      this.patch(id, { unreadCount: 0 });
    }
  }

  /** Adds or replaces a conversation (a conversation just started) and sorts the list. */
  upsert(conversation: ConversationSummary): void {
    if (this.detachedState()?.id === conversation.id) {
      this.detachedState.set(null);
    }
    this.conversationsState.update((items) =>
      sortByActivity([conversation, ...items.filter((item) => item.id !== conversation.id)]),
    );
  }

  /**
   * Drops a conversation (archived, hidden by a block). With `keepOpen`, the thread on screen stays
   * open until the collector leaves it.
   */
  remove(id: string, keepOpen = false): void {
    const removed = this.conversationsState().find((item) => item.id === id) ?? null;
    this.conversationsState.update((items) => items.filter((item) => item.id !== id));
    if (this.activeIdState() === id) {
      if (keepOpen && removed) {
        this.detachedState.set(removed);
      } else {
        this.activeIdState.set(null);
      }
    }
  }

  patch(id: string, changes: Partial<ConversationSummary>): void {
    this.conversationsState.update((items) =>
      items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }

  /** Mute / archive (`PATCH /conversations/{id}`); rejects with an {@link ApiError}. */
  async update(id: string, changes: { muted?: boolean; archived?: boolean }): Promise<void> {
    try {
      const updated = await firstValueFrom(
        this.api.updateConversation({ id, updateConversationRequest: changes }, 'body', false, {
          context: silentErrors(),
        }),
      );
      if (updated.archived) {
        this.remove(id);
      } else {
        this.upsert(updated);
      }
    } catch (error) {
      throw toApiError(error);
    }
  }

  applyMessage(message: MessageResponse): void {
    const conversation = this.conversationsState().find(
      (item) => item.id === message.conversationId,
    );
    if (!conversation) {
      void this.refresh();
      return;
    }
    if (conversation.lastMessage?.id === message.id) {
      return;
    }
    const fromOther = !!message.senderId && message.senderId !== this.selfId();
    const onScreen = this.activeIdState() === message.conversationId && this.visibleState();
    this.upsert({
      ...conversation,
      lastMessage: toLastMessage(message),
      archived: false,
      unreadCount: fromOther && !onScreen ? conversation.unreadCount + 1 : conversation.unreadCount,
    });
  }

  applyReceipt(receipt: ReadReceiptNotice): void {
    if (receipt.userId === this.selfId()) {
      this.patch(receipt.conversationId, { unreadCount: 0 });
    }
  }

  applyPresence(presence: PresenceNotice): void {
    this.conversationsState.update((items) =>
      items.map((item) =>
        item.other.id === presence.userId
          ? {
              ...item,
              other: {
                ...item.other,
                onlineStatus: presence.status as ConversationParticipantOnlineStatusEnum,
              },
            }
          : item,
      ),
    );
  }

  private replaceFirstPage(page: CursorPageConversationSummary): void {
    this.conversationsState.set(sortByActivity(page.items ?? []));
    this.nextCursor = page.nextCursor ?? null;
    this.hasMoreState.set(!!page.hasMore && !!page.nextCursor);
  }

  private mergeFirstPage(page: CursorPageConversationSummary): void {
    const fresh = page.items ?? [];
    const freshIds = new Set(fresh.map((item) => item.id));
    const active = this.activeIdState();
    const merged = fresh.map((item) =>
      item.id === active && this.visibleState() ? { ...item, unreadCount: 0 } : item,
    );
    // Older conversations beyond the first page stay as they were.
    const oldestFresh = fresh.length ? Math.min(...fresh.map(activityOf)) : Infinity;
    const kept = page.hasMore
      ? this.conversationsState().filter(
          (item) => !freshIds.has(item.id) && activityOf(item) < oldestFresh,
        )
      : [];
    this.conversationsState.set(sortByActivity([...merged, ...kept]));
    if (!this.nextCursor || !page.hasMore) {
      this.nextCursor = page.nextCursor ?? null;
      this.hasMoreState.set(!!page.hasMore && !!page.nextCursor);
    }
  }
}
