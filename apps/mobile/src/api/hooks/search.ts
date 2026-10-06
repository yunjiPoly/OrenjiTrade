import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useAccount } from '@/src/account/AccountProvider';
import {
  SEARCH_SECTION_LIMIT,
  discoveryCentreFor,
  searchTypesFor,
  type DiscoveryCentre,
  type SearchSegment,
} from '@/src/features/search/searchSegments';
import {
  HOLDERS_PAGE_SIZE,
  cardHoldersQuery,
  type HolderFilters,
  type HoldersTarget,
} from '@/src/features/holders/holderFilters';
import { boundedQuery } from '@/src/lib/catalog';
import { roundCoordinate } from '@/src/lib/location';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { CardHoldersPage, UnifiedSearchResponse } from '../types';
import { nextPage } from './catalog';
import { useIsAuthenticated, useUid } from './useUid';

/** Where this viewer's geographic searches are centred (see `discoveryCentreFor`). */
export function useDiscoveryCentre(): DiscoveryCentre {
  return discoveryCentreFor(useAccount().me);
}

/** `lat`/`lng` of a city centre (3 decimals), or nothing for the caller's own trading area. */
function centreParams(centre: DiscoveryCentre): { lat?: number; lng?: number } {
  const city = centre.city;
  return city ? { lat: roundCoordinate(city.lat), lng: roundCoordinate(city.lng) } : {};
}

/**
 * `GET /api/v1/search` for one segment of the Search tab (the web's unified results): collectors
 * matching the text (on the map, allowing name search; distance buckets from the caller's trading
 * area or a city) or public binders by name with their owner block. Nothing is asked without a
 * query. Previous results stay on screen while a new query loads.
 */
export function useUnifiedSearch(segment: Exclude<SearchSegment, 'cards'>, q: string) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  const centre = useDiscoveryCentre();
  const query = boundedQuery(q);
  const types = searchTypesFor(segment);
  const params = { q: query, types, ...centreParams(centre), limit: SEARCH_SECTION_LIMIT };
  return useQuery<UnifiedSearchResponse, ApiError>({
    queryKey: meKeys.search(uid, params),
    queryFn: async () =>
      required((await api.GET('/api/v1/search', { params: { query: params } })).data),
    enabled: authenticated && centre.ready && query.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/**
 * `GET /api/v1/search/card-holders` (the web's card-holders view): the public, fresh copies of a
 * card (any printing) or of one printing held by collectors on the map around the caller's
 * trading area (or a city), with every filter and sort of the web, paged for an infinite list.
 */
export function useCardHolders(target: HoldersTarget | null, filters: HolderFilters) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  const centre = useDiscoveryCentre();
  const base = target ? cardHoldersQuery(target, filters, centreParams(centre)) : null;
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
    enabled: authenticated && centre.ready && base !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
