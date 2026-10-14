import type { ApiError } from '@/src/api/ApiError';
import type {
  CreateInventoryItemRequest,
  InventoryItemResponse,
  UpdateInventoryItemRequest,
} from '@/src/api/types';

import { CARD_FORM_COPY } from './inventoryCopy';
import { ASKING_PRICE_MAX, priceFieldText, priceTextOf } from './itemPrice';

/**
 * The card form of Add to inventory and Edit card (owner spec 2026-10-14, section 6, screens 6
 * and 7): copies, the asking price as typed, who can see it, the binder and the public note (the
 * photos are kept beside it). Condition, language, edition, finish, "Available for", "Accepts
 * offers", currency, "Temporarily public" and private notes are gone from the phone: the API
 * keeps them for the paused web, and the phone never changes them.
 */

export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 9999;
export const PUBLIC_NOTE_MAX = 500;

export type CardVisibility = 'PRIVATE' | 'PUBLIC';

export interface CardFormValue {
  /** Copies as typed (digits). */
  quantity: string;
  /** The asking price as typed; empty = no price. */
  price: string;
  visibility: CardVisibility;
  binderId: string | null;
  publicNote: string;
}

export type CardField = 'quantity' | 'price' | 'publicNote';
export type CardFormErrors = Partial<Record<CardField, string>>;

/** A new card: one copy, no price, private, the binder it is added from (if any), no note. */
export function newCardForm(binderId: string | null = null): CardFormValue {
  return { quantity: '1', price: '', visibility: 'PRIVATE', binderId, publicNote: '' };
}

/**
 * The form of an existing card. A temporary publication reads as Public (the phone offers no
 * end date any more); a card priced on the paused web shows its amount ("42.00").
 */
export function cardFormOf(item: InventoryItemResponse): CardFormValue {
  return {
    quantity: String(item.quantity),
    price: priceFieldText(item),
    visibility: item.visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
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
  if ([...value.price.trim()].length > ASKING_PRICE_MAX) {
    errors.price = CARD_FORM_COPY.priceTooLong;
  } else if (/[\n\r\t]/.test(value.price)) {
    errors.price = 'Write the price on one line.';
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
  const price = priceTextOf(value.price);
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
 * it. `null` when nothing in the form changed.
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
  if (value.price.trim() !== before.price.trim()) {
    patch.askingPriceText = priceTextOf(value.price);
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
