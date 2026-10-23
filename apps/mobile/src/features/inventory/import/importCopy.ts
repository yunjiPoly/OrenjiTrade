import type { ImportSource } from '@/src/api/types';

/**
 * The words of the import's screens (mockup v50 screens 66 to 68, stage R14), in one place: the
 * file step, the check step's top bar, filter and amber bar, and the done screen. The words of
 * the counts, the rows, the refusals and the results stay in `importLabels.ts` (stage S5).
 */
export const IMPORT_COPY = {
  title: 'Import cards',
  checkTitle: 'Check the cards',
  doneTitle: 'Import done',
  back: 'Back',
  // The file step (66).
  sourceLine: {
    YDK: 'From YGOPRODeck, EDOPro or Dueling Book',
    COLLECTR_CSV:
      'Your Collectr portfolio, exported as CSV. OrenjiTrade never connects to Collectr.',
  } satisfies Record<ImportSource, string>,
  intro:
    'We match every card of the file. You see them all and choose what goes in before anything is added.',
  chooseFile: 'Choose a file',
  pasteInstead: 'Paste the text of the file instead',
  pasteHint: 'Open the file in another app, copy all of it, and paste it here.',
  useText: 'Use this text',
  switchTo: {
    YDK: {
      title: 'Yu-Gi-Oh! deck file instead',
      line: 'A .ydk file from a deck builder. Its cards are matched by passcode.',
    },
    COLLECTR_CSV: {
      title: 'Collectr CSV export instead',
      line: 'Any game. Rows that name no game use the one you pick.',
    },
  } satisfies Record<ImportSource, { title: string; line: string }>,
  // The check step (67).
  discard: 'Discard this import',
  discardTitle: 'Discard this import?',
  discardBody: 'Nothing was added to your inventory yet.',
  discardConfirm: 'Discard',
  keepChecking: 'Keep checking',
  filterLabel: 'Show',
  /** The file's name when this phone picked it, else what it was. */
  fileFallback: {
    YDK: 'Your deck file',
    COLLECTR_CSV: 'Your CSV export',
  } satisfies Record<ImportSource, string>,
  useNewest: 'Use the newest',
  useNewestHint:
    'Takes the most recent printing by release date for every card without one. Where that set has several versions of a card, the plain copy (Unlimited, no foil) is taken and marked for you to check.',
  chooseCopyReason: 'Choose the copy of the marked cards, or use the newest.',
  sections: 'Deck sections',
  sectionsHint: 'Switch off a section to leave its cards out.',
  copiesLabel: (title: string, condition: string, copies: string) =>
    `Condition and copies of ${title}: ${condition}, ${copies}`,
  // Done (68).
  added: (count: string) => `${count} ${count === '1' ? 'card' : 'cards'} added`,
  startPrivate: 'They start private. Make the ones you trade public from Inventory.',
  notRecognised: (count: string) => `Not recognised · ${count}`,
  withoutPrinting: (count: string) => `Without a printing · ${count}`,
  toInventory: 'Go to my inventory',
  another: 'Import another file',
} as const;
