import type { NotificationResponse } from '@orenji/api-client';
import { OFFERS_GONE_TOAST, PAYMENTS_NOTICE } from '../routing/legacy-redirects';

/**
 * Display vocabulary of the notification centre (Phase 6 contract): an icon, a tone and a short
 * category label per notification type, and the in-app page a notification opens. Unknown types
 * (added by a newer server) still render with a neutral look.
 */

export type NotificationTone = 'match' | 'message' | 'offer' | 'trade' | 'warning' | 'system';

export interface NotificationKind {
  /** Material Symbols glyph. */
  icon: string;
  tone: NotificationTone;
  /** Short category shown above the title ("Wishlist alert"). */
  label: string;
}

const KINDS: Record<string, NotificationKind> = {
  WISHLIST_ALERT: { icon: 'favorite', tone: 'match', label: 'Wishlist alert' },
  MESSAGE: { icon: 'chat', tone: 'message', label: 'Message' },
  // Offers, trades, payments and disputes left the web (decision 2): their old notices read as
  // history ("Past offer · …"), and open nothing.
  OFFER_RECEIVED: { icon: 'local_offer', tone: 'offer', label: 'Past offer' },
  OFFER_ACCEPTED: { icon: 'handshake', tone: 'offer', label: 'Past offer · accepted' },
  OFFER_COUNTERED: { icon: 'swap_horiz', tone: 'offer', label: 'Past offer · countered' },
  OFFER_DECLINED: { icon: 'do_not_disturb_on', tone: 'offer', label: 'Past offer · declined' },
  OFFER_CANCELLED: { icon: 'undo', tone: 'offer', label: 'Past offer · withdrawn' },
  OFFER_EXPIRED: { icon: 'timer_off', tone: 'offer', label: 'Past offer · expired' },
  BINDER_EXPIRING: { icon: 'timer', tone: 'warning', label: 'Binder' },
  BINDER_STALE_WARNING: { icon: 'hourglass_bottom', tone: 'warning', label: 'Binder reminder' },
  BINDER_HIDDEN: { icon: 'visibility_off', tone: 'warning', label: 'Listings hidden' },
  RATING_RECEIVED: { icon: 'star', tone: 'trade', label: 'Rating' },
  TRADE_UPDATE: { icon: 'sync_alt', tone: 'trade', label: 'Past trade' },
  SHIPMENT_STATUS: { icon: 'local_shipping', tone: 'trade', label: 'Past trade · shipment' },
  PAYMENT_UPDATE: { icon: 'payments', tone: 'trade', label: 'Past payment' },
  DISPUTE_UPDATE: { icon: 'gavel', tone: 'warning', label: 'Past dispute' },
  REPORT_DECISION: { icon: 'gavel', tone: 'system', label: 'Report decision' },
  SYSTEM: { icon: 'campaign', tone: 'system', label: 'OrenjiTrade' },
};

const FALLBACK: NotificationKind = { icon: 'notifications', tone: 'system', label: 'Notification' };

/** Icon, tone and label of a notification (the daily limit notice gets the limit icon). */
export function notificationKind(
  notification: Pick<NotificationResponse, 'type' | 'data'>,
): NotificationKind {
  const kind = KINDS[notification.type] ?? FALLBACK;
  if (notification.type === 'SYSTEM') {
    switch (notification.data?.['kind']) {
      case 'LIMIT_REACHED':
        return { icon: 'speed', tone: 'system', label: 'Limit reached' };
      case 'LISTINGS_PAUSED':
        return { icon: 'pause_circle', tone: 'warning', label: 'Listings paused' };
      case 'MODERATION_WARNING':
        return { icon: 'report', tone: 'warning', label: 'Moderation' };
    }
  }
  return kind;
}

