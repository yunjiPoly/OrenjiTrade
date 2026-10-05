import type { RatingSummaryResponse } from '@/src/api/types';

/**
 * Rating vocabulary of profiles (mirror of the web's `shared/ratings/rating-labels.ts`): the
 * optional criteria of a rating and how averages and counts read.
 */
export const RATING_CRITERIA: readonly {
  key: 'communication' | 'conditionAccuracy' | 'shipping' | 'meetupReliability';
  label: string;
}[] = [
  { key: 'communication', label: 'Communication' },
  { key: 'conditionAccuracy', label: 'Card condition' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'meetupReliability', label: 'Meetup reliability' },
];

/** "4.8", or "—" without ratings. */
export function formatAverage(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toFixed(1);
}

/** "12 ratings", "1 rating", "No ratings yet". */
export function ratingCountLabel(count: number | null | undefined): string {
  if (!count) {
    return 'No ratings yet';
  }
  return `${count} ${count === 1 ? 'rating' : 'ratings'}`;
}

/** "★★★★☆" for a 1–5 score (rounded), for display next to the number. */
export function stars(value: number | null | undefined): string {
  const filled = Math.max(0, Math.min(5, Math.round(value ?? 0)));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

/** The breakdown rows of a summary ("Communication 4.5"), criteria nobody scored show "—". */
export function breakdownRows(
  summary: RatingSummaryResponse | null | undefined
): { key: string; label: string; text: string }[] {
  return RATING_CRITERIA.map((criterion) => ({
    key: criterion.key,
    label: criterion.label,
    text: formatAverage(summary?.[criterion.key]),
  }));
}
