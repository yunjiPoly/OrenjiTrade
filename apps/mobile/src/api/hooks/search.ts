import { useInfiniteQuery, useQuery, type QueryKey } from '@tanstack/react-query';

import { useBrowsingGame } from '@/src/features/games/browsingGame';
import { useBrowsingRegion } from '@/src/features/regions/browsingRegion';
import { boundedQuery } from '@/src/lib/catalog';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type {
  CardHoldersPage,
  CollectorByName,
  PublicBinderCursorPage,
  PublicBinderSummary,
  WishlistAvailability,
} from '../types';
import { nextPage } from './catalog';
import { useCanBrowse, useIsAuthenticated, useUid } from './useUid';

/**
 * The region Search and the card page browse (ADR 0017): the one the region switcher shows (the
 * collector's home region until they pick another one). `ready` once it is settled, so nothing is
 * asked in one region first and again in another.
 */
export function useSearchRegion(): { region: string; ready: boolean } {
  const { region, ready } = useBrowsingRegion();
  return { region, ready };
}

/**
 * What a list keeps on screen while its next answer loads: the previous results, as long as they
 * are those of the same region (another text, another filter). After a change of region nothing
 * is kept: the results of Europe never stand under "Americas (North)", however long the new answer
 * takes; the list shows its skeleton instead.
 *
 * The region is read from the last part of the query key (the request's parameters).
 */
export function previousOfSameRegion<T>(region: string) {
  return (previous: T | undefined, previousQuery: { queryKey: QueryKey } | undefined) => {
    const asked = previousQuery?.queryKey.at(-1) as { region?: unknown } | undefined;
    return asked?.region === region ? previous : undefined;
  };
}

/**
 * As `previousOfSameRegion`, and of the same game (stage G): after a change of game nothing is
 * kept either; the list shows its skeleton, never the binders of another game.
 */
export function previousOfSameRegionAndGame<T>(region: string, game: string) {
  return (previous: T | undefined, previousQuery: { queryKey: QueryKey } | undefined) => {
    const asked = previousQuery?.queryKey.at(-1) as
      { region?: unknown; game?: unknown } | undefined;
    return asked?.region === region && asked?.game === game ? previous : undefined;
  };
}

/** The most collectors shown under the cards while a card is typed (mockup screen 12). */
export const COLLECTORS_WHILE_TYPING = 3;

/** Two letters at least before collectors are asked for (one letter matches almost anyone). */
export const COLLECTORS_MIN_CHARS = 2;

/**
 * `GET /api/v1/search/collectors` (stage R5): the "Collectors" section under the cards while a card
 * is typed: discoverable collectors of the browsed region whose handle or name contains the text,
 * at most 3, never the caller nor a collector blocked with them (the API leaves them out before
 * the limit); only those who list the browsed game or show a card of it (stage G). Each carries a
 * state or province and a country only.
 */
export function useCollectorsByName(q: string) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  const { region, ready } = useSearchRegion();
  const browsing = useBrowsingGame();
  const text = boundedQuery(q);
  const params = { q: text, region, game: browsing.game, limit: COLLECTORS_WHILE_TYPING };
  return useQuery<CollectorByName[], ApiError>({
    queryKey: meKeys.search(uid, { collectors: true, ...params }),
    queryFn: async () =>
      required((await api.GET('/api/v1/search/collectors', { params: { query: params } })).data),
    enabled: authenticated && ready && browsing.ready && text.length >= COLLECTORS_MIN_CHARS,
    placeholderData: previousOfSameRegionAndGame<CollectorByName[]>(region, browsing.game),
    staleTime: 60_000,
  });
}

/** Holders per page of the card page. */
export const HOLDERS_PAGE_SIZE = 20;

/**
 * `GET /api/v1/search/card-holders?sort=province&excludeDeckCoreItems=true` (stage R5, "Who has
 * this card"): the public, fresh copies of a card, or of one printing ("Any printing ▾"), held by
 * discoverable collectors of the browsed region, grouped by state or province by the API (the
 * caller's own first, then their country, then the rest of the region; the newest listing first
 * in each), paged for an infinite list. The cards of a deck core are left out: the page shows the
 * core in "Also in a deck core" instead (`useDeckCoresWithCard`).
 */
export function useWhoHasThisCard(
  cardId: string | null,
  printingId: string | null,
  /** Any printing of the card in this rarity (a wish of any printing in one rarity). */
  rarity: string | null = null
) {
  const uid = useUid();
  // Guests read who has a card too, without who they are (stage R15).
  const browse = useCanBrowse();
  const { region, ready } = useSearchRegion();
  const base = printingId
    ? { printingId, region, sort: 'province' as const, excludeDeckCoreItems: true }
    : cardId
      ? {
          cardId,
          region,
          sort: 'province' as const,
          excludeDeckCoreItems: true,
          ...(rarity ? { rarity } : {}),
        }
      : null;
  return useInfiniteQuery<CardHoldersPage, ApiError>({
    queryKey: meKeys.cardHolders(uid, base ?? {}),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/search/card-holders', {
            params: {
              query: { ...(base ?? {}), page: pageParam as number, size: HOLDERS_PAGE_SIZE },
            },
          })
        ).data
      ),
    getNextPageParam: (last) => nextPage(last),
    enabled: browse && ready && base !== null,
    placeholderData: previousOfSameRegion(region),
    staleTime: 60_000,
  });
}

