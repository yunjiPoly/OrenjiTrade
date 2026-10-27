import type { ChannelPreferences, NotificationSettingsResponse } from '@/src/api/types';

export type Channel = keyof ChannelPreferences;
export type MasterKey = 'pushEnabled' | 'emailEnabled' | 'inAppEnabled';

/**
 * The three channels (mockup v50 screen 51): the switch's name, the grid's column and the words
 * after a topic for a screen reader ("Messages by push").
 */
export const CHANNELS: readonly {
  key: Channel;
  master: MasterKey;
  label: string;
  column: string;
  by: string;
  icon: 'cellphone' | 'bell-ring-outline' | 'email-outline';
}[] = [
  {
    key: 'inApp',
    master: 'inAppEnabled',
    label: 'In the app',
    column: 'App',
    by: 'in the app',
    icon: 'cellphone',
  },
  {
    key: 'push',
    master: 'pushEnabled',
    label: 'Push',
    column: 'Push',
    by: 'by push',
    icon: 'bell-ring-outline',
  },
  {
    key: 'email',
    master: 'emailEnabled',
    label: 'Email',
    column: 'Email',
    by: 'by email',
    icon: 'email-outline',
  },
];

/**
 * What a screen reader says for a cell of the grid: the topic and the channel, and that the
 * channel is off while it is ("Messages by email, channel off").
 */
export function cellLabel(topic: string, channel: { by: string }, channelOn: boolean): string {
  return `${topic} ${channel.by}${channelOn ? '' : ', channel off'}`;
}

/** Categories in display order with human labels (unknown API categories still render). */
export const CATEGORY_LABELS: Readonly<Record<string, { label: string; help: string }>> = {
  MESSAGE: { label: 'Messages', help: 'New private messages.' },
  RATING: { label: 'Ratings', help: 'When someone rates you.' },
  BINDER_FRESHNESS: { label: 'Binder reminders', help: 'When your listings need a refresh.' },
  REPORT_DECISION: { label: 'Report decisions', help: 'Outcome of reports you filed.' },
  MARKETING: { label: 'News and tips', help: 'Occasional product news.' },
};

/**
 * Categories the phone does not list: offers and trades left the phone (ADR 0018). The API keeps
 * them for the paused web; saving the settings sends their stored values back unchanged.
 */
export const HIDDEN_CATEGORIES: ReadonlySet<string> = new Set(['OFFER', 'TRADE']);

export function categoriesOf(settings: NotificationSettingsResponse) {
  const order = Object.keys(CATEGORY_LABELS);
  const rank = (key: string) => {
    const index = order.indexOf(key);
    return index === -1 ? order.length : index;
  };
  return Object.keys(settings.categories)
    .filter((key) => !HIDDEN_CATEGORIES.has(key))
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
