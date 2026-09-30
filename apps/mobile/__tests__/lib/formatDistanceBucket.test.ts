import { assertNever } from '@/src/lib/assertNever';
import {
  DISTANCE_BUCKETS,
  formatDistanceBucket,
  isDistanceBucket,
} from '@/src/lib/formatDistanceBucket';

describe('formatDistanceBucket', () => {
  it('formats every server bucket in kilometres (ADR 0004 labels)', () => {
    expect(formatDistanceBucket('UNDER_1_KM')).toBe('< 1 km');
    expect(formatDistanceBucket('ABOUT_4_KM')).toBe('~4 km');
    expect(formatDistanceBucket('KM_10_TO_25')).toBe('10–25 km');
    expect(formatDistanceBucket('OVER_25_KM')).toBe('25+ km');
  });

  it('converts to miles when requested', () => {
    expect(formatDistanceBucket('UNDER_1_KM', 'mi')).toBe('< 1 mi');
    expect(formatDistanceBucket('ABOUT_4_KM', 'mi')).toBe('~2.5 mi');
    expect(formatDistanceBucket('KM_10_TO_25', 'mi')).toBe('6–15 mi');
    expect(formatDistanceBucket('OVER_25_KM', 'mi')).toBe('15+ mi');
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
});

describe('assertNever', () => {
  it('throws with the offending value', () => {
    expect(() => assertNever('oops' as never, 'Unhandled')).toThrow('Unhandled: "oops"');
  });
});
