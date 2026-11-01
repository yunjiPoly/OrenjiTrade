import type { ConversationSummary, LastMessage, MessageResponse } from '@/src/api/types';

import { saleSentence } from './dealRules';

/** What an old offer reads as in a conversation and in the inbox (offers left the phone, ADR 0018). */
export const OFFER_UNAVAILABLE_TEXT = 'Offer (no longer available)';

/**
 * True for a message about an offer or a trade: an OFFER_LINK, or a SYSTEM message carrying the
 * offer (the API posts one on every offer and trade update). Offers left the phone (ADR 0018).
 */
export function isOfferMessage(message: Pick<MessageResponse, 'kind' | 'payload'>): boolean {
  return message.kind === 'OFFER_LINK' || (message.kind === 'SYSTEM' && !!message.payload?.offer);
}

/**
 * True for a conversation's last message about an old offer or trade: an OFFER_LINK, or a SYSTEM
 * message that is not a sale (stage R4 marks a sale's SYSTEM message with `systemTopic: 'SALE'`;
 * the offers and trades modules post the others).
 */
function isOfferLastMessage(last: Pick<LastMessage, 'kind' | 'systemTopic'>): boolean {
  return last.kind === 'OFFER_LINK' || (last.kind === 'SYSTEM' && last.systemTopic !== 'SALE');
}

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
 * a realtime update reads the same as the next `GET /conversations` (web: `message-text.ts`),
 * except an old offer or trade message, which reads "Offer (no longer available)" as
 * `listPreview` words the server's line.
 */
export function messagePreview(
  message: Pick<MessageResponse, 'kind' | 'body' | 'payload'>
): string {
  const text = (message.body ?? '').replace(/\s+/g, ' ').trim();
  if (isOfferMessage(message)) {
    return OFFER_UNAVAILABLE_TEXT;
  }
  switch (message.kind) {
    case 'CARD_LINK':
      return truncate(`Card: ${message.payload?.card?.name ?? ''}`);
    case 'BINDER_LINK':
      return truncate(`Binder: ${message.payload?.binder?.name ?? ''}`);
    case 'IMAGE':
      return text ? truncate(`Photo: ${text}`) : 'Photo';
    default:
      return truncate(text);
  }
}

/** A realtime message as the conversation's `lastMessage`. */
export function toLastMessage(message: MessageResponse): LastMessage {
  const sale = message.payload?.sale;
  return {
    id: message.id,
    preview: messagePreview(message),
    kind: message.kind,
    createdAt: message.createdAt,
    senderId: message.senderId ?? null,
    ...(message.kind === 'SYSTEM'
      ? { systemTopic: sale ? 'SALE' : message.payload?.offer ? 'OFFER' : null }
      : {}),
    ...(sale ? { sale } : {}),
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

/**
 * "You: …" for the caller's own last message. An old offer or trade message reads "Offer (no
 * longer available)" instead of the server's "Offer" or its sentence about the trade page.
 */
export function listPreview(conversation: ConversationSummary, selfId: string | null): string {
  const last = conversation.lastMessage;
  if (!last) {
    return 'No messages yet. Say hello!';
  }
  if (last.kind === 'SYSTEM' && last.systemTopic === 'SALE' && last.sale) {
    // Worded for the reader, as in the chat (stage R4).
    return saleSentence(last.sale, selfId, conversation.other.handle);
  }
  const preview = isOfferLastMessage(last) ? OFFER_UNAVAILABLE_TEXT : last.preview;
  const own = !!selfId && last.senderId === selfId;
  return own ? `You: ${preview}` : preview;
}

/** "3" / "99+" for unread badges. */
export function badgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/**
 * Unread chats that are not muted (the Messages tab badge; owner spec 2026-10-14, section 4:
 * "unread chats", stage R4).
 */
export function totalUnread(conversations: readonly ConversationSummary[]): number {
  return conversations.reduce(
    (sum, item) => sum + (!item.muted && item.unreadCount > 0 ? 1 : 0),
    0
  );
}
