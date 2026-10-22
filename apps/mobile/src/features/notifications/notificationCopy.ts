/**
 * The words of the bell and of Notifications (owner prompt of 2026-10-19, section R9; mockup v50
 * screen 31), in one place.
 */
export const NOTIFICATIONS_COPY = {
  title: 'Notifications',
  back: 'Back',
  settings: 'Notification settings',

  bell: (count: number) => (count > 0 ? `Notifications, ${count} new` : 'Notifications'),

  sections: { fresh: 'New', earlier: 'Earlier' },
  markAll: 'Mark all as read',
  markAllDone: 'Everything is marked as read.',
  unread: 'unread',
  unreadDot: 'Unread',
  markReadHint: 'Marks it as read',

  loading: 'Loading notifications',
  loadError: 'Notifications could not load',
  emptyTitle: 'No notifications yet',
  emptyText: "We'll tell you when a card you want is listed in your region.",

  time: {
    now: 'now',
    minutes: (count: number) => `${count} min`,
    hours: (count: number) => `${count} h`,
    yesterday: 'Yesterday',
    spokenNow: 'just now',
    spokenMinutes: (count: number) => `${count} ${count === 1 ? 'minute' : 'minutes'} ago`,
    spokenHours: (count: number) => `${count} ${count === 1 ? 'hour' : 'hours'} ago`,
  },

  wish: {
    rest: (province: string | null) =>
      province ? `from your wishlist was listed in ${province}` : 'from your wishlist was listed',
  },
  sale: {
    rest: (name: string | null) =>
      name ? `marked ${name} as sold to you` : 'marked a card as sold to you',
    someone: 'A collector',
    withTracking: 'Tracking added. Rate them when it arrives.',
    withoutTracking: 'Rate them when it arrives.',
  },
  rating: {
    someone: 'A collector',
    rest: (stars: number | null) =>
      stars === null ? 'rated you' : `rated you ${stars} ${stars === 1 ? 'star' : 'stars'}`,
    sub: 'See it on your profile.',
  },
  report: {
    strong: 'Report reviewed:',
    rest: 'thanks for your report',
    actioned: 'We took action.',
    dismissed: 'We found no violation of the Community Guidelines.',
  },
  reminder: {
    unfiled: 'Cards without a binder',
    yourBinder: 'Your binder',
    ask: (count: number) =>
      count === 1
        ? 'do you still have this card?'
        : count > 1
          ? `do you still have these ${count} cards?`
          : 'do you still have these cards?',
    leaves: (date: string | null) =>
      date
        ? `Confirm them, or they leave search on ${date}.`
        : 'Confirm them, or they leave search soon.',
    hidden: 'these cards left search',
    hiddenSub: 'Confirm them to show them again.',
    stillHave: 'Still have them',
    review: 'Review the binder',
    reviewCards: 'Review the cards',
    confirmed: 'Confirmed. They stay in search.',
    confirmError: 'The binder could not be confirmed. Try again.',
  },
} as const;
