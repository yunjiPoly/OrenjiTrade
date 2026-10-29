import type { BinderResponse, GameResponse, InventoryItemResponse } from '@orenji/api-client';
import { ALL_GAMES, GameInfo, gameInfo } from '../../../shared/domain/games';

/**
 * Binders by game (web redesign spec 9.2 and 9.12, stage G: a binder holds the cards of one game).
 * Inventory always shows every game; the binder pane and the Binders tab have one section per game
 * the collector has binders of, in the phone's game order.
 */

/** The game slug of a binder (`game`, always sent since stage G; its cards' game before). */
export function binderGame(binder: Pick<BinderResponse, 'game' | 'games'>): string | null {
  return binder.game || binder.games?.[0] || null;
}

/** Whether a card can go in a binder: same game (a binder of unknown game refuses nothing). */
export function binderTakes(
  binder: Pick<BinderResponse, 'game' | 'games'>,
  item: Pick<InventoryItemResponse, 'card'>,
): boolean {
  const game = binderGame(binder);
  return !game || game === item.card.game;
}

/** Whether every one of the cards can go in the binder. */
export function binderTakesAll(
  binder: Pick<BinderResponse, 'game' | 'games'>,
  items: readonly Pick<InventoryItemResponse, 'card'>[],
): boolean {
  return items.every((item) => binderTakes(binder, item));
}

export interface BinderGameGroup {
  game: string;
  info: GameInfo;
  binders: BinderResponse[];
}

const ORDER = new Map(ALL_GAMES.map((game, index) => [game.slug, index]));

/** One group per game the binders belong to, in the phone's order; binders keep their order. */
export function groupBindersByGame(binders: readonly BinderResponse[]): BinderGameGroup[] {
  const groups = new Map<string, BinderResponse[]>();
  for (const binder of binders) {
    const game = binderGame(binder) ?? 'other';
    groups.set(game, [...(groups.get(game) ?? []), binder]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (ORDER.get(a) ?? 99) - (ORDER.get(b) ?? 99) || a.localeCompare(b))
    .map(([game, list]) => ({ game, info: gameInfo(game), binders: list }));
}

/** "3 binders". */
export function binderCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'binder' : 'binders'}`;
}

/** "Only Yu-Gi-Oh! cards can go in" (the dimmed binder of another game, spec 9.6 and 9.7). */
export function onlyGameLabel(game: string | null): string {
  return game ? `Only ${gameInfo(game).label} cards can go in` : 'Only cards of its game can go in';
}

/**
 * The binder's ids reordered after a move inside its game (the whole list keeps every other
 * binder in place): `PUT /binders/reorder` takes the full order.
 */
export function reorderWithinGame(
  binders: readonly BinderResponse[],
  binderId: string,
  offset: -1 | 1 | number,
): string[] {
  const ids = binders.map((binder) => binder.id);
  const moving = binders.find((binder) => binder.id === binderId);
  if (!moving) {
    return ids;
  }
  const game = binderGame(moving);
  const sameGame = binders.filter((binder) => binderGame(binder) === game).map((b) => b.id);
  const from = sameGame.indexOf(binderId);
  const to = Math.max(0, Math.min(sameGame.length - 1, from + offset));
  if (from === to) {
    return ids;
  }
  const reordered = [...sameGame];
  reordered.splice(from, 1);
  reordered.splice(to, 0, binderId);
  // Put the game's binders back into the slots they held, in their new order.
  let next = 0;
  return ids.map((id) => (sameGame.includes(id) ? reordered[next++] : id));
}

/** Whether a game can hold binders now: an active game with cards (`hasCards`, stage G). */
export function gameOpenForBinders(game: Pick<GameResponse, 'hasCards' | 'status'>): boolean {
  return game.hasCards !== false && game.status !== 'HIDDEN';
}
