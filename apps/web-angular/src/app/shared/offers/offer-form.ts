import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import type {
  CounterOfferRequest,
  CounterOfferRequestKindEnum,
  CreateOfferRequest,
  CreateOfferRequestKindEnum,
  InventoryItemResponse,
  OfferResponse,
  OfferTradeItem,
} from '@orenji/api-client';
import { printingCode, printingImageUrl } from '../inventory/inventory-labels';
import {
  OFFER_CASH_MAX,
  OFFER_DEFAULT_EXPIRY_HOURS,
  OFFER_MESSAGE_MAX,
  OFFER_QUANTITY_MAX,
  OFFER_TRADE_ITEMS_MAX,
  OfferKind,
  isOfferKind,
  kindHasCards,
  kindHasCash,
} from './offer-labels';

/**
 * The offer / counter-offer form (Phase 8 contract): kind, cash part, the buyer's cards with
 * quantities, a note and the expiry, with the API's validation rules checked inline, and the
 * mapping to `POST /offers` and `POST /offers/{id}/counter` bodies.
 */

/** One card of the proposal as the picker shows it (always one of the buyer's cards). */
export interface TradeLine {
  inventoryItemId: string;
  quantity: number;
  /** Copies the buyer holds (upper bound of the quantity). */
  maxQuantity: number;
  cardName: string;
  game: string;
  printingCode?: string | null;
  imageUrl?: string | null;
  condition?: string | null;
}

export interface OfferFormValue {
  kind: OfferKind;
  cashAmount: number | null;
  currency: string;
  cards: TradeLine[];
  message: string;
  expiresInHours: number;
  /** Ask for payment protection (cash part only; Phase 9, `protectedPayments` flag). */
  protectionRequested: boolean;
}

export type OfferForm = FormGroup<{
  kind: FormControl<OfferKind>;
  cashAmount: FormControl<number | null>;
  currency: FormControl<string>;
  cards: FormControl<TradeLine[]>;
  message: FormControl<string>;
  expiresInHours: FormControl<number>;
  protectionRequested: FormControl<boolean>;
}>;

function kindOf(control: AbstractControl): OfferKind | null {
  const kind: unknown = control.parent?.get('kind')?.value;
  return isOfferKind(kind) ? kind : null;
}

/** Hundredths of an amount, or NaN when it has more than 2 decimals. */
function cents(value: number): number {
  const scaled = Math.round(value * 100);
  return Math.abs(value * 100 - scaled) < 1e-6 ? scaled : Number.NaN;
}

/** Cash part: required for CASH / MIXED, 0.01 – 9,999,999,999.99, at most 2 decimals. */
export function cashValidator(control: AbstractControl): ValidationErrors | null {
  const kind = kindOf(control);
  if (!kind || !kindHasCash(kind)) {
    return null;
  }
  const value: unknown = control.value;
  if (value === null || value === undefined || value === '') {
    return { required: true };
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return { number: true };
  }
  if (amount <= 0) {
    return { min: true };
  }
  if (amount > OFFER_CASH_MAX) {
    return { max: true };
  }
  return Number.isNaN(cents(amount)) ? { decimals: true } : null;
}

/** Cards: at least one for TRADE / MIXED, at most 10, quantities 1 – the copies held. */
export function cardsValidator(control: AbstractControl): ValidationErrors | null {
  const kind = kindOf(control);
  if (!kind || !kindHasCards(kind)) {
    return null;
  }
  const lines = (control.value as TradeLine[] | null) ?? [];
  if (lines.length === 0) {
    return { required: true };
  }
  if (lines.length > OFFER_TRADE_ITEMS_MAX) {
    return { maxCards: true };
  }
  const badQuantity = lines.some(
    (line) =>
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > Math.min(OFFER_QUANTITY_MAX, Math.max(1, line.maxQuantity)),
  );
  return badQuantity ? { quantity: true } : null;
}

export function createOfferForm(initial: OfferFormValue): OfferForm {
  const form: OfferForm = new FormGroup({
    kind: new FormControl<OfferKind>(initial.kind, { nonNullable: true }),
    cashAmount: new FormControl<number | null>(initial.cashAmount, [cashValidator]),
    currency: new FormControl(initial.currency, {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Z]{3}$/)],
    }),
    cards: new FormControl<TradeLine[]>(initial.cards, {
      nonNullable: true,
      validators: [cardsValidator],
    }),
    message: new FormControl(initial.message, {
      nonNullable: true,
      validators: [Validators.maxLength(OFFER_MESSAGE_MAX)],
    }),
    expiresInHours: new FormControl(initial.expiresInHours, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(168)],
    }),
    protectionRequested: new FormControl(initial.protectionRequested, { nonNullable: true }),
  });
  // The parts' validators depend on the kind: re-run them once the group exists and on change.
  const revalidate = () => {
    form.controls.cashAmount.updateValueAndValidity({ emitEvent: false });
    form.controls.cards.updateValueAndValidity({ emitEvent: false });
  };
  revalidate();
  form.controls.kind.valueChanges.subscribe(revalidate);
  return form;
}

/** Inline message of the cash field; `null` when valid. */
export function cashError(errors: ValidationErrors | null | undefined): string | null {
  if (!errors) {
    return null;
  }
  if (errors['required']) {
    return 'Enter the amount you offer.';
  }
  if (errors['number'] || errors['min']) {
    return 'Enter an amount above 0.';
  }
  if (errors['max']) {
    return 'That amount is too large.';
  }
  if (errors['decimals']) {
    return 'Use at most 2 decimals.';
  }
  return 'Enter a valid amount.';
}

