/**
 * The approved English copy of the game pill and its sheet (stage G of the phone redesign, mockup
 * screen 34, version 50), in one place.
 */
export const GAME_COPY = {
  /** What a screen reader says for the pill. */
  pillLabel: (name: string) => `Game: ${name}. Change game`,
  sheetTitle: 'Choose a game',
  sheetIntro: 'Home and Search show one game at a time.',
  groupLabel: 'Game',
  /** The second line of a game the collector can browse. */
  yourCards: (count: number) => (count > 0 ? `${count} of your cards` : 'None of your cards yet'),
  /** A game without cards in the catalogue: dimmed, it cannot be picked. */
  comingSoon: 'Cards coming soon',
  footnote:
    'Your inventory keeps every game, with binders grouped by game. Chats and the bell show every game.',
  /** The games list could not load (review fix 1, U5): the sheet's error, with "Try again". */
  loadError: 'The games could not load',
  /** The empty states of a game in Search (review fix 1, U4): opens "Choose a game". */
  switchGame: 'Switch game',
} as const;
