import type { ApiError } from '@/src/api/ApiError';
import type {
  CreateInventoryItemRequest,
  GameSchema,
  InventoryAvailability,
  InventoryItemResponse,
  PrintingSummary,
  UpdateInventoryItemRequest,
  Visibility,
} from '@/src/api/types';
import {
  DEFAULT_CURRENCY,
  DEFAULT_TEMPORARY_DURATION,
  publicUntilFor,
  type TemporaryDuration,
} from '@/src/lib/inventory';

/**
 * The add-card and edit-card form (mirror of the web's `features/inventory/data/item-form.ts`,
 * without Angular forms): text inputs are kept as typed, validated like the API, and turned into
 * a `POST` body or a `PATCH` with only the changed fields.
 */

/** Keep the current end of a temporary publication instead of starting a new one. */
export const KEEP_END = 'KEEP';
export type DurationChoice = TemporaryDuration | typeof KEEP_END;

export const MAX_QUANTITY = 9999;
export const MAX_PRICE = 9_999_999_999.99;
export const NOTES_MAX = 2000;
export const PUBLIC_NOTES_MAX = 500;

export interface ItemFormValue {
  /** As typed (digits). */
  quantity: string;
  condition: string;
  language: string;
  edition: string;
  finish: string;
  /** As typed; empty = no asking price. */
  askingPrice: string;
  currency: string;
  availability: InventoryAvailability;
  acceptsOffers: boolean;
  notes: string;
  publicNotes: string;
  visibility: Visibility;
  duration: DurationChoice;
  binderId: string | null;
}

export type ItemField =
  'quantity' | 'condition' | 'askingPrice' | 'currency' | 'notes' | 'publicNotes';

export type ItemFormErrors = Partial<Record<ItemField, string>>;

/** Defaults of a new item: the printing's language/edition/finish, Near Mint, private. */
export function newItemDefaults(
  printing: PrintingSummary | null,
  schema: GameSchema | null | undefined,
  binderId: string | null
): ItemFormValue {
  const conditions = schema?.conditions ?? [];
  return {
    quantity: '1',
    condition: conditions.includes('NEAR_MINT') ? 'NEAR_MINT' : (conditions[0] ?? 'NEAR_MINT'),
    language: printing?.language ?? schema?.languages[0] ?? 'en',
    edition: printing?.edition ?? schema?.editions[0] ?? '',
    finish: printing?.finish ?? schema?.finishes[0] ?? '',
    askingPrice: '',
    currency: DEFAULT_CURRENCY,
    availability: 'TRADE_OR_SALE',
    acceptsOffers: false,
    notes: '',
    publicNotes: '',
    visibility: 'PRIVATE',
    duration: DEFAULT_TEMPORARY_DURATION,
    binderId,
  };
}

function priceText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(Math.round(value * 100) / 100);
}

/** Form value of an existing item. A running temporary publication keeps its end by default. */
export function itemFormValue(
  item: InventoryItemResponse,
  now: number = Date.now()
): ItemFormValue {
  const running =
    item.visibility === 'TEMPORARILY_PUBLIC' &&
    !!item.publicUntil &&
    Date.parse(item.publicUntil) > now;
  return {
    quantity: String(item.quantity),
    condition: item.condition,
    language: item.language,
    edition: item.edition,
    finish: item.finish,
    askingPrice: priceText(item.askingPrice),
    currency: item.currency || DEFAULT_CURRENCY,
    availability: item.availability,
    acceptsOffers: item.acceptsOffers,
    notes: item.notes ?? '',
    publicNotes: item.publicNotes ?? '',
    visibility: item.visibility,
    duration: running ? KEEP_END : DEFAULT_TEMPORARY_DURATION,
    binderId: item.binder?.id ?? null,
  };
}

/** Whole copies, or NaN when the text is not a whole number. */
export function parseQuantity(text: string): number {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : Number.NaN;
}

