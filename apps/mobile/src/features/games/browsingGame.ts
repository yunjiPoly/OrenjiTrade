import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo } from 'react';
import { create } from 'zustand';

import { useGames, useMyProfile } from '@/src/api/hooks/profile';
import { useIsAuthenticated, useUid } from '@/src/api/hooks/useUid';
import type { GameResponse } from '@/src/api/types';
import { gameLabel } from '@/src/lib/profile';

/**
 * The game Home and Search browse (stage G of the phone redesign, "one game at a time"): like the
 * browsed region, a choice of this phone, remembered per account (AsyncStorage keyed by the
 * account's uid, the slug alone). It scopes the map's counts, the card search, the binders and
 * deck cores of Search, binder search and Search › Wishlist; never Inventory › Cards, chats or the
 * bell, nor a card page (its card says which game it is).
 *
 * Which game, in this order:
 * 1. the one picked with the game pill in this session (or opened by a link);
 * 2. the one remembered on this phone for this account;
 * 3. the first game of the collector's profile games that has cards;
 * 4. Yu-Gi-Oh!.
 *
 * Only a game that can be browsed is ever chosen: an ACTIVE game of `GET /games` whose catalogue
 * holds a card (`hasCards`). A remembered game an admin hid since, or one that has no cards, is
 * passed over (and kept on the phone: it comes back once it can be browsed again).
 */
export const BROWSING_GAME_STORAGE_PREFIX = 'orenjitrade.browsing-game.v1.';

/** The game of a collector without a choice and without a profile game that has cards. */
export const DEFAULT_GAME = 'yugioh';

interface BrowsingGameState {
  /** The game picked in this session, per account uid. */
  picked: Readonly<Record<string, string>>;
  /** The game remembered on this phone, per account uid (`null`: nothing remembered). */
  stored: Readonly<Record<string, string | null>>;
}

const INITIAL: BrowsingGameState = { picked: {}, stored: {} };

export const useBrowsingGameStore = create<BrowsingGameState>()(() => INITIAL);

const hydrations = new Map<string, Promise<void>>();

function storageKey(uid: string): string {
  return `${BROWSING_GAME_STORAGE_PREFIX}${uid}`;
}

/** A slug as the API writes them (`yugioh`, `one-piece`); anything else is not kept. */
export function isGameSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value.length <= 32;
}

/**
 * Reads the game remembered for this account, once per account. Storage can fail or be missing (a
 * private window, a full disk): the default game is browsed then.
 */
export function hydrateBrowsingGame(uid: string): Promise<void> {
  let hydration = hydrations.get(uid);
  if (!hydration) {
    hydration = (async () => {
      let stored: string | null = null;
      try {
        const value = await AsyncStorage.getItem(storageKey(uid));
        stored = isGameSlug(value) ? value : null;
      } catch {
        stored = null;
      }
      useBrowsingGameStore.setState((state) =>
        // A game picked while the storage was being read is newer than what it held.
        uid in state.stored ? state : { stored: { ...state.stored, [uid]: stored } }
      );
    })();
    hydrations.set(uid, hydration);
  }
  return hydration;
}

/** Forgets every pick and hydration (tests, between two cases). */
export function resetBrowsingGame(): void {
  hydrations.clear();
  useBrowsingGameStore.setState(INITIAL);
}

/** Picks a game for this account and keeps it on the phone (best effort). */
export async function pickBrowsingGame(uid: string, game: string): Promise<void> {
  if (!isGameSlug(game)) {
    return;
  }
  useBrowsingGameStore.setState((state) => ({
    picked: { ...state.picked, [uid]: game },
    stored: { ...state.stored, [uid]: game },
  }));
  try {
    await AsyncStorage.setItem(storageKey(uid), game);
  } catch {
    // The pick still holds for this session.
  }
}

/** A game as Home and Search offer it. */
export interface GameOption {
  slug: string;
  /** The short name ("Magic", "One Piece"): pills, titles, empty states. */
  name: string;
  /** Whether it can be browsed and hold binders: ACTIVE with cards in the catalogue. */
  browsable: boolean;
}

