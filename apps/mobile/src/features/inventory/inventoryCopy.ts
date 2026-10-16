/**
 * The approved English copy of the inventory screens (owner spec 2026-10-14, section 6, mockup
 * screens 1 to 9), one object per screen, so the French translation (on hold) can slot in later.
 * Functions build the sentences that carry a number or a name.
 */

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Inventory (screen 1) and its rows. */
export const INVENTORY_COPY = {
  title: 'Inventory',
  addCards: 'Add cards',
  cards: 'Cards',
  binders: 'Binders',
  viewLabel: 'Inventory view',
  searchPlaceholder: 'Search your cards',
  filters: (on: number) =>
    on === 0 ? 'Filter and sort' : `Filter and sort, ${on} ${on === 1 ? 'filter' : 'filters'} on`,
  select: 'Select',
  doneSelecting: 'Done',
  summary: (cards: number, copies: number, shown: number) => ({
    cards: plural(cards, 'card', 'cards'),
    rest: ` · ${plural(copies, 'copy', 'copies')} · ${shown} public`,
  }),
  loadError: 'Your cards could not load',
  emptyTitle: 'Your inventory is empty',
  emptyBody: 'Add the cards you own, trade or sell. New cards start private.',
  emptyAction: 'Add cards',
  noMatchTitle: 'No cards match',
  noMatchBody: 'Try another search, game, binder or “Who can see it”.',
  noMatchAction: 'Clear all',
  rowHint: 'Opens the card to edit it',
  copies: (count: number) => `×${count}`,
  copiesSpoken: (count: number) => plural(count, 'copy', 'copies'),
  openBinder: 'Open this binder',
} as const;

/** Filter and sort, the bottom sheet (screen 2). */
export const FILTER_COPY = {
  title: 'Filter and sort',
  clearAll: 'Clear all',
  sortBy: 'Sort by',
  sortCreated: 'Recently added',
  sortName: 'Name',
  sortPrice: 'Price',
  game: 'Game',
  allGames: 'All games',
  binder: 'Binder',
  allCards: 'All cards',
  noBinder: 'No binder',
  whoCanSee: 'Who can see it',
  all: 'All',
  public: 'Public',
  private: 'Private',
  show: (count: number | null) =>
    count === null ? 'Show cards' : `Show ${plural(count, 'card', 'cards')}`,
} as const;

/** Add cards (screens 3 and 4). */
export const ADD_CARDS_COPY = {
  back: 'Inventory',
  backLabel: 'Back to Inventory',
  title: 'Add cards',
  searchPlaceholder: 'Card name or code, like LOB-EN001',
  searchLabel: 'Card name or code',
  searchHint: 'The fastest way to add one card. You pick the printing next.',
  manyAtOnce: 'Add many at once',
  deckTitle: 'Import a deck',
  deckBody: '.ydk file from YGOPRODeck or EDOPro',
  collectrTitle: 'Import from Collectr',
  collectrBody: ".csv export. You check every match before it's added",
  scanTitle: 'Scan with camera',
  scanBody: 'Point at a card to add it',
  comingLater: 'Coming later',
  footer: 'New cards start private. You choose what to publish.',
  clear: 'Clear',
  cancel: 'Cancel',
  cardsSection: 'Cards',
  printingsSection: 'Exact printings',
  cardMeta: (game: string, printings: number | null | undefined) =>
    printings ? `${game} · ${plural(printings, 'printing', 'printings')}` : game,
  typingHint:
    'Tap a card to pick its printing, or an exact printing to go straight to the details.',
  tooShort: 'Type two letters or more of the name, or the code printed on the card.',
  noMatch: (text: string) => `No card matches “${text}”`,
  noMatchHint: 'Try fewer letters, or the code printed on the card, like LAVD-EN008.',
  loadError: 'Cards could not load',
} as const;

/** Choose the printing (screen 5). */
export const PRINTING_COPY = {
  title: 'Choose the printing',
  backLabel: 'Back to the search',
  count: (count: number) => `${plural(count, 'printing', 'printings')}. Pick the one on your card.`,
  filterPlaceholder: 'Set code or set name',
  filterLabel: 'Filter printings',
  allRarities: 'All',
  rarityLabel: 'Rarity',
  setAndYear: (set: string, year: string | null) => (year ? `${set} · ${year}` : set),
  none: 'No printing matches. Try another set code or name.',
  loadError: 'This card could not load',
} as const;