/** A price (`12`, `12.5`, `12,50`), `null` when empty, NaN when not a number. */
export function parsePrice(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) {
    return null;
  }
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** Inline errors for the form (the API's bounds); empty when valid. */
export function validateItemForm(value: ItemFormValue): ItemFormErrors {
  const errors: ItemFormErrors = {};
  const quantity = parseQuantity(value.quantity);
  if (!value.quantity.trim()) {
    errors.quantity = 'Enter how many copies you have.';
  } else if (Number.isNaN(quantity)) {
    errors.quantity = 'Enter a whole number.';
  } else if (quantity < 1) {
    errors.quantity = 'At least 1 copy.';
  } else if (quantity > MAX_QUANTITY) {
    errors.quantity = `At most ${MAX_QUANTITY} copies.`;
  }
  if (!value.condition) {
    errors.condition = 'Choose a condition.';
  }
  const price = parsePrice(value.askingPrice);
  if (price !== null) {
    if (Number.isNaN(price)) {
      errors.askingPrice = 'Enter a valid price.';
    } else if (Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) {
      errors.askingPrice = 'Use at most two decimals.';
    } else if (price > MAX_PRICE) {
      errors.askingPrice = 'Enter a valid price.';
    }
  }
  if (!/^[A-Z]{3}$/.test(value.currency)) {
    errors.currency = 'Use a three-letter currency code, like CAD.';
  }
  if (value.notes.length > NOTES_MAX) {
    errors.notes = `Private notes are limited to ${NOTES_MAX} characters.`;
  }
  if (value.publicNotes.length > PUBLIC_NOTES_MAX) {
    errors.publicNotes = `Public notes are limited to ${PUBLIC_NOTES_MAX} characters.`;
  }
  return errors;
}

export function hasErrors(errors: ItemFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

function priceOf(text: string): number | null {
  const value = parsePrice(text);
  return value === null || Number.isNaN(value) ? null : Math.round(value * 100) / 100;
}

function publicUntilOf(value: ItemFormValue, now: number, fallback?: string | null) {
  if (value.visibility !== 'TEMPORARILY_PUBLIC') {
    return undefined;
  }
  if (value.duration === KEEP_END && fallback) {
    return fallback;
  }
  const duration = value.duration === KEEP_END ? DEFAULT_TEMPORARY_DURATION : value.duration;
  return publicUntilFor(duration, now);
}

/** `POST /inventory/items` body. Empty notes and prices are left out. */
export function toCreateRequest(
  value: ItemFormValue,
  printingId: string,
  now: number = Date.now()
): CreateInventoryItemRequest {
  const request: CreateInventoryItemRequest = {
    printingId,
    quantity: parseQuantity(value.quantity),
    condition: value.condition,
    currency: value.currency,
    availability: value.availability,
    acceptsOffers: value.acceptsOffers,
    visibility: value.visibility,
  };
  if (value.language) {
    request.language = value.language;
  }
  if (value.edition) {
    request.edition = value.edition;
  }
  if (value.finish) {
    request.finish = value.finish;
  }
  const price = priceOf(value.askingPrice);
  if (price !== null) {
    request.askingPrice = price;
  }
  if (value.notes.trim()) {
    request.notes = value.notes.trim();
  }
  if (value.publicNotes.trim()) {
    request.publicNotes = value.publicNotes.trim();
  }
  const until = publicUntilOf(value, now);
  if (until) {
    request.publicUntil = until;
  }
  if (value.binderId) {
    request.binderId = value.binderId;
  }
  return request;
}

/**
 * `PATCH /inventory/items/{id}` body with only the fields that changed (absent = unchanged, null
 * clears); `null` when nothing changed. Visibility is only sent when it (or the temporary end)
 * changed, so moving a card between binders keeps the server's visibility rules.
 */
export function toUpdateRequest(
  value: ItemFormValue,
  item: InventoryItemResponse,
  now: number = Date.now()
): UpdateInventoryItemRequest | null {
  const before = itemFormValue(item, now);
  const patch: UpdateInventoryItemRequest = {};
  const quantity = parseQuantity(value.quantity);
  if (quantity !== item.quantity) {
    patch.quantity = quantity;
  }
  for (const key of ['condition', 'language', 'edition', 'finish', 'currency'] as const) {
    if (value[key] !== before[key] && value[key]) {
      patch[key] = value[key];
    }
  }
  if (priceOf(value.askingPrice) !== priceOf(before.askingPrice)) {
    patch.askingPrice = priceOf(value.askingPrice);
  }
  if (value.availability !== before.availability) {
    patch.availability = value.availability;
  }
  if (value.acceptsOffers !== before.acceptsOffers) {
    patch.acceptsOffers = value.acceptsOffers;
  }
  if (value.notes.trim() !== before.notes.trim()) {
    patch.notes = value.notes.trim() || null;
  }
  if (value.publicNotes.trim() !== before.publicNotes.trim()) {
    patch.publicNotes = value.publicNotes.trim() || null;
  }
  const visibilityChanged = value.visibility !== before.visibility;
  const newEnd = value.visibility === 'TEMPORARILY_PUBLIC' && value.duration !== KEEP_END;
  if (visibilityChanged || newEnd) {
    patch.visibility = value.visibility;
    patch.publicUntil = publicUntilOf(value, now, item.publicUntil) ?? null;
  }
  if (value.binderId !== before.binderId) {
    patch.binderId = value.binderId;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Server field errors (400 `VALIDATION_FAILED`) on the form's fields. */
export function serverItemErrors(error: ApiError): ItemFormErrors {
  const errors: ItemFormErrors = {};
  for (const field of [
    'quantity',
    'condition',
    'askingPrice',
    'currency',
    'notes',
    'publicNotes',
  ] as const) {
    const message = error.fieldErrors[field];
    if (message) {
      errors[field] = message;
    }
  }
  return errors;
}

/** The values a game allows for a field, keeping the current value when the schema lacks it. */
export function withCurrent(
  values: readonly string[] | null | undefined,
  current: string
): string[] {
  const list = [...(values ?? [])];
  if (current && !list.includes(current)) {
    list.push(current);
  }
  return list;
}
