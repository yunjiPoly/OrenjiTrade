import { useInfiniteQuery, useQuery, type QueryKey } from '@tanstack/react-query';

import {
  SEARCH_SECTION_LIMIT,
  searchTypesFor,
  type SearchSegment,
} from '@/src/features/search/searchSegments';
import {
  HOLDERS_PAGE_SIZE,
  cardHoldersQuery,
  type HolderFilters,
  type HoldersTarget,
} from '@/src/features/holders/holderFilters';
import { useBrowsingRegion } from '@/src/features/regions/browsingRegion';
import { boundedQuery } from '@/src/lib/catalog';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { CardHoldersPage, UnifiedSearchResponse } from '../types';
import { nextPage } from './catalog';
import { useIsAuthenticated, useUid } from './useUid';

/**
 * The region the Search tab and the card holders browse (ADR 0017): the one the region switcher
 * shows (the collector's home region until they pick another one). `ready` once it is settled, so
 * nothing is asked in one region first and again in another.
 */
export function useSearchRegion(): { region: string; ready: boolean } {
  const { region, ready } = useBrowsingRegion();
  return { region, ready };
}

/**
 * What a list keeps on screen while its next answer loads: the previous results, as long as they
 * are those of the same region (another text, another filter). After a change of region nothing
 * is kept: the results of Europe never stand under "Region: Americas (North)", however long the
 * new answer takes; the list shows its skeleton instead.
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
 * `GET /api/v1/search` for one segment of the Search tab (the web's unified results): collectors
 * matching the text (on the map, allowing name search) or public binders by name with their owner
 * block, in the browsed region. Nothing is asked without a query. Previous results stay on screen
 * while a new query loads in the same region.
 */
export function useUnifiedSearch(segment: Exclude<SearchSegment, 'cards'>, q: string) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  const { region, ready } = useSearchRegion();
  const query = boundedQuery(q);
  const types = searchTypesFor(segment);
  const params = { q: query, types, region, limit: SEARCH_SECTION_LIMIT };
  return useQuery<UnifiedSearchResponse, ApiError>({
    queryKey: meKeys.search(uid, params),
    queryFn: async () =>
      required((await api.GET('/api/v1/search', { params: { query: params } })).data),
    enabled: authenticated && ready && query.length > 0,
    placeholderData: previousOfSameRegion<UnifiedSearchResponse>(region),
    staleTime: 60_000,
  });
}

/**
 * `GET /api/v1/search/card-holders` (the web's card-holders view): the public, fresh copies of a
 * card (any printing) or of one printing held by collectors on the map in the browsed region, with
 * every filter and sort of the web, paged for an infinite list.
 */
export function useCardHolders(target: HoldersTarget | null, filters: HolderFilters) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  const { region, ready } = useSearchRegion();
  const base = target ? cardHoldersQuery(target, filters, region) : null;
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
    enabled: authenticated && ready && base !== null,
    placeholderData: previousOfSameRegion(region),
    staleTime: 60_000,
  });
}
