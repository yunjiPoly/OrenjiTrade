import type { BinderResponse, NotificationResponse } from '@/src/api/types';
import type { IconName } from '@/src/components/ui/EmptyState';
import { calendarDaysAgo } from '@/src/features/home/feedRules';
import { itemPriceText } from '@/src/features/inventory/itemPrice';

import { NOTIFICATIONS_COPY } from './notificationCopy';
import { mobileTarget, notificationLink, safeAppPath } from './notificationKinds';

/**
 * The pure rules of the bell and of Notifications (owner prompt of 2026-10-19, section R9; mockup
 * v50 screen 31): each kind's icon and colours, its sentence, its target, the time labels in the
 * phone's time zone, the freshness reminders' states, the New and Earlier sections, and where a
 * push notification leads.
 */

type Notice = Pick<NotificationResponse, 'type' | 'data'>;

/** The types the phone never lists or counts: chats have their own badge in Messages. */
export const PHONE_EXCLUDED_TYPES = [
  'MESSAGE',
] as const satisfies readonly NotificationResponse['type'][];

/** True for a type the phone leaves out (`excludeTypes`). */
export function isExcludedType(type: string): boolean {
  return (PHONE_EXCLUDED_TYPES as readonly string[]).includes(type);
}

// ---------------------------------------------------------------------------------------------
// The kind's icon and colours
// ---------------------------------------------------------------------------------------------

/** The colours of an icon tile: orange wish, blue sale, amber star and reminder, grey the rest. */
export type RowTone = 'wish' | 'sale' | 'star' | 'remind' | 'flag';

export interface RowVisual {
  tone: RowTone;
  icon: IconName;
}

/** Freshness reminders answered in place ("Still have them"). */
const REMINDERS = new Set(['BINDER_EXPIRING', 'BINDER_STALE_WARNING']);

/** Old offer, trade, payment and dispute notifications (the paused web's; ADR 0018). */
const OLD_DEAL_ICONS: Record<string, IconName> = {
  OFFER_RECEIVED: 'tag-outline',
  OFFER_ACCEPTED: 'tag-outline',
  OFFER_COUNTERED: 'tag-outline',
  OFFER_DECLINED: 'tag-outline',
  OFFER_CANCELLED: 'tag-outline',
  OFFER_EXPIRED: 'tag-outline',
  TRADE_UPDATE: 'swap-horizontal',
  SHIPMENT_STATUS: 'truck-outline',
  PAYMENT_UPDATE: 'cash',
  DISPUTE_UPDATE: 'gavel',
};

/** True for a freshness reminder (BINDER_EXPIRING, BINDER_STALE_WARNING). */
export function isReminder(notification: Pick<NotificationResponse, 'type'>): boolean {
  return REMINDERS.has(notification.type);
}

/** A reminder or a hidden-listings notice: a row with the binder's actions instead of a target. */
export function isFreshnessRow(notification: Pick<NotificationResponse, 'type'>): boolean {
  return isReminder(notification) || notification.type === 'BINDER_HIDDEN';
}

/** The icon tile of a notification. Old deals and unknown types are grey, with no target. */
export function rowVisual(notification: Notice): RowVisual {
  switch (notification.type) {
    case 'WISHLIST_ALERT':
      return { tone: 'wish', icon: 'heart' };
    case 'SALE_RECORDED':
      return { tone: 'sale', icon: 'package-variant-closed' };
    case 'RATING_RECEIVED':
      return { tone: 'star', icon: 'star' };
    case 'BINDER_EXPIRING':
    case 'BINDER_STALE_WARNING':
    case 'BINDER_HIDDEN':
      return { tone: 'remind', icon: 'timer-sand' };
    case 'REPORT_DECISION':
      return { tone: 'flag', icon: 'flag-outline' };
    case 'SYSTEM':
      switch (notification.data?.['kind']) {
        case 'LIMIT_REACHED':
          return { tone: 'flag', icon: 'speedometer' };
        case 'LISTINGS_PAUSED':
          return { tone: 'flag', icon: 'pause-circle-outline' };
        case 'MODERATION_WARNING':
          return { tone: 'flag', icon: 'flag-outline' };
        default:
          return { tone: 'flag', icon: 'information-outline' };
      }
    default:
      return { tone: 'flag', icon: OLD_DEAL_ICONS[notification.type] ?? 'bell-outline' };
  }
}

