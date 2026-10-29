import type {
  CreateInventoryItemRequest,
  InventoryItemResponse,
  UpdateInventoryItemRequest,
} from '@orenji/api-client';
import { ApiError } from '../../../core/http/api-error';
import { editionLabel, languageLabel } from '../../../shared/catalog/catalog-labels';
import { conditionLabel } from '../../../shared/inventory/inventory-labels';
import {
  PriceMode,
  askingPriceTextOf,
  checkPrice,
  priceInputOf,
  readAskingPrice,
} from './item-price';

/**
 * The card form of the Edit card and Add cards drawers (web redesign spec 9.8 and 9.9, decision 8:
 * the phone's card model): copies, the asking price in "$" or "% TCG", who can see it (Private or
 * Public), the binder and the public note; the photos sit beside it. Condition, language, edition,
 * finish, availability, offers, currency, "Temporarily public" and private notes are no longer
 * edited on the web; the API keeps them. The rules are the phone's
 * (`apps/mobile/src/features/inventory/cardForm.ts`), ported as they are.
 */

export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 9999;
export const PUBLIC_NOTE_MAX = 500;

export type CardVisibility = 'PRIVATE' | 'PUBLIC';

export interface CardFormValue {
  /** Copies as typed (digits). */
  quantity: string;
  priceMode: PriceMode;
  /** The price's number as typed ("12.50", "85"); empty = no price. */
  price: string;
  /** A saved text neither mode can show, kept until a price is typed; null otherwise. */
  priceWas: string | null;
  visibility: CardVisibility;
  binderId: string | null;
  publicNote: string;
}

export type CardField = 'quantity' | 'price' | 'publicNote';
export type CardFormErrors = Partial<Record<CardField, string>>;

/** The form's words (the phone's `CARD_FORM_COPY`). */
export const CARD_FORM_COPY = {
  copies: 'Copies',
  oneLess: 'One less',
  oneMore: 'One more',
  askingPrice: 'Asking price',
  whoCanSee: 'Who can see it',
  private: 'Private',
  public: 'Public',
  privateHint: 'Only you see it until you make it public.',
  privateHintEnded:
    'Its temporary publication has ended: only you see it until you make it public again.',
  publicHint: (region: string) => `Collectors in ${region} can find it.`,
  publicHintNoRegion: 'Collectors in your region can find it.',
  binder: 'Binder',
  noBinder: 'No binder (unfiled)',
  binderHint: (game: string) => `Only ${game} binders. A binder holds cards of one game.`,
  publicNote: 'Public note',
  publicNotePlaceholder: 'NM, English, 1st, for trade',
  photos: 'Photos',
  photosHint: 'Show the real card, front and back. Location data is removed.',
  noteTooLong: 'At most 500 characters.',
  legacy: (parts: string) => `From the old web form: ${parts}`,
  addToNote: 'Add to public note',
} as const;

/** A new card: one copy, no price in the mode used last, private, the given binder, no note. */
export function newCardForm(
  binderId: string | null = null,
  priceMode: PriceMode = 'usd',
  visibility: CardVisibility = 'PRIVATE',
): CardFormValue {
  return {
    quantity: '1',
    priceMode,
    price: '',
    priceWas: null,
    visibility,
    binderId,
    publicNote: '',
  };
}

/** A temporary publication (set on the old web form) whose end has passed. */
export function temporaryPublicationEnded(
  item: { visibility: string; publicUntil?: string | null },
  now = Date.now(),
): boolean {
  return (
    item.visibility === 'TEMPORARILY_PUBLIC' &&
    !(item.publicUntil && Date.parse(item.publicUntil) > now)
  );
}

/** The form of an existing card (a running temporary publication reads as Public). */
export function cardFormOf(
  item: InventoryItemResponse,
  now = Date.now(),
  priceMode: PriceMode = 'usd',
): CardFormValue {
  const price = readAskingPrice(item);
  return {
    quantity: String(item.quantity),
    priceMode: price.mode ?? priceMode,
    price: price.number,
    priceWas: price.was,
    visibility:
      item.visibility === 'PUBLIC' ||
      (item.visibility === 'TEMPORARILY_PUBLIC' && !temporaryPublicationEnded(item, now))
        ? 'PUBLIC'
        : 'PRIVATE',
    binderId: item.binder?.id ?? null,
    publicNote: item.publicNotes ?? '',
  };
}

/** Whole copies, or NaN when the text is not a whole number. */
export function parseQuantity(text: string): number {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : Number.NaN;
}

/** The copies after a − or + (kept between 1 and 9 999). */
export function stepQuantity(text: string, direction: 1 | -1): string {
  const current = parseQuantity(text);
  const base = Number.isNaN(current) ? QUANTITY_MIN : current;
  return String(Math.min(QUANTITY_MAX, Math.max(QUANTITY_MIN, base + direction)));
}

/** The mode switched: the number is cleared (85% is not $85); a "Was" text stays. */
export function switchPriceMode(
  value: Pick<CardFormValue, 'priceMode'>,
  priceMode: PriceMode,
): Partial<CardFormValue> {
  return priceMode === value.priceMode ? {} : { priceMode, price: '' };
}

/** A price typed in the number box: what the box keeps; a "Was" text is replaced. */
export function typePrice(
  value: Pick<CardFormValue, 'priceMode'>,
  text: string,
): Partial<CardFormValue> {
  return { price: priceInputOf(value.priceMode, text), priceWas: null };
}

