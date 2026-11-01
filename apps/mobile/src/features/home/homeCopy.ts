/**
 * Every text of Home (stage R7 of the phone redesign; owner prompt of 2026-10-19,
 * docs/product/specs/2026-10-19-home-full-design.md; mockup v50 screens 10, 10b and 10c), in one
 * place. English only (owner, 2026-10-20). Nothing sponsored, nothing to buy (ADR 0019).
 */
export const HOME_COPY = {
  title: 'Home',
  searchField: 'Search cards or collectors',
  searchHint: 'Opens Search with the keyboard',

  chipsLabel: 'Show',
  chips: {
    ALL: 'All',
    NEW_CARDS: 'New cards',
    WANTED: 'Wanted',
    DECK_CORES: 'Deck cores',
  },

  sections: {
    today: 'Today',
    week: 'Earlier this week',
    month: 'Earlier this month',
  },

  time: {
    now: 'now',
    minutes: (count: number) => `${count} min`,
    hours: (count: number) => `${count} h`,
  },

  verbs: {
    cards: (count: number) => (count === 1 ? 'listed a card' : `listed ${count} cards`),
    wanted: 'wants a card',
    deckCore: 'is selling a deck core',
  },
  /** What a screen reader says for a post's header: "{handle} {verb}, {time}, {province}". */
  headerLabel: (handle: string, verb: string, time: string, province: string) =>
    [`${handle} ${verb}`, time, province].filter(Boolean).join(', '),
  headerHint: 'Opens their profile',

  tileLabel: (name: string, price: string | null) => (price ? `${name}, ${price}` : name),
  moreTile: (count: number) => `+${count}`,
  moreTileLabel: (count: number) =>
    `${count} more ${count === 1 ? 'card' : 'cards'} from this collector`,
  moreTilePrice: 'more',
  cardHint: 'Opens who has this card',
  messageAbout: (handle: string, card: string) => `Message ${handle} about ${card}`,
  haveIt: 'I have it',
  haveItLabel: (card: string, handle: string) => `I have ${card}. Message ${handle}`,
  deckCoreTag: 'Deck core',
  photos: (count: number) => `${count} photos`,
  deckCoreLabel: (name: string, price: string | null, note: string | null) =>
    [`${name}, deck core`, price, note].filter(Boolean).join(', '),
  deckCoreHint: 'Opens the deck core',

  end: {
    title: "You're all caught up",
    /** "That’s everything new for Yu-Gi-Oh! in Americas (North) from the last 30 days." */
    text: (what: string, game: string, region: string, days: number) =>
      `That’s ${what} for ${game} in ${region} from the last ${days} days.`,
    what: {
      ALL: 'everything new',
      NEW_CARDS: 'every new card',
      WANTED: 'every wish',
      DECK_CORES: 'every deck core',
    },
    map: 'Explore the map',
  },

  empty: {
    title: (place: string) => `Nothing new in ${place} yet`,
    text: 'Be the first: the cards you make public show up here for collectors in your region.',
    addCards: 'Add cards',
  },
  chipEmpty: {
    NEW_CARDS: (region: string, days: number) =>
      `No new cards in ${region} in the last ${days} days.`,
    WANTED: (region: string, days: number) => `No wishes in ${region} in the last ${days} days.`,
    DECK_CORES: (region: string, days: number) =>
      `No deck cores in ${region} in the last ${days} days.`,
    showAll: 'Show all',
  },

  loading: 'Loading what’s new',
  error: "Couldn't load what's new.",
  retry: 'Try again',
  moreError: "Couldn't load more",

  getStarted: {
    title: 'Get started',
    intro: 'Do these once to sell and find cards in your region.',
    hide: 'Hide these steps',
    progress: (done: number) => `${done} of 3`,
    progressLabel: 'Get started',
    progressValue: (done: number) => `${done} of 3 done`,
    done: ', done',
    province: {
      title: 'Choose your province',
      todo: 'So collectors in your region can find your cards',
      hidden: 'Turn on Show me on the map',
      choose: 'Choose',
      turnOn: 'Turn on',
    },
    card: {
      title: 'List your first card',
      todo: 'Add a card and set it to Public',
      action: 'Add cards',
    },
    wish: {
      title: 'Add a card you want',
      todo: "We'll tell you when someone lists it",
      action: 'Add a wish',
    },
  },
} as const;
