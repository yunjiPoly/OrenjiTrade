import { isRegionCode } from '@/src/lib/place';

import { placeCodeFrom } from '../map/places';

/**
 * Where the screens and links of before stage R5 now lead (owner spec 2026-10-14, section 4): the
 * Map tab is Search's default view, the Wishlist tab its Wishlist segment, the public binders of a
 * state its Binders segment filtered to that state, and the card holders list the card page.
 */
export type SearchHref = { pathname: '/search'; params: Record<string, string> };

const ID = /^[\w-]{1,64}$/;

/** The old Map tab (`/?region=&subdivision=`): the map, on that region and that state. */
export function mapLinkTarget(params: { region?: unknown; subdivision?: unknown }): SearchHref {
  const out: Record<string, string> = { segment: 'cards' };
  if (typeof params.region === 'string' && isRegionCode(params.region)) {
    out.region = params.region;
  }
  const code = placeCodeFrom(typeof params.subdivision === 'string' ? params.subdivision : null);
  if (code) {
    out.subdivision = code;
  }
  return { pathname: '/search', params: out };
}

/** The old Wishlist tab (`/wishlist`). */
export function wishlistLinkTarget(): SearchHref {
  return { pathname: '/search', params: { segment: 'wishlist' } };
}

/** The old public binders of a state (`/regions/<region>/<code>`): Binders, on that state. */
export function placeBindersTarget(params: { region?: unknown; code?: unknown }): SearchHref {
  const out: Record<string, string> = { segment: 'binders' };
  if (typeof params.region === 'string' && isRegionCode(params.region)) {
    out.region = params.region;
  }
  const code = placeCodeFrom(typeof params.code === 'string' ? params.code : null);
  if (code) {
    out.state = code;
  }
  return { pathname: '/search', params: out };
}

/**
 * The old card holders list (`/holders?card=<id>` or `?printing=<id>`): the card page. A printing
 * needs its card first (`printing` then says which card to look up); `null` without an id.
 */
export function holdersLinkTarget(params: {
  card?: unknown;
  printing?: unknown;
}): { card: string; printing?: string } | { printing: string } | null {
  const card = typeof params.card === 'string' && ID.test(params.card) ? params.card : null;
  const printing =
    typeof params.printing === 'string' && ID.test(params.printing) ? params.printing : null;
  if (card) {
    return printing ? { card, printing } : { card };
  }
  return printing ? { printing } : null;
}
