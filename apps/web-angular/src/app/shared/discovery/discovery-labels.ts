import type { CollectorMarker, CollectorRating } from '@orenji/api-client';
import type { Availability } from '../ui/availability-chip/availability';

/**
 * Display vocabulary of map discovery and search (Phase 4 contract): the filter values the API
 * accepts, collector summaries and item availability. Values mirror the generated
 * `@orenji/api-client` enums; labels live here so the map, the lists and search word them alike.
 */

/** `availability` filter of `/search/card-holders`. */
export type AvailabilityFilter = 'TRADE' | 'SALE' | 'TRADE_OR_SALE' | 'ACCEPTS_OFFERS';

export const AVAILABILITY_FILTERS: readonly {
  value: AvailabilityFilter;
  label: string;
  icon: string;
}[] = [
  { value: 'TRADE', label: 'For trade', icon: 'swap_horiz' },
  { value: 'SALE', label: 'For sale', icon: 'sell' },
  { value: 'TRADE_OR_SALE', label: 'Trade or sale', icon: 'sync_alt' },
  { value: 'ACCEPTS_OFFERS', label: 'Accepts offers', icon: 'local_offer' },
];

export function isAvailabilityFilter(value: unknown): value is AvailabilityFilter {
  return AVAILABILITY_FILTERS.some((option) => option.value === value);
}

export function availabilityFilterLabel(value: string | null | undefined): string {
  return AVAILABILITY_FILTERS.find((option) => option.value === value)?.label ?? 'Any availability';
}

/** `freshness` filter: STALE and HIDDEN listings never appear on the map. */
export type FreshnessFilter = 'ACTIVE' | 'AGING';

export const FRESHNESS_FILTERS: readonly { value: FreshnessFilter; label: string }[] = [
  { value: 'ACTIVE', label: 'Fresh listings' },
  { value: 'AGING', label: 'Aging listings' },
];

export function isFreshnessFilter(value: unknown): value is FreshnessFilter {
  return value === 'ACTIVE' || value === 'AGING';
}

export function freshnessFilterLabel(value: string | null | undefined): string {
  return FRESHNESS_FILTERS.find((option) => option.value === value)?.label ?? 'Any freshness';
}

/** Readable tag from its slug (`local-meetups` -> `Local meetups`) when no label is known. */
export function tagLabel(slug: string, labels?: ReadonlyMap<string, string>): string {
  const known = labels?.get(slug);
  if (known) {
    return known;
  }
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : slug;
}

/** "4.8 (12 ratings)" / "No ratings yet". */
export function ratingLabel(rating: CollectorRating | null | undefined): string {
  if (!rating || rating.count <= 0 || rating.average === null || rating.average === undefined) {
    return 'No ratings yet';
  }
  const count = `${rating.count} ${rating.count === 1 ? 'rating' : 'ratings'}`;
  return `${rating.average.toFixed(1)} (${count})`;
}

/** Ring colour of a collector's map marker: the best freshness of their public listings. */
export function markerTone(binderFreshness: string | null | undefined): 'fresh' | 'aging' | 'none' {
  switch (binderFreshness) {
    case 'ACTIVE':
      return 'fresh';
    case 'AGING':
      return 'aging';
    default:
      return 'none';
  }
}

/** "2 public binders · 143 cards" / "No public listings yet". */
export function listingsLabel(
  collector: Pick<CollectorMarker, 'publicBinderCount' | 'publicItemCount'>,
): string {
  const binders = collector.publicBinderCount;
  const items = collector.publicItemCount;
  if (binders <= 0 && items <= 0) {
    return 'No public listings yet';
  }
  const parts: string[] = [];
  if (binders > 0) {
    parts.push(`${binders} public ${binders === 1 ? 'binder' : 'binders'}`);
  }
  if (items > 0) {
    parts.push(`${items} ${items === 1 ? 'card' : 'cards'}`);
  }
  return parts.join(' · ');
}

/** Item availability of the API (`MatchingItem`, `PublicInventoryItem`) as a chip value. */
export function itemAvailability(value: string | null | undefined): Availability | null {
  switch (value) {
    case 'COLLECTION_ONLY':
    case 'TRADE':
    case 'SALE':
    case 'TRADE_OR_SALE':
    case 'NOT_AVAILABLE':
      return value;
    default:
      return null;
  }
}

/** Colour behind a collector's initials (stable per name; same palette as `app-avatar`). */
const AVATAR_PALETTE = [
  '#C2410C',
  '#0F766E',
  '#7C3AED',
  '#1D4ED8',
  '#BE185D',
  '#A16207',
  '#047857',
];

export function avatarColor(name: string | null | undefined): string {
  const text = name ?? '';
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}