/** The card form of Add to inventory (screen 6) and Edit card (screen 7). */
export const CARD_FORM_COPY = {
  copies: 'Copies',
  oneLess: 'One less',
  oneMore: 'One more',
  askingPrice: 'Asking price',
  // The price in "$" or "% TCG" (owner change of 2026-10-16, mockup v43, screens 6 and 7).
  priceIn: 'Price in',
  priceModes: {
    usd: { label: '$', spoken: 'Dollars' },
    pct: { label: '% TCG', spoken: 'Percent of the TCGplayer price' },
  },
  priceInputLabel: {
    usd: 'Asking price in dollars',
    pct: 'Asking price in percent of the TCGplayer price',
  },
  pricePlaceholder: { usd: '12.50', pct: '85' },
  priceHint: {
    usd: 'Leave it empty to agree on a price in the chat.',
    pct: 'Percent of the TCGplayer market price.',
  },
  // A saved text neither mode can show ("Trade only"): kept until a price is typed.
  priceWas: (text: string) => `Was: ${text}`,
  priceUsdFormat: 'Enter an amount like 12.50.',
  priceUsdDecimals: 'Use at most 2 decimals, like 12.50.',
  priceUsdZero: 'Enter more than $0, or leave it empty.',
  priceUsdMax: 'At most $99,999.99.',
  pricePctFormat: 'Enter a whole number, like 85.',
  pricePctRange: 'Enter a percent from 1 to 200.',
  whoCanSee: 'Who can see it',
  private: 'Private',
  public: 'Public',
  privateHint: 'Only you see it until you make it public.',
  // A private card filed in a public deck core (review fix 2 of stage R3): buyers see it as one of
  // the core's key cards, never listed on its own.
  privateInCoreHint: (core: string) =>
    `Buyers see it as a key card of “${core}”. It is not listed on its own.`,
  // Edit card, a temporary publication (set on the paused web) that ended: the card reads Private.
  privateHintEnded:
    'Its temporary publication has ended: only you see it until you make it public again.',
  publicHint: (region: string) => `Collectors in ${region} can find it.`,
  publicHintNoRegion: 'Collectors in your region can find it.',
  // Edit card, a card nobody can find now that "Save changes" makes public (review fix 2 of R2).
  publicHintOnSave: (region: string) => `Collectors in ${region} can find it once you save.`,
  publicHintOnSaveNoRegion: 'Collectors in your region can find it once you save.',
  // Edit card, unchanged: the card's own state (review fix 2 of R2).
  notFoundUntilConfirmed: 'Nobody can find it until you confirm it is still available.',
  notFoundNow: 'Nobody can find it right now.',
  // Public, but nobody can find it (review fix 1 of stage R2): the reason instead of the claim.
  notFoundNoLocation:
    'Nobody can find it yet: add your state or province in Settings › Location, then turn on “Show me on the map”.',
  notFoundHidden:
    'You are hidden from the map, so nobody can find it yet. Turn on “Show me on the map” in Settings › Location.',
  notFoundPrivateProfile:
    'Your profile is private, so nobody can find it yet. Change who sees your profile in Settings › Privacy.',
  notFoundPaused: 'Your public cards are paused, so nobody can find it right now.',
  notFoundBinderPrivate: (binder: string) =>
    `Its binder “${binder}” is private, so nobody can find it yet. Publish the binder to show it.`,
  notFoundBinderOff: (binder: string) =>
    `Its binder “${binder}” is not public right now, so nobody can find it.`,
  privateBinder: 'Private',
  privateBinderLabel: (binder: string) => `${binder}, private binder: its cards don't show`,
  binder: 'Binder',
  noBinder: 'No binder (unfiled)',
  publicNote: 'Public note',
  publicNotePlaceholder: 'NM, English, 1st, for trade',
  counter: (count: number, max: number) => `${count} / ${max}`,
  photos: 'Photos',
  addPhotos: 'Add photos',
  addPhoto: 'Add',
  photosHint: 'Show the real card, front and back. Location data is removed.',
  removePhoto: (index: number) => `Remove photo ${index}`,
  photo: (index: number) => `Photo ${index}`,
  takePhoto: 'Take a photo',
  chooseFromLibrary: 'Choose from your photos',
  photoSourceTitle: 'Add photos',
  cancel: 'Cancel',
  allowPhotos: 'Allow access to your photos to add one.',
  allowCamera: 'Allow the camera to take a photo.',
  cameraUnavailable: 'The camera is not available here. Choose a photo instead.',
  uploading: 'Uploading…',
  photoNotSaved: 'Not saved',
  photoFailed: (count: number) =>
    count === 1 ? "1 photo wasn't saved. Try again." : `${count} photos weren't saved. Try again.`,
  photoRefused: (index: number, problem: string) => `Photo ${index} wasn't saved. ${problem}`,
  removeRefused: (count: number) => (count === 1 ? 'Remove it' : 'Remove them'),
  leaveTitle: (count: number) =>
    count === 1 ? 'Leave without this photo?' : `Leave without these ${count} photos?`,
  leaveBody: (count: number) =>
    count === 1
      ? "It wasn't saved, and it is lost when you leave. Try again to save it."
      : "They weren't saved, and they are lost when you leave. Try again to save them.",
  leave: 'Leave',
  stay: 'Stay',
  tryAgain: 'Try again',
  checkFields: 'Check the highlighted fields.',
  /**
   * A reached size limit of the inventory, the same for everyone (free for all, owner 2026-10-14:
   * no plan, no upgrade).
   */
  inventoryFull: (limit: number | null) =>
    limit !== null
      ? `Your inventory is full: it holds at most ${limit} cards. Delete a card you no longer have to add another.`
      : 'Your inventory is full. Delete a card you no longer have to add another.',
  noteTooLong: 'At most 500 characters.',
} as const;