/** Pages removed by stage F1 ("free for all"): Premium, credits, donations and their checkouts. */
const REMOVED_PAGE =
  /^\/(premium|credits|support|offers|trades|disputes|checkout)([/?#]|$)|^\/settings\/(offers|payouts)([/?#]|$)/;

/** Characters allowed in an in-app path (with its query string); nothing else is followed. */
const APP_PATH = /^\/(?!\/)[\w\-/?=&.%~]*$/;

/** `value` when it is a same-app absolute path (`/cards/…`), otherwise `null`. */
export function safeAppPath(value: unknown): string | null {
  return typeof value === 'string' && APP_PATH.test(value) ? value : null;
}

function idOf(data: NotificationResponse['data'] | undefined, key: string): string | null {
  const value = data?.[key];
  return typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : null;
}

/**
 * The page a notification opens: its `data.deepLink` (web path, e.g. `/cards/<id>?printing=<id>`,
 * `/cards/<id>?rarity=<rarity>` or `/cards/<id>?printing=any` of a wishlist alert,
 * `/messages/<conversationId>`, `/inventory?binder=<id>`, `/collectors/<handle>?tab=ratings`,
 * `/settings/reports`) when it is a safe in-app path to a page that still exists, otherwise a path
 * rebuilt from the ids it carries, otherwise the notification list. An old link to Premium,
 * credits or "Support OrenjiTrade" (removed by stage F1), or to an offer, a trade, a checkout, a
 * dispute or the payouts (removed from the web by stage WA, decision 2), is not followed.
 */
export function notificationLink(
  notification: Pick<NotificationResponse, 'type' | 'data'>,
): string {
  const deepLink = safeAppPath(notification.data?.['deepLink']);
  if (deepLink && !REMOVED_PAGE.test(deepLink)) {
    return deepLink;
  }
  const data = notification.data;
  switch (notification.type) {
    case 'WISHLIST_ALERT': {
      // The card page with the wish's selection (the API's deepLink normally covers it).
      const card = idOf(data, 'cardId');
      const printing = idOf(data, 'printingId');
      if (!card) {
        return '/search?tab=wishlist';
      }
      // Without a printing, "any" is said explicitly: the page never picks a printing itself.
      return `/cards/${card}?printing=${printing ?? 'any'}`;
    }
    case 'MESSAGE': {
      const conversation = idOf(data, 'conversationId');
      return conversation ? `/messages/${conversation}` : '/messages';
    }
    case 'BINDER_EXPIRING':
    case 'BINDER_STALE_WARNING':
    case 'BINDER_HIDDEN': {
      const binder = idOf(data, 'binderId');
      return binder ? `/inventory?binder=${binder}` : '/inventory';
    }
    // Offers, trades, payments and disputes left the web (decision 2): their old notifications
    // read as history in the list and open nothing else.
    case 'OFFER_RECEIVED':
    case 'OFFER_ACCEPTED':
    case 'OFFER_COUNTERED':
    case 'OFFER_DECLINED':
    case 'OFFER_CANCELLED':
    case 'OFFER_EXPIRED':
    case 'TRADE_UPDATE':
    case 'PAYMENT_UPDATE':
    case 'SHIPMENT_STATUS':
    case 'DISPUTE_UPDATE':
      return '/notifications';
    case 'REPORT_DECISION':
      return '/settings/reports';
    case 'SYSTEM':
      switch (data?.['kind']) {
        case 'LIMIT_REACHED':
          // Held-back alerts; nothing to buy (stage F1).
          return data?.['notificationType'] === 'WISHLIST_ALERT'
            ? '/search?tab=wishlist'
            : '/notifications';
        case 'LISTINGS_PAUSED':
          return '/inventory';
        case 'MODERATION_WARNING':
          return '/legal/community-guidelines';
        default:
          return '/notifications';
      }
    default:
      return '/notifications';
  }
}

/** The types whose old notices are history on the web (decision 2): shown, never opened. */
const HISTORY_TYPES: ReadonlySet<string> = new Set([
  'OFFER_RECEIVED',
  'OFFER_ACCEPTED',
  'OFFER_COUNTERED',
  'OFFER_DECLINED',
  'OFFER_CANCELLED',
  'OFFER_EXPIRED',
  'TRADE_UPDATE',
  'PAYMENT_UPDATE',
  'SHIPMENT_STATUS',
  'DISPUTE_UPDATE',
]);

/** True for an old offer, trade, payment or dispute notice: the list shows it without a link. */
export function isHistoryNotification(notification: Pick<NotificationResponse, 'type'>): boolean {
  return HISTORY_TYPES.has(notification.type);
}

/** The words of an old notice: its headline with and without a card, and its sentence. */
const HISTORY_WORDS: Record<string, { on: string; none: string; body: string }> = {
  offer: { on: 'Past offer on', none: 'A past offer', body: OFFERS_GONE_TOAST },
  trade: { on: 'Past trade of', none: 'A past trade', body: OFFERS_GONE_TOAST },
  payment: { on: 'Past payment for', none: 'A past payment', body: PAYMENTS_NOTICE },
  dispute: { on: 'Past dispute about', none: 'A past dispute', body: PAYMENTS_NOTICE },
};

function historyFamily(type: string): string {
  if (type.startsWith('OFFER_')) {
    return 'offer';
  }
  if (type === 'PAYMENT_UPDATE') {
    return 'payment';
  }
  return type === 'DISPUTE_UPDATE' ? 'dispute' : 'trade';
}

/**
 * The headline and the sentence a notification shows. The server's own words of an old offer,
 * trade, payment or dispute notice still speak of a live offer ("New offer on …", "Arrange the
 * exchange on the trade page"), so the web reads those as history (decision 2): "Past offer on
 * {card}" and the sentence of the old links' toast or notice. Every other notice keeps its words.
 */
export function notificationText(
  notification: Pick<NotificationResponse, 'type' | 'title' | 'body' | 'data'>,
): { title: string; body: string } {
  if (!isHistoryNotification(notification)) {
    return { title: notification.title, body: notification.body };
  }
  const words = HISTORY_WORDS[historyFamily(notification.type)];
  const card = textOf(notification.data, 'cardName');
  return { title: card ? `${words.on} ${card}` : words.none, body: words.body };
}

/** True while the notification has not been read. */
export function isUnread(notification: Pick<NotificationResponse, 'readAt'>): boolean {
  return !notification.readAt;
}

/** A card carried by a notification's payload (wishlist alerts, offers). */
export interface NotificationCard {
  /** Card name (alt text); empty when the payload has none. */
  name: string;
  /** Picture URL from the API (OrenjiTrade's own image route or an API-relative path). */
  imageUrl: string;
  game: string | null;
}

/** Absolute http(s) URLs and API-relative paths; anything else is ignored. */
const PICTURE_URL = /^(https?:\/\/|\/(?!\/))\S+$/;

function textOf(data: NotificationResponse['data'] | undefined, key: string): string | null {
  const value = data?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * The card a notification shows: `data.cardImageUrl` (with `data.cardName` and `data.game`) when
 * the payload carries one, otherwise `null` (the type icon is shown).
 */
export function notificationCard(
  notification: Pick<NotificationResponse, 'data'>,
): NotificationCard | null {
  const data = notification.data;
  const imageUrl = textOf(data, 'cardImageUrl');
  if (!imageUrl || !PICTURE_URL.test(imageUrl)) {
    return null;
  }
  return { imageUrl, name: textOf(data, 'cardName') ?? '', game: textOf(data, 'game') };
}
