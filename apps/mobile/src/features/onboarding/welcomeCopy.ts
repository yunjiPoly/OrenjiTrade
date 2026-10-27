/**
 * The words of the welcome (stage R12, mockup v50 screens 40 to 42), one place for its three
 * steps. English only (owner, 2026-10-20).
 */
export const WELCOME_COPY = {
  eyebrow: 'Welcome to OrenjiTrade',
  step: (current: number, total: number) => `Step ${current} of ${total}`,
  back: 'Back',
  backTo: (step: string) => `Back to ${step}`,
  loading: 'Loading your profile',
  loadError: 'We could not load your profile',
  continue: 'Continue',
  saving: 'Saving…',
  signOut: 'Sign out',
  profile: {
    name: 'Who are you?',
    title: 'Who are you?',
    intro:
      'A few quick steps so collectors of your region can find you. You can change everything later in Settings.',
    handle: 'Handle',
    handleHint: 'Lowercase letters, digits and _. It is your profile address.',
    handleAvailable: 'Available',
    handleChecking: 'Checking the handle',
    handleTaken: 'That handle is already taken. Try another one.',
    displayName: 'Display name',
    bio: 'Bio (optional)',
    bioCount: (length: number, max: number) => `${length} / ${max}`,
    bioPlaceholder: 'What do you collect? Do you trade, sell or ship?',
  },
  games: {
    name: 'What do you collect?',
    title: 'What do you collect?',
    intro: 'Home and Search open on the first game you pick. Switch anytime with the game button.',
    gamesHeading: 'Games',
    gamesLabel: 'Games you collect or play',
    opensFirst: 'Opens first',
    comingSoon: 'Cards coming soon',
    gamesLoading: 'Loading the games',
    gamesError: 'We could not load the games',
    languagesHeading: 'Languages you trade in',
    tagsHeading: 'Tags · optional',
    tagsLabel: 'Tags',
    tagSearch: 'Search or add a tag',
    tagSearchPlaceholder: 'Trader, ships tracked…',
    addTag: (label: string) => `Add “${label}”`,
    addTagName: (label: string) => `Add your own tag ${label}`,
    tagsFull: (max: number) => `You chose the ${max} tags a profile can have.`,
    tagsLoading: 'Loading tags',
    tagsError: 'We could not load the tags',
    noTags: 'No matching tags.',
    needGame: 'Choose at least one game.',
  },
  place: {
    name: 'Where do you ship from?',
    title: 'Where do you ship from?',
    intro:
      'Collectors find binders by state or province. We never use GPS and never ask for your address.',
    discoverable: 'Show me on the map',
    discoverableHelp: (region: string, province: string) =>
      `Collectors of ${region} can find your public binders in ${province}. Visitors without an account never see your name. Off until you turn it on.`,
    yourRegion: 'your region',
    yourProvince: 'your state or province',
    finish: 'Finish',
    finishing: 'Finishing…',
    skip: 'Skip for now',
    ready: 'Welcome to OrenjiTrade! Your profile is ready.',
  },
} as const;

/**
 * The languages a collector trades in, as the welcome offers them (mockup v50 screen 41): their
 * English names, in the mockup's order. The codes are those of the profile (ISO 639-1).
 */
export const WELCOME_LANGUAGES: readonly { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
];
