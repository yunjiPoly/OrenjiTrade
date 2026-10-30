import type { BinderResponse, NotificationResponse } from '@orenji/api-client';
import type { ShellIconName } from '../layout/shell-icon/shell-icon.component';
import { isHistoryNotification, notificationLink, notificationText } from './notification-kinds';

/**
 * The rows of the bell popover and of `/notifications` (spec 12, board W24; the phone's R9
 * `notificationRows`): each kind's 36 tile, its sentence ("{bold subject} {rest}" over one muted
 * line), its target, the freshness reminders answered in place, and the New and Earlier groups.
 * Old offer, trade, payment and dispute notices read as history and open nothing (decision 2).
 */

type Notice = Pick<NotificationResponse, 'type' | 'data'>;

/** The tile colours: orange wish, blue sale, amber star and reminder, grey the rest. */
export type RowTone = 'wish' | 'sale' | 'star' | 'remind' | 'flag';

export interface RowVisual {
  tone: RowTone;
  icon: ShellIconName;
}

const REMINDERS = new Set(['BINDER_EXPIRING', 'BINDER_STALE_WARNING']);

export function isReminder(notification: Pick<NotificationResponse, 'type'>): boolean {
  return REMINDERS.has(notification.type);
}

/** A reminder or a hidden-listings notice: the binder's buttons instead of a target. */
export function isFreshnessRow(notification: Pick<NotificationResponse, 'type'>): boolean {
  return isReminder(notification) || notification.type === 'BINDER_HIDDEN';
}

/** The tile of a notification; old deals and unknown types are grey. */
export function rowVisual(notification: Notice): RowVisual {
  switch (notification.type) {
    case 'WISHLIST_ALERT':
      return { tone: 'wish', icon: 'heart' };
    case 'SALE_RECORDED':
      return { tone: 'sale', icon: 'box' };
    case 'RATING_RECEIVED':
      return { tone: 'star', icon: 'star' };
    case 'BINDER_EXPIRING':
    case 'BINDER_STALE_WARNING':
    case 'BINDER_HIDDEN':
      return { tone: 'remind', icon: 'hourglass' };
    case 'SHIPMENT_STATUS':
      return { tone: 'flag', icon: 'truck' };
    case 'SYSTEM':
      return { tone: 'flag', icon: notification.data?.['kind'] ? 'flag' : 'info' };
    case 'REPORT_DECISION':
      return { tone: 'flag', icon: 'flag' };
    default:
      return { tone: 'flag', icon: 'bell' };
  }
}

export interface RowText {
  strong: string;
  rest: string;
  sub: string;
}

