import type { MessageResponse, NotificationResponse } from '@/src/api/types';

/**
 * Payloads of the realtime queues (port of the web's `core/realtime/realtime-events.ts`).
 * `/user/queue/messages` carries the generated `MessageResponse` and `/user/queue/notifications`
 * the generated `NotificationResponse`; the others mirror the server's
 * `messaging.domain.RealtimeNotices` records: STOMP payloads are not part of the OpenAPI document,
 * so the generated types have none for them.
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

/** STOMP destinations of the Phase 5 / Phase 6 realtime contract. */
export const REALTIME_DESTINATIONS = {
  messages: '/user/queue/messages',
  receipts: '/user/queue/receipts',
  typing: '/user/queue/typing',
  presence: '/user/queue/presence',
  /** Phase 6: every new in-app notification (payload = `NotificationResponse`). */
  notifications: '/user/queue/notifications',
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

export function isMessageResponse(value: unknown): value is MessageResponse {
  return hasStrings(value, ['id', 'conversationId', 'kind', 'createdAt']);
}

/** A pushed notification (`/user/queue/notifications`): the REST `NotificationResponse`. */
export function isNotificationResponse(value: unknown): value is NotificationResponse {
  return (
    hasStrings(value, ['id', 'type', 'title', 'body', 'createdAt']) &&
    isRecord((value as Record<string, unknown>)['data'])
  );
}
