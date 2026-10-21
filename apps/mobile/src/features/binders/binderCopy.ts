import type { PublicBinderSummary } from '@/src/api/types';
import { binderKindLabel, cardCount } from '@/src/lib/inventory';

/**
 * The approved English copy of the binder screens (owner spec 2026-10-14, section 7, mockup
 * screens 16 to 18): Inventory › Binders, Edit binder and New binder, the deck core page and the
 * public binder page, one object per screen, so the French translation (on hold) can slot in
 * later. Functions build the sentences that carry a number, a name or a price.
 */

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The purple tag of a deck core: "Deck core · $180", or "Deck core" without a price. */
export function deckCoreTag(price: string | null | undefined): string {
  const text = price?.trim();
  return text ? `Deck core · ${text}` : 'Deck core';
}

/** Inventory › Binders (screen 17). */
export const INVENTORY_BINDERS_COPY = {
  /**
   * "3 binders · 1 deck core": the deck cores part is dropped at 0, and so is the binders part
   * when the collector has deck cores only ("1 deck core", not "0 binders · 1 deck core").
   */
  summary: (binders: number, cores: number) =>
    binders === 0 && cores > 0
      ? { binders: plural(cores, 'deck core', 'deck cores'), rest: '' }
      : {
          binders: plural(binders, 'binder', 'binders'),
          rest: cores > 0 ? ` · ${plural(cores, 'deck core', 'deck cores')}` : '',
        },
  newBinder: 'New binder',
  reorder: 'Reorder',
  reorderLabel: 'Reorder your binders',
  photos: (count: number) => plural(count, 'photo', 'photos'),
  cards: (count: number) => plural(count, 'card', 'cards'),
  public: 'Public',
  private: 'Private',
  tipTitle: 'Selling a whole deck?',
  tipBody: 'Turn on “Sell as a deck core” in a binder. Photos, a price and a note are enough.',
  rowHint: 'Opens the binder to edit it',
  /** A game's section (stage G): "{n} binders", deck cores included. */
  sectionCount: (count: number) => plural(count, 'binder', 'binders'),
  sectionLabel: (game: string, count: number) => `${game}, ${plural(count, 'binder', 'binders')}`,
  loadError: 'Your binders could not load',
  emptyTitle: 'No binders yet',
  emptyBody:
    'Binders group your cards. Sell a whole deck as a deck core: photos, a price and a note are enough.',
  emptyAction: 'New binder',
} as const;

/** Edit binder and New binder (screen 18), with its delete sheet and the card picker. */
export const EDIT_BINDER_COPY = {
  titleEdit: 'Edit binder',
  titleNew: 'New binder',
  backLabel: 'Back to your binders',
  name: 'Name',
  namePlaceholder: 'Trade binder',
  nameRequired: 'Give your binder a name.',
  nameTooLong: 'At most 80 characters.',
  whoCanSee: 'Who can see it',
  private: 'Private',
  public: 'Public',
  coreTitle: 'Sell as a deck core',
  coreHint: 'Photos, one price and a note',
  photos: 'Photos',
  addPhoto: 'Add',
  askingPrice: 'Asking price',
  pricePlaceholder: '$180 or Trade only',
  priceTooLong: 'At most 40 characters.',
  priceOneLine: 'Keep the price on one line.',
  note: 'Public note',
  notePlaceholder: "What's in it, condition, language",
  noteTooLong: 'At most 500 characters.',
  counter: (count: number, max: number) => `${count} / ${max}`,
  privateCoreHint: 'Buyers can only find a deck core when it is public.',
  keyCards: 'Key cards',
  optional: ' · optional',
  cardsInside: 'Cards inside',
  addCards: 'Add cards',
  keyCardsHint: 'Helps buyers find it when they search a card.',
  noCardsHint: 'No cards in this binder yet.',
  cardLine: (code: string, copies: number) => `${code} · ×${copies}`,
  removeCard: (name: string) => `Remove ${name} from this binder`,
  undoRemove: (name: string) => `Keep ${name} in this binder`,
  pendingAdd: 'Added when you save',
  pendingRemove: 'Leaves when you save',
  showMore: 'Show more',
  save: 'Save changes',
  saving: 'Saving…',
  noChanges: 'No changes yet',
  create: 'Create binder',
  creating: 'Creating…',
  delete: 'Delete binder',
  deleteTitle: (name: string) => `Delete ${name}?`,
  deleteBody: 'Its photos, price and note go away. Your cards stay in your inventory.',
  deleteBodyPlain: 'Your cards stay in your inventory.',
  deleteConfirm: 'Delete binder',
  keep: 'Keep it',
  publicPage: 'See its public page',
  hiddenNotice:
    'This binder is hidden from other collectors until you confirm it is still available.',
  agingNotice: 'This binder is getting old. Confirm it is still available to keep it fresh.',
  stillAvailable: 'Still available',
  confirming: 'Confirming…',
  confirmed: 'Confirmed: your binder and its cards are listed as available again.',
  checkFields: 'Check the highlighted fields.',
  limitTitle: 'You reached the number of binders you can have',
  notFoundTitle: 'Binder not found',
  notFoundBody: 'It may have been deleted.',
  notFoundAction: 'Back to your binders',
  loadError: 'This binder could not load',
  cardsLoadError: 'The cards of this binder could not load',
  photoFull: 'A deck core can have at most 4 photos.',
  // The card picker ("Add cards": pick from your inventory).
  pickerTitle: 'Add cards',
  pickerSearch: 'Search your cards',
  pickerHint: 'Cards in another binder move here.',
  /** The game (stage G): New binder's picker and Edit binder's field. */
  game: 'Game',
  gameHint: 'A binder holds cards of one game. You can’t change it once it has cards.',
  gameComingSoon: 'Cards coming soon',
  /** What a screen reader says for a binder's game that can no longer change. */
  gameLocked: (game: string) => `Game: ${game}. It can't change once the binder has cards`,
  gameChange: (game: string) => `Game: ${game}. Change game`,
  /**
   * The binder holds no card, but one that left it (deleted, or sold) can still come back with
   * Undo: the game waits (review fix 1, U2; the API's `gameLocked`).
   */
  gameLockedUndo:
    'A card that left this binder in the last 10 minutes can still come back with Undo. You can change the game after that.',
  gameLockedUndoLabel: (game: string) =>
    `Game: ${game}. It can't change while a card that left the binder can still come back with Undo`,
  /** New binder before the games list answered (review fix 1, P3): Save waits for it. */
  gamesLoadError: 'The games could not load',
  gamesWait: 'Choose the binder’s game first.',
  gameSheetTitle: 'Choose the binder’s game',
  /** Only the binder's game in the card picker (stage G). */
  pickerGameHint: (game: string) =>
    `Only your ${game} cards can go in. Cards in another binder move here.`,
  pickerCoreHint:
    'Cards in another binder move here. Buyers see them when the deck core is public.',
  pickerEmpty: 'All your cards are already in this binder.',
  pickerNoMatch: (text: string) => `None of your other cards match “${text}”.`,
  pickerInBinder: (binder: string) => `in ${binder}`,
  pickerUnfiled: 'unfiled',
  pickerAdd: (count: number) => (count > 0 ? `Add ${plural(count, 'card', 'cards')}` : 'Add cards'),
  pickerMore: 'Show more',
  pickerLoadError: 'Your cards could not load',
} as const;

