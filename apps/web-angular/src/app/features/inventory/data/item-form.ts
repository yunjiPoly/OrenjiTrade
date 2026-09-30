import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import type {
  CreateInventoryItemRequest,
  GameSchema,
  InventoryItemResponse,
  PrintingSummary,
  UpdateInventoryItemRequest,
} from '@orenji/api-client';
import {
  DEFAULT_CURRENCY,
  DEFAULT_TEMPORARY_DURATION,
  InventoryAvailability,
  TemporaryDuration,
  Visibility,
  publicUntilFor,
} from '../../../shared/inventory/inventory-labels';

/** Keep the current end of a temporary publication instead of starting a new one. */
export const KEEP_END = 'KEEP';
export type DurationChoice = TemporaryDuration | typeof KEEP_END;

export const MAX_QUANTITY = 9999;
export const MAX_PRICE = 9_999_999_999.99;
export const NOTES_MAX = 2000;
export const PUBLIC_NOTES_MAX = 500;

export interface ItemFormValue {
  quantity: number;
  condition: string;
  language: string;
  edition: string;
  finish: string;
  askingPrice: number | null;
  currency: string;
  availability: InventoryAvailability;
  acceptsOffers: boolean;
  notes: string;
  publicNotes: string;
  visibility: Visibility;
  duration: DurationChoice;
  binderId: string | null;
}

export type ItemForm = FormGroup<{ [K in keyof ItemFormValue]: FormControl<ItemFormValue[K]> }>;

/** At most two decimals (cents). */
function twoDecimals(control: AbstractControl<number | null>): ValidationErrors | null {
  const value = control.value;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6 ? null : { decimals: true };
}

/** Whole numbers only (copies). */
function wholeNumber(control: AbstractControl<number | null>): ValidationErrors | null {
  const value = control.value;
  return typeof value !== 'number' || Number.isInteger(value) ? null : { integer: true };
}

/** The reactive form behind the add dialog and the edit panel (validators mirror the API). */
export function createItemForm(initial: ItemFormValue): ItemForm {
  return new FormGroup({
    quantity: new FormControl(initial.quantity, {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.min(1),
        Validators.max(MAX_QUANTITY),
        wholeNumber,
      ],
    }),
    condition: new FormControl(initial.condition, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    language: new FormControl(initial.language, { nonNullable: true }),
    edition: new FormControl(initial.edition, { nonNullable: true }),
    finish: new FormControl(initial.finish, { nonNullable: true }),
    askingPrice: new FormControl<number | null>(initial.askingPrice, {
      validators: [Validators.min(0), Validators.max(MAX_PRICE), twoDecimals],
    }),
    currency: new FormControl(initial.currency, {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Z]{3}$/)],
    }),
    availability: new FormControl(initial.availability, { nonNullable: true }),
    acceptsOffers: new FormControl(initial.acceptsOffers, { nonNullable: true }),
    notes: new FormControl(initial.notes, {
      nonNullable: true,
      validators: [Validators.maxLength(NOTES_MAX)],
    }),
    publicNotes: new FormControl(initial.publicNotes, {
      nonNullable: true,
      validators: [Validators.maxLength(PUBLIC_NOTES_MAX)],
    }),
    visibility: new FormControl(initial.visibility, { nonNullable: true }),
    duration: new FormControl<DurationChoice>(initial.duration, { nonNullable: true }),
    binderId: new FormControl<string | null>(initial.binderId),
  });
}

/** Defaults of a new item: the printing's language/edition/finish, Near Mint, private. */
export function newItemDefaults(
  printing: PrintingSummary | null,
  schema: GameSchema | null,
  binderId: string | null,
): ItemFormValue {
  const conditions = schema?.conditions ?? [];
  return {
    quantity: 1,
    condition: conditions.includes('NEAR_MINT') ? 'NEAR_MINT' : (conditions[0] ?? 'NEAR_MINT'),
    language: printing?.language ?? schema?.languages[0] ?? 'en',
    edition: printing?.edition ?? schema?.editions[0] ?? '',
    finish: printing?.finish ?? schema?.finishes[0] ?? '',
    askingPrice: null,
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

/** Form value of an existing item. A running temporary publication keeps its end by default. */
export function itemFormValue(
  item: InventoryItemResponse,
  now: number = Date.now(),
): ItemFormValue {
  const running =
    item.visibility === 'TEMPORARILY_PUBLIC' &&
    !!item.publicUntil &&
    Date.parse(item.publicUntil) > now;
  return {
    quantity: item.quantity,
    condition: item.condition,
    language: item.language,
    edition: item.edition,
    finish: item.finish,
    askingPrice: item.askingPrice ?? null,
    currency: item.currency || DEFAULT_CURRENCY,
    availability: item.availability as InventoryAvailability,
    acceptsOffers: item.acceptsOffers,
    notes: item.notes ?? '',
    publicNotes: item.publicNotes ?? '',
    visibility: item.visibility as Visibility,
    duration: running ? KEEP_END : DEFAULT_TEMPORARY_DURATION,
    binderId: item.binder?.id ?? null,
  };
}

function priceOf(value: number | null): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return Math.round(value * 100) / 100;
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
  now: number = Date.now(),
): CreateInventoryItemRequest {
  const request: CreateInventoryItemRequest = {
    printingId,
    quantity: value.quantity,
    condition: value.condition,
    currency: value.currency,
    availability: value.availability as CreateInventoryItemRequest['availability'],
    acceptsOffers: value.acceptsOffers,
    visibility: value.visibility as CreateInventoryItemRequest['visibility'],
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
 * clears). `null` when nothing changed. Visibility is only sent when it (or the temporary end)
 * changed, so moving a card between binders keeps the server's visibility rules.
 */
export function toUpdateRequest(
  value: ItemFormValue,
  item: InventoryItemResponse,
  now: number = Date.now(),
): UpdateInventoryItemRequest | null {
  const before = itemFormValue(item, now);
  const patch: UpdateInventoryItemRequest = {};
  if (value.quantity !== before.quantity) {
    patch.quantity = value.quantity;
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
    patch.availability = value.availability as UpdateInventoryItemRequest['availability'];
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
    patch.visibility = value.visibility as UpdateInventoryItemRequest['visibility'];
    patch.publicUntil = publicUntilOf(value, now, item.publicUntil) ?? null;
  }
  if (value.binderId !== before.binderId) {
    patch.binderId = value.binderId;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Friendly inline messages for the form's validation errors. */
export function itemFieldError(
  field: 'quantity' | 'askingPrice' | 'currency' | 'notes' | 'publicNotes' | 'condition',
  errors: Record<string, unknown> | null | undefined,
): string | null {
  if (!errors) {
    return null;
  }
  switch (field) {
    case 'quantity':
      if (errors['required']) {
        return 'Enter how many copies you have.';
      }
      if (errors['min']) {
        return 'At least 1 copy.';
      }
      return errors['max'] ? `At most ${MAX_QUANTITY} copies.` : 'Enter a whole number.';
    case 'askingPrice':
      if (errors['min']) {
        return 'The price cannot be negative.';
      }
      if (errors['decimals']) {
        return 'Use at most two decimals.';
      }
      return 'Enter a valid price.';
    case 'currency':
      return 'Use a three-letter currency code, like CAD.';
    case 'notes':
      return `Private notes are limited to ${NOTES_MAX} characters.`;
    case 'publicNotes':
      return `Public notes are limited to ${PUBLIC_NOTES_MAX} characters.`;
    case 'condition':
      return 'Choose a condition.';
  }
}