function text(data: Notice['data'] | undefined, key: string): string | null {
  const value = data?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function wholeNumber(data: Notice['data'] | undefined, key: string): number | null {
  const value = data?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

function amount(data: Notice['data'] | undefined, key: string): number | null {
  const value = data?.[key];
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const MONEY = (value: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

function shortDate(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : SHORT_DATE.format(at);
}

function reminderSubject(data: Notice['data'] | undefined): string {
  const name = text(data, 'binderName');
  if (name) {
    return name;
  }
  return text(data, 'binderId') && text(data, 'binderId') !== 'unfiled'
    ? 'Your binder'
    : 'Cards without a binder';
}

function askFor(count: number): string {
  if (count === 1) {
    return 'do you still have this card?';
  }
  return count > 1 ? `do you still have these ${count} cards?` : 'do you still have these cards?';
}

/** What a row says; a notification stored before R9 falls back on its title and body. */
export function rowText(notification: NotificationResponse): RowText {
  const data = notification.data;
  switch (notification.type) {
    case 'WISHLIST_ALERT': {
      const handle = text(data, 'collectorHandle');
      const province = text(data, 'province');
      const priceText = text(data, 'askingPriceText');
      const price =
        priceText ??
        (amount(data, 'askingPrice') !== null
          ? MONEY(amount(data, 'askingPrice') as number, text(data, 'currency') ?? 'CAD')
          : null);
      return {
        strong: text(data, 'cardName') ?? notification.title,
        rest: province
          ? `from your wishlist was listed in ${province}`
          : 'from your wishlist was listed',
        sub: handle ? [handle, price].filter(Boolean).join(' · ') : notification.body,
      };
    }
    case 'SALE_RECORDED': {
      const seller = text(data, 'sellerHandle');
      const name = text(data, 'itemName') ?? text(data, 'cardName');
      const rest =
        !name && seller && notification.title.startsWith(`${seller} `)
          ? notification.title.slice(seller.length + 1)
          : name
            ? `marked ${name} as sold to you`
            : 'marked a card as sold to you';
      const tracking = data?.['hasTracking'];
      return {
        strong: seller ?? 'A collector',
        rest,
        sub:
          tracking === true
            ? 'Tracking added. Rate them when it arrives.'
            : tracking === false
              ? 'Rate them when it arrives.'
              : notification.body,
      };
    }
    case 'RATING_RECEIVED': {
      const stars = wholeNumber(data, 'overall');
      return {
        strong: text(data, 'raterHandle') ?? 'A collector',
        rest: stars === null ? 'rated you' : `rated you ${stars} ${stars === 1 ? 'star' : 'stars'}`,
        sub: 'See it on your profile.',
      };
    }
    case 'BINDER_EXPIRING':
    case 'BINDER_STALE_WARNING': {
      const date = shortDate(text(data, 'hidesAt'));
      return {
        strong: `${reminderSubject(data)}:`,
        rest: askFor(wholeNumber(data, 'itemCount') ?? 0),
        sub: date
          ? `Confirm them, or they leave search on ${date}.`
          : 'Confirm them, or they leave search soon.',
      };
    }
    case 'BINDER_HIDDEN':
      return {
        strong: `${reminderSubject(data)}:`,
        rest: 'these cards left search',
        sub: 'Confirm them to show them again.',
      };
    case 'REPORT_DECISION': {
      const status = text(data, 'status');
      return {
        strong: 'Report reviewed:',
        rest: 'thanks for your report',
        sub:
          status === 'ACTIONED'
            ? 'We took action.'
            : status === 'DISMISSED'
              ? 'We found no violation of the Community Guidelines.'
              : notification.body,
      };
    }
    default: {
      // Old offers, trades, payments and disputes read as history (decision 2).
      const words = notificationText(notification);
      return { strong: words.title, rest: '', sub: words.body };
    }
  }
}

/**
 * Where a row leads, or `null`: a wishlist alert Who has this card, a sale its chat, a rating your
 * ratings, the rest their own deep link; old deals (history), freshness rows (their buttons) and
 * a notice with nothing to open lead nowhere.
 */
export function rowTarget(
  notification: NotificationResponse,
  ownHandle: string | null,
): string | null {
  if (isHistoryNotification(notification) || isFreshnessRow(notification)) {
    return null;
  }
  if (notification.type === 'RATING_RECEIVED' && ownHandle) {
    return `/collectors/${encodeURIComponent(ownHandle)}?tab=ratings`;
  }
  const link = notificationLink(notification);
  return link === '/notifications' ? null : link;
}

/** The binder id of a freshness row, or `null` for the cards without a binder. */
export function reminderBinderId(notification: Notice): string | null {
  const id = text(notification.data, 'binderId');
  return id && id !== 'unfiled' && /^[\w-]{1,64}$/.test(id) ? id : null;
}

export type ReminderState = 'pending' | 'confirmed' | 'hidden' | 'unfiled' | 'gone';

/** A freshness row's state from your binders (`null` while they load: the buttons show). */
export function reminderState(
  notification: Pick<NotificationResponse, 'type' | 'data' | 'createdAt'>,
  binders: readonly Pick<BinderResponse, 'id' | 'freshness'>[] | null,
): ReminderState {
  const binderId = reminderBinderId(notification);
  if (!binderId) {
    return 'unfiled';
  }
  const binder = binders?.find((candidate) => candidate.id === binderId);
  if (binders && !binder) {
    return 'gone';
  }
  if (notification.type === 'BINDER_HIDDEN') {
    return 'hidden';
  }
  const confirmedAt = binder ? Date.parse(binder.freshness.confirmedAt) : Number.NaN;
  const createdAt = Date.parse(notification.createdAt);
  return Number.isFinite(confirmedAt) && Number.isFinite(createdAt) && confirmedAt >= createdAt
    ? 'confirmed'
    : 'pending';
}

/** The bell's sections: NEW (unread) and EARLIER (read), each newest first. */
export function bellSections(notifications: readonly NotificationResponse[]): {
  fresh: NotificationResponse[];
  earlier: NotificationResponse[];
} {
  return {
    fresh: notifications.filter((n) => !n.readAt),
    earlier: notifications.filter((n) => !!n.readAt),
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

function dayNumber(date: Date): number {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/**
 * A row's time (board W24): "5 min" and "6 h" in the first hours, the clock time ("6:05 PM") later
 * the same day or yesterday, the weekday this week, then the date ("Sep 30").
 */
export function rowTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return '';
  }
  const elapsed = Math.max(0, now.getTime() - at.getTime());
  const days = Math.max(0, dayNumber(now) - dayNumber(at));
  if (elapsed < MINUTE) {
    return 'now';
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} min`;
  }
  if (days === 0 && elapsed < 12 * HOUR) {
    return `${Math.floor(elapsed / HOUR)} h`;
  }
  if (days <= 1) {
    return TIME.format(at);
  }
  return days <= 6 ? WEEKDAY.format(at) : SHORT_DATE.format(at);
}
