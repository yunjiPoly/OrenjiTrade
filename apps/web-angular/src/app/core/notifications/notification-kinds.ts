import type { NotificationResponse } from '@orenji/api-client';

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
  OFFER_RECEIVED: { icon: 'local_offer', tone: 'offer', label: 'Offer' },
  OFFER_ACCEPTED: { icon: 'handshake', tone: 'offer', label: 'Offer accepted' },
  OFFER_COUNTERED: { icon: 'swap_horiz', tone: 'offer', label: 'Counter-offer' },
  OFFER_DECLINED: { icon: 'do_not_disturb_on', tone: 'offer', label: 'Offer declined' },
  OFFER_CANCELLED: { icon: 'undo', tone: 'offer', label: 'Offer withdrawn' },
  OFFER_EXPIRED: { icon: 'timer_off', tone: 'offer', label: 'Offer expired' },
  BINDER_EXPIRING: { icon: 'timer', tone: 'warning', label: 'Binder' },
  BINDER_STALE_WARNING: { icon: 'hourglass_bottom', tone: 'warning', label: 'Binder reminder' },
  BINDER_HIDDEN: { icon: 'visibility_off', tone: 'warning', label: 'Listings hidden' },
  RATING_RECEIVED: { icon: 'star', tone: 'trade', label: 'Rating' },
  TRADE_UPDATE: { icon: 'sync_alt', tone: 'trade', label: 'Trade' },
  SHIPMENT_STATUS: { icon: 'local_shipping', tone: 'trade', label: 'Shipment' },
  PAYMENT_UPDATE: { icon: 'payments', tone: 'trade', label: 'Payment' },
  DISPUTE_UPDATE: { icon: 'gavel', tone: 'warning', label: 'Dispute' },
  REPORT_DECISION: { icon: 'gavel', tone: 'system', label: 'Report decision' },
  SYSTEM: { icon: 'campaign', tone: 'system', label: 'OrenjiTrade' },
};

const FALLBACK: NotificationKind = { icon: 'notifications', tone: 'system', label: 'Notification' };

/** Icon, tone and label of a notification (the plan-limit notice gets the premium icon). */
export function notificationKind(
  notification: Pick<NotificationResponse, 'type' | 'data'>,
): NotificationKind {
  const kind = KINDS[notification.type] ?? FALLBACK;
  if (notification.type === 'SYSTEM') {
    switch (notification.data?.['kind']) {
      case 'LIMIT_REACHED':
        return { icon: 'workspace_premium', tone: 'system', label: 'Plan limit' };
      case 'LISTINGS_PAUSED':
        return { icon: 'pause_circle', tone: 'warning', label: 'Listings paused' };
      case 'MODERATION_WARNING':
        return { icon: 'report', tone: 'warning', label: 'Moderation' };
    }
  }
  return kind;
}

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
 * `/messages/<conversationId>`, `/inventory?binder=<id>`, `/premium`,
 * `/collectors/<handle>?tab=ratings`, `/settings/reports`, `/offers/<id>`, `/trades/<id>`,
 * `/disputes/<id>`, `/settings/payouts`) when it
 * is a safe in-app path, otherwise a path rebuilt from the ids it carries, otherwise the
 * notification list.
 */
export function notificationLink(
  notification: Pick<NotificationResponse, 'type' | 'data'>,
): string {
  const deepLink = safeAppPath(notification.data?.['deepLink']);
  if (deepLink) {
    return deepLink;
  }
  const data = notification.data;
  switch (notification.type) {
    case 'WISHLIST_ALERT': {
      // The card page with the wish's selection (the API's deepLink normally covers it).
      const card = idOf(data, 'cardId');
      const printing = idOf(data, 'printingId');
      if (!card) {
        return '/wishlist';
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
    case 'OFFER_RECEIVED':
    case 'OFFER_ACCEPTED':
    case 'OFFER_COUNTERED':
    case 'OFFER_DECLINED':
    case 'OFFER_CANCELLED':
    case 'OFFER_EXPIRED': {
      const trade = idOf(data, 'tradeId');
      const offer = idOf(data, 'offerId');
      return trade ? `/trades/${trade}` : offer ? `/offers/${offer}` : '/offers';
    }
    case 'TRADE_UPDATE':
    case 'PAYMENT_UPDATE':
    case 'SHIPMENT_STATUS': {
      const trade = idOf(data, 'tradeId');
      return trade ? `/trades/${trade}` : '/trades';
    }
    case 'DISPUTE_UPDATE': {
      const dispute = idOf(data, 'disputeId');
      const trade = idOf(data, 'tradeId');
      return dispute ? `/disputes/${dispute}` : trade ? `/trades/${trade}` : '/trades';
    }
    case 'REPORT_DECISION':
      return '/settings/reports';
    case 'SYSTEM':
      switch (data?.['kind']) {
        case 'LIMIT_REACHED':
          // The API carries `deepLink: /premium` only while the premiumPlans flag is on (handled
          // above); without it the notice is only about held-back alerts.
          return data?.['notificationType'] === 'WISHLIST_ALERT' ? '/wishlist' : '/notifications';
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
