import type { ApiError } from '@/src/api/ApiError';
import type {
  CreateInventoryItemRequest,
  InventoryItemResponse,
  UpdateInventoryItemRequest,
} from '@/src/api/types';

import { CARD_FORM_COPY } from './inventoryCopy';
import {
  askingPriceTextOf,
  checkPrice,
  priceInputOf,
  readAskingPrice,
  type PriceMode,
} from './itemPrice';
import { temporaryPublicationEnded } from './visibilityStatus';

/**
 * The card form of Add to inventory and Edit card (owner spec 2026-10-14, section 6, screens 6
 * and 7): copies, the asking price, who can see it, the binder and the public note (the photos are
 * kept beside it). Condition, language, edition, finish, "Available for", "Accepts offers",
 * currency, "Temporarily public" and private notes are gone from the phone: the API keeps them for
 * the paused web, and the phone never changes them. The asking price is a number in "$" or in
 * "% TCG" since the owner's change of 2026-10-16, saved as one text ("$12.50", "85% TCG").
 */

export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 9999;
export const PUBLIC_NOTE_MAX = 500;

export type CardVisibility = 'PRIVATE' | 'PUBLIC';

export interface CardFormValue {
  /** Copies as typed (digits). */
  quantity: string;
  /** How the asking price is typed: "$" or "% TCG". */
  priceMode: PriceMode;
  /** The asking price's number as typed ("12.50", "85"); empty = no price. */
  price: string;
  /**
   * Edit card: a saved price text neither mode can show ("Trade only"), shown as "Was: {text}"
   * and kept by a save until a price is typed or the field is cleared; null otherwise.
   */
  priceWas: string | null;
  visibility: CardVisibility;
  binderId: string | null;
  publicNote: string;
}

export type CardField = 'quantity' | 'price' | 'publicNote';
export type CardFormErrors = Partial<Record<CardField, string>>;

/**
 * A new card: one copy, no price in the mode the collector used last on this phone ("$" the first
 * time), private, the binder it is added from (if any), no note.
 */
export function newCardForm(
  binderId: string | null = null,
  priceMode: PriceMode = 'usd'
): CardFormValue {
  return {
    quantity: '1',
    priceMode,
    price: '',
    priceWas: null,
    visibility: 'PRIVATE',
    binderId,
    publicNote: '',
  };
}

/**
 * The form of an existing card. A temporary publication reads as Public while it runs (the phone
 * offers no end date any more), and as Private once it has ended (review fix 2 of stage R2: nobody
 * can see it, and choosing Public publishes it again). The price reads back in its mode
 * (`readAskingPrice`: a card priced on the paused web shows its amount, "42.00"); a card without a
 * price starts in `priceMode`, the mode used last.
 */
export function cardFormOf(
  item: InventoryItemResponse,
  now = Date.now(),
  priceMode: PriceMode = 'usd'
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

/** The copies after a − or + (kept between 1 and 9 999; a text that is no number starts at 1). */
export function stepQuantity(text: string, direction: 1 | -1): string {
  const current = parseQuantity(text);
  const base = Number.isNaN(current) ? QUANTITY_MIN : current;
  return String(Math.min(QUANTITY_MAX, Math.max(QUANTITY_MIN, base + direction)));
}

/**
 * The mode switched (the "$" | "% TCG" switch): the number is cleared, 85% is not $85. A saved
 * text shown as "Was: {text}" stays: nothing was typed.
 */
export function switchPriceMode(
  value: Pick<CardFormValue, 'priceMode'>,
  priceMode: PriceMode
): Partial<CardFormValue> {
  return priceMode === value.priceMode ? {} : { priceMode, price: '' };
}

/**
 * A price typed in the number box (or the box cleared): what the box keeps of it; a saved text
 * shown as "Was: {text}" is replaced from now on.
 */
export function typePrice(
  value: Pick<CardFormValue, 'priceMode'>,
  text: string
): Partial<CardFormValue> {
  return { price: priceInputOf(value.priceMode, text), priceWas: null };
}

/**
 * What a save does to the price: keep the saved text (`keep`), or write `text` (null: no price).
 * `key` tells two forms that save the same price apart from two that do not.
 */
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

/** The inline errors of the form (the API's bounds); empty when it can be sent. */
export function validateCardForm(value: CardFormValue): CardFormErrors {
  const errors: CardFormErrors = {};
  const quantity = parseQuantity(value.quantity);
  if (!value.quantity.trim()) {
    errors.quantity = 'Enter how many copies you have.';
  } else if (Number.isNaN(quantity)) {
    errors.quantity = 'Enter a whole number.';
  } else if (quantity < QUANTITY_MIN) {
    errors.quantity = 'At least 1 copy.';
  } else if (quantity > QUANTITY_MAX) {
    errors.quantity = `At most ${QUANTITY_MAX} copies.`;
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
 * `POST /inventory/items` of a card added on the phone: what the form holds, plus the fixed values
 * of the phone (section 12): trade or sale, no offers, no stated condition; language, edition and
 * finish are left to the server (the printing's).
 */
export function toCreateBody(value: CardFormValue, printingId: string): CreateInventoryItemRequest {
  const body: CreateInventoryItemRequest = {
    printingId,
    quantity: parseQuantity(value.quantity),
    visibility: value.visibility,
    availability: 'TRADE_OR_SALE',
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
 * `PATCH /inventory/items/{id}` of Edit card: only the fields that changed (absent = unchanged,
 * null clears), and `confirm: true` (a save counts as "still available", section 6). Visibility is
 * sent when it changed and whenever the binder changes, so the card is exactly as the form shows
 * it. The price is sent only when it saves another price than the card's: an untouched old text
 * ("Trade only", "$12") stays as it was saved. `null` when nothing in the form changed.
 */
export function toPatch(
  value: CardFormValue,
  item: InventoryItemResponse
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
    patch.visibility = value.visibility;
  }
  if (Object.keys(patch).length === 0) {
    return null;
  }
  patch.confirm = true;
  return patch;
}

/** Whether the form differs from the card (the photos are counted by the screen). */
export function formChanged(value: CardFormValue, item: InventoryItemResponse): boolean {
  return toPatch(value, item) !== null;
}

/** Server field errors (400 `VALIDATION_FAILED`) on the form's fields. */
export function serverCardErrors(error: ApiError): CardFormErrors {
  const errors: CardFormErrors = {};
  const quantity = error.fieldErrors.quantity;
  const price = error.fieldErrors.askingPriceText ?? error.fieldErrors.askingPrice;
  const note = error.fieldErrors.publicNotes;
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
