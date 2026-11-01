import type { BinderResponse, CreateBinderRequest, UpdateBinderRequest } from '@/src/api/types';
import { ASKING_PRICE_MAX } from '@/src/features/inventory/itemPrice';
import { temporaryPublicationEnded } from '@/src/features/inventory/visibilityStatus';

import { deckCoreTag, EDIT_BINDER_COPY, INVENTORY_BINDERS_COPY } from './binderCopy';

/** The API's bounds of a binder's name. */
export const BINDER_NAME_MAX = 80;
/** A deck core's public note on the phone (the binder's description; the API allows 1 000). */
export const BINDER_NOTE_MAX = 500;
/** A deck core's photos (the item photo rules). */
export const BINDER_PHOTO_MAX = 4;

export type BinderVisibilityChoice = 'PRIVATE' | 'PUBLIC';

/** What Edit binder and New binder edit (spec 2026-10-14, section 7, screen 18). */
export interface BinderFormValue {
  name: string;
  visibility: BinderVisibilityChoice;
  sellsAsCore: boolean;
  /** The asking price as typed ("$180", "Trade only"). */
  price: string;
  /** The public note: the binder's description. */
  note: string;
  /** The game whose cards the binder holds (stage G): a slug. */
  game: string;
}

export interface BinderFormErrors {
  name?: string;
  price?: string;
  note?: string;
}

/**
 * Who can see a binder, as its owner chose it: Public for PUBLIC and for a temporary publication
 * of the paused web that is still running, Private otherwise (one that ended shows nothing).
 */
export function binderVisibilityChoice(
  binder: Pick<BinderResponse, 'visibility' | 'publicUntil'>,
  now = Date.now()
): BinderVisibilityChoice {
  if (binder.visibility === 'PRIVATE' || temporaryPublicationEnded(binder, now)) {
    return 'PRIVATE';
  }
  return 'PUBLIC';
}

/** The game of a binder the API sent without one (an answer older than stage G). */
export const BINDER_DEFAULT_GAME = 'yugioh';

/**
 * The form of a new binder (private, a plain binder of `game`: the browsed game) or of a binder as
 * saved.
 */
export function binderFormOf(
  binder?: BinderResponse | null,
  now = Date.now(),
  game = BINDER_DEFAULT_GAME
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
    game: binder.game ?? BINDER_DEFAULT_GAME,
  };
}

/**
 * Turning "Sell as a deck core" on makes the binder public, as the mockup does (a deck core is for
 * buyers); the collector can still choose Private, and the hint then says buyers cannot find it.
 */
export function withDeckCore(form: BinderFormValue, sellsAsCore: boolean): BinderFormValue {
  return {
    ...form,
    sellsAsCore,
    visibility: sellsAsCore && !form.sellsAsCore ? 'PUBLIC' : form.visibility,
  };
}

