import type { PrintingSummary } from '@/src/api/types';
import { languageName, printingCode } from '@/src/lib/catalog';

import { specialEdition, specialFinish } from '../wishlist/wishlistLabels';
import { CARD_PAGE_COPY } from '../search/searchCopy';

/** One choice of the "Any printing ▾" sheet. */
export interface PrintingOption {
  id: string;
  label: string;
}

/**
 * The printings of the card page's sheet (owner spec 2026-10-14, section 8): "{code} · {rarity}",
 * in the catalogue's order. Two printings that would read the same (one code in two languages or
 * editions) also say what differs, so a collector never picks the wrong one blindly.
 */
export function printingOptions(printings: readonly PrintingSummary[]): PrintingOption[] {
  const base = (printing: PrintingSummary) =>
    CARD_PAGE_COPY.printingLine(printingCode(printing), printing.rarity);
  const seen = new Map<string, number>();
  for (const printing of printings) {
    seen.set(base(printing), (seen.get(base(printing)) ?? 0) + 1);
  }
  return printings
    .filter((printing): printing is PrintingSummary & { id: string } => !!printing.id)
    .map((printing) => {
      const label = base(printing);
      if ((seen.get(label) ?? 0) < 2) {
        return { id: printing.id, label };
      }
      const extra = [
        printing.language ? languageName(printing.language) : null,
        specialEdition(printing.edition),
        specialFinish(printing.finish),
      ].filter((part) => part && part !== '—');
      return { id: printing.id, label: [label, ...extra].join(' · ') };
    });
}