// ---------------------------------------------------------------------------------------------
// The sentence: "{bold subject} {rest}", then one muted line
// ---------------------------------------------------------------------------------------------

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

/** "Oct 26" in the phone's time zone, or null. */
function shortDate(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : SHORT_DATE.format(at);
}

/** The binder a freshness row is about: its name, "Your binder", or the unfiled cards. */
function reminderSubject(data: Notice['data'] | undefined): string {
  const name = text(data, 'binderName');
  if (name) {
    return name;
  }
  return text(data, 'binderId') && text(data, 'binderId') !== 'unfiled'
    ? NOTIFICATIONS_COPY.reminder.yourBinder
    : NOTIFICATIONS_COPY.reminder.unfiled;
}

/**
 * What a row says. Notifications stored before stage R9 lack the fields of the new rows: they fall
 * back on their title and body.
 */
export function rowText(notification: NotificationResponse): RowText {
  const data = notification.data;
  const copy = NOTIFICATIONS_COPY;
  switch (notification.type) {
    case 'WISHLIST_ALERT': {
      const handle = text(data, 'collectorHandle');
      const price = handle
        ? itemPriceText({
            askingPriceText: text(data, 'askingPriceText'),
            askingPrice: amount(data, 'askingPrice'),
            currency: text(data, 'currency'),
          })
        : null;
      return {
        strong: text(data, 'cardName') ?? notification.title,
        rest: copy.wish.rest(text(data, 'province')),
        sub: handle ? [handle, price].filter(Boolean).join(' · ') : notification.body,
      };
    }
    case 'SALE_RECORDED': {
      const seller = text(data, 'sellerHandle');
      const name = text(data, 'itemName') ?? text(data, 'cardName');
      // An older sale notification names the card in its title only: "{seller} marked … to you".
      const rest =
        !name && seller && notification.title.startsWith(`${seller} `)
          ? notification.title.slice(seller.length + 1)
          : copy.sale.rest(name);
      const tracking = data?.['hasTracking'];
      return {
        strong: seller ?? copy.sale.someone,
        rest,
        sub:
          tracking === true
            ? copy.sale.withTracking
            : tracking === false
              ? copy.sale.withoutTracking
              : notification.body,
      };
    }
    case 'RATING_RECEIVED':
      return {
        strong: text(data, 'raterHandle') ?? copy.rating.someone,
        rest: copy.rating.rest(wholeNumber(data, 'overall')),
        sub: copy.rating.sub,
      };
    case 'BINDER_EXPIRING':
    case 'BINDER_STALE_WARNING':
      return {
        strong: `${reminderSubject(data)}:`,
        rest: copy.reminder.ask(wholeNumber(data, 'itemCount') ?? 0),
        sub: copy.reminder.leaves(shortDate(text(data, 'hidesAt'))),
      };
    case 'BINDER_HIDDEN':
      return {
        strong: `${reminderSubject(data)}:`,
        rest: copy.reminder.hidden,
        sub: copy.reminder.hiddenSub,
      };
    case 'REPORT_DECISION': {
      const status = text(data, 'status');
      return {
        strong: copy.report.strong,
        rest: copy.report.rest,
        sub:
          status === 'ACTIONED'
            ? copy.report.actioned
            : status === 'DISMISSED'
              ? copy.report.dismissed
              : notification.body,
      };
    }
    default:
      return { strong: notification.title, rest: '', sub: notification.body };
  }
}

/** "{strong} {rest}" as one sentence. */
export function rowSentence(row: RowText): string {
  return row.rest ? `${row.strong} ${row.rest}` : row.strong;
}

/**
 * What a screen reader says for a row (mockup: "{strong} {rest}. {sub}, {time}, unread"), with
 * the time spoken in words.
 */
