import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { GameResponse } from '@orenji/api-client';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../auth/session.service';
import { GamesStore } from '../../shared/catalog/games.store';
import { MyProfileStore } from '../../shared/profile/my-profile.store';
import { ALL_GAMES, GameInfo, gameInfo } from '../../shared/domain/games';

/** The game a signed-out visitor and a new collector browse first (the phone's default). */
export const DEFAULT_GAME = 'yugioh';

/**
 * localStorage key prefix of the browsed game (spec 4.5: "the last choice is also kept in this
 * browser"): `orenji.game.<Firebase uid>` for a collector, `orenji.game.guest` signed out, as the
 * phone keeps it per account. Never the API's account id, which other members see as a holder's
 * or an owner's id (WD review P4); a key of that old form is moved and removed.
 */
export const GAME_STORAGE_PREFIX = 'orenji.game.';
export const GUEST_GAME_KEY = 'guest';

const GAME_SLUG = /^[a-z0-9-]{1,32}$/;

/** A row of the game popover (spec 4.5). */
export interface GameOption {
  game: GameInfo;
  /** False: dimmed with "Cards coming soon", `aria-disabled` (it cannot be picked). */
  available: boolean;
}

/** The slugs Home and Search can browse: ACTIVE games whose catalogue holds a card. */
export function browsableGames(games: readonly GameResponse[] | null): ReadonlySet<string> | null {
  if (games === null) {
    return null;
  }
  return new Set(
    games
      .filter((game) => !!game.slug && game.status !== 'HIDDEN' && game.hasCards === true)
      .map((game) => game.slug as string),
  );
}

/**
 * The rows of the game popover: the games of `GET /games` (ACTIVE, never HIDDEN, in the API's
 * order), each available when its catalogue holds a card; the static list only while the games
 * load, with the browsed one available (WD review F16). A game the web does not know by name yet
 * keeps the API's name.
 */
export function gameOptions(games: readonly GameResponse[] | null, current: string): GameOption[] {
  if (games === null) {
    return ALL_GAMES.map((game) => ({ game, available: game.slug === current }));
  }
  return games
    .filter((game) => !!game.slug && game.status === 'ACTIVE')
    .map((game) => {
      const slug = game.slug as string;
      const known = gameInfo(slug);
      const info =
        known.label === slug && game.name
          ? { ...known, label: game.name, shortLabel: game.shortName || game.name }
          : known;
      return { game: info, available: game.hasCards === true };
    });
}

/**
 * The game to browse (the phone's `resolveBrowsingGame`, stage G), in this order: the one picked
 * in this visit (the pill, a `?game=` link, a card page of another game), the one kept in this
 * browser for this account, the first game of the collector's profile that can be browsed, then
 * Yu-Gi-Oh!. Before the games list answered, a pick or a kept game is taken as it is.
 */
export function resolveGame(input: {
  picked: string | null;
  stored: string | null;
  profileGames: readonly string[];
  browsable: ReadonlySet<string> | null;
}): string {
  const can = (slug: string | null): slug is string =>
    !!slug && (input.browsable === null || input.browsable.has(slug));
  if (can(input.picked)) {
    return input.picked;
  }
  if (can(input.stored)) {
    return input.stored;
  }
  if (input.browsable !== null) {
    const fromProfile = input.profileGames.find((slug) => can(slug));
    if (fromProfile) {
      return fromProfile;
    }
  }
  if (can(DEFAULT_GAME) || input.browsable === null) {
    return DEFAULT_GAME;
  }
  return [...input.browsable][0] ?? DEFAULT_GAME;
}

/**
 * The browsed game of the top bar's game pill (spec 4.2 and 4.5; one game at a time on Home and
 * Search, decision 7; web stage WD, after the phone's stage G): every Search call sends it as
 * `game=`. The games come from `GET /games`: a game without cards (`hasCards` false) is dimmed
 * "Cards coming soon". The choice is kept in this browser per account (localStorage, try/catch).
 */