/** Inline message of the cards picker; `null` when valid. */
export function cardsError(errors: ValidationErrors | null | undefined): string | null {
  if (!errors) {
    return null;
  }
  if (errors['required']) {
    return 'Pick at least one of your cards to trade.';
  }
  if (errors['maxCards']) {
    return `Offer at most ${OFFER_TRADE_ITEMS_MAX} different cards.`;
  }
  return 'Check the number of copies of each card.';
}

function roundCash(value: number | null): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return Math.round(Number(value) * 100) / 100;
}

function tradeItems(value: OfferFormValue) {
  return value.cards.map((line) => ({
    inventoryItemId: line.inventoryItemId,
    quantity: line.quantity,
  }));
}

/** `POST /offers` body. */
export function toCreateRequest(itemId: string, value: OfferFormValue): CreateOfferRequest {
  const message = value.message.trim();
  return {
    itemId,
    kind: value.kind as CreateOfferRequestKindEnum,
    ...(kindHasCash(value.kind)
      ? { cashAmount: roundCash(value.cashAmount), currency: value.currency }
      : {}),
    ...(kindHasCards(value.kind) ? { tradeItemIds: tradeItems(value) } : {}),
    ...(message ? { message } : {}),
    expiresInHours: value.expiresInHours,
    ...(kindHasCash(value.kind) && value.protectionRequested ? { protectionRequested: true } : {}),
  };
}

/** `POST /offers/{id}/counter` body (explicit kind and parts, the version the caller saw). */
export function toCounterRequest(value: OfferFormValue, version: number): CounterOfferRequest {
  const message = value.message.trim();
  return {
    kind: value.kind as CounterOfferRequestKindEnum,
    ...(kindHasCash(value.kind)
      ? { cashAmount: roundCash(value.cashAmount), currency: value.currency }
      : {}),
    tradeItemIds: kindHasCards(value.kind) ? tradeItems(value) : [],
    ...(message ? { message } : {}),
    expiresInHours: value.expiresInHours,
    version,
  };
}

/**
 * Whether the form proposes the same deal as the current proposal (the API refuses such a
 * counter-offer with 400): same kind, same amount to the cent, same cards and quantities.
 */
export function sameDeal(value: OfferFormValue, offer: OfferResponse): boolean {
  if (value.kind !== offer.kind) {
    return false;
  }
  if (kindHasCash(value.kind)) {
    const mine = roundCash(value.cashAmount);
    const theirs = roundCash(offer.cashAmount ?? null);
    if (mine !== theirs || value.currency !== (offer.currency ?? value.currency)) {
      return false;
    }
  }
  if (kindHasCards(value.kind)) {
    const current = new Map(
      offer.tradeItems
        .filter((line) => !!line.inventoryItemId)
        .map((line) => [line.inventoryItemId as string, line.quantity]),
    );
    if (current.size !== value.cards.length) {
      return false;
    }
    return value.cards.every((line) => current.get(line.inventoryItemId) === line.quantity);
  }
  return true;
}

/** A card of the caller's inventory as a picker line (one copy by default). */
export function tradeLineFromInventory(item: InventoryItemResponse): TradeLine {
  return {
    inventoryItemId: item.id,
    quantity: 1,
    maxQuantity: Math.max(1, item.quantity),
    cardName: item.card.name,
    game: item.card.game,
    printingCode: printingCode(item.printing) || null,
    imageUrl: item.images[0]?.url ?? printingImageUrl(item.printing),
    condition: item.condition,
  };
}

/** A card of a proposal as a picker line (`null` once its owner's account was purged). */
export function tradeLineFromOffer(line: OfferTradeItem): TradeLine | null {
  if (!line.inventoryItemId) {
    return null;
  }
  const item = line.item;
  return {
    inventoryItemId: line.inventoryItemId,
    quantity: line.quantity,
    maxQuantity: Math.max(line.quantity, item?.quantity ?? line.quantity),
    cardName: item?.card.name ?? 'Card',
    game: item?.card.game ?? '',
    printingCode: item ? printingCode(item.printing) || null : null,
    imageUrl: item ? (item.images[0]?.url ?? printingImageUrl(item.printing)) : null,
    condition: item?.condition ?? null,
  };
}

/** Starting values of a new offer: the first allowed kind, the item's currency, 3 days. */
export function newOfferValue(kinds: readonly OfferKind[], currency: string): OfferFormValue {
  return {
    kind: kinds[0] ?? 'CASH',
    cashAmount: null,
    currency,
    cards: [],
    message: '',
    expiresInHours: OFFER_DEFAULT_EXPIRY_HOURS,
    protectionRequested: false,
  };
}

/** Starting values of a counter-offer: the current proposal (the note starts empty). */
export function counterValue(offer: OfferResponse, fallbackCurrency: string): OfferFormValue {
  return {
    kind: isOfferKind(offer.kind) ? offer.kind : 'CASH',
    cashAmount: offer.cashAmount ?? null,
    currency: offer.currency ?? fallbackCurrency,
    cards: offer.tradeItems
      .map((line) => tradeLineFromOffer(line))
      .filter((line): line is TradeLine => line !== null),
    message: '',
    expiresInHours: OFFER_DEFAULT_EXPIRY_HOURS,
    // Counter-offers keep the negotiation's choice (the API does not take it again).
    protectionRequested: offer.protectionRequested,
  };
}