function priceOutcome(value: CardFormValue): { key: string; text: string | null } {
  if (value.priceWas !== null) {
    return { key: `was:${value.priceWas}`, text: value.priceWas };
  }
  const check = checkPrice(value.priceMode, value.price);
  if (check.kind === 'ok') {
    return { key: check.text, text: check.text };
  }
  if (check.kind === 'empty') {
    return { key: 'none', text: null };
  }
  return { key: `typed:${value.priceMode}:${value.price.trim()}`, text: null };
}

/** The quantity's inline error, or null. */
export function quantityError(text: string): string | null {
  const quantity = parseQuantity(text);
  if (!text.trim()) {
    return 'Enter how many copies you have.';
  }
  if (Number.isNaN(quantity)) {
    return 'Enter a whole number.';
  }
  if (quantity < QUANTITY_MIN) {
    return 'At least 1 copy.';
  }
  return quantity > QUANTITY_MAX ? `At most ${QUANTITY_MAX} copies.` : null;
}

/** The inline errors of the form; empty when it can be sent. */
export function validateCardForm(value: CardFormValue): CardFormErrors {
  const errors: CardFormErrors = {};
  const quantity = quantityError(value.quantity);
  if (quantity) {
    errors.quantity = quantity;
  }
  if (value.priceWas === null) {
    const price = checkPrice(value.priceMode, value.price);
    if (price.kind === 'error') {
      errors.price = price.message;
    }
  }
  if (value.publicNote.trim().length > PUBLIC_NOTE_MAX) {
    errors.publicNote = CARD_FORM_COPY.noteTooLong;
  }
  return errors;
}

export function hasErrors(errors: CardFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * `POST /inventory/items` of a card added on the web: the form plus the phone's fixed values
 * (trade or sale, no offers, no stated condition; language, edition and finish are the printing's).
 */
export function toCreateBody(value: CardFormValue, printingId: string): CreateInventoryItemRequest {
  const body: CreateInventoryItemRequest = {
    printingId,
    quantity: parseQuantity(value.quantity),
    visibility: value.visibility as CreateInventoryItemRequest['visibility'],
    availability: 'TRADE_OR_SALE' as CreateInventoryItemRequest['availability'],
    acceptsOffers: false,
    conditionStated: false,
  };
  const price = askingPriceTextOf(value.priceMode, value.price);
  if (price) {
    body.askingPriceText = price;
  }
  const note = value.publicNote.trim();
  if (note) {
    body.publicNotes = note;
  }
  if (value.binderId) {
    body.binderId = value.binderId;
  }
  return body;
}

/**
 * What the form changes on the card (`PATCH /inventory/items/{id}`): only the changed fields, with
 * `confirm: true` (a save confirms the card is still available). Visibility is sent when it
 * changed and whenever the binder changes. `null` when nothing changed.
 */
export function toPatch(
  value: CardFormValue,
  item: InventoryItemResponse,
): UpdateInventoryItemRequest | null {
  const before = cardFormOf(item);
  const patch: UpdateInventoryItemRequest = {};
  const quantity = parseQuantity(value.quantity);
  if (quantity !== item.quantity) {
    patch.quantity = quantity;
  }
  const price = priceOutcome(value);
  if (price.key !== priceOutcome(before).key) {
    patch.askingPriceText = price.text;
  }
  if (value.publicNote.trim() !== before.publicNote.trim()) {
    patch.publicNotes = value.publicNote.trim() || null;
  }
  const binderChanged = value.binderId !== before.binderId;
  if (binderChanged) {
    patch.binderId = value.binderId;
  }
  if (binderChanged || value.visibility !== before.visibility) {
    patch.visibility = value.visibility as UpdateInventoryItemRequest['visibility'];
  }
  if (Object.keys(patch).length === 0) {
    return null;
  }
  patch.confirm = true;
  return patch;
}

/** Whether the form differs from the card (photos are counted by the drawer). */
export function formChanged(value: CardFormValue, item: InventoryItemResponse): boolean {
  return toPatch(value, item) !== null;
}

/** Server field errors (400 `VALIDATION_FAILED`) on the form's fields. */
export function serverCardErrors(error: ApiError): CardFormErrors {
  const errors: CardFormErrors = {};
  const quantity = error.fieldErrors['quantity'];
  const price = error.fieldErrors['askingPriceText'] ?? error.fieldErrors['askingPrice'];
  const note = error.fieldErrors['publicNotes'];
  if (quantity) {
    errors.quantity = quantity;
  }
  if (price) {
    errors.price = price;
  }
  if (note) {
    errors.publicNote = note;
  }
  return errors;
}

/**
 * "Near Mint · English · 1st Edition" for a card made on the old web form (decision 8): its stated
 * condition, language and edition, read-only. Null for a card whose condition is not stated (every
 * card added on the phone or the new web), which shows nothing.
 */
export function legacyDetails(
  item: Pick<InventoryItemResponse, 'condition' | 'conditionStated' | 'language' | 'edition'>,
): string | null {
  if (item.conditionStated === false || !item.condition?.trim()) {
    return null;
  }
  const parts = [conditionLabel(item.condition)];
  if (item.language?.trim()) {
    parts.push(languageLabel(item.language));
  }
  if (item.edition?.trim()) {
    parts.push(editionLabel(item.edition));
  }
  return parts.filter((part) => part && part !== '—').join(' · ');
}

/** The public note with the old details added (a line of its own; never past 500 characters). */
export function noteWithLegacy(note: string, details: string): string {
  const trimmed = note.trim();
  if (trimmed.includes(details)) {
    return note;
  }
  const next = trimmed ? `${trimmed}\n${details}` : details;
  return next.slice(0, PUBLIC_NOTE_MAX);
}
