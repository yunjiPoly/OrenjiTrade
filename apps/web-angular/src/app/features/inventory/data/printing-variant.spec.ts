import { printingVariant, suggestionVariant } from './printing-variant';

describe("printings that carry the same code (U2, the phone's rule)", () => {
  const first = { id: 'a', printingCode: 'AZR-EN011', edition: 'FIRST_EDITION', finish: 'NORMAL' };
  const unlimited = { id: 'b', printingCode: 'AZR-EN011', edition: 'UNLIMITED', finish: 'NORMAL' };
  const other = { id: 'c', printingCode: 'AZR-EN012', edition: 'UNLIMITED', finish: 'NORMAL' };

  it('names what differs among twins, and nothing for a code of its own', () => {
    const all = [first, unlimited, other];
    expect(printingVariant(first, all)).toBe('1st Edition');
    expect(printingVariant(unlimited, all)).toBe('Unlimited');
    expect(printingVariant(other, all)).toBeNull();
    expect(
      printingVariant({ ...unlimited, finish: 'FOIL' }, [first, { ...unlimited, finish: 'FOIL' }]),
    ).toBe('Unlimited · Foil');
  });

  it('reads the exact printings of a search by their printing ids', () => {
    const s1 = { printingId: 'a', printingCode: 'AZR-EN011', edition: 'FIRST_EDITION' };
    const s2 = { printingId: 'b', printingCode: 'AZR-EN011', edition: 'UNLIMITED' };
    expect(suggestionVariant(s1, [s1, s2])).toBe('1st Edition');
    expect(suggestionVariant(s2, [s1, s2])).toBe('Unlimited');
  });
});