/** Add to inventory (screen 6). */
export const ADD_DETAILS_COPY = {
  title: 'Add to inventory',
  backLabel: 'Back to the printings',
  submit: 'Add to inventory',
  submitting: 'Adding…',
  footnote: 'Change any of this later by tapping the card in Inventory.',
} as const;

/** Edit card (screen 7) and its delete sheet. */
export const EDIT_CARD_COPY = {
  title: 'Edit card',
  backLabel: 'Back to Inventory',
  save: 'Save changes',
  saving: 'Saving…',
  noChanges: 'No changes yet',
  delete: 'Delete this card',
  deleteTitle: (name: string) => `Delete ${name}?`,
  deleteBody: 'It leaves your inventory and any binder. Its photos are deleted too.',
  deleteConfirm: 'Delete',
  keep: 'Keep it',
  notFoundTitle: 'This card is no longer in your inventory',
  notFoundBody: 'It may have been deleted on another device.',
  notFoundAction: 'Back to Inventory',
  loadError: 'This card could not load',
  hiddenNotice:
    'This card is hidden from other collectors until you confirm it is still available.',
  agingNotice: 'This listing is getting old. Confirm it is still available to keep it fresh.',
  stillAvailable: 'Still available',
  confirming: 'Confirming…',
  confirmed: 'Confirmed: your card is listed as available again.',
} as const;

/** The toasts of the inventory (screens 8 and 9) and of the bulk actions. */
export const TOAST_COPY = {
  saved: 'Saved',
  /** Added, but a photo failed (review fix 1): said on the toast, not only on Edit card. */
  savedPhotosFailed: (count: number) =>
    count === 1 ? "Saved · 1 photo wasn't saved" : `Saved · ${count} photos weren't saved`,
  view: 'View',
  deleted: 'Card deleted',
  deletedMany: (count: number) => `${plural(count, 'card', 'cards')} deleted`,
  undo: 'Undo',
  restored: 'Card restored',
  restoredMany: (count: number) => `${plural(count, 'card', 'cards')} restored`,
  tooLate: 'This card can no longer be restored.',
} as const;

/** The bulk bar of Select mode. */
export const BULK_COPY = {
  selected: (count: number) => `${count} selected`,
  selectAll: 'Select all cards on this page',
  clear: 'Clear selection',
  move: 'Move to binder',
  makePublic: 'Make public',
  makePrivate: 'Make private',
  stillAvailable: 'Still available',
  delete: 'Delete',
  moveTitle: 'Move to binder',
  noBinder: 'No binder (unfiled)',
  deleteTitle: (count: number) => `Delete ${plural(count, 'card', 'cards')}?`,
  deleteBody: 'They leave your inventory and any binder. Their photos are deleted too.',
  deleteConfirm: 'Delete',
  keep: 'Keep them',
} as const;
