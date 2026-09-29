/** Distance buckets returned by the API (never raw metres; ADR 0004). */
export type DistanceBucket = 'LT_1KM' | 'KM_1_5' | 'KM_5_10' | 'KM_10_25' | 'KM_25_50' | 'GT_50KM';

export const DISTANCE_BUCKET_LABELS: Record<DistanceBucket, string> = {
  LT_1KM: 'Less than 1 km away',
  KM_1_5: '1–5 km away',
  KM_5_10: '5–10 km away',
  KM_10_25: '10–25 km away',
  KM_25_50: '25–50 km away',
  GT_50KM: 'More than 50 km away',
};

export function distanceBucketLabel(bucket: string | null | undefined): string | null {
  if (!bucket) {
    return null;
  }
  return DISTANCE_BUCKET_LABELS[bucket as DistanceBucket] ?? null;
}

export type LastActiveBucket = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LONGER_AGO' | 'HIDDEN';

export const LAST_ACTIVE_LABELS: Record<LastActiveBucket, string> = {
  TODAY: 'Active today',
  THIS_WEEK: 'Active this week',
  THIS_MONTH: 'Active this month',
  LONGER_AGO: 'Active a while ago',
  HIDDEN: 'Activity hidden',
};

/** Maps a last-active bucket to the freshness palette (fresh / aging / stale / hidden). */
export function lastActiveTone(bucket: string): 'fresh' | 'aging' | 'stale' | 'hidden' {
  switch (bucket) {
    case 'TODAY':
    case 'THIS_WEEK':
      return 'fresh';
    case 'THIS_MONTH':
      return 'aging';
    case 'LONGER_AGO':
      return 'stale';
    default:
      return 'hidden';
  }
}

/** Rounds a coordinate to 3 decimals (~110 m), the most precision the app ever sends or shows. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Initials for avatars: first letters of the first two words, or of the handle. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}
