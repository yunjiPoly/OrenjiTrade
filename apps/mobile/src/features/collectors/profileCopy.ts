/**
 * The approved English copy of the profile pages (owner spec 2026-10-14, section 9; mockup screens
 * 19 to 21, version 50 for the words), in one place so the French translation (on hold) can slot
 * in later: another collector's profile, your Profile tab, their "See all" pages and "I have it".
 */
export const PROFILE_COPY = {
  // Your Profile tab (21).
  tabTitle: 'Profile',
  settings: 'Settings',
  settingsHint: 'Opens Settings',
  editProfile: 'Edit profile',
  shareProfile: 'Share profile',
  // Another collector's profile (19, 20).
  back: 'Back',
  more: (handle: string) => `More for ${handle}`,
  report: (handle: string) => `Report ${handle}`,
  block: (handle: string) => `Block ${handle}`,
  unblock: (handle: string) => `Unblock ${handle}`,
  cancel: 'Cancel',
  message: (handle: string) => `Message ${handle}`,
  messageShort: 'Message',
  messageHint: (handle: string) => `Opens your chat with ${handle}`,
  noMessages: (handle: string) => `${handle} does not accept messages from you.`,
  opening: 'Opening…',
  // The header and the line under it.
  rating: (average: string) => `Rated ${average} out of 5. Go to ratings and references`,
  chips: 'Games and tags',
  onlineNow: 'Online now',
  memberSince: (year: string) => `Member since ${year}`,
  activeThisWeek: 'Active this week',
  activeThisMonth: 'Active this month',
  notOnMap: 'Not on the map',
  notOnMapHint: 'Opens Location and discoverability',
  // Sections.
  seeAll: 'See all',
  seeAllCards: 'See all cards',
  seeAllBinders: 'See all binders',
  seeAllWishes: 'See all wishes',
  cards: 'Cards',
  binders: 'Binders',
  lookingFor: 'Looking for',
  about: 'About',
  ratings: 'Ratings & references',
  ratingsSection: 'Ratings and references',
  seeAllReferences: 'See all references',
  deckCore: 'Deck core',
  cardCount: (count: number) => (count === 1 ? '1 card' : `${count} cards`),
  ratingCount: (count: number) => (count === 1 ? '1 rating' : `${count} ratings`),
  outOfFive: (average: string) => `${average} out of 5`,
  iHaveIt: 'I have it',
  iHaveItLabel: (card: string, handle: string) => `I have ${card}. Message ${handle}`,
  haveMessage: (card: string) => `I have ${card} for your wishlist. Interested?`,
  sectionError: (section: string) => `${section} could not load.`,
  retry: 'Try again',
  loading: 'Loading the profile',
  // Empty sections: yours say how to fill them, another collector's say nothing about why.
  emptyCards: {
    own: 'No public cards yet. Make cards public in Inventory so collectors in your region can find them.',
    other: 'No public cards yet.',
  },
  emptyBinders: {
    own: 'No public binders yet. Make a binder public, or sell a deck core, in Inventory › Binders.',
    other: 'No public binders yet.',
  },
  emptyWishes: {
    own: 'No wishes yet. Add the cards you want in Search › Wishlist.',
    other: 'No public wishes.',
  },
  hiddenWishes:
    'Only you see your wishes. Turn on “Let others see what you want” in Settings › Privacy to show them here.',
  emptyBio: {
    own: 'No bio yet. Add a few words with Edit profile.',
    other: (name: string) => `${name} has not written a bio yet.`,
  },
  noRatings: 'No ratings yet.',
  noReferences: 'No references yet.',
  // A block (today's rule: the header answers, the listings do not, either way).
  blockedByMe: (handle: string) =>
    `You blocked ${handle}. Unblock them to see their cards, binders and wishes, and to message each other.`,
  unblockAction: 'Unblock',
  blockedToast: (handle: string) => `${handle} is blocked.`,
  unblockedToast: (handle: string) => `${handle} is unblocked.`,
  blockTitle: (handle: string) => `Block ${handle}?`,
  blockBody:
    'You will stop seeing each other’s binders, profiles and posts on the map, in search and in the community, and neither of you can send messages. They are not told. You can unblock them from their profile or from Settings › Blocked users.',
  blockConfirm: 'Block',
  // Share.
  shareMessage: (name: string, url: string) => `${name} on OrenjiTrade: ${url}`,
  shareFallback: (url: string) => `Profile link: ${url}`,
  // Not available (unknown, private, suspended, deleted, or a collector who blocked you).
  notAvailableTitle: 'This collector is not available',
  notAvailableBody: 'The profile does not exist, is private, or is no longer active.',
  notAvailableAction: 'Back to Search',
  loadError: 'We could not load this profile',
  retrying: 'Retrying…',
  // Your Profile tab.
  ownLoadError: 'We could not load your profile',
  ownLoading: 'Loading your profile',
  // Members only (signed out, or a session that ended).
  membersTitle: 'Collector profiles are for members',
  membersBody: 'Sign in or create a free account to see who trades in your region.',
  signIn: 'Sign in',
  createAccount: 'Create account',
  // Hints of rows and links.
  editWishHint: 'Edits this wish',
  openProfileHint: 'Opens their profile',
  openCardHint: 'Opens Who has this card',
  somethingWrong: { title: 'Something went wrong', message: 'Please try again.' },
} as const;

/** The "See all" pages of another collector's profile. */
export const PROFILE_LIST_COPY = {
  cardsTitle: 'Cards',
  bindersTitle: 'Binders',
  wishesTitle: 'Looking for',
  referencesTitle: 'Ratings & references',
  loadMore: 'Show more',
  loadingMore: 'Loading…',
  of: (handle: string) => `@${handle}`,
} as const;
