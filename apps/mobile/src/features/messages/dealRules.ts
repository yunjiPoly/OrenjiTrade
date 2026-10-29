import type {
  ConversationParticipant,
  ConversationSubject,
  ConversationSummary,
  MessageResponse,
  SaleNotice,
} from '@/src/api/types';
import { dealSideOf, type DealSide } from '@/src/features/safety/chatSafetyTips';

import {
  CHAT_COPY,
  INBOX_COPY,
  MARK_SOLD_COPY,
  PINNED_COPY,
  QUICK_REPLIES,
  SALE_MESSAGE_COPY,
} from './chatCopy';

/**
 * The pure rules of a chat about a card (owner spec 2026-10-14, section 10, stage R4): which side
 * the reader is on, the quick replies, the "+" sheet's first rows, the pinned bar's line, the
 * status line, the sale message worded per side, the Mark as sold sentence and the inbox's times.
 * Unit-tested; the screens only draw them.
 */

export type { DealSide };

/** The reader's side of the chat: the subject's owner sells, the other collector buys. */
export function chatSide(
  subject: Pick<ConversationSubject, 'ownerId'> | null | undefined,
  selfId: string | null | undefined
): DealSide {
  return dealSideOf(subject?.ownerId ?? null, selfId);
}

/** Whether a message is a sale's SYSTEM message the seller undid (the phones drop it). */
export function isUndoneSale(message: Pick<MessageResponse, 'payload'>): boolean {
  return message.payload?.sale?.undone === true;
}

/** Whether a collector sent a message of their own (a SYSTEM message has no sender). */
function hasSent(messages: readonly MessageResponse[], senderId: string | null | undefined) {
  return !!senderId && messages.some((message) => message.senderId === senderId);
}

/**
 * The quick replies of the reader's side, in one sideways row (spec section 10): buying, until the
 * seller has replied, "Is it still available?" and "How much with shipping?", then "e-Transfer
 * sent!", "Tracking number?" and "Thanks!"; selling, until the reader has written, "Yes, still
 * available" and "Send me your address", then "Got your e-Transfer", "Shipped!" and "Thanks for
 * buying!". Once the chat's card is marked sold (`sold`, the subject's own flag: a sale not undone)
 * both sides have the "after" replies, whether or not anyone wrote; the undo brings the first ones
 * back to whoever has not written (owner decision of 2026-10-28, R8 follow-up 3). A reply the
 * reader already sent in this chat (that exact text) is hidden. A chat without a card has none.
 */
export function quickReplies(
  side: DealSide,
  messages: readonly MessageResponse[],
  selfId: string | null | undefined,
  otherId: string | null | undefined,
  sold = false
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
      .map((message) => (message.body ?? '').trim())
  );
  return replies.filter((reply) => !sent.has(reply));
}

/** A row of the "+" sheet (screen 23 and 24). */
export type AttachRow = 'address' | 'etransfer' | 'photo' | 'card' | 'binder';

/**
 * The "+" sheet's rows: first "Send my address" when buying, "Send my e-Transfer email" when
 * selling (both in a chat without a card), then "Send a photo", "Share a card from your
 * inventory" and "Share a binder".
 */
export function attachRows(side: DealSide): AttachRow[] {
  const first: AttachRow[] =
    side === 'buying' ? ['address'] : side === 'selling' ? ['etransfer'] : ['address', 'etransfer'];
  return [...first, 'photo', 'card', 'binder'];
}

/**
 * The pinned bar's second line: buying a card "{code} · {rarity}"; selling "{code} · {price} ·
 * your card"; a deck core "Deck core", "Deck core · {price} · your deck core" for its owner.
 */
export function pinnedLine(subject: ConversationSubject, side: DealSide): string {
  const parts: string[] = [];
  if (subject.kind === 'DECK_CORE') {
    parts.push(PINNED_COPY.deckCore);
  } else if (subject.printingCode) {
    parts.push(subject.printingCode);
  }
  if (side === 'selling') {
    if (subject.askingPriceText) {
      parts.push(subject.askingPriceText);
    }
    parts.push(subject.kind === 'DECK_CORE' ? PINNED_COPY.yourDeckCore : PINNED_COPY.yourCard);
  } else if (subject.kind === 'CARD' && subject.rarity) {
    parts.push(subject.rarity);
  }
  return parts.join(' · ');
}

/**
 * What the right side of the pinned bar shows: "Mark as sold" for the seller, "Sold" after a sale,
 * "No longer listed" for a buyer once it is not on offer, the price as typed for a buyer, or
 * nothing.
 */
export type PinnedEnd =
  | { kind: 'markAsSold' }
  | { kind: 'sold' }
  | { kind: 'unlisted' }
  | { kind: 'price'; text: string }
  | { kind: 'none' };

export function pinnedEnd(subject: ConversationSubject, side: DealSide): PinnedEnd {
  if (subject.sold) {
    return { kind: 'sold' };
  }
  if (side === 'selling') {
    // A card the seller no longer holds (deleted, or sold out elsewhere): nothing to mark. A deck
    // core sold to someone else answers "nothing left" when marked.
    return subject.kind === 'DECK_CORE' || (subject.copies ?? 0) > 0
      ? { kind: 'markAsSold' }
      : { kind: 'none' };
  }
  if (!subject.listed) {
    return { kind: 'unlisted' };
  }
  return subject.askingPriceText
    ? { kind: 'price', text: subject.askingPriceText }
    : { kind: 'none' };
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
 * The status line under the handle (screen 23): "Online · Quebec", "Quebec", "Online"; "typing…"
 * while they type, "Blocked" once blocked; never a city (ADR 0017).
 */
export function chatStatusLine(
  conversation: Pick<ConversationSummary, 'other' | 'muted'>,
  typing: boolean,
  blocked: boolean
): string {
  if (blocked) {
    return CHAT_COPY.blocked;
  }
  if (typing) {
    return CHAT_COPY.typing;
  }
  const parts: string[] = [];
  if (conversation.other.onlineStatus === 'ONLINE') {
    parts.push(CHAT_COPY.online);
  }
  const province = provinceOf(conversation.other);
  if (province) {
    parts.push(province);
  }
  if (conversation.muted) {
    parts.push(CHAT_COPY.muted);
  }
  return parts.join(' · ');
}

/**
 * The sale message worded for the reader: "You marked {card} as sold to {buyer}." for the seller,
 * "{seller} marked {card} as sold to you." for the buyer.
 */
export function saleSentence(
  sale: Pick<SaleNotice, 'sellerId' | 'name'>,
  selfId: string | null | undefined,
  otherHandle: string
): string {
  return sale.sellerId === selfId
    ? SALE_MESSAGE_COPY.seller(sale.name, otherHandle)
    : SALE_MESSAGE_COPY.buyer(otherHandle, sale.name);
}

/**
 * The sentence of the Mark as sold sheet: the last copy leaves the inventory, or "{n} left"; a
 * deck core leaves Search with its cards.
 */
export function markSoldSentence(
  subject: Pick<ConversationSubject, 'kind' | 'copies'>,
  quantity: number,
  buyer: string
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

/**
 * The time of an inbox row (screen 22): "2 min", "1 h" today, "Yesterday", the weekday within the
 * week ("Mon"), else "Sep 28".
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