@Injectable({ providedIn: 'root' })
export class GameContext {
  private readonly document = inject(DOCUMENT);
  private readonly session = inject(SessionService);
  private readonly auth = inject(AuthService);
  private readonly gamesStore = inject(GamesStore);
  private readonly profiles = inject(MyProfileStore);

  private readonly storage = this.resolveStorage();
  private readonly pickedState = signal<string | null>(null);
  private readonly accountState = signal<string | null>(null);
  private readonly storedState = signal<string | null>(this.read(GUEST_GAME_KEY));
  private readonly profileGames = computed<readonly string[]>(() =>
    this.accountState() ? (this.profiles.profile()?.games ?? []) : [],
  );

  /** The browsable slugs; `null` until `GET /games` answered. */
  readonly browsable = computed(() => browsableGames(this.gamesStore.games()));
  readonly current = computed(() =>
    resolveGame({
      picked: this.pickedState(),
      stored: this.storedState(),
      profileGames: this.profileGames(),
      browsable: this.browsable(),
    }),
  );
  readonly info = computed(() => gameInfo(this.current()));
  readonly options = computed<GameOption[]>(() =>
    gameOptions(this.gamesStore.games(), this.current()),
  );

  constructor() {
    void this.gamesStore.load();
    effect(() => {
      const status = this.session.status();
      const id = this.session.me()?.id ?? null;
      untracked(() => {
        const uid = this.auth.user?.()?.uid ?? null;
        const account = status === 'ready' && id ? uid : null;
        if (status !== 'ready' && status !== 'anonymous') {
          return;
        }
        if (account === this.accountState()) {
          return;
        }
        // Another account (or signing out): its own kept game wins over this visit's pick.
        this.accountState.set(account);
        this.pickedState.set(null);
        if (account && id) {
          this.migrateLegacyKey(id, account);
        }
        const stored = this.read(account ?? GUEST_GAME_KEY);
        this.storedState.set(stored);
        if (account && !stored && !this.profiles.profile() && !this.profiles.loading()) {
          void this.profiles.load();
        }
      });
    });
  }

  /** Browses `slug` when it can be browsed; returns whether it did. */
  select(slug: string | null | undefined): boolean {
    const value = (slug ?? '').trim().toLowerCase();
    const browsable = this.browsable();
    if (!GAME_SLUG.test(value) || (browsable !== null && !browsable.has(value))) {
      return false;
    }
    this.pickedState.set(value);
    this.storedState.set(value);
    try {
      this.storage?.setItem(GAME_STORAGE_PREFIX + (this.accountState() ?? GUEST_GAME_KEY), value);
    } catch {
      // Storage may be unavailable (private mode, quota): the visit keeps the choice in memory.
    }
    return true;
  }

  /** Whether `slug` can be browsed (true until the games list answered). */
  canBrowse(slug: string | null | undefined): boolean {
    const browsable = this.browsable();
    return !!slug && (browsable === null || browsable.has(slug));
  }

  /** Moves a choice kept under the API account id (before WD's review) to the uid key. */
  private migrateLegacyKey(accountId: string, uid: string): void {
    if (accountId === uid) {
      return;
    }
    try {
      const legacy = this.storage?.getItem(GAME_STORAGE_PREFIX + accountId) ?? null;
      if (legacy === null) {
        return;
      }
      this.storage?.removeItem(GAME_STORAGE_PREFIX + accountId);
      if (GAME_SLUG.test(legacy) && this.storage?.getItem(GAME_STORAGE_PREFIX + uid) == null) {
        this.storage?.setItem(GAME_STORAGE_PREFIX + uid, legacy);
      }
    } catch {
      // Storage may be unavailable: nothing to move.
    }
  }

  private read(key: string): string | null {
    try {
      const value = this.storage?.getItem(GAME_STORAGE_PREFIX + key) ?? null;
      return value && GAME_SLUG.test(value) ? value : null;
    } catch {
      return null;
    }
  }

  private resolveStorage(): Storage | null {
    try {
      return this.document.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }
}