/** At most this many deck cores in "Also in a deck core" (spec section 8). */
export const DECK_CORES_ON_CARD_PAGE = 3;

/**
 * `GET /api/v1/search/deck-cores` (stage R3, shown from R5): the public deck cores of the browsed
 * region that hold the card, at most 3, never the caller's own nor a blocked collector's.
 */
export function useDeckCoresWithCard(cardId: string | null) {
  const uid = useUid();
  const browse = useCanBrowse();
  const { region, ready } = useSearchRegion();
  const params = { cardId: cardId ?? '', region, limit: DECK_CORES_ON_CARD_PAGE };
  return useQuery<PublicBinderSummary[], ApiError>({
    queryKey: meKeys.search(uid, { deckCores: true, ...params }),
    queryFn: async () =>
      required((await api.GET('/api/v1/search/deck-cores', { params: { query: params } })).data),
    enabled: browse && ready && !!cardId,
    placeholderData: previousOfSameRegion<PublicBinderSummary[]>(region),
    staleTime: 60_000,
  });
}

/** Binders per page of Search › Binders (the API allows 1 to 50). */
export const BINDER_SEARCH_PAGE = 20;

export interface BinderSearch {
  /** A state or province of the browsed region (`CA-QC`), or `null` for the whole region. */
  state: string | null;
  /** Deck cores only, or the other binders only (the "Binders | Deck cores" switch). */
  deckCore: boolean;
  /** The field's text ("Deck, binder or collector"); empty for every binder. */
  q: string;
}

/**
 * Search › Binders (stage R5): `GET /api/v1/regions/{region}/subdivisions/{code}/binders` for one
 * state, `GET /api/v1/regions/{region}/binders` for the whole region, with `deckCore` and `q`
 * (binder names, handles and a deck core's key cards; stage R3) and the browsed game (stage G),
 * most recently updated first, by cursor. Each binder names its owner and the owner's state or
 * province and country, never a city.
 */
export function useBinderSearch(search: BinderSearch) {
  const uid = useUid();
  const browse = useCanBrowse();
  const { region, ready } = useSearchRegion();
  const browsing = useBrowsingGame();
  const game = browsing.game;
  const q = boundedQuery(search.q);
  const params = { region, state: search.state, deckCore: search.deckCore, q, game };
  return useInfiniteQuery<PublicBinderCursorPage, ApiError>({
    queryKey: meKeys.regionBinderSearch(uid, params),
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const query = {
        cursor: (pageParam as string | null) ?? undefined,
        limit: BINDER_SEARCH_PAGE,
        deckCore: search.deckCore,
        q: q || undefined,
        game,
      };
      if (search.state) {
        return required(
          (
            await api.GET('/api/v1/regions/{region}/subdivisions/{code}/binders', {
              params: { path: { region, code: search.state }, query },
            })
          ).data
        );
      }
      return required(
        (await api.GET('/api/v1/regions/{region}/binders', { params: { path: { region }, query } }))
          .data
      );
    },
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    enabled: browse && ready && browsing.ready,
    placeholderData: previousOfSameRegionAndGame(region, game),
    staleTime: 60_000,
  });
}

/**
 * `GET /api/v1/wishlist/availability?region=&game=` (stage R5): the wishes of the browsed game
 * (stage G) "Available" in the browsed region.
 */
export function useWishlistAvailability(enabled = true) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  const { region, ready } = useSearchRegion();
  const browsing = useBrowsingGame();
  const game = browsing.game;
  return useQuery<WishlistAvailability, ApiError>({
    queryKey: meKeys.wishlistAvailability(uid, region, game),
    queryFn: async () =>
      required(
        (await api.GET('/api/v1/wishlist/availability', { params: { query: { region, game } } }))
          .data
      ),
    enabled: authenticated && ready && browsing.ready && enabled,
    staleTime: 30_000,
  });
}

/** `GET /api/v1/printings/{id}`: the card of one printing (for an old card holders link). */
export function usePrintingCard(id: string | null) {
  return useQuery<string | null, ApiError>({
    queryKey: ['printing-card', id ?? ''],
    queryFn: async () => {
      const detail = required(
        (await api.GET('/api/v1/printings/{id}', { params: { path: { id: id ?? '' } } })).data
      );
      return detail.printing?.cardId ?? detail.card?.id ?? null;
    },
    enabled: !!id,
    staleTime: 10 * 60_000,
  });
}
