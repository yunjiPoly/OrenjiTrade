import type { ApiError } from '@/src/api/ApiError';
import { friendlyError } from '@/src/api/errorMessages';
import type {
  CreateWishlistItemRequest,
  MyPlan,
  TradePreference,
  UpdateWishlistItemRequest,
  WishlistItemResponse,
} from '@/src/api/types';
import { DEFAULT_CURRENCY } from '@/src/lib/inventory';
import { limitReachedInfo } from '@/src/lib/limits';

import { isTradePreference } from './wishlistLabels';

/** Bounds mirrored from the API (`WishlistService`): notes, price, radius (web: `wishlist-form.ts`). */
export const WISH_NOTES_MAX = 500;
export const WISH_MAX_PRICE = 9_999_999_999.99;
export const WISH_RADIUS_MIN_KM = 1;
/** Largest radius offered (further capped by the plan's `map.radius.max_km`). */
export const WISH_RADIUS_MAX_KM = 100;
/** The API's default radius (lowered to the plan cap). */
export const DEFAULT_WISH_RADIUS_KM = 25;
/** The plan limit that caps the radius. */
export const RADIUS_LIMIT_KEY = 'map.radius.max_km';
/** The plan limit on the number of wishes. */
export const WISH_ITEMS_LIMIT_KEY = 'wishlist.items.max';
/** Select value meaning "no filter" (any printing, any condition, ...). */
export const ANY = '';

export interface WishFormValue {
  /** Wished printing; `ANY` = every printing of the card. */
  printingId: string;
  conditionMin: string;
  edition: string;
  language: string;
  rarity: string;
  /** As typed (decimal text); empty = no maximum. */
  maxPrice: string;
  currency: string;
  radiusKm: number;
  tradePreference: TradePreference;
  notes: string;
  active: boolean;
}

export type WishField = keyof WishFormValue;
export type WishFormErrors = Partial<Record<WishField, string>>;

/**
 * The plan's radius cap for wishes: `undefined` while unknown, `null` when unlimited, else km
 * (`map.radius.max_km` of `GET /me/plan`).
 */
export function wishRadiusCap(plan: MyPlan | undefined): number | null | undefined {
  if (!plan) {
    return undefined;
  }
  const status = plan.limits?.find((entry) => entry.key === RADIUS_LIMIT_KEY);
  return status ? (status.limit ?? null) : null;
}

/** The largest radius offered for a plan cap (`null` = unlimited, `undefined` = FREE default). */
export function radiusMaxFor(cap: number | null | undefined): number {
  if (cap === undefined) {
    // Until the plan answers, the FREE cap of the API default keeps the choice honest.
    return DEFAULT_WISH_RADIUS_KM;
  }
  if (cap === null || !Number.isFinite(cap)) {
    return WISH_RADIUS_MAX_KM;
  }
  return Math.max(WISH_RADIUS_MIN_KM, Math.min(WISH_RADIUS_MAX_KM, Math.floor(cap)));
}

/** A radius kept within the allowed range. */
export function clampRadius(radiusKm: number, max: number): number {
  const rounded = Math.round(Number.isFinite(radiusKm) ? radiusKm : DEFAULT_WISH_RADIUS_KM);
  return Math.min(Math.max(rounded, WISH_RADIUS_MIN_KM), Math.max(max, WISH_RADIUS_MIN_KM));
}

/** Defaults of a new wish: the given printing (or any), no filter, the default radius. */
export function newWishDefaults(printingId: string | null, radiusMax: number): WishFormValue {
  return {
    printingId: printingId ?? ANY,
    conditionMin: ANY,
    edition: ANY,
    language: ANY,
    rarity: ANY,
    maxPrice: '',
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
    maxPrice: item.maxPrice === null || item.maxPrice === undefined ? '' : String(item.maxPrice),
    currency: item.currency || DEFAULT_CURRENCY,
    radiusKm: item.radiusKm,
    tradePreference: isTradePreference(item.tradePreference) ? item.tradePreference : 'ANY',
    notes: item.notes ?? '',
    active: item.active,
  };
}

/** The typed maximum price as a number; `null` when empty, `NaN` when not a number. */
export function parsePrice(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) {
    return null;
  }
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** Inline validation, mirroring the API's rules. */
export function validateWish(value: WishFormValue, radiusMax: number): WishFormErrors {
  const errors: WishFormErrors = {};
  const price = parsePrice(value.maxPrice);
  if (price !== null) {
    if (Number.isNaN(price)) {
      errors.maxPrice = value.maxPrice.trim().startsWith('-')
        ? 'The price cannot be negative.'
        : 'Enter a valid price.';
    } else if (price > WISH_MAX_PRICE) {
      errors.maxPrice = 'Enter a valid price.';
    } else if (Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) {
      errors.maxPrice = 'Use at most two decimals.';
    }
  }
  if (!/^[A-Z]{3}$/.test(value.currency)) {
    errors.currency = 'Use a three-letter currency code, like CAD.';
  }
  if (!Number.isFinite(value.radiusKm) || value.radiusKm < WISH_RADIUS_MIN_KM) {
    errors.radiusKm = `Choose at least ${WISH_RADIUS_MIN_KM} km.`;
  } else if (value.radiusKm > radiusMax) {
    errors.radiusKm = `Your plan matches collectors up to ${radiusMax} km away.`;
  }
  if (value.notes.length > WISH_NOTES_MAX) {
    errors.notes = `Notes are limited to ${WISH_NOTES_MAX} characters.`;
  }
  return errors;
}

