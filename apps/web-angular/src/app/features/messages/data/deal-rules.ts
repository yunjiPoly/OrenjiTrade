import type {
  ConversationParticipant,
  ConversationSubject,
  ConversationSummary,
  MessageResponse,
  SaleNotice,
} from '@orenji/api-client';
import { INBOX_COPY, MARK_SOLD_COPY, PINNED_COPY, QUICK_REPLIES, SALE_COPY } from './chat-copy';

/**
 * The pure rules of a chat about a card on the web (spec 10, boards W18 to W21), the phone's
 * (`apps/mobile/src/features/messages/dealRules.ts`) where the web shares them: which side the
 * reader is on, the quick replies, the pinned bar's line and end, the status line, the sale note
 * worded per side and its undo window, the Mark as sold sentence, the tracking number's rule and
 * the inbox's times. Unit-tested; the components only draw them.
 */

/** The reader's side of a chat about a card: its owner sells, the other collector buys. */
export type DealSide = 'buying' | 'selling' | 'none';

/** A sale can be undone for this long after it was marked (the API's 10 minutes). */
export const SALE_UNDO_MS = 10 * 60 * 1000;

export function chatSide(
  subject: Pick<ConversationSubject, 'ownerId'> | null | undefined,
  selfId: string | null | undefined,
): DealSide {
  if (!subject || !selfId) {
    return 'none';
  }
  return subject.ownerId === selfId ? 'selling' : 'buying';
}

/** A sale's SYSTEM message the seller undid (the API pushes its copy so clients drop it). */
export function isUndoneSale(message: Pick<MessageResponse, 'payload'>): boolean {
  return message.payload?.sale?.undone === true;
}

function hasSent(messages: readonly MessageResponse[], senderId: string | null | undefined) {
  return !!senderId && messages.some((message) => message.senderId === senderId);
}

/**
 * The quick replies of the reader's side (the phone's rule, owner decision of 2026-10-28):
 * buying, until the seller has replied, "Is it still available?" and "How much with shipping?",
 * then "e-Transfer sent!", "Tracking number?" and "Thanks!"; selling, until the reader has
 * written, "Yes, still available" and "Send me your address", then "Got your e-Transfer",
 * "Shipped!" and "Thanks for buying!". Once the chat's card is marked sold both sides have the
 * later replies; the undo brings the first ones back to whoever has not written. A reply the
 * reader already sent in this chat is hidden. A chat without a card has none.
 */
export function quickReplies(
  side: DealSide,
  messages: readonly MessageResponse[],
  selfId: string | null | undefined,
  otherId: string | null | undefined,
  sold = false,
): string[] {
  let replies: readonly string[];
  switch (side) {
    case 'buying':
      replies =
        sold || hasSent(messages, otherId) ? QUICK_REPLIES.buyingAfter : QUICK_REPLIES.buyingFirst;
      break;
    case 'selling':
      replies =
        sold || hasSent(messages, selfId) ? QUICK_REPLIES.sellingAfter : QUICK_REPLIES.sellingFirst;
      break;
    default:
      return [];
  }
  const sent = new Set(
    messages
      .filter((message) => !!selfId && message.senderId === selfId)
      .map((message) => (message.body ?? '').trim()),
  );
  return replies.filter((reply) => !sent.has(reply));
}

/**
 * The pinned bar's second line: a card "{code} · {rarity}", for its owner "{code} · {rarity} ·
 * your card"; a deck core "Deck core", "Deck core · your deck core" for its owner. The price sits
 * at the end of the bar.
 */
export function pinnedLine(subject: ConversationSubject, side: DealSide): string {
  const parts: string[] = [];
  if (subject.kind === 'DECK_CORE') {
    parts.push(PINNED_COPY.deckCore);
  } else {
    if (subject.printingCode) {
      parts.push(subject.printingCode);
    }
    if (subject.rarity) {
      parts.push(subject.rarity);
    }
  }
  if (side === 'selling') {
    parts.push(subject.kind === 'DECK_CORE' ? PINNED_COPY.yourDeckCore : PINNED_COPY.yourCard);
  }
  return parts.join(' · ');
}

/**
 * The end of the pinned bar: the seller's "Mark as sold" (the only entry, spec 10.3), "Sold" after
 * a sale, "No longer listed" for a buyer once it is off offer, or nothing more than the price.
 */
export type PinnedEnd = 'markAsSold' | 'sold' | 'unlisted' | 'none';

export function pinnedEnd(subject: ConversationSubject, side: DealSide): PinnedEnd {
  if (subject.sold) {
    return 'sold';
  }
  if (side === 'selling') {
    // A card the seller no longer holds has nothing to mark; a deck core sold elsewhere answers
    // "nothing left" when marked.
    return subject.kind === 'DECK_CORE' || (subject.copies ?? 0) > 0 ? 'markAsSold' : 'none';
  }
  return subject.listed ? 'none' : 'unlisted';
}

/** The price shown on the pinned bar and the deal panel: the seller's typed text, or none. */
export function subjectPrice(subject: ConversationSubject): string | null {
  return subject.askingPriceText?.trim() || null;
}

/** The state or province of a collector (the country for a whole-country place), if shown. */
export function provinceOf(other: Pick<ConversationParticipant, 'place'>): string | null {
  const place = other.place;
  if (!place) {
    return null;
  }
  return place.subdivisionCode === place.countryCode ? place.countryName : place.subdivisionName;
}

/**
 * The status line under the handle: "Online · Quebec", "Quebec", "Online"; "typing…" while they
 * type, "Blocked" once the reader blocked them; never a city (ADR 0017).
 */
