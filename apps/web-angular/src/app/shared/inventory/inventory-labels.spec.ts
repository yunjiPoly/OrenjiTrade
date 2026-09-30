import { PrintingImageKindEnum } from '@orenji/api-client';
import {
  badgeFreshness,
  conditionLabel,
  endsLabel,
  formatPrice,
  isVisibility,
  printingCode,
  printingImageUrl,
  publicUntilFor,
} from './inventory-labels';

describe('inventory labels', () => {
  const now = new Date('2026-09-29T12:00:00Z');

  it('computes the end of a temporary publication', () => {
    expect(publicUntilFor('1h', now)).toBe('2026-09-29T13:00:00.000Z');
    expect(publicUntilFor('24h', now)).toBe('2026-09-30T12:00:00.000Z');
    expect(publicUntilFor('7d', now)).toBe('2026-10-06T12:00:00.000Z');
    // Thirty days stays a few minutes under the API bound.
    const thirty = new Date(publicUntilFor('30d', now)).getTime() - now.getTime();
    expect(thirty).toBeLessThan(30 * 86_400_000);
    expect(thirty).toBeGreaterThan(30 * 86_400_000 - 10 * 60_000);
  });

  it('maps API freshness states to the badge palette', () => {
    expect(badgeFreshness('ACTIVE')).toBe('fresh');
    expect(badgeFreshness('AGING')).toBe('aging');
    expect(badgeFreshness('STALE')).toBe('stale');
    expect(badgeFreshness('HIDDEN')).toBe('hidden');
    expect(badgeFreshness(undefined)).toBe('hidden');
  });

  it('formats prices and tolerates missing amounts', () => {
    expect(formatPrice(45, 'CAD')).toBe('$45.00');
    expect(formatPrice(12.5, 'USD')).toBe('US$12.50');
    expect(formatPrice(null, 'CAD')).toBeNull();
    expect(formatPrice(3, 'NOPE')).toBe('3.00 NOPE');
  });

  it('labels conditions, including values outside the shared vocabulary', () => {
    expect(conditionLabel('NEAR_MINT')).toBe('Near Mint');
    expect(conditionLabel('POOR_BUT_LOVED')).toBe('Poor but loved');
    expect(conditionLabel(null)).toBe('—');
  });

  it('describes printings by code and front picture', () => {
    expect(printingCode({ printingCode: 'AZR-EN001', setCode: 'AZR' })).toBe('AZR-EN001');
    expect(printingCode({ setCode: 'AZR', collectorNumber: '7' })).toBe('AZR-7');
    expect(printingCode(null)).toBe('');
    expect(
      printingImageUrl({
        images: [
          { kind: PrintingImageKindEnum.Back, url: 'back.svg' },
          { kind: PrintingImageKindEnum.Front, url: 'front.svg' },
        ],
      }),
    ).toBe('front.svg');
    expect(printingImageUrl({ images: [] })).toBeNull();
  });

  it('words the end of a publication', () => {
    expect(endsLabel('2026-09-29T15:00:00Z', now)).toBe('ends in 3 hours');
    expect(endsLabel('2026-09-29T10:00:00Z', now)).toBe('ended 2 hours ago');
    expect(endsLabel(null, now)).toBeNull();
  });

  it('recognises visibilities', () => {
    expect(isVisibility('TEMPORARILY_PUBLIC')).toBe(true);
    expect(isVisibility('SECRET')).toBe(false);
  });
});