export function rowLabel(row: RowText, spokenTime: string, unread: boolean): string {
  const tail = [
    row.sub.replace(/\.$/, ''),
    spokenTime,
    unread ? NOTIFICATIONS_COPY.unread : '',
  ].filter(Boolean);
  const sentence = rowSentence(row);
  const head = /[.?!:]$/.test(sentence) ? sentence : `${sentence}.`;
  return [head, tail.join(', ')].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------------------------
// The target
// ---------------------------------------------------------------------------------------------

/**
 * Where tapping a row leads, or null: a wishlist alert opens Who has this card for the wished
 * printing, a sale its chat, a rating your ratings on your profile (`ownHandle`, the caller's
 * handle today: a handle changed since the rating would leave the stored link dead). Reports,
 * system notices, freshness rows (they have their own buttons), old offers, trades, payments and
 * disputes, and types a newer server adds open nothing.
 */
export function rowTarget(notification: Notice, ownHandle: string | null): string | null {
  switch (notification.type) {
    case 'WISHLIST_ALERT':
    case 'SALE_RECORDED': {
      const target = mobileTarget(notificationLink(notification));
      return target.kind === 'route' && target.href !== '/notifications' ? target.href : null;
    }
    case 'RATING_RECEIVED': {
      if (ownHandle) {
        return `/collectors/${encodeURIComponent(ownHandle)}?tab=ratings`;
      }
      const target = mobileTarget(notificationLink(notification));
      return target.kind === 'route' && target.href.startsWith('/collectors/') ? target.href : null;
    }
    default:
      return null;
  }
}

/**
 * A row's target as Notifications opens it: a chat (a sale's) gets `?from=notifications`, so its
 * Back says "Back to Notifications", where it returns (as Edit binder does for a reminder). A push
 * notification opens the bare target: its chat's Back returns to Messages.
 */
export function openedFromNotifications(target: string): string {
  return /^\/messages\/[\w-]{1,64}$/.test(target) ? `${target}?from=notifications` : target;
}

/**
 * Where a tapped push notification leads (its payload: `notificationId`, `type`, `deepLink`): the
 * target of its row, else Notifications, where a reminder is answered and a notice without a
 * target is read. A chat has no row here (Messages has its own badge): its push opens the chat
 * (`/messages/{id}`), or Messages when the link names none (review fix 1, U2 and F2).
 */
export function pushTarget(
  payload: Record<string, unknown> | null | undefined,
  ownHandle: string | null
): string {
  const type = typeof payload?.['type'] === 'string' ? payload['type'] : '';
  const deepLink = safeAppPath(payload?.['deepLink']);
  const notice = { type: type as NotificationResponse['type'], data: deepLink ? { deepLink } : {} };
  if (isExcludedType(type)) {
    const chat = mobileTarget(notificationLink(notice));
    return chat.kind === 'route' && /^\/messages(\/[\w-]{1,64})?$/.test(chat.href)
      ? chat.href
      : '/messages';
  }
  return rowTarget(notice, ownHandle) ?? '/notifications';
}

// ---------------------------------------------------------------------------------------------
// Times, in the phone's time zone
// ---------------------------------------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const WEEKDAY_LONG = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
const MONTH_DAY_LONG = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });
const DATE_YEAR = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const DATE_YEAR_LONG = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

export interface TimeLabel {
  /** What the row shows: "5 min", "1 h", "Yesterday", "Sat", "Sep 30". */
  short: string;
  /** What a screen reader says: "5 minutes ago", "1 hour ago", "Yesterday", "Saturday", … */
  spoken: string;
}

/**
 * The time of a notification: "now" and "{n} min" within the hour, "{n} h" earlier today,
 * "Yesterday", the weekday for the 2 to 6 days before, then the date ("Sep 30", with the year
 * when it is not this year). A time a little ahead of the phone's clock is "now".
 */
