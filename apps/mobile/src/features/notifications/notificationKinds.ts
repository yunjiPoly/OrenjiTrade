import type { NotificationResponse } from '@/src/api/types';
import type { IconName } from '@/src/components/ui/EmptyState';

/**
 * Display vocabulary of the notification centre (Phase 6 contract, mirror of the web's
 * `core/notifications/notification-kinds.ts`): an icon, a tone and a short category label per
 * notification type, the in-app page a notification opens, and the card it shows. Unknown types
 * (added by a newer server) still render with a neutral look.
 */
export type NotificationTone = 'match' | 'message' | 'offer' | 'trade' | 'warning' | 'system';

export interface NotificationKind {
  icon: IconName;
  tone: NotificationTone;
  /** Short category shown above the title ("Wishlist match"). */
  label: string;
}

const KINDS: Record<string, NotificationKind> = {
  WISHLIST_MATCH: { icon: 'heart', tone: 'match', label: 'Wishlist match' },
  MESSAGE: { icon: 'message-text', tone: 'message', label: 'Message' },
  OFFER_RECEIVED: { icon: 'tag', tone: 'offer', label: 'Offer' },
  OFFER_ACCEPTED: { icon: 'handshake', tone: 'offer', label: 'Offer accepted' },
  OFFER_COUNTERED: { icon: 'swap-horizontal', tone: 'offer', label: 'Counter-offer' },
  OFFER_DECLINED: { icon: 'minus-circle', tone: 'offer', label: 'Offer declined' },
  OFFER_CANCELLED: { icon: 'undo', tone: 'offer', label: 'Offer withdrawn' },
  OFFER_EXPIRED: { icon: 'timer-off-outline', tone: 'offer', label: 'Offer expired' },
  BINDER_EXPIRING: { icon: 'timer-sand', tone: 'warning', label: 'Binder' },
  BINDER_STALE_WARNING: { icon: 'timer-sand-complete', tone: 'warning', label: 'Binder reminder' },
  BINDER_HIDDEN: { icon: 'eye-off', tone: 'warning', label: 'Listings hidden' },
  RATING_RECEIVED: { icon: 'star', tone: 'trade', label: 'Rating' },
  TRADE_UPDATE: { icon: 'swap-horizontal-bold', tone: 'trade', label: 'Trade' },
  SHIPMENT_STATUS: { icon: 'truck-outline', tone: 'trade', label: 'Shipment' },
  PAYMENT_UPDATE: { icon: 'cash', tone: 'trade', label: 'Payment' },
  DISPUTE_UPDATE: { icon: 'gavel', tone: 'warning', label: 'Dispute' },
  REPORT_DECISION: { icon: 'gavel', tone: 'system', label: 'Report decision' },
  SYSTEM: { icon: 'bullhorn-outline', tone: 'system', label: 'OrenjiTrade' },
};

const FALLBACK: NotificationKind = { icon: 'bell', tone: 'system', label: 'Notification' };

/** Icon, tone and label of a notification (the plan-limit notice gets the premium icon). */
export function notificationKind(
  notification: Pick<NotificationResponse, 'type' | 'data'>
): NotificationKind {
  const kind = KINDS[notification.type] ?? FALLBACK;
  if (notification.type === 'SYSTEM') {
    switch (notification.data?.['kind']) {
      case 'LIMIT_REACHED':
        return { icon: 'crown-outline', tone: 'system', label: 'Plan limit' };
      case 'LISTINGS_PAUSED':
        return { icon: 'pause-circle-outline', tone: 'warning', label: 'Listings paused' };
      case 'MODERATION_WARNING':
        return { icon: 'flag-outline', tone: 'warning', label: 'Moderation' };
    }
  }
  return kind;
}

/** Characters allowed in an in-app path (with its query string); nothing else is followed. */
const APP_PATH = /^\/(?!\/)[\w\-/?=&.%~]*$/;

/** `value` when it is a same-app absolute path (`/wishlist/…`), otherwise `null`. */
export function safeAppPath(value: unknown): string | null {
  return typeof value === 'string' && APP_PATH.test(value) ? value : null;
}

const ID = /^[\w-]{1,64}$/;

function idOf(data: NotificationResponse['data'] | undefined, key: string): string | null {
  const value = data?.[key];
  return typeof value === 'string' && ID.test(value) ? value : null;
}

/**
 * The web path a notification opens (the same rules as the web): its `data.deepLink` when it is
 * a safe in-app path, otherwise a path rebuilt from the ids it carries, otherwise the list.
 */
