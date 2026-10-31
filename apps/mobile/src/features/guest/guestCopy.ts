/**
 * Every text of browsing without an account (stage R15 of the phone redesign; owner prompt of
 * 2026-10-20, docs/product/specs/2026-10-20-finish-the-phone-ui.md, section R15; mockup v50
 * screens 70 to 75), in one place. English only (owner, 2026-10-20). Free for all (ADR 0019): an
 * account costs nothing, and nothing here offers anything to buy.
 */
export const GUEST_COPY = {
  /** The person button that takes the bell's place on Home and Search (spoken "Sign in"). */
  personButton: 'Sign in',
  personButtonHint: 'Opens Sign in',

  /** A collector a guest does not see (posts, holders, binders): the place stays. */
  aCollector: 'A collector',

  /** Home's card above the chips (70). */
  card: {
    title: 'You’re browsing as a guest',
    text: 'Create a free account to message collectors, save wishes and list your own cards.',
  },

  createAccount: 'Create account',
  signIn: 'Sign in',

  /** The sheet of 71: its title says what the guest tried to do. */
  sheet: {
    titles: {
      message: 'Sign in to message this collector',
      have: 'Sign in to tell them you have it',
      profile: 'Sign in to see collector profiles',
      wish: 'Sign in to save your wishes',
      // Not in the mockup: Report on a public binder or deck core (a write a guest can reach).
      report: 'Sign in to report this collector',
    },
    text: 'It’s free. When you’re done, you come right back here.',
    notNow: 'Not now',
    close: 'Close',
  },

  /** What a screen reader says of a guest's post header and buttons (the mockup's labels). */
  postHeaderLabel: (summary: string) => `${summary}. Sign in to see who`,
  messageLabel: (card: string) => `Message this collector about ${card}. Needs an account`,
  haveLabel: (card: string) => `I have ${card}. Needs an account`,
  moreLabel: (count: number) =>
    `${count} more ${count === 1 ? 'card' : 'cards'} from this collector. Needs an account`,
  holderLabel: (line: string) => `A collector. ${line}. Sign in to see who`,
  ownerLabel: (line: string) => `A collector. ${line}. Sign in to see who`,
  /** The Message button of a public binder or deck core for a guest. */
  messageButton: 'Message this collector',
  needsAccount: 'Needs an account',

  /** The pages in place of the member-only tabs (72 to 75). */
  pages: {
    wishlist: {
      title: 'Get told when it’s listed',
      text: 'Save the cards you’re looking for. We let you know the moment a collector in your region lists one.',
    },
    inventory: {
      title: 'Your cards, in one place',
      text: 'Add cards in seconds, sort them into binders, and let collectors in your region find the ones you sell or trade.',
    },
    messages: {
      title: 'Talk to collectors',
      text: 'Message a collector about a card, agree on the deal, and join your game’s room for your region.',
    },
    profile: {
      title: 'Your collector profile',
      text: 'Show your cards, binders and wishes, and build trust with ratings from the collectors you deal with.',
    },
  },

  /** Profile's rows for a guest (75). */
  profileRows: {
    label: 'Settings',
    appearance: 'Appearance',
    tradingSafely: 'Trading safely',
    legal: 'Legal',
    legalDetail: 'Terms, privacy, guidelines',
  },

  /** Sign in's close button (36): back to where the guest was. */
  closeSignIn: 'Not now, keep browsing',

  /** A finished action whose listing is gone, or the guest's own (after signing in). */
  resume: {
    gone: 'That listing is no longer available.',
    own: 'That’s one of your own listings.',
  },
} as const;
