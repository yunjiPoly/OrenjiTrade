import type { operations } from '@orenji/shared-types';

import type { CollectorMarker, CollectorRating } from '@/src/api/types';

/**
 * Words the app uses for other collectors and their listings (mirror of the web's
 * `shared/discovery/discovery-labels.ts`). Places are states or provinces (ADR 0017): no
 * distance, no position.
 */

type HoldersQuery = NonNullable<operations['searchCardHolders']['parameters']['query']>;

/** `availability` filter of `/search/card-holders` (an "Intent"). */
export type IntentFilter = NonNullable<HoldersQuery['availability']>;

export const INTENT_FILTERS: readonly { value: IntentFilter; label: string }[] = [
  { value: 'TRADE', label: 'For trade' },
  { value: 'SALE', label: 'For sale' },
  { value: 'TRADE_OR_SALE', label: 'Trade or sale' },
  { value: 'ACCEPTS_OFFERS', label: 'Accepts offers' },
];

export function isIntentFilter(value: unknown): value is IntentFilter {
  return INTENT_FILTERS.some((option) => option.value === value);
}

export function intentLabel(value: string | null | undefined): string {
  return INTENT_FILTERS.find((option) => option.value === value)?.label ?? 'Any intent';
}

/** "Who has this in my region": collectors listing any printing of a card, or one printing. */
export type HoldersTarget = { kind: 'card' | 'printing'; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOrNull(value: string | string[] | null | undefined): string | null {
  const text = (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  return UUID.test(text) ? text.toLowerCase() : null;
}

/** The holders target of route parameters (`?card=` or `?printing=`). */
export function holdersTarget(params: {
  card?: string | string[];
  printing?: string | string[];
}): HoldersTarget | null {
  const printing = uuidOrNull(params.printing);
  if (printing) {
    return { kind: 'printing', id: printing };
  }
  const card = uuidOrNull(params.card);
  return card ? { kind: 'card', id: card } : null;
}

/** Readable tag from its slug (`local-meetups` -> `Local meetups`). */
export function tagLabel(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words ? (words[0]?.toUpperCase() ?? '') + words.slice(1) : slug;
}

/** "4.8 (12 ratings)" / "No ratings yet". */
export function ratingLabel(rating: CollectorRating | null | undefined): string {
  if (!rating || rating.count <= 0 || rating.average === null || rating.average === undefined) {
    return 'No ratings yet';
  }
  return `${rating.average.toFixed(1)} (${rating.count} ${rating.count === 1 ? 'rating' : 'ratings'})`;
}

/** "2 public binders · 143 cards" / "No public listings yet". */
export function listingsLabel(
  collector: Pick<CollectorMarker, 'publicBinderCount' | 'publicItemCount'>
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