/** The toasts of the binder screens. */
export const BINDER_TOAST_COPY = {
  saved: 'Saved',
  savedPhotosFailed: (count: number) =>
    count === 1 ? "Saved · 1 photo wasn't saved" : `Saved · ${count} photos weren't saved`,
  deleted: 'Binder deleted',
} as const;

/** The deck core page, what buyers see (screen 16). */
export const DECK_CORE_COPY = {
  tag: 'Deck core',
  backLabel: 'Back',
  photosLabel: 'Photos',
  photoCounter: (index: number, total: number) => `${index} / ${total}`,
  photoLabel: (index: number, total: number) => `Photo ${index} of ${total}`,
  showPhoto: (index: number) => `Photo ${index}`,
  noPhotos: 'No photos yet',
  sellerLine: (place: string, binders: number) =>
    `${place} · ${plural(binders, 'public binder', 'public binders')}`,
  sellerLabel: (handle: string, place: string) => `${handle}, ${place}. Opens their profile.`,
  keyCards: 'Key cards',
  keyCardCopies: (count: number) => `×${count}`,
  keyCardLabel: (name: string, count: number) =>
    `${name}, ${plural(count, 'copy', 'copies')}. Opens the card.`,
  message: (handle: string) => `Message ${handle}`,
  editOwn: 'Edit binder',
  report: 'Report',
  reportLabel: (name: string) => `Report ${name}`,
  notFoundTitle: 'This binder is not available',
  notFoundBody:
    'It does not exist, is private, was sold, its publication ended, or its owner has to confirm it is still up to date.',
  notFoundAction: 'Back to the map',
  limitTitle: "You reached today's binder views",
  loadError: 'This binder could not load',
} as const;

/** A plain public binder (the public binder screen, restyled to the new look). */
export const PUBLIC_BINDER_COPY = {
  backLabel: 'Back',
  cardsLine: (count: number, games: string) =>
    games ? `${plural(count, 'card', 'cards')} · ${games}` : plural(count, 'card', 'cards'),
  ends: (label: string) => ` · ${label}`,
  search: 'Search this binder',
  count: (count: number) => plural(count, 'card', 'cards'),
  emptyTitle: 'No cards match',
  emptyBody: 'Try another search.',
  cardsLoadError: 'The cards could not load',
} as const;

/**
 * What a screen reader says of a public binder's kind in lists: "Deck core · $60" for a deck core
 * (its cards sell only with it, and it may have none), else "Collection", "9 cards".
 */
export function publicBinderKindParts(binder: PublicBinderSummary): string[] {
  return binder.sellsAsCore
    ? [deckCoreTag(binder.askingPriceText)]
    : [binderKindLabel(binder.kind), cardCount(binder.itemCount)];
}
