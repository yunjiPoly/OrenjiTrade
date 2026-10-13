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
    invite: 'Search a collector of your region by name or handle.',
  },
  binders: {
    title: 'No public binders match',
    description: 'Binders appear here while their owner keeps them public and fresh.',
    invite: 'Search public binders by name to see what collectors of your region trade.',
  },
};