export function notificationTime(iso: string, now: Date = new Date()): TimeLabel {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return { short: '', spoken: '' };
  }
  const copy = NOTIFICATIONS_COPY.time;
  const elapsed = Math.max(0, now.getTime() - at.getTime());
  if (elapsed < MINUTE) {
    return { short: copy.now, spoken: copy.spokenNow };
  }
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return { short: copy.minutes(minutes), spoken: copy.spokenMinutes(minutes) };
  }
  const days = calendarDaysAgo(at, now);
  if (days === 0) {
    const hours = Math.floor(elapsed / HOUR);
    return { short: copy.hours(hours), spoken: copy.spokenHours(hours) };
  }
  if (days === 1) {
    return { short: copy.yesterday, spoken: copy.yesterday };
  }
  if (days <= 6) {
    return { short: WEEKDAY.format(at), spoken: WEEKDAY_LONG.format(at) };
  }
  if (at.getFullYear() !== now.getFullYear()) {
    return { short: DATE_YEAR.format(at), spoken: DATE_YEAR_LONG.format(at) };
  }
  return { short: SHORT_DATE.format(at), spoken: MONTH_DAY_LONG.format(at) };
}

// ---------------------------------------------------------------------------------------------
// Freshness reminders, answered in place
// ---------------------------------------------------------------------------------------------

/**
 * A freshness row's state:
 * - `pending`: "Still have them" and "Review the binder";
 * - `confirmed`: the binder was confirmed since the reminder (a teal check, "Confirmed. They stay
 *   in search.");
 * - `hidden`: listings already left search (BINDER_HIDDEN): "Review the binder" only;
 * - `unfiled`: cards without a binder (nothing to confirm in one tap): "Review the cards";
 * - `gone`: the binder was deleted since: no button.
 */
export type ReminderState = 'pending' | 'confirmed' | 'hidden' | 'unfiled' | 'gone';

/** The binder id of a freshness row, or null for the unfiled cards. */
export function reminderBinderId(notification: Notice): string | null {
  const id = text(notification.data, 'binderId');
  return id && id !== 'unfiled' && /^[\w-]{1,64}$/.test(id) ? id : null;
}

/**
 * The state of a freshness row from the caller's binders (`undefined` while they load: the row
 * offers its buttons, a confirm being harmless).
 */
export function reminderState(
  notification: Pick<NotificationResponse, 'type' | 'data' | 'createdAt'>,
  binders: readonly Pick<BinderResponse, 'id' | 'freshness'>[] | undefined
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

// ---------------------------------------------------------------------------------------------
// New and Earlier
// ---------------------------------------------------------------------------------------------

export type ListRow =
  | { kind: 'heading'; key: string; section: 'fresh' | 'earlier'; markAll: boolean }
  | { kind: 'notification'; key: string; notification: NotificationResponse; fresh: boolean };

/**
 * The list: "New" with the unread notifications as they were loaded (one read since keeps its
 * place, without its dot, until the next load), "Mark all as read" while one of them is unread;
 * then "Earlier" with every other notification of the loaded pages, newest first. While New has
 * pages left to load (`freshComplete` false: more unread notifications than one page holds),
 * Earlier waits, so an unread notification is never listed under it (review fix 1, F4).
 */
export function listRows(
  fresh: readonly NotificationResponse[],
  all: readonly NotificationResponse[],
  freshComplete: boolean
): ListRow[] {
  const rows: ListRow[] = [];
  const freshIds = new Set(fresh.map((notification) => notification.id));
  if (fresh.length > 0) {
    rows.push({
      kind: 'heading',
      key: 'heading-fresh',
      section: 'fresh',
      markAll: fresh.some((notification) => !notification.readAt),
    });
    for (const notification of fresh) {
      rows.push({ kind: 'notification', key: notification.id, notification, fresh: true });
    }
  }
  if (!freshComplete) {
    return rows;
  }
  const earlier = all.filter((notification) => !freshIds.has(notification.id));
  if (earlier.length > 0) {
    rows.push({ kind: 'heading', key: 'heading-earlier', section: 'earlier', markAll: false });
    for (const notification of earlier) {
      rows.push({ kind: 'notification', key: notification.id, notification, fresh: false });
    }
  }
  return rows;
}
