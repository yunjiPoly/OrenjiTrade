/**
 * Payloads of the realtime queues other than `/user/queue/messages` (which carries the generated
 * `MessageResponse`). They mirror the server's `messaging.domain.RealtimeNotices` records: STOMP
 * payloads are not part of the OpenAPI document, so the generated client has no type for them.
 */

/** `/user/queue/receipts`: `userId` read `conversationId` up to `lastReadMessageId`. */
export interface ReadReceiptNotice {
  conversationId: string;
  userId: string;
  lastReadMessageId: string;
  readAt: string;
}

/** `/user/queue/typing`: `userId` is typing in `conversationId`. */
export interface TypingNotice {
  conversationId: string;
  userId: string;
}

/** `/user/queue/presence`: a conversation partner came online or went offline. */
export interface PresenceNotice {
  userId: string;
  status: 'ONLINE' | 'OFFLINE' | 'HIDDEN';
}

/** STOMP destinations of the Phase 5 realtime contract. */
export const REALTIME_DESTINATIONS = {
  messages: '/user/queue/messages',
  receipts: '/user/queue/receipts',
  typing: '/user/queue/typing',
  presence: '/user/queue/presence',
  sendTyping: '/app/typing',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function hasStrings(value: unknown, keys: readonly string[]): value is Record<string, string> {
  return isRecord(value) && keys.every((key) => typeof value[key] === 'string');
}

export function isReadReceipt(value: unknown): value is ReadReceiptNotice {
  return hasStrings(value, ['conversationId', 'userId', 'lastReadMessageId']);
}

export function isTypingNotice(value: unknown): value is TypingNotice {
  return hasStrings(value, ['conversationId', 'userId']);
}

export function isPresenceNotice(value: unknown): value is PresenceNotice {
  return hasStrings(value, ['userId', 'status']);
}
