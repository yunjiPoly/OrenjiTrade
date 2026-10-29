import type {
  BulkInventoryRequest,
  BulkInventoryResponse,
  InventoryItemResponse,
} from '@orenji/api-client';
import { gameInfo } from '../../../shared/domain/games';
import {
  TemporaryDuration,
  Visibility,
  publicUntilFor,
} from '../../../shared/inventory/inventory-labels';

/**
 * One action of the bulk dock (web redesign spec 9.6): Make public / Make private
 * (`SET_VISIBILITY`), Move to binder (`MOVE_TO_BINDER`), Still have them (`CONFIRM`) and Delete
 * (`DELETE`). "Set price" and "Select all that match" stay hidden until their additive API exists
 * (decision 19).
 */
export type BulkAction =
  | { kind: 'visibility'; visibility: Visibility; duration?: TemporaryDuration }
  | { kind: 'move'; binderId: string | null; binderName: string | null; binderGame?: string | null }
  | { kind: 'confirm' }
  | { kind: 'delete' };

/** `POST /inventory/items/bulk` body for an action on the selected items. */
export function toBulkRequest(
  action: BulkAction,
  itemIds: readonly string[],
  now: number = Date.now(),
): BulkInventoryRequest {
  const base = { itemIds: [...itemIds] };
  switch (action.kind) {
    case 'visibility': {
      const request: BulkInventoryRequest = {
        ...base,
        action: 'SET_VISIBILITY' as BulkInventoryRequest['action'],
        visibility: action.visibility as BulkInventoryRequest['visibility'],
      };
      if (action.visibility === 'TEMPORARILY_PUBLIC') {
        request.publicUntil = publicUntilFor(action.duration ?? '24h', now);
      }
      return request;
    }
    case 'move': {
      const request: BulkInventoryRequest = {
        ...base,
        action: 'MOVE_TO_BINDER' as BulkInventoryRequest['action'],
      };
      if (action.binderId) {
        request.binderId = action.binderId;
      }
      return request;
    }
    case 'confirm':
      return { ...base, action: 'CONFIRM' as BulkInventoryRequest['action'] };
    case 'delete':
      return { ...base, action: 'DELETE' as BulkInventoryRequest['action'] };
  }
}

export function cardsLabel(count: number): string {
  return `${count} ${count === 1 ? 'card' : 'cards'}`;
}

/** A toast's words: the title and its sub-line. */
export interface BulkOutcome {
  title: string;
  sub: string | null;
}

function title(action: BulkAction, count: number): string {
  if (count === 0) {
    return 'Nothing changed';
  }
  switch (action.kind) {
    case 'visibility':
      return action.visibility === 'PRIVATE' ? `Made ${count} private` : `Made ${count} public`;
    case 'move':
      return action.binderId
        ? `Moved ${count} to ${action.binderName ?? 'the binder'}`
        : `Moved ${count} to Unfiled`;
    case 'confirm':
      return `${cardsLabel(count)} confirmed as still available`;
    case 'delete':
      return `${cardsLabel(count)} deleted`;
  }
}

/**
 * The toast of a bulk action, naming what changed and why the rest did not (spec 9.6): "Moved 4."
 * with "2 Pokémon cards can't go in a Yu-Gi-Oh! binder.". `items` are the loaded cards (to name the
 * game of the cards a binder refused).
 */
export function bulkOutcome(
  action: BulkAction,
  response: BulkInventoryResponse,
  items: readonly Pick<InventoryItemResponse, 'id' | 'card'>[] = [],
): BulkOutcome {
  const parts: string[] = [];
  const unchanged = response.skipped.filter((entry) => entry.reason === 'UNCHANGED').length;
  const otherGame = response.skipped.filter((entry) => entry.reason === 'BINDER_GAME_MISMATCH');
  const missing = response.skipped.length - unchanged - otherGame.length;
  if (otherGame.length > 0) {
    const byId = new Map(items.map((item) => [item.id, item]));
    const games = new Set(otherGame.map((entry) => byId.get(entry.itemId)?.card.game ?? '?'));
    const binderGameLabel =
      action.kind === 'move' && action.binderGame ? gameInfo(action.binderGame).label : null;
    const where = binderGameLabel ? `a ${binderGameLabel} binder` : 'that binder';
    const [only] = [...games];
    const what =
      games.size === 1 && only !== '?'
        ? `${otherGame.length} ${gameInfo(only).label} ${otherGame.length === 1 ? 'card' : 'cards'}`
        : `${cardsLabel(otherGame.length)} of other games`;
    parts.push(`${what} can't go in ${where}.`);
  }
  if (unchanged > 0) {
    parts.push(
      unchanged === 1 ? '1 was already like that.' : `${unchanged} were already like that.`,
    );
  }
  if (missing > 0) {
    parts.push(
      missing === 1
        ? '1 is no longer in your inventory.'
        : `${missing} are no longer in your inventory.`,
    );
  }
  return { title: title(action, response.updated), sub: parts.length ? parts.join(' ') : null };
}

/** One sentence (the old result line and the screen readers' summary). */
export function bulkResultMessage(
  action: BulkAction,
  response: BulkInventoryResponse,
  items: readonly Pick<InventoryItemResponse, 'id' | 'card'>[] = [],
): string {
  const outcome = bulkOutcome(action, response, items);
  return outcome.sub ? `${outcome.title}. ${outcome.sub}` : `${outcome.title}.`;
}

/**
 * After "Make public": the cards that are public but that nobody sees (spec 9.6, "Made 6 public.
 * 2 are in a private binder, so nobody sees them yet."). `binderId` is set when they all sit in
 * the same private binder (the toast then offers "Make the binder public").
 */
export function hiddenAfterPublic(
  items: readonly Pick<InventoryItemResponse, 'id' | 'effectivePublic' | 'visibility' | 'binder'>[],
  ids: readonly string[],
  privateBinders: ReadonlySet<string>,
): { count: number; inPrivateBinder: number; binderId: string | null } {
  const chosen = new Set(ids);
  const hidden = items.filter(
    (item) => chosen.has(item.id) && item.visibility !== 'PRIVATE' && !item.effectivePublic,
  );
  const inBinder = hidden.filter((item) => item.binder && privateBinders.has(item.binder.id));
  const binders = new Set(inBinder.map((item) => item.binder!.id));
  return {
    count: hidden.length,
    inPrivateBinder: inBinder.length,
    binderId: binders.size === 1 && inBinder.length === hidden.length ? [...binders][0] : null,
  };
}
