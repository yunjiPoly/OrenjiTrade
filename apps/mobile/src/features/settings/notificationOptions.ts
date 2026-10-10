import type { ChannelPreferences, NotificationSettingsResponse } from '@/src/api/types';

export type Channel = keyof ChannelPreferences;
export type MasterKey = 'pushEnabled' | 'emailEnabled' | 'inAppEnabled';

export const CHANNELS: readonly { key: Channel; master: MasterKey; label: string }[] = [
  { key: 'inApp', master: 'inAppEnabled', label: 'In-app' },
  { key: 'push', master: 'pushEnabled', label: 'Push' },
  { key: 'email', master: 'emailEnabled', label: 'Email' },
];

/** Categories in display order with human labels (unknown API categories still render). */
export const CATEGORY_LABELS: Readonly<Record<string, { label: string; help: string }>> = {
  MESSAGE: { label: 'Messages', help: 'New private messages.' },
  OFFER: { label: 'Offers', help: 'Offers you receive and their answers.' },
  TRADE: { label: 'Trades', help: 'Progress of your trades.' },
  RATING: { label: 'Ratings', help: 'When someone rates a trade with you.' },
  BINDER_FRESHNESS: { label: 'Binder reminders', help: 'When your listings need a refresh.' },
  REPORT_DECISION: { label: 'Report decisions', help: 'Outcome of reports you filed.' },
  MARKETING: { label: 'News and tips', help: 'Occasional product news.' },
};

export function categoriesOf(settings: NotificationSettingsResponse) {
  const order = Object.keys(CATEGORY_LABELS);
  const rank = (key: string) => {
    const index = order.indexOf(key);
    return index === -1 ? order.length : index;
  };
  return Object.keys(settings.categories)
    .sort((a, b) => rank(a) - rank(b))
    .map((key) => ({
      key,
      label: CATEGORY_LABELS[key]?.label ?? key.replace(/_/g, ' ').toLowerCase(),
      help: CATEGORY_LABELS[key]?.help ?? '',
    }));
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Quiet hours need two different, valid `HH:MM` times when enabled. */
export function quietHoursError(settings: NotificationSettingsResponse): string | null {
  const quiet = settings.quietHours;
  if (!quiet.enabled) {
    return null;
  }
  if (!TIME.test(quiet.start) || !TIME.test(quiet.end)) {
    return 'Use 24-hour times such as 22:00 and 08:00.';
  }
  if (quiet.start === quiet.end) {
    return 'Choose a start and an end time that differ.';
  }
  return null;
}

/** IANA time zone of the device (falls back to the API default). */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto';
  } catch {
    return 'America/Toronto';
  }
}
