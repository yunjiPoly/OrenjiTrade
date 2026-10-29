import type { CardHolderResult } from '@orenji/api-client';
import { groupAnchor, groupHolders, holderLine, holderPrice, messageLabel } from './holder-groups';

function holder(code: string, name: string, country: string, countryName: string, id: string) {
  return {
    collector: {
      handle: `h-${id}`,
      place: { subdivisionCode: code, subdivisionName: name, countryCode: country, countryName },
    },
    item: { id, askingPriceText: null, askingPrice: 32, currency: 'CAD', printing: {} },
  } as unknown as CardHolderResult;
}

describe('Who has this card groups (spec 7.3)', () => {
  const rows = [
    holder('CA-QC', 'Quebec', 'CA', 'Canada', '1'),
    holder('CA-QC', 'Quebec', 'CA', 'Canada', '2'),
    holder('CA-ON', 'Ontario', 'CA', 'Canada', '3'),
    holder('US-NY', 'New York', 'US', 'United States', '4'),
  ];

  it("groups consecutive rows by province, the viewer's marked, other countries named", () => {
    const groups = groupHolders(rows, { subdivisionCode: 'CA-QC', countryCode: 'CA' });
    expect(groups.map((group) => [group.title, group.rows.length, group.mine])).toEqual([
      ['Quebec · your province', 2, true],
      ['Ontario', 1, false],
      ['New York · United States', 1, false],
    ]);
    expect(groups.map((group) => group.name)).toEqual(['Quebec', 'Ontario', 'New York']);
  });

  it('marks nothing for a guest', () => {
    const groups = groupHolders(rows, { subdivisionCode: null, countryCode: null });
    expect(groups.some((group) => group.mine)).toBe(false);
    expect(groups.map((group) => group.title)).toEqual(['Quebec', 'Ontario', 'New York']);
  });

  it('writes the line, the price as typed, the Message label and the anchors', () => {
    expect(holderLine({ printingCode: 'LAVD-EN008', rarity: 'Ultra Rare' })).toBe(
      'LAVD-EN008 · Ultra Rare',
    );
    expect(holderPrice(rows[0])).toBe('$32.00');
    expect(
      holderPrice({ ...rows[0], item: { ...rows[0].item, askingPriceText: '85% TCG' } } as never),
    ).toBe('85% TCG');
    expect(messageLabel('duelist.jp', 'Ash Blossom & Joyous Spring')).toBe(
      'Message duelist.jp about Ash Blossom & Joyous Spring',
    );
    expect(messageLabel(null, 'Ash')).toBe('Message a collector about Ash');
    expect(groupAnchor('cp', 'CA-QC')).toBe('cp-group-ca-qc');
  });
});
