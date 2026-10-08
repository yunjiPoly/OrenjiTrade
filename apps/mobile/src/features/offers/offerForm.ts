import type {
  CounterOfferRequest,
  CreateOfferRequest,
  InventoryItemResponse,
  OfferResponse,
  OfferTradeItem,
} from '@/src/api/types';
import { printingCode, printingImageUrl } from '@/src/lib/catalog';

import {
  OFFER_CASH_MAX,
  OFFER_DEFAULT_EXPIRY_HOURS,
  OFFER_MESSAGE_MAX,
  OFFER_QUANTITY_MAX,
  OFFER_TRADE_ITEMS_MAX,
  allowedOfferKinds,
  isOfferKind,
  kindHasCards,
  kindHasCash,
  type OfferKind,
  type OfferRole,
} from './offerLabels';
import type { OfferTarget } from './offerTarget';

/**
 * The offer / counter-offer form (Phase 8 contract, mirror of the web's
 * `shared/offers/offer-form.ts`): kind, cash part, the buyer's cards with quantities, a note
 * and the expiry, the API's validation rules checked inline, and the mapping to the
 * `POST /offers` and `POST /offers/{id}/counter` bodies.
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
  /** The amount as typed (a decimal string; `''` when empty). */
  cashAmount: string;
  currency: string;
  cards: TradeLine[];
  message: string;
  expiresInHours: number;
  /** Ask for payment protection (cash part only; Phase 9, `protectedPayments` flag). */
  protectionRequested: boolean;
}

export type OfferField = 'cashAmount' | 'cards' | 'message' | 'expiresInHours';
export type OfferFormErrors = Partial<Record<OfferField, string>>;

/** The amount typed, as a number (`null` when empty or not a number). */
export function parseAmount(value: string): number | null {
  const text = value.trim().replace(',', '.');
  if (!text) {
    return null;
  }
  if (!/^\d*(\.\d*)?$/.test(text) || text === '.') {
    return Number.NaN;
  }
  return Number(text);
}

/** Inline message of the cash field (CASH / MIXED), `null` when valid. */
export function cashError(kind: OfferKind, value: string): string | null {
  if (!kindHasCash(kind)) {
    return null;
  }
  const amount = parseAmount(value);
  if (amount === null) {
    return 'Enter the amount you offer.';
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Enter an amount above 0.';
  }
  if (amount > OFFER_CASH_MAX) {
    return 'That amount is too large.';
  }
  const decimals = value.trim().replace(',', '.').split('.')[1] ?? '';
  return decimals.length > 2 ? 'Use at most 2 decimals.' : null;
}

/** Inline message of the cards picker (TRADE / MIXED), `null` when valid. */
export function cardsError(kind: OfferKind, lines: readonly TradeLine[]): string | null {
  if (!kindHasCards(kind)) {
    return null;
  }
  if (lines.length === 0) {
    return 'Pick at least one of your cards to trade.';
  }
  if (lines.length > OFFER_TRADE_ITEMS_MAX) {
    return `Offer at most ${OFFER_TRADE_ITEMS_MAX} different cards.`;
  }
  const badQuantity = lines.some(
    (line) =>
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > Math.min(OFFER_QUANTITY_MAX, Math.max(1, line.maxQuantity))
  );
  return badQuantity ? 'Check the number of copies of each card.' : null;
}

/** Every inline error of the form (empty when it can be sent). */
export function validateOffer(value: OfferFormValue): OfferFormErrors {
  const errors: OfferFormErrors = {};
  const cash = cashError(value.kind, value.cashAmount);
  if (cash) {
    errors.cashAmount = cash;
  }
  const cards = cardsError(value.kind, value.cards);
  if (cards) {
    errors.cards = cards;
  }
  if (value.message.length > OFFER_MESSAGE_MAX) {
    errors.message = `Keep the note under ${OFFER_MESSAGE_MAX} characters.`;
  }
  if (
    !Number.isInteger(value.expiresInHours) ||
    value.expiresInHours < 1 ||
    value.expiresInHours > 168
  ) {
    errors.expiresInHours = 'Choose when the offer expires.';
  }
  return errors;
}

function roundCash(value: string): number | undefined {
  const amount = parseAmount(value);
  if (amount === null || !Number.isFinite(amount)) {
    return undefined;
  }
  return Math.round(amount * 100) / 100;
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
    kind: value.kind,
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
    kind: value.kind,
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
    const theirs =
      offer.cashAmount === null || offer.cashAmount === undefined
        ? undefined
        : Math.round(offer.cashAmount * 100) / 100;
    if (mine !== theirs || value.currency !== (offer.currency ?? value.currency)) {
      return false;
    }
  }
  if (kindHasCards(value.kind)) {
    const current = new Map(
      offer.tradeItems
        .filter((line) => !!line.inventoryItemId)
        .map((line) => [line.inventoryItemId as string, line.quantity])
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
    cashAmount: '',
    currency,
    cards: [],
    message: '',
    expiresInHours: OFFER_DEFAULT_EXPIRY_HOURS,
    protectionRequested: false,
  };
}

/** The amount of a proposal as the form shows it ("40", "12.5" → "12.50"). */
function amountText(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) {
    return '';
  }
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/** Starting values of a counter-offer: the current proposal (the note starts empty). */
export function counterValue(offer: OfferResponse, fallbackCurrency: string): OfferFormValue {
  return {
    kind: isOfferKind(offer.kind) ? offer.kind : 'CASH',
    cashAmount: amountText(offer.cashAmount),
    currency: offer.currency ?? fallbackCurrency,
    cards: offer.tradeItems
      .map((line) => tradeLineFromOffer(line))
      .filter((line): line is TradeLine => line !== null),
    message: '',
    expiresInHours: OFFER_DEFAULT_EXPIRY_HOURS,
    protectionRequested: offer.protectionRequested,
  };
}

/**
 * The kinds the form offers: a new offer follows the card's availability; a seller's counter-
 * offer may propose any kind, but the cards can only be the buyer's (so CASH only without them);
 * the buyer's counter-offers follow the card's availability.
 */
export function formKinds(
  target: Pick<OfferTarget, 'availability' | 'acceptsOffers'>,
  counter: { viewerRole: OfferRole; poolSize: number } | null
): OfferKind[] {
  if (!counter) {
    return allowedOfferKinds(target.availability, target.acceptsOffers);
  }
  if (counter.viewerRole === 'SELLER') {
    return counter.poolSize > 0 ? ['CASH', 'TRADE', 'MIXED'] : ['CASH'];
  }
  return allowedOfferKinds(target.availability, true);
}
