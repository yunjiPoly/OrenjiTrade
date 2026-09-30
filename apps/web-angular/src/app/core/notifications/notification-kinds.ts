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
  /** Short category shown above the title ("Wishlist match"). */
  label: string;
}

const KINDS: Record<string, NotificationKind> = {
  WISHLIST_MATCH: { icon: 'favorite', tone: 'match', label: 'Wishlist match' },
  MESSAGE: { icon: 'chat', tone: 'message', label: 'Message' },
  OFFER_RECEIVED: { icon: 'local_offer', tone: 'offer', label: 'Offer' },
  OFFER_ACCEPTED: { icon: 'handshake', tone: 'offer', label: 'Offer accepted' },
  OFFER_COUNTERED: { icon: 'swap_horiz', tone: 'offer', label: 'Counter-offer' },
  OFFER_DECLINED: { icon: 'do_not_disturb_on', tone: 'offer', label: 'Offer declined' },
  BINDER_EXPIRING: { icon: 'timer', tone: 'warning', label: 'Binder' },
  BINDER_STALE_WARNING: { icon: 'hourglass_bottom', tone: 'warning', label: 'Binder reminder' },
  BINDER_HIDDEN: { icon: 'visibility_off', tone: 'warning', label: 'Listings hidden' },
  RATING_RECEIVED: { icon: 'star', tone: 'trade', label: 'Rating' },
  TRADE_UPDATE: { icon: 'sync_alt', tone: 'trade', label: 'Trade' },
  SHIPMENT_STATUS: { icon: 'local_shipping', tone: 'trade', label: 'Shipment' },
  PAYMENT_UPDATE: { icon: 'payments', tone: 'trade', label: 'Payment' },
  REPORT_DECISION: { icon: 'gavel', tone: 'system', label: 'Report decision' },
  SYSTEM: { icon: 'campaign', tone: 'system', label: 'OrenjiTrade' },
};

const FALLBACK: NotificationKind = { icon: 'notifications', tone: 'system', label: 'Notification' };

/** Icon, tone and label of a notification (the plan-limit notice gets the premium icon). */
export function notificationKind(
  notification: Pick<NotificationResponse, 'type' | 'data'>,
): NotificationKind {
  const kind = KINDS[notification.type] ?? FALLBACK;
  if (notification.type === 'SYSTEM' && notification.data?.['kind'] === 'LIMIT_REACHED') {
    return { icon: 'workspace_premium', tone: 'system', label: 'Plan limit' };
  }
  return kind;
}

/** Characters allowed in an in-app path (with its query string); nothing else is followed. */
const APP_PATH = /^\/(?!\/)[\w\-/?=&.%~]*$/;

/** `value` when it is a same-app absolute path (`/wishlist/…`), otherwise `null`. */
export function safeAppPath(value: unknown): string | null {
  return typeof value === 'string' && APP_PATH.test(value) ? value : null;
}

function idOf(data: NotificationResponse['data'] | undefined, key: string): string | null {
  const value = data?.[key];
  return typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : null;
}

/**
 * The page a notification opens: its `data.deepLink` (web path, e.g. `/wishlist/<id>`,
 * `/messages/<conversationId>`, `/inventory?binder=<id>`, `/premium`) when it is a safe in-app
 * path, otherwise a path rebuilt from the ids it carries, otherwise the notification list.
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
    case 'WISHLIST_MATCH': {
      const wish = idOf(data, 'wishlistItemId');
      return wish ? `/wishlist/${wish}` : '/wishlist';
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
    case 'SYSTEM':
      return data?.['kind'] === 'LIMIT_REACHED' ? '/premium' : '/notifications';
    default:
      return '/notifications';
  }
}

/** True while the notification has not been read. */
export function isUnread(notification: Pick<NotificationResponse, 'readAt'>): boolean {
  return !notification.readAt;
}
