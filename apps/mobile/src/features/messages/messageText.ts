import type { ConversationSummary, LastMessage, MessageResponse } from '@/src/api/types';

/** Longest conversation preview, like the server's `MessagePreviews.MAX`. */
export const PREVIEW_MAX = 140;
/** Longest message text (`SendMessageRequest.body`). */
export const MESSAGE_MAX_LENGTH = 4000;

function truncate(text: string): string {
  const chars = [...text];
  if (chars.length <= PREVIEW_MAX) {
    return text;
  }
  return `${chars
    .slice(0, PREVIEW_MAX - 1)
    .join('')
    .trimEnd()}…`;
}

/**
 * The one-line preview of a message in the inbox, worded like the server's `MessagePreviews` so
 * a realtime update reads the same as the next `GET /conversations` (web: `message-text.ts`).
 */
export function messagePreview(
  message: Pick<MessageResponse, 'kind' | 'body' | 'payload'>
): string {
  const text = (message.body ?? '').replace(/\s+/g, ' ').trim();
  switch (message.kind) {
    case 'CARD_LINK':
      return truncate(`Card: ${message.payload?.card?.name ?? ''}`);
    case 'BINDER_LINK':
      return truncate(`Binder: ${message.payload?.binder?.name ?? ''}`);
    case 'IMAGE':
      return text ? truncate(`Photo: ${text}`) : 'Photo';
    case 'OFFER_LINK':
      return 'Offer';
    default:
      return truncate(text);
  }
}

/** A realtime message as the conversation's `lastMessage`. */
export function toLastMessage(message: MessageResponse): LastMessage {
  return {
    id: message.id,
    preview: messagePreview(message),
    kind: message.kind,
    createdAt: message.createdAt,
    senderId: message.senderId ?? null,
  };
}

/** Time of the latest activity of a conversation (its last message, else its creation). */
export function activityOf(conversation: ConversationSummary): number {
  return Date.parse(conversation.lastMessage?.createdAt ?? conversation.createdAt) || 0;
}

/** Most recent activity first. */
export function sortByActivity(
  conversations: readonly ConversationSummary[]
): ConversationSummary[] {
  return [...conversations].sort((a, b) => activityOf(b) - activityOf(a));
}

/** "You: …" for the caller's own last message. */
export function listPreview(conversation: ConversationSummary, selfId: string | null): string {
  const last = conversation.lastMessage;
  if (!last) {
    return 'No messages yet. Say hello!';
  }
  const own = !!selfId && last.senderId === selfId;
  return own ? `You: ${last.preview}` : last.preview;
}

/** "3" / "99+" for unread badges. */
export function badgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** Unread messages across conversations that are not muted (the Messages tab badge). */
export function totalUnread(conversations: readonly ConversationSummary[]): number {
  return conversations.reduce((sum, item) => sum + (item.muted ? 0 : item.unreadCount), 0);
}
