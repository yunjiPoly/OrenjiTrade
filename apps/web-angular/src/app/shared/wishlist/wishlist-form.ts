import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import type {
  CreateWishlistItemRequest,
  UpdateWishlistItemRequest,
  WishlistItemResponse,
} from '@orenji/api-client';
import { DEFAULT_CURRENCY } from '../inventory/inventory-labels';
import { TradePreference, isTradePreference } from './wishlist-labels';

/** Bounds mirrored from the API (`WishlistService`): notes, price, radius. */
export const WISH_NOTES_MAX = 500;
export const WISH_MAX_PRICE = 9_999_999_999.99;
export const WISH_RADIUS_MIN_KM = 1;
/** Largest radius the slider offers (further capped by the plan's `map.radius.max_km`). */
export const WISH_RADIUS_SLIDER_MAX_KM = 100;
/** The API's default radius (lowered to the plan cap). */
export const DEFAULT_WISH_RADIUS_KM = 25;
/** The plan limit that caps the radius. */
export const RADIUS_LIMIT_KEY = 'map.radius.max_km';
/** The plan limit on the number of wishes. */
export const WISH_ITEMS_LIMIT_KEY = 'wishlist.items.max';
/** Select value meaning "no filter" (any printing, any condition, …). */
export const ANY = '';

export interface WishFormValue {
  /** Wished printing; `ANY` = every printing of the card. */
  printingId: string;
  conditionMin: string;
  edition: string;
  language: string;
  rarity: string;
  maxPrice: number | null;
  currency: string;
  radiusKm: number;
  tradePreference: TradePreference;
  notes: string;
  active: boolean;
}

export type WishForm = FormGroup<{ [K in keyof WishFormValue]: FormControl<WishFormValue[K]> }>;

/** At most two decimals (cents). */
function twoDecimals(control: AbstractControl<number | null>): ValidationErrors | null {
  const value = control.value;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6 ? null : { decimals: true };
}

/** The slider's upper bound for a plan cap (`null` = unlimited). */
export function radiusSliderMax(cap: number | null | undefined): number {
  if (cap === null || cap === undefined || !Number.isFinite(cap)) {
    return WISH_RADIUS_SLIDER_MAX_KM;
  }
  return Math.max(WISH_RADIUS_MIN_KM, Math.min(WISH_RADIUS_SLIDER_MAX_KM, Math.floor(cap)));
}

/** A radius kept within the slider bounds. */
export function clampRadius(radiusKm: number, max: number): number {
  const rounded = Math.round(Number.isFinite(radiusKm) ? radiusKm : DEFAULT_WISH_RADIUS_KM);
  return Math.min(Math.max(rounded, WISH_RADIUS_MIN_KM), Math.max(max, WISH_RADIUS_MIN_KM));
}

/** The reactive form of the add/edit dialog (validators mirror the API). */
export function createWishForm(initial: WishFormValue): WishForm {
  return new FormGroup({
    printingId: new FormControl(initial.printingId, { nonNullable: true }),
    conditionMin: new FormControl(initial.conditionMin, { nonNullable: true }),
    edition: new FormControl(initial.edition, { nonNullable: true }),
    language: new FormControl(initial.language, { nonNullable: true }),
    rarity: new FormControl(initial.rarity, { nonNullable: true }),
    maxPrice: new FormControl<number | null>(initial.maxPrice, {
      validators: [Validators.min(0), Validators.max(WISH_MAX_PRICE), twoDecimals],
    }),
    currency: new FormControl(initial.currency, {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Z]{3}$/)],
    }),
    radiusKm: new FormControl(initial.radiusKm, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(WISH_RADIUS_MIN_KM)],
    }),
    tradePreference: new FormControl<TradePreference>(initial.tradePreference, {
      nonNullable: true,
    }),
    notes: new FormControl(initial.notes, {
      nonNullable: true,
      validators: [Validators.maxLength(WISH_NOTES_MAX)],
    }),
    active: new FormControl(initial.active, { nonNullable: true }),
  });
}

/** Defaults of a new wish: the given printing (or any), no filter, the default radius. */
export function newWishDefaults(printingId: string | null, radiusMax: number): WishFormValue {
  return {
    printingId: printingId ?? ANY,
    conditionMin: ANY,
    edition: ANY,
    language: ANY,
    rarity: ANY,
    maxPrice: null,
    currency: DEFAULT_CURRENCY,
    radiusKm: clampRadius(DEFAULT_WISH_RADIUS_KM, radiusMax),
    tradePreference: 'ANY',
    notes: '',
    active: true,
  };
}

