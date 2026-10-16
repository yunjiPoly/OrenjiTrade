import type { CardHolderResult } from '@/src/api/types';

import { CARD_PAGE_COPY } from '../search/searchCopy';

/**
 * The holders of "Who has this card" grouped by state or province (owner spec 2026-10-14, section
 * 8). The API already orders them (`sort=province`: the viewer's own province first, then the
 * other ones of their country, then the rest of the region, the newest listing first inside each),
 * so a group is a run of rows of one state or province. Only the declared state or province is
 * read (ADR 0017): no position, no distance, and no count is shown.
 */
export interface HolderGroup {
  /** The state or province code (`CA-QC`), or `''` for a holder without one. */
  key: string;
  /** "Quebec · your province", "Ontario". */
  title: string;
  mine: boolean;
  rows: CardHolderResult[];
}

export function groupHolders(
  rows: readonly CardHolderResult[],
  mySubdivision: string | null | undefined
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
    const mine = !!mySubdivision && key === mySubdivision;
    const name = place?.subdivisionName || place?.countryName || '';
    groups.push({
      key,
      title: mine ? CARD_PAGE_COPY.ownProvince(name) : name,
      mine,
      rows: [row],
    });
  }
  return groups;
}
