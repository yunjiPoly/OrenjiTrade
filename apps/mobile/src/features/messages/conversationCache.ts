import type { InfiniteData } from '@tanstack/react-query';

import type {
  ConversationPage,
  ConversationSummary,
  MessagePage,
  MessageResponse,
} from '@/src/api/types';
import type { PresenceNotice, ReadReceiptNotice } from '@/src/realtime/realtimeEvents';

import { sortByActivity, toLastMessage } from './messageText';
import { applyReadReceipt, mergeMessages } from './threadItems';

/**
 * Pure updates of the cached inbox (`GET /conversations` pages) and threads
 * (`GET /conversations/{id}/messages` pages, newest first) for sends, realtime pushes, receipts,
 * presence, mute / archive and blocks: the mobile equivalent of the web's `ConversationsStore`
 * and `ThreadStore` state changes. Every function returns new objects (react-query cache).
 */
export type InboxData = InfiniteData<ConversationPage>;
export type ThreadData = InfiniteData<MessagePage>;

/** Every conversation of the loaded inbox pages, most recent activity first, without duplicates. */
export function inboxConversations(data: InboxData | undefined): ConversationSummary[] {
  const byId = new Map<string, ConversationSummary>();
  for (const page of data?.pages ?? []) {
    for (const item of page.items ?? []) {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
      }
    }
  }
  return sortByActivity([...byId.values()]);
}

export function findConversation(
  data: InboxData | undefined,
  id: string
): ConversationSummary | null {
  for (const page of data?.pages ?? []) {
    const found = page.items?.find((item) => item.id === id);
    if (found) {
      return found;
    }
  }
  return null;
}

function mapItems(
  data: InboxData,
  change: (items: ConversationSummary[]) => ConversationSummary[]
): InboxData {
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, items: change(page.items ?? []) })),
  };
}

/** Applies `changes` to one conversation wherever it is. */
export function patchConversation(
  data: InboxData | undefined,
  id: string,
  changes: Partial<ConversationSummary>
): InboxData | undefined {
  if (!data) {
    return data;
  }
  return mapItems(data, (items) =>
    items.map((item) => (item.id === id ? { ...item, ...changes } : item))
  );
}

/** Drops a conversation (archived, hidden by a block). */
export function removeConversation(data: InboxData | undefined, id: string): InboxData | undefined {
  if (!data) {
    return data;
  }
  return mapItems(data, (items) => items.filter((item) => item.id !== id));
}

/** Adds or replaces a conversation and moves it to the top of the first page. */
export function upsertConversation(
  data: InboxData | undefined,
  conversation: ConversationSummary
): InboxData | undefined {
  if (!data || data.pages.length === 0) {
    return data;
  }
  const without = mapItems(data, (items) => items.filter((item) => item.id !== conversation.id));
  const [first, ...rest] = without.pages;
  if (!first) {
    return data;
  }
  return {
    ...without,
    pages: [{ ...first, items: sortByActivity([conversation, ...(first.items ?? [])]) }, ...rest],
  };
}

/**
 * A new message (sent here, or pushed): its conversation moves to the top with the new preview,
 * un-archived, and one more unread message when it comes from the other collector and the thread
 * is not on screen. `found` is false when the inbox does not hold the conversation yet (a
 * collector wrote for the first time): the caller re-reads the inbox.
 */
export function applyMessageToInbox(
  data: InboxData | undefined,
  message: MessageResponse,
  selfId: string | null,
  onScreen: boolean
): { data: InboxData | undefined; found: boolean } {
  const conversation = findConversation(data, message.conversationId);
  if (!conversation) {
    return { data, found: false };
  }
  if (conversation.lastMessage?.id === message.id) {
    return { data, found: true };
  }
  const fromOther = !!message.senderId && message.senderId !== selfId;
  return {
    found: true,
    data: upsertConversation(data, {
      ...conversation,
      lastMessage: toLastMessage(message),
      archived: false,
      unreadCount: fromOther && !onScreen ? conversation.unreadCount + 1 : conversation.unreadCount,
    }),
  };
}

/** The caller read a conversation (here or on another device): its unread count is cleared. */
export function applyOwnReceipt(
  data: InboxData | undefined,
  receipt: Pick<ReadReceiptNotice, 'conversationId'>
): InboxData | undefined {
  return patchConversation(data, receipt.conversationId, { unreadCount: 0 });
}

/** A partner came online or went offline. */
export function applyPresence(
  data: InboxData | undefined,
  presence: PresenceNotice
): InboxData | undefined {
  if (!data) {
    return data;
  }
  return mapItems(data, (items) =>
    items.map((item) =>
      item.other.id === presence.userId
        ? { ...item, other: { ...item.other, onlineStatus: presence.status } }
        : item
    )
  );
}

/** Every loaded message of a thread, oldest first, without duplicates. */
export function threadMessages(data: ThreadData | undefined): MessageResponse[] {
  return mergeMessages(
    [],
    (data?.pages ?? []).flatMap((page) => page.items ?? [])
  );
}

/**
 * Puts a message into the newest page of a thread (a send or a push), replacing a copy already
 * loaded (a REST answer and its realtime echo share the id; a receipt applied locally is kept).
 */
export function upsertThreadMessage(
  data: ThreadData | undefined,
  message: MessageResponse
): ThreadData | undefined {
  if (!data || data.pages.length === 0) {
    return data;
  }
  let replaced = false;
  const pages = data.pages.map((page) => ({
    ...page,
    items: (page.items ?? []).map((item) => {
      if (item.id !== message.id) {
        return item;
      }
      replaced = true;
      return { ...message, readByOther: item.readByOther || message.readByOther };
    }),
  }));
  if (replaced) {
    return { ...data, pages };
  }
  const [first, ...rest] = pages;
  if (!first) {
    return data;
  }
  return { ...data, pages: [{ ...first, items: [message, ...(first.items ?? [])] }, ...rest] };
}

/** The other collector read the thread up to a message: the caller's messages become "Seen". */
export function applyReceiptToThread(
  data: ThreadData | undefined,
  selfId: string,
  receipt: Pick<ReadReceiptNotice, 'lastReadMessageId' | 'readAt'>
): ThreadData | undefined {
  if (!data) {
    return data;
  }
  const all = threadMessages(data);
  const updated = new Map(
    applyReadReceipt(all, selfId, receipt.lastReadMessageId, receipt.readAt ?? null).map(
      (message) => [message.id, message]
    )
  );
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: (page.items ?? []).map((item) => updated.get(item.id) ?? item),
    })),
  };
}
