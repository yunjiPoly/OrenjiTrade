import type { ApiError } from '@/src/api/ApiError';
import { friendlyError } from '@/src/api/errorMessages';
import type {
  CreateWishlistItemRequest,
  TradePreference,
  UpdateWishlistItemRequest,
  WishlistItemResponse,
} from '@/src/api/types';
import { DEFAULT_CURRENCY } from '@/src/lib/inventory';
import { limitReachedInfo } from '@/src/lib/limits';

import { isTradePreference } from './wishlistLabels';

/**
 * Bounds mirrored from the API (`WishlistService`): notes and price (web: `wishlist-form.ts`). A
 * wish matches listings of the collector's own region (ADR 0017): there is no radius.
 */
export const WISH_NOTES_MAX = 500;
export const WISH_MAX_PRICE = 9_999_999_999.99;
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
  tradePreference: TradePreference;
  notes: string;
  active: boolean;
}

export type WishField = keyof WishFormValue;
export type WishFormErrors = Partial<Record<WishField, string>>;

/** Defaults of a new wish: the given printing (or any), no filter. */
export function newWishDefaults(printingId: string | null): WishFormValue {
  return {
    printingId: printingId ?? ANY,
    conditionMin: ANY,
    edition: ANY,
    language: ANY,
    rarity: ANY,
    maxPrice: '',
    currency: DEFAULT_CURRENCY,
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
export function validateWish(value: WishFormValue): WishFormErrors {
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
  'tradePreference',
  'notes',
];

/**
 * What a refused save shows (web: `WishlistItemDialogComponent.showError`): a full wishlist (429
 * `LIMIT_REACHED`), an identical wish (409), else the API's field errors on their fields and a
 * summary.
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
