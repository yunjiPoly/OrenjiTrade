import type { BinderResponse, CreateBinderRequest, UpdateBinderRequest } from '@orenji/api-client';
import { binderGame } from './binder-games';
import { temporaryPublicationEnded } from './card-form';
import { endsLabel } from '../../../shared/inventory/inventory-labels';
import { ASKING_PRICE_MAX } from './item-price';

/**
 * Edit binder and New binder (web redesign spec 9.12): the phone's binder form
 * (`apps/mobile/src/features/binders/binderForm.ts`) ported as it is: a name, Private or Public,
 * "Sell as a deck core" with its price (free text) and public note (the binder's description), and
 * the game (stage G: one game per binder, fixed once the binder holds a card).
 */

export const BINDER_NAME_MAX = 80;
export const BINDER_NOTE_MAX = 500;
export const BINDER_DEFAULT_GAME = 'yugioh';

export type BinderVisibilityChoice = 'PRIVATE' | 'PUBLIC';

export interface BinderFormValue {
  name: string;
  visibility: BinderVisibilityChoice;
  sellsAsCore: boolean;
  /** The asking price as typed ("$180", "Trade only"). */
  price: string;
  /** The public note: the binder's description. */
  note: string;
  /** The game slug. */
  game: string;
}

export interface BinderFormErrors {
  name?: string;
  price?: string;
  note?: string;
}

export const BINDER_COPY = {
  nameRequired: 'Give your binder a name.',
  nameTooLong: 'At most 80 characters.',
  priceTooLong: 'At most 40 characters.',
  priceOneLine: 'Keep the price on one line.',
  noteTooLong: 'At most 500 characters.',
  coreTitle: 'Sell as a deck core',
  coreHint: 'Photos, one price and a note',
  pricePlaceholder: '$180 or Trade only',
  priceHint: 'One price for the whole deck core.',
  notePlaceholder: "What's in it, condition, language",
  privateCoreHint: 'Buyers can only find a deck core when it is public.',
  keyCards: 'Key cards',
  keyCardsHint: 'Helps buyers find it when they search a card.',
  gameHint: 'A binder holds cards of one game. You can’t change it once it has cards.',
  gameLocked: (game: string) => `Game: ${game}. It can't change once the binder has cards`,
  gameLockedLine: 'Game locked. It can’t change once the binder has cards.',
  gameComingSoon: 'Cards coming soon',
  limit: (count: number) =>
    `You have ${count} ${count === 1 ? 'binder' : 'binders'}, the most each collector can have. Every collector has the same limits.`,
  deleteBodyCore: 'Its photos, price and note go away. Your cards stay in your inventory.',
  deleteBodyPlain: 'Your cards stay in your inventory.',
  tipTitle: 'Selling a whole deck?',
  tipBody: 'Turn on “Sell as a deck core” in a binder. Photos, a price and a note are enough.',
} as const;

/** Public for PUBLIC and a running temporary publication; Private otherwise. */
export function binderVisibilityChoice(
  binder: Pick<BinderResponse, 'visibility' | 'publicUntil'>,
  now = Date.now(),
): BinderVisibilityChoice {
  if (binder.visibility === 'PRIVATE' || temporaryPublicationEnded(binder, now)) {
    return 'PRIVATE';
  }
  return 'PUBLIC';
}

/** The form of a new binder (private, plain, of `game`) or of a saved one. */
export function binderFormOf(
  binder?: BinderResponse | null,
  now = Date.now(),
  game = BINDER_DEFAULT_GAME,
): BinderFormValue {
  if (!binder) {
    return { name: '', visibility: 'PRIVATE', sellsAsCore: false, price: '', note: '', game };
  }
  return {
    name: binder.name,
    visibility: binderVisibilityChoice(binder, now),
    sellsAsCore: binder.sellsAsCore ?? false,
    price: binder.askingPriceText ?? '',
    note: binder.description ?? '',
    game: binderGame(binder) ?? BINDER_DEFAULT_GAME,
  };
}

/** "Sell as a deck core" turned on makes the binder public (buyers find public deck cores only). */
export function withDeckCore(form: BinderFormValue, sellsAsCore: boolean): BinderFormValue {
  return {
    ...form,
    sellsAsCore,
    visibility: sellsAsCore && !form.sellsAsCore ? 'PUBLIC' : form.visibility,
  };
}

