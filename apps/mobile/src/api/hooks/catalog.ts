import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  type QueryClient,
} from '@tanstack/react-query';

import { CARD_PAGE_SIZE, SUGGEST_MIN_CHARS, uniqueSuggestions } from '@/src/lib/catalog';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { catalogKeys } from '../queryKeys';
import type { CardDetail, CardPage, CardSuggestion, SetSummary } from '../types';

/** The filters of `GET /api/v1/cards` the Search tab exposes (the web's `/cards` page). */
export interface CardSearchQuery {
  q: string;
  game: string | null;
  /** Set code (the API accepts an id or a code). */
  set: string | null;
  rarity: string | null;
  language: string | null;
  edition: string | null;
}

export const EMPTY_CARD_SEARCH: CardSearchQuery = {
  q: '',
  game: null,
  set: null,
  rarity: null,
  language: null,
  edition: null,
};

/** The next zero-based page of an offset-paginated answer, or undefined after the last one. */
export function nextPage(page: {
  page?: number;
  totalPages?: number;
  items?: readonly unknown[];
}): number | undefined {
  const current = page.page ?? 0;
  const total = page.totalPages ?? 0;
  return current + 1 < total && (page.items?.length ?? 0) > 0 ? current + 1 : undefined;
}

/** `GET /api/v1/cards` (full text, typo tolerant, printing codes), paged for an infinite list. */
export function useCardSearch(query: CardSearchQuery, enabled = true) {
  return useInfiniteQuery<CardPage, ApiError>({
    queryKey: catalogKeys.cards(query),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/cards', {
            params: {
              query: {
                query: query.q || undefined,
                game: query.game ?? undefined,
                set: query.set ?? undefined,
                rarity: query.rarity ?? undefined,
                language: query.language ?? undefined,
                edition: query.edition ?? undefined,
                page: pageParam as number,
                size: CARD_PAGE_SIZE,
              },
            },
          })
        ).data
      ),
    getNextPageParam: (last) => nextPage(last),
    // Typing keeps the previous results on screen until the new ones arrive.
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** `GET /api/v1/cards/suggest`: card and printing suggestions (debounce `q` in the caller). */
export function useCardSuggestions(q: string, limit = 10) {
  const trimmed = q.trim();
  return useQuery<CardSuggestion[], ApiError>({
    queryKey: catalogKeys.suggest(`${trimmed}|${limit}`),
    queryFn: async () =>
      uniqueSuggestions(
        required(
          (await api.GET('/api/v1/cards/suggest', { params: { query: { q: trimmed, limit } } }))
            .data
        )
      ),
    enabled: trimmed.length >= SUGGEST_MIN_CHARS,
    staleTime: 5 * 60_000,
  });
}

async function getCard(id: string): Promise<CardDetail> {
  return required((await api.GET('/api/v1/cards/{id}', { params: { path: { id } } })).data);
}

/** `GET /api/v1/cards/{id}`: a card with its metadata and every printing. */
export function useCard(id: string | null | undefined) {
  return useQuery<CardDetail, ApiError>({
    queryKey: catalogKeys.card(id ?? ''),
    queryFn: () => getCard(id ?? ''),
    enabled: !!id,
    staleTime: 10 * 60_000,
  });
}

/** The same card outside a component (cached like `useCard`). */
export function fetchCard(queryClient: QueryClient, id: string): Promise<CardDetail> {
  return queryClient.fetchQuery({
    queryKey: catalogKeys.card(id),
    queryFn: () => getCard(id),
    staleTime: 10 * 60_000,
  });
}

/** `GET /api/v1/sets?game=`: the sets of a game for the set filter (first 100, like the web). */
export function useSets(game: string | null) {
  return useQuery<SetSummary[], ApiError>({
    queryKey: catalogKeys.sets(game ?? ''),
    queryFn: async () =>
      required(
        (await api.GET('/api/v1/sets', { params: { query: { game: game ?? '', size: 100 } } })).data
      ).items ?? [],
    enabled: !!game,
    staleTime: 60 * 60_000,
  });
}