/** The form value of an existing wish. */
export function wishFormFromItem(item: WishlistItemResponse): WishFormValue {
  return {
    printingId: item.printing?.id ?? ANY,
    conditionMin: item.conditionMin ?? ANY,
    edition: item.edition ?? ANY,
    language: item.language ?? ANY,
    rarity: item.rarity ?? ANY,
    maxPrice: item.maxPrice ?? null,
    currency: item.currency || DEFAULT_CURRENCY,
    radiusKm: item.radiusKm,
    tradePreference: isTradePreference(item.tradePreference) ? item.tradePreference : 'ANY',
    notes: item.notes ?? '',
    active: item.active,
  };
}

function orNull(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

function price(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * `POST /wishlist` body. The card is sent with "any printing", the printing otherwise (its card
 * is derived by the API). Rarity only filters "any printing" wishes (a printing has one).
 */
export function toCreateWishRequest(
  value: WishFormValue,
  cardId: string,
): CreateWishlistItemRequest {
  const request: CreateWishlistItemRequest = {
    currency: value.currency,
    radiusKm: value.radiusKm,
    tradePreference: value.tradePreference as CreateWishlistItemRequest['tradePreference'],
    active: value.active,
  };
  if (value.printingId) {
    request.printingId = value.printingId;
  } else {
    request.cardId = cardId;
    const rarity = orNull(value.rarity);
    if (rarity) {
      request.rarity = rarity;
    }
  }
  const optional: [keyof CreateWishlistItemRequest, string | null][] = [
    ['conditionMin', orNull(value.conditionMin)],
    ['edition', orNull(value.edition)],
    ['language', orNull(value.language)],
    ['notes', orNull(value.notes)],
  ];
  for (const [key, entry] of optional) {
    if (entry) {
      (request as Record<string, unknown>)[key] = entry;
    }
  }
  const maxPrice = price(value.maxPrice);
  if (maxPrice !== null) {
    request.maxPrice = maxPrice;
  }
  return request;
}

/** `PATCH /wishlist/{id}` body: every field, with `null` clearing a filter. */
export function toUpdateWishRequest(value: WishFormValue): UpdateWishlistItemRequest {
  return {
    printingId: orNull(value.printingId),
    rarity: value.printingId ? null : orNull(value.rarity),
    conditionMin: orNull(value.conditionMin),
    edition: orNull(value.edition),
    language: orNull(value.language),
    maxPrice: price(value.maxPrice),
    currency: value.currency,
    radiusKm: value.radiusKm,
    tradePreference: value.tradePreference as UpdateWishlistItemRequest['tradePreference'],
    notes: orNull(value.notes),
    active: value.active,
  };
}

export type WishField = 'maxPrice' | 'currency' | 'radiusKm' | 'notes';

/** Inline message of an invalid field (`server` = the API's own message). */
export function wishFieldError(
  field: WishField,
  errors: Record<string, unknown> | null | undefined,
): string | null {
  if (!errors) {
    return null;
  }
  if (typeof errors['server'] === 'string') {
    return errors['server'];
  }
  switch (field) {
    case 'maxPrice':
      if (errors['min']) {
        return 'The price cannot be negative.';
      }
      if (errors['decimals']) {
        return 'Use at most two decimals.';
      }
      return 'Enter a valid price.';
    case 'currency':
      return 'Use a three-letter currency code, like CAD.';
    case 'radiusKm':
      return `Choose at least ${WISH_RADIUS_MIN_KM} km.`;
    case 'notes':
      return `Notes are limited to ${WISH_NOTES_MAX} characters.`;
  }
}

/** Form controls the API's field errors map to (`cardId` has no control of its own). */
const SERVER_FIELDS: Record<string, keyof WishFormValue> = {
  printingId: 'printingId',
  rarity: 'rarity',
  conditionMin: 'conditionMin',
  edition: 'edition',
  language: 'language',
  maxPrice: 'maxPrice',
  currency: 'currency',
  radiusKm: 'radiusKm',
  tradePreference: 'tradePreference',
  notes: 'notes',
};

/** Puts the API's field errors on the matching controls; returns the ones left unmapped. */
export function applyServerErrors(
  form: WishForm,
  fieldErrors: Record<string, string> | null | undefined,
): string[] {
  const unmapped: string[] = [];
  for (const [field, message] of Object.entries(fieldErrors ?? {})) {
    const control = SERVER_FIELDS[field] ? form.controls[SERVER_FIELDS[field]] : null;
    if (control) {
      control.setErrors({ server: message });
      control.markAsTouched();
    } else {
      unmapped.push(`${field}: ${message}`);
    }
  }
  return unmapped;
}
