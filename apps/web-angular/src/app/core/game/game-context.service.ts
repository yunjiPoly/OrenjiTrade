import { Injectable, computed, signal } from '@angular/core';
import { ALL_GAMES, GameInfo, gameInfo } from '../../shared/domain/games';

/** The game a signed-out visitor and a new collector browse first (the phone's default). */
export const DEFAULT_GAME = 'yugioh';

/** A row of the game popover (spec 4.5). */
export interface GameOption {
  game: GameInfo;
  /** False: dimmed with "Cards coming soon", `aria-disabled` (it cannot be picked). */
  available: boolean;
}

/**
 * The browsed game of the top bar's game pill (spec 4.2 and 4.5; one game at a time on Home and
 * Search, decision 7). Until web stage WD scopes Search by game (the phone did in stage G), the web
 * browses Yu-Gi-Oh! only and its popover lists every other game as "Cards coming soon".
 */
@Injectable({ providedIn: 'root' })
export class GameContext {
  /** Games that can be browsed on the web today. Stage WD reads `GET /games` here. */
  private readonly browsable = signal<ReadonlySet<string>>(new Set([DEFAULT_GAME]));
  private readonly currentState = signal(DEFAULT_GAME);

  readonly current = this.currentState.asReadonly();
  readonly info = computed(() => gameInfo(this.currentState()));
  readonly options = computed<GameOption[]>(() =>
    ALL_GAMES.map((game) => ({ game, available: this.browsable().has(game.slug) })),
  );

  /** Browses `slug` when it can be browsed; returns whether it did. */
  select(slug: string): boolean {
    if (!this.browsable().has(slug)) {
      return false;
    }
    this.currentState.set(slug);
    return true;
  }
}