export function binderFormChanged(
  form: BinderFormValue,
  binder: BinderResponse,
  now = Date.now(),
): boolean {
  const saved = binderFormOf(binder, now);
  return (
    form.name.trim() !== saved.name.trim() ||
    form.visibility !== saved.visibility ||
    form.sellsAsCore !== saved.sellsAsCore ||
    form.price.trim() !== saved.price.trim() ||
    form.note.trim() !== saved.note.trim() ||
    form.game !== saved.game
  );
}

export function validateBinderForm(form: BinderFormValue): BinderFormErrors {
  const errors: BinderFormErrors = {};
  const name = form.name.trim();
  if (!name) {
    errors.name = BINDER_COPY.nameRequired;
  } else if (name.length > BINDER_NAME_MAX) {
    errors.name = BINDER_COPY.nameTooLong;
  }
  if (form.sellsAsCore) {
    const price = form.price.trim();
    if ([...price].length > ASKING_PRICE_MAX) {
      errors.price = BINDER_COPY.priceTooLong;
    } else if (/[\r\n]/.test(price)) {
      errors.price = BINDER_COPY.priceOneLine;
    }
    if (form.note.trim().length > BINDER_NOTE_MAX) {
      errors.note = BINDER_COPY.noteTooLong;
    }
  }
  return errors;
}

export function hasBinderErrors(errors: BinderFormErrors): boolean {
  return !!(errors.name || errors.price || errors.note);
}

/** `POST /binders`, always with the binder's game (a binder made without one takes any game). */
export function toCreateBinderBody(form: BinderFormValue, gameId: string): CreateBinderRequest {
  const body: CreateBinderRequest = {
    name: form.name.trim(),
    visibility: form.visibility as CreateBinderRequest['visibility'],
    sellsAsCore: form.sellsAsCore,
    gameId,
  };
  if (form.sellsAsCore) {
    const price = form.price.trim();
    if (price) {
      body.askingPriceText = price;
    }
    const note = form.note.trim();
    if (note) {
      body.description = note;
    }
  }
  return body;
}

/** `PATCH /binders/{id}`: the changed fields and `confirm` (a save confirms the binder). */
export function toBinderPatch(
  form: BinderFormValue,
  binder: BinderResponse,
  now = Date.now(),
  gameId?: string | null,
): UpdateBinderRequest {
  const saved = binderFormOf(binder, now);
  const patch: UpdateBinderRequest = { confirm: true };
  if (form.name.trim() !== saved.name.trim()) {
    patch.name = form.name.trim();
  }
  if (form.visibility !== saved.visibility) {
    patch.visibility = form.visibility as UpdateBinderRequest['visibility'];
  }
  if (form.sellsAsCore !== saved.sellsAsCore) {
    patch.sellsAsCore = form.sellsAsCore;
  }
  if (form.price.trim() !== saved.price.trim()) {
    patch.askingPriceText = form.price.trim() || null;
  }
  if (form.note.trim() !== saved.note.trim()) {
    patch.description = form.note.trim();
  }
  if (form.game !== saved.game && gameId) {
    patch.gameId = gameId;
  }
  return patch;
}

/** "Deck core · $180", or "Deck core" without a price. */
export function deckCoreTag(price: string | null | undefined): string {
  const text = price?.trim();
  return text ? `Deck core · ${text}` : 'Deck core';
}

/** "9 cards · Public" or "2 photos · Public" (a deck core). */
export function binderLine(binder: BinderResponse, now = Date.now()): string {
  const count = binder.sellsAsCore ? (binder.photos?.length ?? 0) : binder.itemCount;
  const unit = binder.sellsAsCore ? 'photo' : 'card';
  const who = binderVisibilityChoice(binder, now) === 'PUBLIC' ? 'Public' : 'Private';
  const ends = binderEnds(binder, now);
  return `${count} ${count === 1 ? unit : `${unit}s`} · ${who}${ends ? ` · ${ends}` : ''}`;
}

/**
 * When a binder's temporary publication (made on the old web) ends, "ends tomorrow", while it
 * runs; null otherwise (U9: the collector knows the binder will turn private).
 */
export function binderEnds(
  binder: Pick<BinderResponse, 'visibility' | 'publicUntil'>,
  now = Date.now(),
): string | null {
  if (binder.visibility !== 'TEMPORARILY_PUBLIC' || temporaryPublicationEnded(binder, now)) {
    return null;
  }
  return endsLabel(binder.publicUntil, now);
}
