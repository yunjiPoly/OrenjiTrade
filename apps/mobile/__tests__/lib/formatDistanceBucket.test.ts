import { assertNever } from '@/src/lib/assertNever';
import {
  DISTANCE_BUCKETS,
  distanceBucketLabel,
  formatDistanceBucket,
  isDistanceBucket,
} from '@/src/lib/formatDistanceBucket';

describe('formatDistanceBucket', () => {
  it('formats every API bucket in kilometres (ADR 0004: ranges, never metres)', () => {
    expect(formatDistanceBucket('LT_1KM')).toBe('< 1 km');
    expect(formatDistanceBucket('KM_1_5')).toBe('1–5 km');
    expect(formatDistanceBucket('KM_5_10')).toBe('5–10 km');
    expect(formatDistanceBucket('KM_10_25')).toBe('10–25 km');
    expect(formatDistanceBucket('KM_25_50')).toBe('25–50 km');
    expect(formatDistanceBucket('GT_50KM')).toBe('50+ km');
  });

  it('converts to miles when requested', () => {
    expect(formatDistanceBucket('LT_1KM', 'mi')).toBe('< 0.6 mi');
    expect(formatDistanceBucket('KM_10_25', 'mi')).toBe('6–15 mi');
    expect(formatDistanceBucket('GT_50KM', 'mi')).toBe('30+ mi');
  });

  it('never exposes raw metres and degrades unknown buckets to "nearby"', () => {
    expect(formatDistanceBucket('1234')).toBe('nearby');
    expect(formatDistanceBucket(undefined)).toBe('nearby');
    expect(formatDistanceBucket(null)).toBe('nearby');
  });

  it('covers all declared buckets', () => {
    for (const bucket of DISTANCE_BUCKETS) {
      expect(isDistanceBucket(bucket)).toBe(true);
      expect(formatDistanceBucket(bucket)).not.toBe('nearby');
    }
    expect(isDistanceBucket('SOMETHING_ELSE')).toBe(false);
  });

  it('builds the profile sentence (web wording) or nothing without a bucket', () => {
    expect(distanceBucketLabel('LT_1KM')).toBe('Less than 1 km away');
    expect(distanceBucketLabel('KM_5_10')).toBe('5–10 km away');
    expect(distanceBucketLabel('GT_50KM')).toBe('More than 50 km away');
    expect(distanceBucketLabel(null)).toBeNull();
  });
});

describe('assertNever', () => {
  it('throws with the offending value', () => {
    expect(() => assertNever('oops' as never, 'Unhandled')).toThrow('Unhandled: "oops"');
  });
});