export function chatStatusLine(
  conversation: Pick<ConversationSummary, 'other' | 'muted'>,
  typing: boolean,
  blocked: boolean,
): string {
  if (blocked) {
    return 'Blocked';
  }
  if (typing) {
    return 'typing…';
  }
  const parts: string[] = [];
  if (conversation.other.onlineStatus === 'ONLINE') {
    parts.push('Online');
  }
  const province = provinceOf(conversation.other);
  if (province) {
    parts.push(province);
  }
  if (conversation.muted) {
    parts.push('Muted');
  }
  return parts.join(' · ');
}

/** The sale note worded for the reader. */
export function saleSentence(
  sale: Pick<SaleNotice, 'sellerId' | 'name'>,
  selfId: string | null | undefined,
  otherHandle: string,
): string {
  return sale.sellerId === selfId
    ? SALE_COPY.seller(sale.name, otherHandle)
    : SALE_COPY.buyer(otherHandle, sale.name);
}

/**
 * Whether the reader may still undo a sale note: the seller, the sale not undone, within 10
 * minutes of the note (the server checks again, and refuses once it was rated).
 */
export function canUndoSale(
  message: Pick<MessageResponse, 'createdAt' | 'payload'>,
  selfId: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const sale = message.payload?.sale;
  if (!sale || sale.undone || !selfId || sale.sellerId !== selfId) {
    return false;
  }
  const at = Date.parse(message.createdAt);
  return Number.isFinite(at) && now < at + SALE_UNDO_MS;
}

/** Milliseconds until a sale note's Undo goes, or 0. */
export function undoLeftMs(
  message: Pick<MessageResponse, 'createdAt'>,
  now: number = Date.now(),
): number {
  const at = Date.parse(message.createdAt);
  return Number.isFinite(at) ? Math.max(0, at + SALE_UNDO_MS - now) : 0;
}

/** The newest sale note of a chat that is not undone (the deal panel's "Sold …" line). */
export function latestSale(messages: readonly MessageResponse[]): MessageResponse | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const sale = messages[i].payload?.sale;
    if (messages[i].kind === 'SYSTEM' && sale && !sale.undone) {
      return messages[i];
    }
  }
  return null;
}

/**
 * The live sentence of Mark as sold: the last copy leaves the inventory, or "You keep {n}
 * copies"; a deck core leaves Search with its cards.
 */
export function markSoldSentence(
  subject: Pick<ConversationSubject, 'kind' | 'copies'>,
  quantity: number,
  buyer: string,
): string {
  if (subject.kind === 'DECK_CORE') {
    return MARK_SOLD_COPY.deckCore(buyer);
  }
  const left = Math.max(0, (subject.copies ?? 1) - quantity);
  return left === 0 ? MARK_SOLD_COPY.lastCopy(buyer) : MARK_SOLD_COPY.copiesLeft(buyer, left);
}

/** Longest tracking number (the API's `sale.tracking_number`). */
export const TRACKING_MAX = 64;

const TRACKING = /^[A-Za-z0-9][A-Za-z0-9 .-]*$/;

/** The tracking number as sent: trimmed, inner spaces collapsed; empty when blank. */
export function cleanTracking(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Why a tracking number cannot be sent, or `null` (the API's rule). */
export function trackingProblem(raw: string): string | null {
  const tracking = cleanTracking(raw);
  if (!tracking) {
    return null;
  }
  if (tracking.length > TRACKING_MAX) {
    return MARK_SOLD_COPY.trackingTooLong;
  }
  return TRACKING.test(tracking) ? null : MARK_SOLD_COPY.trackingInvalid;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const WEEKDAY = new Intl.DateTimeFormat('en', { weekday: 'short' });
const MONTH_DAY = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });

/** "Oct 20" (the deal panel's "Sold Oct 20"). */
export function monthDay(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : MONTH_DAY.format(at);
}

/**
 * The time of an inbox row: "now", "2 min", "1 h" today, "Yesterday", the weekday within the
 * week ("Mon"), else "Sep 28" (the phone's).
 */
export function inboxTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return '';
  }
  const elapsed = now.getTime() - at.getTime();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (at.getTime() >= startOfToday) {
    if (elapsed < MINUTE) {
      return INBOX_COPY.now;
    }
    if (elapsed < HOUR) {
      return INBOX_COPY.minutes(Math.floor(elapsed / MINUTE));
    }
    return INBOX_COPY.hours(Math.floor(elapsed / HOUR));
  }
  const day = 24 * HOUR;
  if (at.getTime() >= startOfToday - day) {
    return INBOX_COPY.yesterday;
  }
  if (at.getTime() >= startOfToday - 6 * day) {
    return WEEKDAY.format(at);
  }
  return MONTH_DAY.format(at);
}

/** A simple email shape for "Send my e-Transfer email" (the field is typed each time). */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(text: string): boolean {
  return EMAIL.test(text.trim());
}

/** Longest address the dialog takes (a message holds 4,000 characters). */
export const ADDRESS_MAX = 300;
/** Longest e-Transfer email. */
export const EMAIL_MAX = 254;

/**
 * Filters the inbox: "Unread" keeps chats with unread messages; the search matches the handle, the
 * name, the last message and the chat's card or deck core, ignoring case.
 */
export function filterChats(
  conversations: readonly ConversationSummary[],
  only: 'all' | 'unread',
  query: string,
): ConversationSummary[] {
  const q = query.trim().toLowerCase();
  return conversations.filter((c) => {
    if (only === 'unread' && c.unreadCount === 0) {
      return false;
    }
    if (!q) {
      return true;
    }
    const text = [c.other.handle, c.other.displayName, c.lastMessage?.preview, c.subject?.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return text.includes(q);
  });
}