/** The games of `GET /games` in their order (hidden games are not listed by the API). */
export function gameOptions(games: readonly GameResponse[] | undefined): GameOption[] {
  return (games ?? [])
    .filter((game): game is GameResponse & { slug: string } => isGameSlug(game.slug))
    .map((game) => ({
      slug: game.slug,
      name: game.shortName || game.name || gameLabel(game.slug),
      browsable: game.status !== 'HIDDEN' && game.hasCards === true,
    }));
}

/**
 * The game to browse (see the order at the top of this file). Without the games list (not read
 * yet, or it failed), a pick or the remembered game is taken as it is (the collector chose it, so
 * it could be browsed then), else Yu-Gi-Oh!: a profile game may have no cards yet (One Piece), so
 * the profile waits for the list's `hasCards` (review fix 1, F9).
 */
export function resolveBrowsingGame(input: {
  picked: string | null;
  stored: string | null;
  profileGames: readonly string[];
  options: readonly GameOption[] | null;
}): string {
  const can = (slug: string | null): slug is string =>
    !!slug &&
    (input.options === null ||
      input.options.some((option) => option.slug === slug && option.browsable));
  if (can(input.picked)) {
    return input.picked;
  }
  if (can(input.stored)) {
    return input.stored;
  }
  const fromProfile =
    input.options === null ? undefined : input.profileGames.find((slug) => can(slug));
  if (fromProfile) {
    return fromProfile;
  }
  if (can(DEFAULT_GAME) || input.options === null) {
    return DEFAULT_GAME;
  }
  return input.options.find((option) => option.browsable)?.slug ?? DEFAULT_GAME;
}

export interface BrowsingGame {
  /** The slug every game-scoped call sends as `game`. */
  game: string;
  /** The browsed game as the pill shows it. */
  current: GameOption;
  /** Every game of the sheet, in the games' order (dimmed ones included). */
  options: GameOption[];
  /**
   * True once the game is settled (the games, the profile and the phone's memory answered), so
   * nothing is asked for one game first and again for another.
   */
  ready: boolean;
  /** Browses another game; a game that cannot be browsed is ignored. */
  select: (game: string) => void;
  /** `GET /games` has not answered yet (the sheet shows skeleton rows meanwhile). */
  gamesLoading: boolean;
  /** `GET /games` failed and there is no list to show (the sheet shows "Try again"). */
  gamesError: unknown;
  /** Asks `GET /games` again. */
  retryGames: () => void;
}

const EMPTY_GAMES: readonly string[] = [];

export function useBrowsingGame(): BrowsingGame {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  const gamesQuery = useGames();
  const profile = useMyProfile();
  const picked = useBrowsingGameStore((state) => (uid ? (state.picked[uid] ?? null) : null));
  const stored = useBrowsingGameStore((state) => (uid ? state.stored[uid] : undefined));

  useEffect(() => {
    if (uid) {
      void hydrateBrowsingGame(uid);
    }
  }, [uid]);

  const options = useMemo(
    () => (gamesQuery.data ? gameOptions(gamesQuery.data) : null),
    [gamesQuery.data]
  );
  const profileGames = profile.data?.games ?? EMPTY_GAMES;
  const game = resolveBrowsingGame({
    picked,
    stored: stored ?? null,
    profileGames,
    options,
  });
  const select = useCallback(
    (next: string) => {
      const can = !options || options.some((option) => option.slug === next && option.browsable);
      if (uid && can) {
        void pickBrowsingGame(uid, next);
      }
    },
    [options, uid]
  );
  const list = options ?? [];
  const current = list.find((option) => option.slug === game) ?? {
    slug: game,
    name: gameLabel(game),
    browsable: true,
  };
  const gamesSettled = !!gamesQuery.data || gamesQuery.isError;
  const profileSettled = !authenticated || !!profile.data || profile.isError;
  const memorySettled = !uid || picked !== null || stored !== undefined;
  const refetchGames = gamesQuery.refetch;
  const retryGames = useCallback(() => void refetchGames(), [refetchGames]);
  return {
    game,
    current,
    options: list,
    ready: gamesSettled && profileSettled && memorySettled,
    select,
    gamesLoading: !gamesQuery.data && !gamesQuery.isError,
    gamesError: gamesQuery.data ? null : (gamesQuery.error ?? null),
    retryGames,
  };
}
