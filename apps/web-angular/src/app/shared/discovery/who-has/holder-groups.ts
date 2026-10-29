import type { CardHolderResult, PrintingSummary } from '@orenji/api-client';
import { itemPriceText } from '../../../features/inventory/data/item-price';
import { printingCode } from '../../inventory/inventory-labels';

/**
 * The holders of "Who has this card" grouped by state or province (spec 7.3, board W7; the
 * phone's `groupHolders`). The API orders them (`sort=province`: the viewer's own state or
 * province first, then the rest of their country, then the region, the newest listing first
 * inside each), so a group is a run of rows of one state or province. Only the declared place is
 * read (ADR 0017): no position, no distance, and no count is shown anywhere.
 */
export interface HolderGroup {
  /** The state or province code (`CA-QC`), or `''` for a holder without one. */
  key: string;
  /** The place alone ("Quebec"), for the "Jump to" chips. */
  name: string;
  /** "Quebec · your province", "Ontario", "New York · United States" (drawn in label style). */
  title: string;
  /** The part after the place ("your province", drawn teal; "United States"), or null. */
  suffix: string | null;
  mine: boolean;
  rows: CardHolderResult[];
}

/** The viewer's declared place: their state or province and country codes (null for a guest). */
export interface ViewerPlace {
  subdivisionCode: string | null;
  countryCode: string | null;
}

export function groupHolders(
  rows: readonly CardHolderResult[],
  viewer: ViewerPlace,
): HolderGroup[] {
  const groups: HolderGroup[] = [];
  for (const row of rows) {
    const place = row.collector.place;
    const key = place?.subdivisionCode ?? '';
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
      continue;
    }
    const mine = !!viewer.subdivisionCode && key === viewer.subdivisionCode;
    const name = place?.subdivisionName || place?.countryName || '';
    const otherCountry =
      !!place?.countryName && !!viewer.countryCode && place.countryCode !== viewer.countryCode;
    const suffix = mine
      ? 'your province'
      : otherCountry && place.countryName !== name
        ? place.countryName
        : null;
    groups.push({
      key,
      name,
      title: suffix ? `${name} · ${suffix}` : name,
      suffix,
      mine,
      rows: [row],
    });
  }
  return groups;
}

/** "LAVD-EN008 · Ultra Rare" (the code and the rarity of a holder's copy). */
export function holderLine(printing: PrintingSummary | null | undefined): string {
  return [printingCode(printing), printing?.rarity].filter(Boolean).join(' · ');
}

/** The price as the holder typed it ("85% TCG", "$32", "Trade only"), else null. */
export function holderPrice(result: CardHolderResult): string | null {
  return itemPriceText(result.item);
}

/** "Message duelist.jp about Ash Blossom & Joyous Spring" (spec 7.3). */
export function messageLabel(handle: string | null | undefined, cardName: string): string {
  return handle ? `Message ${handle} about ${cardName}` : `Message a collector about ${cardName}`;
}

/** The DOM id of a group's header, the target of its "Jump to" chip. */
export function groupAnchor(prefix: string, key: string): string {
  return `${prefix}-group-${(key || 'none').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}
