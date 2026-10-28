import { Injectable, signal } from '@angular/core';
import type { ConversationSummary } from '@orenji/api-client';

/**
 * Unread chats of the inbox, for the Messages badge (spec 4.6, the phone's `totalUnread`): each
 * chat with an unread message counts once, however many it holds; muted and archived chats never.
 */
export function inboxUnread(conversations: readonly ConversationSummary[]): number {
  return conversations.reduce(
    (sum, item) => sum + (!item.muted && !item.archived && item.unreadCount > 0 ? 1 : 0),
    0,
  );
}

/**
 * The count of unread chats behind the Messages badge of the rail and the tab bar (spec 4.6:
 * chats only, never notifications). The probe that reads it (`UnreadChatsProbeComponent`) is a
 * deferred chunk of the shell, so the messaging client stays out of the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class UnreadChats {
  private readonly countState = signal(0);
  readonly count = this.countState.asReadonly();

  set(count: number): void {
    this.countState.set(Math.max(0, count));
  }
}
