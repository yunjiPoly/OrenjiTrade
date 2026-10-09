import type { ApiError } from '@/src/api/ApiError';
import { friendlyError } from '@/src/api/errorMessages';
import type {
  CreateWishlistItemRequest,
  PrintingSummary,
  UpdateWishlistItemRequest,
  WishlistItemResponse,
} from '@/src/api/types';
import { limitReachedInfo } from '@/src/lib/limits';

import { printingOptionLabel } from './wishlistLabels';

/**
 * The wish form (stage S2, web: `wishlist-form.ts`): which copy (any printing, any printing of one
 * rarity, or one printing), a public note (first field, plain text, at most {@link WISH_NOTE_MAX}
 * characters), "Near Mint only" and at most one price term of the admin list. Nothing else: no
 * price, currency, trade preference, distance, private note, language or condition.
 */
export const WISH_NOTE_MAX = 280;
/** The plan limit on the number of wishes. */
export const WISH_ITEMS_LIMIT_KEY = 'wishlist.items.max';

export interface WishFormValue {
  /** Wished printing; `''` = any printing. */
  printingId: string;
  /** Rarity of an "any printing" wish; `''` = any rarity. */
  rarity: string;
  note: string;
  nearMintOnly: boolean;
  /** A price term label ("85% TCG"); `''` = none. */
  priceTerm: string;
}

export type WishField = keyof WishFormValue;
export type WishFormErrors = Partial<Record<WishField, string>>;

/** Defaults of a new wish: the given selection (any printing by default), no note or term. */
export function newWishDefaults(
  selection: { printingId?: string | null; rarity?: string | null } = {}
): WishFormValue {
  return {
    printingId: selection.printingId ?? '',
    rarity: selection.printingId ? '' : (selection.rarity ?? ''),
    note: '',
    nearMintOnly: false,
    priceTerm: '',
  };
}

/** The form value of an existing wish. */
export function wishFormFromItem(item: WishlistItemResponse): WishFormValue {
  return {
    printingId: item.printing?.id ?? '',
    rarity: item.printing ? '' : (item.rarity ?? ''),
    note: item.note ?? '',
    nearMintOnly: !!item.nearMintOnly,
    priceTerm: item.priceTerm?.label ?? '',
  };
}

/** Characters of a note as the API counts them (code points). */
export function noteLength(note: string): number {
  return [...note.trim()].length;
}

/** Inline validation, mirroring the API's rules. */
export function validateWish(value: WishFormValue): WishFormErrors {
  const errors: WishFormErrors = {};
  if (noteLength(value.note) > WISH_NOTE_MAX) {
    errors.note = `The note is limited to ${WISH_NOTE_MAX} characters.`;
  }
  return errors;
}

export function hasWishErrors(errors: WishFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

// --- Which copy (the simple printing chooser) ----------------------------------------------------

const RARITY_PREFIX = 'rarity:';

/** One choice of the "Which copy" select. */
export interface CopyOption {
  value: string;
  label: string;
  detail?: string;
}

/**
 * The "Which copy" choices: "Any printing", "Any printing · <rarity>" for each rarity of the card
 * (when it has several), then every printing (code · rarity · set · edition · language).
 */
export function copyOptions(printings: readonly PrintingSummary[]): CopyOption[] {
  const rarities: string[] = [];
  for (const printing of printings) {
    if (printing.rarity && !rarities.includes(printing.rarity)) {
      rarities.push(printing.rarity);
    }
  }
  return [
    { value: '', label: 'Any printing', detail: 'Every printing of the card' },
    ...(rarities.length > 1
      ? rarities.map((rarity) => ({
          value: `${RARITY_PREFIX}${rarity}`,
          label: `Any printing · ${rarity}`,
          detail: 'Any printing of this rarity',
        }))
      : []),
    ...printings
      .filter((printing): printing is PrintingSummary & { id: string } => !!printing.id)
      .map((printing) => ({ value: printing.id, label: printingOptionLabel(printing) })),
  ];
}

/** The select value of a form value. */
export function copyValue(value: Pick<WishFormValue, 'printingId' | 'rarity'>): string {
  if (value.printingId) {
    return value.printingId;
  }
  return value.rarity ? `${RARITY_PREFIX}${value.rarity}` : '';
}

/** The form value after choosing a copy. */
export function withCopy(value: WishFormValue, choice: string): WishFormValue {
  if (!choice) {
    return { ...value, printingId: '', rarity: '' };
  }
  if (choice.startsWith(RARITY_PREFIX)) {
    return { ...value, printingId: '', rarity: choice.slice(RARITY_PREFIX.length) };
  }
  return { ...value, printingId: choice, rarity: '' };
}

// --- Requests ------------------------------------------------------------------------------------

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * `POST /wishlist` body: the card for "any printing" (with its rarity, if one), the printing
 * otherwise (the API derives its card).
 */
export function toCreateWishRequest(
  value: WishFormValue,
  cardId: string
): CreateWishlistItemRequest {
  const request: CreateWishlistItemRequest = { nearMintOnly: value.nearMintOnly };
  if (value.printingId) {
    request.printingId = value.printingId;
  } else {
    request.cardId = cardId;
    const rarity = orNull(value.rarity);
    if (rarity) {
      request.rarity = rarity;
    }
  }
  const note = orNull(value.note);
  if (note) {
    request.note = note;
  }
  const term = orNull(value.priceTerm);
  if (term) {
    request.priceTerm = term;
  }
  return request;
}

/** `PATCH /wishlist/{id}` body: every field, `null` clearing a choice. */
export function toUpdateWishRequest(value: WishFormValue): UpdateWishlistItemRequest {
  return {
    printingId: orNull(value.printingId),
    rarity: value.printingId ? null : orNull(value.rarity),
    note: orNull(value.note),
    nearMintOnly: value.nearMintOnly,
    priceTerm: orNull(value.priceTerm),
  };
}

const SERVER_FIELDS: readonly WishField[] = [
  'printingId',
  'rarity',
  'note',
  'nearMintOnly',
  'priceTerm',
];

/**
 * What a refused save shows (web: `WishlistItemDialogComponent.showError`): a full wishlist (429
 * `LIMIT_REACHED`), the same selection twice (409), else the API's field errors on their fields
 * and a summary.
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
      message:
        error.message || 'This card is already on your wishlist with the same printing or rarity.',
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
