import type { ConversationSummary, LastMessage, MessageResponse } from '@orenji/api-client';
import { saleSentence } from './deal-rules';

/** What an old offer reads as in a chat and in the inbox (offers left the web, decision 2). */
export const OFFER_UNAVAILABLE_TEXT = 'Offer (no longer available)';

/** A message about an offer or a trade: an OFFER_LINK, or a SYSTEM message carrying the offer. */
export function isOfferMessage(message: Pick<MessageResponse, 'kind' | 'payload'>): boolean {
  return message.kind === 'OFFER_LINK' || (message.kind === 'SYSTEM' && !!message.payload?.offer);
}

/** A last message about an old offer or trade (a SYSTEM message that is not a sale). */
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
 * The one-line preview of a message in the conversation list, worded like the server's
 * `MessagePreviews` so a realtime update reads the same as the next `GET /conversations`.
 */
export function messagePreview(
  message: Pick<MessageResponse, 'kind' | 'body' | 'payload'>,
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
    kind: message.kind as string as LastMessage['kind'],
    createdAt: message.createdAt,
    senderId: message.senderId ?? null,
    ...(message.kind === 'SYSTEM'
      ? {
          systemTopic: (sale ? 'SALE' : message.payload?.offer ? 'OFFER' : null) as
            | LastMessage['systemTopic']
            | null,
        }
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
  conversations: readonly ConversationSummary[],
): ConversationSummary[] {
  return [...conversations].sort((a, b) => activityOf(b) - activityOf(a));
}

/**
 * "You: …" for the caller's own last message; a sale worded for the reader, as in the chat; an
 * old offer or trade message as "Offer (no longer available)".
 */
export function listPreview(conversation: ConversationSummary, selfId: string | null): string {
  const last = conversation.lastMessage;
  if (!last) {
    return 'No messages yet. Say hello!';
  }
  if (last.kind === 'SYSTEM' && last.systemTopic === 'SALE' && last.sale) {
    return saleSentence(last.sale, selfId, conversation.other.handle);
  }
  const preview = isOfferLastMessage(last) ? OFFER_UNAVAILABLE_TEXT : last.preview;
  const own = !!selfId && last.senderId === selfId;
  return own ? `You: ${preview}` : preview;
}
