import { SEARCH_COPY } from './searchCopy';

/**
 * The segments of Search (owner spec 2026-10-14, sections 4 and 8): Cards (the region map, then
 * the card search while typing), Binders (binders and deck cores of the region or of one state)
 * and Wishlist (the old Wishlist tab, with the number of wishes). No Collectors segment: collectors
 * show under the cards while a card is typed.
 */
export type SearchSegment = 'cards' | 'binders' | 'wishlist';

export const SEARCH_SEGMENTS: readonly SearchSegment[] = ['cards', 'binders', 'wishlist'];

export function isSearchSegment(value: unknown): value is SearchSegment {
  return SEARCH_SEGMENTS.includes(value as SearchSegment);
}

/** The label of a segment ("Wishlist" carries its count beside it, see `UnderlineTabs`). */
export function segmentLabel(segment: SearchSegment): string {
  switch (segment) {
    case 'cards':
      return SEARCH_COPY.cards;
    case 'binders':
      return SEARCH_COPY.binders;
    case 'wishlist':
      return SEARCH_COPY.wishlist;
  }
}

/**
 * The segment a link asks for: `?segment=`, or the `?tab=` of the links before stage R5
 * (`collectors` opens the cards, where collectors now show while typing; `binders` the binders).
 * `null` when the link names none.
 */
export function segmentOfLink(params: { segment?: unknown; tab?: unknown }): SearchSegment | null {
  if (isSearchSegment(params.segment)) {
    return params.segment;
  }
  if (params.tab === 'binders') {
    return 'binders';
  }
  if (params.tab === 'collectors' || params.tab === 'cards') {
    return 'cards';
  }
  return null;
}
