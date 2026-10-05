import type { DistanceBucket as ApiDistanceBucket } from '@/src/api/types';

import { assertNever } from './assertNever';

/**
 * Distance buckets as returned by the API (`CollectorLocation.distanceBucket`). Clients never
 * receive raw metres (ADR 0004): the server rounds every distance into one of these buckets and
 * the app only formats them.
 */
export const DISTANCE_BUCKETS = [
  'LT_1KM',
  'KM_1_5',
  'KM_5_10',
  'KM_10_25',
  'KM_25_50',
  'GT_50KM',
] as const satisfies readonly ApiDistanceBucket[];

export type DistanceBucket = (typeof DISTANCE_BUCKETS)[number];

export type DistanceUnit = 'km' | 'mi';

export function isDistanceBucket(value: unknown): value is DistanceBucket {
  return typeof value === 'string' && (DISTANCE_BUCKETS as readonly string[]).includes(value);
}

/**
 * Short label of a server-provided distance bucket, e.g. `1–5 km`. Unknown values (a bucket
 * added server-side before the app is updated) degrade to `nearby`.
 */
export function formatDistanceBucket(
  bucket: string | null | undefined,
  unit: DistanceUnit = 'km'
): string {
  if (!isDistanceBucket(bucket)) {
    return 'nearby';
  }
  const km = unit === 'km';
  switch (bucket) {
    case 'LT_1KM':
      return km ? '< 1 km' : '< 0.6 mi';
    case 'KM_1_5':
      return km ? '1–5 km' : '0.6–3 mi';
    case 'KM_5_10':
      return km ? '5–10 km' : '3–6 mi';
    case 'KM_10_25':
      return km ? '10–25 km' : '6–15 mi';
    case 'KM_25_50':
      return km ? '25–50 km' : '15–30 mi';
    case 'GT_50KM':
      return km ? '50+ km' : '30+ mi';
    default:
      return assertNever(bucket, 'Unhandled distance bucket');
  }
}

/** Sentence used on profiles and previews (same wording as the web), or null without a bucket. */
export function distanceBucketLabel(bucket: string | null | undefined): string | null {
  if (!isDistanceBucket(bucket)) {
    return null;
  }
  switch (bucket) {
    case 'LT_1KM':
      return 'Less than 1 km away';
    case 'GT_50KM':
      return 'More than 50 km away';
    default:
      return `${formatDistanceBucket(bucket)} away`;
  }
}
