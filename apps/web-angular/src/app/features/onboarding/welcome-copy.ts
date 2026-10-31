/**
 * The words of the welcome (spec 14; the phone's R12 `welcomeCopy.ts`). English only (owner,
 * 2026-10-20).
 */
export const WELCOME_COPY = {
  eyebrow: 'Welcome to OrenjiTrade',
  step: (current: number, total: number) => `Step ${current} of ${total}`,
  back: 'Back',
  continue: 'Continue',
  saving: 'Saving…',
  signOut: 'Sign out',
  loading: 'Loading your profile',
  loadError: 'We could not load your profile',
  profile: {
    title: 'Who are you?',
    intro:
      'A few quick steps so collectors of your region can find you. You can change everything later in Settings.',
    handle: 'Handle',
    handleHint: 'Lowercase letters, digits and _. It is your profile address.',
    checking: 'Checking the handle…',
    free: (handle: string) => `@${handle} is free`,
    yours: (handle: string) => `@${handle} is yours`,
    taken: 'That handle is already taken. Try another one.',
    displayName: 'Display name',
    displayNameHint: 'How other collectors see you.',
    bio: 'Bio (optional)',
    bioPlaceholder: 'What do you collect? Do you trade, sell or ship?',
  },
  games: {
    title: 'What do you collect?',
    intro: 'Home and Search open on the first game you pick. Switch anytime with the game button.',
    gamesLabel: 'Games you collect or play',
    opensFirst: 'Opens first',
    comingSoon: 'Cards coming soon',
    languages: 'Languages you trade in',
    tags: 'Tags · optional',
    needInterest: 'Choose at least one game or one tag.',
  },
  place: {
    title: 'Where do you ship from?',
    intro:
      'Collectors find binders by state or province. We never use GPS and never ask for your address.',
    discoverable: 'Show me on the map',
    discoverableHelp:
      'Collectors of your region can find your public binders in your state or province. Visitors without an account never see your name. Off until you turn it on.',
    finish: 'Finish',
    finishing: 'Finishing…',
    skip: 'Skip for now',
    ready: 'Welcome to OrenjiTrade! Your profile is ready.',
  },
} as const;
