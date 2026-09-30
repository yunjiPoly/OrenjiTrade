import type { MessageResponse } from '@orenji/api-client';

/** Messages of one sender closer than this read as one group (one avatar, tight spacing). */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export interface DayItem {
  kind: 'day';
  key: string;
  label: string;
}

export interface MessageItem {
  kind: 'message';
  key: string;
  message: MessageResponse;
  own: boolean;
  /** First message of a run of the same sender (shows the avatar and a larger gap above). */
  firstOfGroup: boolean;
  /** Last message of a run (carries the time). */
  lastOfGroup: boolean;
  /** Delivery status under the caller's newest message: `Seen` once the other read it. */
  status: 'sent' | 'seen' | null;
}

export type ThreadItem = DayItem | MessageItem;

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** "Today", "Yesterday", "Monday, September 28" or "September 28, 2025". */
export function dayLabel(date: Date, now: Date = new Date(), locale = 'en'): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (days === 0) {
    return 'Today';
  }
  if (days === 1) {
    return 'Yesterday';
  }
  const options: Intl.DateTimeFormatOptions =
    date.getFullYear() === now.getFullYear()
      ? { weekday: 'long', month: 'long', day: 'numeric' }
      : { month: 'long', day: 'numeric', year: 'numeric' };
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/** Oldest first, without duplicates (a REST answer and its realtime echo share the id). */
export function mergeMessages(
  current: readonly MessageResponse[],
  incoming: readonly MessageResponse[],
): MessageResponse[] {
  const byId = new Map<string, MessageResponse>();
  for (const message of current) {
    byId.set(message.id, message);
  }
  for (const message of incoming) {
    const known = byId.get(message.id);
    // Keep a receipt already applied locally when a stale copy arrives.
    byId.set(
      message.id,
      known ? { ...message, readByOther: known.readByOther || message.readByOther } : message,
    );
  }
  return [...byId.values()].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/**
 * Marks the caller's messages up to `lastReadMessageId` (or, when it is not loaded, up to
 * `readAt`) as read by the other participant.
 */
export function applyReadReceipt(
  messages: readonly MessageResponse[],
  selfId: string,
  lastReadMessageId: string,
  readAt: string | null,
): MessageResponse[] {
  const target = messages.find((message) => message.id === lastReadMessageId);
  const limit = target ? Date.parse(target.createdAt) : readAt ? Date.parse(readAt) : Number.NaN;
  if (Number.isNaN(limit)) {
    return [...messages];
  }
  return messages.map((message) =>
    message.senderId === selfId && !message.readByOther && Date.parse(message.createdAt) <= limit
      ? { ...message, readByOther: true }
      : message,
  );
}

/** Day separators, sender groups and the delivery status of the caller's newest message. */
export function buildThreadItems(
  messages: readonly MessageResponse[],
  selfId: string | null,
  now: Date = new Date(),
): ThreadItem[] {
  const items: ThreadItem[] = [];
  const newestOwn = [...messages].reverse().find((message) => message.senderId === selfId);
  let previousDay = '';
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const at = new Date(message.createdAt);
    const key = dayKey(at);
    if (key !== previousDay) {
      items.push({ kind: 'day', key: `day-${key}`, label: dayLabel(at, now) });
      previousDay = key;
    }
    const previous = messages[i - 1];
    const next = messages[i + 1];
    const sameRun = (other: MessageResponse | undefined) =>
      !!other &&
      other.senderId === message.senderId &&
      other.kind !== 'SYSTEM' &&
      message.kind !== 'SYSTEM' &&
      dayKey(new Date(other.createdAt)) === key &&
      Math.abs(Date.parse(other.createdAt) - at.getTime()) <= GROUP_WINDOW_MS;
    const own = !!selfId && message.senderId === selfId;
    items.push({
      kind: 'message',
      key: message.id,
      message,
      own,
      firstOfGroup: !sameRun(previous),
      lastOfGroup: !sameRun(next),
      status: own && message === newestOwn ? (message.readByOther ? 'seen' : 'sent') : null,
    });
  }
  return items;
}
