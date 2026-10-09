import { FormControl, FormGroup } from '@angular/forms';
import type {
  CreateWishlistItemRequest,
  UpdateWishlistItemRequest,
  WishlistItemResponse,
} from '@orenji/api-client';
import type { PrintingSelection } from '../catalog/printing-picker/printing-selection';

/**
 * The wish form (owner product change of 2026-10-08, section 4): which copy (the printing picker:
 * any printing, any printing of one rarity, or one printing), a public note (first field, plain
 * text, at most {@link WISH_NOTE_MAX} characters), "Near Mint only" and at most one price term of
 * the admin list. Nothing else: no price, currency, trade preference, distance, private note,
 * language or condition.
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

export type WishForm = FormGroup<{ [K in keyof WishFormValue]: FormControl<WishFormValue[K]> }>;

/** Characters of a note as the API counts them (code points). */
export function noteLength(note: string): number {
  return [...note.trim()].length;
}

/** The reactive form of the add/edit dialog (validators mirror the API). */
export function createWishForm(initial: WishFormValue): WishForm {
  return new FormGroup({
    printingId: new FormControl(initial.printingId, { nonNullable: true }),
    rarity: new FormControl(initial.rarity, { nonNullable: true }),
    note: new FormControl(initial.note, {
      nonNullable: true,
      validators: [
        (control) => (noteLength(control.value ?? '') > WISH_NOTE_MAX ? { maxlength: true } : null),
      ],
    }),
    nearMintOnly: new FormControl(initial.nearMintOnly, { nonNullable: true }),
    priceTerm: new FormControl(initial.priceTerm, { nonNullable: true }),
  });
}

/** Defaults of a new wish: the given selection (any printing by default), no note or term. */
export function newWishDefaults(selection: Partial<PrintingSelection> = {}): WishFormValue {
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

/** The picker's selection of a form value. */
export function selectionOf(
  value: Pick<WishFormValue, 'printingId' | 'rarity'>,
): PrintingSelection {
  return value.printingId
    ? { printingId: value.printingId, rarity: null }
    : { printingId: null, rarity: value.rarity || null };
}

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
  cardId: string,
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

/** Inline message of an invalid note (`server` = the API's own message). */
export function noteError(errors: Record<string, unknown> | null | undefined): string | null {
  if (!errors) {
    return null;
  }
  if (typeof errors['server'] === 'string') {
    return errors['server'];
  }
  return `The note is limited to ${WISH_NOTE_MAX} characters.`;
}

/** Form controls the API's field errors map to (`cardId` has no control of its own). */
const SERVER_FIELDS: Record<string, keyof WishFormValue> = {
  printingId: 'printingId',
  rarity: 'rarity',
  note: 'note',
  nearMintOnly: 'nearMintOnly',
  priceTerm: 'priceTerm',
};

/** Puts the API's field errors on the matching controls; returns the ones left unmapped. */
export function applyServerErrors(
  form: WishForm,
  fieldErrors: Record<string, string> | null | undefined,
): string[] {
  const unmapped: string[] = [];
  for (const [field, message] of Object.entries(fieldErrors ?? {})) {
    const key = SERVER_FIELDS[field];
    const control = key ? form.controls[key] : null;
    if (control) {
      control.setErrors({ server: message });
      control.markAsTouched();
    } else {
      unmapped.push(`${field}: ${message}`);
    }
  }
  return unmapped;
}
