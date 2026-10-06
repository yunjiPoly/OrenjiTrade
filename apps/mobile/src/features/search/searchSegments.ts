import type { MeResponse } from '@/src/api/types';
import { CITY_PRESETS, type CityPreset } from '@/src/lib/location';

/**
 * The Search tab's segments (the web's `/search` tabs, `SEARCH_TABS`): the card catalog (the
 * app's own catalog search, richer than the web's cards tab), collectors by name or handle and
 * public binders by name, both from `GET /search`.
 */
export type SearchSegment = 'cards' | 'collectors' | 'binders';

export const SEARCH_SEGMENTS: readonly { value: SearchSegment; label: string }[] = [
  { value: 'cards', label: 'Cards' },
  { value: 'collectors', label: 'Collectors' },
  { value: 'binders', label: 'Binders' },
];

export function isSearchSegment(value: unknown): value is SearchSegment {
  return SEARCH_SEGMENTS.some((segment) => segment.value === value);
}

/** The `types` sections of `GET /search` a segment needs (never the heavy card sections). */
export function searchTypesFor(segment: Exclude<SearchSegment, 'cards'>): string[] {
  return segment === 'collectors' ? ['collectors'] : ['binders'];
}

/** Results per section (the API allows 1–50). */
export const SEARCH_SECTION_LIMIT = 30;

/** Field wording per segment. */
export const SEGMENT_FIELDS: Record<SearchSegment, { label: string; placeholder: string }> = {
  cards: { label: 'Find a card', placeholder: 'Card name, text or printing code' },
  collectors: { label: 'Find a collector', placeholder: 'Name or handle' },
  binders: { label: 'Find a public binder', placeholder: 'Binder name' },
};

/** Empty-state wording per segment (the web's unified results). */
export const SEGMENT_EMPTY: Record<
  Exclude<SearchSegment, 'cards'>,
  { title: string; description: string; invite: string }
> = {
  collectors: {
    title: 'No collectors match',
    description: 'Collectors appear when they are on the map and allow name search.',
    invite: 'Search a collector by name or handle. Distances are approximate, never exact.',
  },
  binders: {
    title: 'No public binders match',
    description: 'Binders appear here while their owner keeps them public and fresh.',
    invite: 'Search public binders by name to see what collectors near you trade.',
  },
};

/**
 * Centre of a geographic search (the web's `DiscoveryCentreService`): a collector with a trading
 * area sends none (the server uses their area; the app never reads its private centre); everyone
 * else searches around a public city centre (Montréal, the launch city).
 */
export interface DiscoveryCentre {
  /** True once `/me` answered (before that the centre is unknown and nothing is asked). */
  ready: boolean;
  signedIn: boolean;
  /** `null` = the caller's own trading area. */
  city: CityPreset | null;
}

export function discoveryCentreFor(me: MeResponse | null | undefined): DiscoveryCentre {
  return {
    ready: !!me,
    signedIn: !!me,
    city: me?.onboarding?.tradingAreaSet ? null : (CITY_PRESETS[0] ?? null),
  };
}