/** Whether something of the form differs from the binder as saved (trimmed texts). */
export function binderFormChanged(
  form: BinderFormValue,
  binder: BinderResponse,
  now = Date.now()
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

/** Whether two forms hold the same values (as typed). */
export function sameBinderForm(a: BinderFormValue, b: BinderFormValue): boolean {
  return (
    a.name === b.name &&
    a.visibility === b.visibility &&
    a.sellsAsCore === b.sellsAsCore &&
    a.price === b.price &&
    a.note === b.note &&
    a.game === b.game
  );
}

/**
 * The form once the binder changed elsewhere (another Edit binder saved it, or a refresh came
 * in): each field the collector has not touched since `before` takes the binder's new value
 * (`after`), each field they changed keeps what they typed. An untouched form then shows the binder
 * as saved and has no change to save, so it never writes an old value back.
 */
export function rebaseBinderForm(
  form: BinderFormValue,
  before: BinderFormValue,
  after: BinderFormValue
): BinderFormValue {
  return {
    name: form.name === before.name ? after.name : form.name,
    visibility: form.visibility === before.visibility ? after.visibility : form.visibility,
    sellsAsCore: form.sellsAsCore === before.sellsAsCore ? after.sellsAsCore : form.sellsAsCore,
    price: form.price === before.price ? after.price : form.price,
    note: form.note === before.note ? after.note : form.note,
    game: form.game === before.game ? after.game : form.game,
  };
}

/** Inline errors (the API's bounds: a name of 1–80, a price of 40, a note of 500 on the phone). */
export function validateBinderForm(form: BinderFormValue): BinderFormErrors {
  const errors: BinderFormErrors = {};
  const name = form.name.trim();
  if (!name) {
    errors.name = EDIT_BINDER_COPY.nameRequired;
  } else if (name.length > BINDER_NAME_MAX) {
    errors.name = EDIT_BINDER_COPY.nameTooLong;
  }
  if (form.sellsAsCore) {
    const price = form.price.trim();
    if ([...price].length > ASKING_PRICE_MAX) {
      errors.price = EDIT_BINDER_COPY.priceTooLong;
    } else if (/[\r\n]/.test(price)) {
      errors.price = EDIT_BINDER_COPY.priceOneLine;
    }
    if (form.note.trim().length > BINDER_NOTE_MAX) {
      errors.note = EDIT_BINDER_COPY.noteTooLong;
    }
  }
  return errors;
}

export function hasBinderErrors(errors: BinderFormErrors): boolean {
  return !!(errors.name || errors.price || errors.note);
}

/**
 * `POST /binders` of New binder, with the id of the binder's game (stage G; `GET /games`). A plain
 * binder sends no price and no note (the phone shows them for a deck core only).
 */
export function toCreateBinderBody(form: BinderFormValue, gameId: string): CreateBinderRequest {
  // The phone always names the binder's game (review fix 1, P3): a binder made without one takes
  // any game (the paused web's).
  const body: CreateBinderRequest = {
    name: form.name.trim(),
    visibility: form.visibility,
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

/**
 * `PATCH /binders/{id}` of "Save changes": the fields that changed, and `confirm` (a save counts
 * as "still available", as on Edit card). The price and the note are kept when the switch goes off
 * (turning it on again brings them back); public views show them for a deck core only. Another
 * game (stage G, only while the binder holds no card) is sent as `gameId` (`GET /games`).
 */
export function toBinderPatch(
  form: BinderFormValue,
  binder: BinderResponse,
  now = Date.now(),
  gameId?: string | null
): UpdateBinderRequest {
  const saved = binderFormOf(binder, now);
  const patch: UpdateBinderRequest = { confirm: true };
  if (form.name.trim() !== saved.name.trim()) {
    patch.name = form.name.trim();
  }
  if (form.visibility !== saved.visibility) {
    patch.visibility = form.visibility;
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

/** The second line of a row of Inventory › Binders: "2 photos · Public", "9 cards · Private". */
export function binderRowLine(binder: BinderResponse, now = Date.now()): string {
  const shown =
    binderVisibilityChoice(binder, now) === 'PUBLIC'
      ? INVENTORY_BINDERS_COPY.public
      : INVENTORY_BINDERS_COPY.private;
  const count = binder.sellsAsCore
    ? INVENTORY_BINDERS_COPY.photos(binder.photos?.length ?? 0)
    : INVENTORY_BINDERS_COPY.cards(binder.itemCount);
  return `${count} · ${shown}`;
}

/** The tag of a deck core row: "Deck core · $180". */
export function binderTag(binder: Pick<BinderResponse, 'askingPriceText'>): string {
  return deckCoreTag(binder.askingPriceText);
}

/**
 * The collector's binders without the deck cores they sold (Mark as sold, stage R4; spec section
 * 16, default 6: a sold deck core is hidden). `useMyBinders` answers these, so a sold core is in no
 * list, count or picker of the phone: Inventory › Binders, the "Binders {n}" switch, Reorder, the
 * card form's binder picker and "Share a binder" (R3 leftover U10). Undoing the sale brings it back.
 */
export function liveBinders(binders: readonly BinderResponse[]): BinderResponse[] {
  return binders.filter((binder) => !binder.soldAt);
}

/**
 * Inventory › Binders: deck cores first, then the other binders, each in the owner's order (the
 * list the API returns, `PUT /binders/reorder`). Sold deck cores (stage R4) are not listed. The
 * Reorder sheet shows the same two groups and moves a binder inside its group.
 */
export function orderBinders(binders: readonly BinderResponse[]): {
  cores: BinderResponse[];
  binders: BinderResponse[];
} {
  const live = liveBinders(binders);
  return {
    cores: live.filter((binder) => binder.sellsAsCore),
    binders: live.filter((binder) => !binder.sellsAsCore),
  };
}

/** A game's binders in Inventory › Binders (stage G, mockup screen 17). */
export interface BinderSection {
  game: string;
  binders: BinderResponse[];
}

/**
 * Inventory › Binders grouped by game (stage G): one section per game that has binders, in the
 * games' order (`gameOrder`, the order of `GET /games`; a game it does not list, such as one an
 * admin hid, comes last), each with its deck cores first and then its other binders, in the
 * owner's order. Sold deck cores are not listed (`orderBinders`).
 */
export function bindersByGame(
  binders: readonly BinderResponse[],
  gameOrder: readonly string[]
): BinderSection[] {
  const { cores, binders: plain } = orderBinders(binders);
  const byGame = new Map<string, BinderResponse[]>();
  for (const binder of [...cores, ...plain]) {
    const game = binder.game ?? BINDER_DEFAULT_GAME;
    const list = byGame.get(game) ?? [];
    list.push(binder);
    byGame.set(game, list);
  }
  const rank = (game: string) => {
    const index = gameOrder.indexOf(game);
    return index === -1 ? gameOrder.length : index;
  };
  return [...byGame.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([game, list]) => ({ game, binders: list }));
}

/**
 * The binders a card can go into (stage G): those of the card's game, sold deck cores left out. A
 * card whose game is not known yet keeps every live binder, and so does a binder whose game the
 * answer does not say (one older than stage G): the API refuses another game's binder anyway (409
 * BINDER_GAME_MISMATCH).
 */
export function bindersForGame(
  binders: readonly BinderResponse[],
  game: string | null | undefined
): BinderResponse[] {
  const live = liveBinders(binders);
  return game ? live.filter((binder) => !binder.game || binder.game === game) : live;
}