export function notificationLink(
  notification: Pick<NotificationResponse, 'type' | 'data'>
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
          return '/premium';
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

/** Where a notification leads in the app, or why it cannot yet (a screen of a later stage). */
export type NotificationTarget = { kind: 'route'; href: string } | { kind: 'later'; note: string };

const SETTINGS_LATER = 'This setting is on orenjitrade.com only for now.';

/** Settings pages of the app, by their web path segment (`/settings/<segment>`). */
const SETTINGS_PAGES: Record<string, string> = {
  profile: 'profile',
  location: 'location',
  'trading-area': 'location',
  privacy: 'privacy',
  notifications: 'notifications',
  account: 'account',
  appearance: 'appearance',
  reports: 'reports',
  offers: 'offers',
  payouts: 'payouts',
  blocked: 'blocked',
};

function route(href: string): NotificationTarget {
  return { kind: 'route', href };
}

/**
 * The mobile screen of a web path (the API's deep links are web paths): wishlist matches,
 * conversations, community channels, binders (`/inventory?binder=`), cards, collector profiles
 * (`?tab=ratings` scrolls to the ratings), offers, trades, disputes, Premium, credits, support,
 * legal pages and settings (My reports, offer settings, payouts) map to their app screens; the
 * web-only settings explain where to go instead. Ids are validated again.
 */
export function mobileTarget(webPath: string): NotificationTarget {
  const [pathname = '', query = ''] = webPath.split('?');
  const params = new URLSearchParams(query);
  const [root, rawId] = pathname.split('/').filter(Boolean);
  const id = rawId && ID.test(rawId) ? rawId : null;
  switch (root) {
    case 'wishlist':
      return route(id ? `/wishlist/${id}` : '/wishlist');
    case 'messages':
      return route(id ? `/messages/${id}` : '/messages');
    case 'community':
      return route(id ? `/community/${id}` : '/messages?view=community');
    case 'inventory': {
      const binder = params.get('binder');
      return route(binder && ID.test(binder) ? `/binders/${binder}` : '/inventory');
    }
    case 'binders':
      return route(id ? `/binders/${id}` : '/inventory?view=binders');
    case 'cards':
      return route(id ? `/cards/${id}` : '/search');
    case 'sets':
      return route(id ? `/sets/${id}` : '/search');
    case 'collectors':
      return route(
        id ? `/collectors/${id}${params.get('tab') === 'ratings' ? '?tab=ratings' : ''}` : '/'
      );
    case 'map':
      return route('/');
    case 'search': {
      // The web's holders view (`/search?card=|printing=`) is the app's holders list.
      const printing = params.get('printing');
      const card = params.get('card');
      if (printing && ID.test(printing)) {
        return route(`/holders?printing=${printing}`);
      }
      if (card && ID.test(card)) {
        return route(`/holders?card=${card}`);
      }
      const tab = params.get('tab');
      return route(tab === 'collectors' || tab === 'binders' ? `/search?tab=${tab}` : '/search');
    }
    case 'notifications':
      return route('/notifications');
    case 'legal':
      return route(id ? `/legal/${id}` : '/legal');
    case 'settings': {
      if (!rawId) {
        return route('/settings');
      }
      const page = SETTINGS_PAGES[rawId];
      return page ? route(`/settings/${page}`) : { kind: 'later', note: SETTINGS_LATER };
    }
    case 'offers':
      return route(id ? `/offers/${id}` : '/offers');
    case 'trades':
      return route(id ? `/trades/${id}` : '/trades');
    case 'disputes':
      return route(id ? `/disputes/${id}` : '/trades');
    case 'premium': {
      const checkout = params.get('checkout');
      return route(checkout === 'success' ? '/premium?checkout=success' : '/premium');
    }
    case 'credits':
      return route('/credits');
    case 'support':
      return route('/support');
    default:
      return route('/notifications');
  }
}

/** The mobile target of a notification. */
export function notificationTarget(
  notification: Pick<NotificationResponse, 'type' | 'data'>
): NotificationTarget {
  return mobileTarget(notificationLink(notification));
}

/** True while the notification has not been read. */
export function isUnread(notification: Pick<NotificationResponse, 'readAt'>): boolean {
  return !notification.readAt;
}

/** A card carried by a notification's payload (wishlist alerts, offers). */
export interface NotificationCard {
  name: string;
  imageUrl: string;
  game: string | null;
}

/** Absolute http(s) URLs and API-relative paths; anything else is ignored. */
const PICTURE_URL = /^(https?:\/\/|\/(?!\/))\S+$/;

function textOf(data: NotificationResponse['data'] | undefined, key: string): string | null {
  const value = data?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

/** The card a notification shows (`data.cardImageUrl` with `cardName` and `game`), or `null`. */
export function notificationCard(
  notification: Pick<NotificationResponse, 'data'>
): NotificationCard | null {
  const data = notification.data;
  const imageUrl = textOf(data, 'cardImageUrl');
  if (!imageUrl || !PICTURE_URL.test(imageUrl)) {
    return null;
  }
  return { imageUrl, name: textOf(data, 'cardName') ?? '', game: textOf(data, 'game') };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export interface FeedSection {
  title: string;
  data: NotificationResponse[];
}

/** Newest-first notifications in day sections ("Today", "Yesterday", "Earlier this week", "Older"). */
export function groupByDay(
  items: readonly NotificationResponse[],
  now: number = Date.now()
): FeedSection[] {
  const today = startOfDay(now);
  const labels = ['Today', 'Yesterday', 'Earlier this week', 'Older'];
  const groups: NotificationResponse[][] = [[], [], [], []];
  for (const item of items) {
    const created = Date.parse(item.createdAt);
    let index = 3;
    if (Number.isFinite(created)) {
      if (created >= today) {
        index = 0;
      } else if (created >= today - DAY_MS) {
        index = 1;
      } else if (created >= today - 6 * DAY_MS) {
        index = 2;
      }
    }
    groups[index]?.push(item);
  }
  return groups
    .map((data, index) => ({ title: labels[index] ?? 'Older', data }))
    .filter((section) => section.data.length > 0);
}
