import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useAccount } from '@/src/account/AccountProvider';
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
import { boundedQuery } from '@/src/lib/catalog';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { CardHoldersPage, UnifiedSearchResponse } from '../types';
import { useHomeRegion } from './regions';
import { nextPage } from './catalog';
import { useIsAuthenticated, useUid } from './useUid';

/**
 * The region the Search tab and the card holders browse (ADR 0017): the home region of `GET /me`
 * (`americas-north` without a location). `ready` once `/me` answered, so nothing is asked in the
 * default region first and again in the home region.
 */
export function useSearchRegion(): { region: string; ready: boolean } {
  const ready = !!useAccount().me;
  return { region: useHomeRegion(), ready };
}

/**
 * `GET /api/v1/search` for one segment of the Search tab (the web's unified results): collectors
 * matching the text (on the map, allowing name search) or public binders by name with their owner
 * block, in the home region. Nothing is asked without a query. Previous results stay on screen
 * while a new query loads.
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
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/**
 * `GET /api/v1/search/card-holders` (the web's card-holders view): the public, fresh copies of a
 * card (any printing) or of one printing held by collectors on the map in the home region, with
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
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