export function hasWishErrors(errors: WishFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

function orNull(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

/**
 * `POST /wishlist` body. The card is sent with "any printing", the printing otherwise (its card
 * is derived by the API). Rarity only filters "any printing" wishes (a printing has one).
 */
export function toCreateWishRequest(
  value: WishFormValue,
  cardId: string
): CreateWishlistItemRequest {
  const request: CreateWishlistItemRequest = {
    currency: value.currency,
    radiusKm: value.radiusKm,
    tradePreference: value.tradePreference,
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
  const conditionMin = orNull(value.conditionMin);
  if (conditionMin) {
    request.conditionMin = conditionMin;
  }
  const edition = orNull(value.edition);
  if (edition) {
    request.edition = edition;
  }
  const language = orNull(value.language);
  if (language) {
    request.language = language;
  }
  const notes = orNull(value.notes);
  if (notes) {
    request.notes = notes;
  }
  const price = parsePrice(value.maxPrice);
  if (price !== null && !Number.isNaN(price)) {
    request.maxPrice = price;
  }
  return request;
}

/** `PATCH /wishlist/{id}` body: every field, with `null` clearing a filter. */
export function toUpdateWishRequest(value: WishFormValue): UpdateWishlistItemRequest {
  const price = parsePrice(value.maxPrice);
  return {
    printingId: orNull(value.printingId),
    rarity: value.printingId ? null : orNull(value.rarity),
    conditionMin: orNull(value.conditionMin),
    edition: orNull(value.edition),
    language: orNull(value.language),
    maxPrice: price === null || Number.isNaN(price) ? null : price,
    currency: value.currency,
    radiusKm: value.radiusKm,
    tradePreference: value.tradePreference,
    notes: orNull(value.notes),
    active: value.active,
  };
}

const SERVER_FIELDS: readonly WishField[] = [
  'printingId',
  'rarity',
  'conditionMin',
  'edition',
  'language',
  'maxPrice',
  'currency',
  'radiusKm',
  'tradePreference',
  'notes',
];

/**
 * What a refused save shows (web: `WishlistItemDialogComponent.showError`): a full wishlist or a
 * radius beyond the plan (429 `LIMIT_REACHED`), an identical wish (409), else the API's field
 * errors on their fields and a summary.
 */
export function wishSaveError(error: ApiError): { message: string; fields: WishFormErrors } {
  if (error.errorCode === 'LIMIT_REACHED') {
    const info = limitReachedInfo(error);
    if (info.limitKey === WISH_ITEMS_LIMIT_KEY) {
      return {
        fields: {},
        message:
          info.limit !== null
            ? `Your wishlist is full: your plan allows ${info.limit} wishes. Remove one or upgrade to add more.`
            : 'Your wishlist is full on your current plan. Remove a wish or upgrade to add more.',
      };
    }
    if (info.limitKey === RADIUS_LIMIT_KEY) {
      return {
        fields: {},
        message: 'This distance is beyond what your plan allows. Choose a smaller radius.',
      };
    }
    return { fields: {}, message: friendlyError(error).message };
  }
  if (error.errorCode === 'CONFLICT') {
    return {
      fields: {},
      message: error.message || 'This card is already on your wishlist with the same filters.',
    };
  }
  const fields: WishFormErrors = {};
  const unmapped: string[] = [];
  for (const [field, message] of Object.entries(error.fieldErrors)) {
    if ((SERVER_FIELDS as readonly string[]).includes(field)) {
      fields[field as WishField] = message;
    } else {
      unmapped.push(`${field}: ${message}`);
    }
  }
  const base = friendlyError(error).message;
  return { fields, message: unmapped.length ? `${base} (${unmapped.join('; ')})` : base };
}

/** The radius stepper's next value: 1 km steps up to 10 km, then multiples of 5 km. */
export function nextWishRadius(current: number, direction: 1 | -1): number {
  if (current < 10 || (current === 10 && direction === -1)) {
    return current + direction;
  }
  return direction === 1 ? Math.floor(current / 5) * 5 + 5 : Math.ceil(current / 5) * 5 - 5;
}
