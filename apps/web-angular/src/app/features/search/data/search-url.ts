/**
 * Search's URL (spec 4.11, web stage WD):
 * `/search?region&game&tab=cards|binders|wishlist&q&state=CA-QC&kind=binders|deckcores&open=<binderId>&wish=<id>&set=<setId>`.
 * `state=all` lists every binder of the region ("Whole region"); without a state and a text the
 * Binders tab shows "Browse by state or province".
 */
export type SearchTab = 'cards' | 'binders' | 'wishlist';
export type BinderKind = 'binders' | 'deckcores';

/** "Whole region" in the URL (`state=all`). */
export const WHOLE_REGION = 'all';

/** ISO 3166-2 first-level code or a whole-country alpha-2 code. */
const SUBDIVISION_CODE = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SEARCH_TEXT_MAX = 100;

export interface SearchUrl {
  tab: SearchTab;
  q: string;
  /** A subdivision code, `all` (the whole region), or null (the state list). */
  state: string | null;
  kind: BinderKind;
  /** A binder or deck core opened beside the list. */
  open: string | null;
  /** The wish whose holders show in the holder pane. */
  wish: string | null;
  /** Cards: only the cards of this set (a set page's "Who has cards of this set"). */
  set: string | null;
}

export interface SearchUrlInput {
  tab?: string | null;
  q?: string | null;
  state?: string | null;
  kind?: string | null;
  open?: string | null;
  wish?: string | null;
  set?: string | null;
}

export function searchTabOf(tab: string | null | undefined): SearchTab {
  const value = (tab ?? '').trim().toLowerCase();
  return value === 'wishlist' ? 'wishlist' : value === 'binders' ? 'binders' : 'cards';
}

export function parseSearchUrl(input: SearchUrlInput): SearchUrl {
  const state = (input.state ?? '').trim();
  const upper = state.toUpperCase();
  const open = (input.open ?? '').trim();
  const wish = (input.wish ?? '').trim();
  const set = (input.set ?? '').trim();
  return {
    tab: searchTabOf(input.tab),
    q: (input.q ?? '').trim().slice(0, SEARCH_TEXT_MAX),
    state:
      state.toLowerCase() === WHOLE_REGION
        ? WHOLE_REGION
        : SUBDIVISION_CODE.test(upper)
          ? upper
          : null,
    kind: (input.kind ?? '').trim().toLowerCase() === 'deckcores' ? 'deckcores' : 'binders',
    open: UUID.test(open) ? open.toLowerCase() : null,
    wish: UUID.test(wish) ? wish.toLowerCase() : null,
    set: UUID.test(set) ? set.toLowerCase() : null,
  };
}

/** Whether the Binders tab shows the state list (no state, no text). */
export function showsStateList(url: Pick<SearchUrl, 'state' | 'q'>): boolean {
  return !url.state && !url.q;
}

export interface SwitchInput {
  /** The URL's region and game (undefined on a first visit without them). */
  requestedRegion: string | undefined;
  requestedGame: string | undefined;
  /** The browsed region and game (the pills). */
  region: string;
  game: string;
  /** The URL's state. */
  state: string | undefined;
  /** Whether the browsed region has that subdivision. */
  regionHas: (code: string) => boolean;
}

/**
 * The URL patch that mirrors the pills into the URL (one navigation). When the region changed, a
 * state of the old region (it would answer 404 on every Try again) and the open binder go; a
 * chosen wish stays, its holders follow the region. When the game changed, the open binder and
 * the chosen wish of the old game go.
 */
export function switchPatch(input: SwitchInput): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  if (input.requestedRegion !== input.region) {
    patch['region'] = input.region;
    if (input.requestedRegion) {
      const state = (input.state ?? '').trim().toUpperCase();
      if (state && state !== WHOLE_REGION.toUpperCase() && !input.regionHas(state)) {
        patch['state'] = null;
      }
      patch['open'] = null;
    }
  }
  if (input.requestedGame !== input.game) {
    patch['game'] = input.game;
    if (input.requestedGame) {
      patch['open'] = null;
      patch['wish'] = null;
    }
  }
  return patch;
}
