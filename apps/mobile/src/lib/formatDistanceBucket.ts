import { assertNever } from './assertNever';

/**
 * Distance buckets as returned by the API. Clients never receive raw metres (ADR 0004): the
 * server rounds every distance into one of these buckets, and the app only formats them.
 */
export const DISTANCE_BUCKETS = ['UNDER_1_KM', 'ABOUT_4_KM', 'KM_10_TO_25', 'OVER_25_KM'] as const;

export type DistanceBucket = (typeof DISTANCE_BUCKETS)[number];

export type DistanceUnit = 'km' | 'mi';

export function isDistanceBucket(value: unknown): value is DistanceBucket {
  return typeof value === 'string' && (DISTANCE_BUCKETS as readonly string[]).includes(value);
}

/**
 * Formats a server-provided distance bucket for display, e.g. `~4 km`.
 * Unknown values (a bucket added server-side before the app is updated) degrade to `nearby`.
 */
export function formatDistanceBucket(
  bucket: string | null | undefined,
  unit: DistanceUnit = 'km'
): string {
  if (!isDistanceBucket(bucket)) {
    return 'nearby';
  }
  switch (bucket) {
    case 'UNDER_1_KM':
      return unit === 'km' ? '< 1 km' : '< 1 mi';
    case 'ABOUT_4_KM':
      return unit === 'km' ? '~4 km' : '~2.5 mi';
    case 'KM_10_TO_25':
      return unit === 'km' ? '10–25 km' : '6–15 mi';
    case 'OVER_25_KM':
      return unit === 'km' ? '25+ km' : '15+ mi';
    default:
      return assertNever(bucket, 'Unhandled distance bucket');
  }
}
