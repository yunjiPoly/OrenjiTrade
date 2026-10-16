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
  const twins = new Map<string, PrintingSummary[]>();
  for (const printing of printings) {
    twins.set(base(printing), [...(twins.get(base(printing)) ?? []), printing]);
  }
  // What tells twins apart: only the attributes whose values differ among them.
  const parts: readonly ((printing: PrintingSummary) => string | null)[] = [
    (printing) => (printing.language ? languageName(printing.language) : null),
    (printing) => specialEdition(printing.edition),
    (printing) => specialFinish(printing.finish),
  ];
  return printings
    .filter((printing): printing is PrintingSummary & { id: string } => !!printing.id)
    .map((printing) => {
      const label = base(printing);
      const group = twins.get(label) ?? [];
      if (group.length < 2) {
        return { id: printing.id, label };
      }
      const extra = parts
        .filter((part) => new Set(group.map(part)).size > 1)
        .map((part) => part(printing))
        .filter((value): value is string => !!value && value !== '—');
      return { id: printing.id, label: [label, ...extra].join(' · ') };
    });
}
