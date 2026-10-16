import type { CardSuggestion } from '@/src/api/types';
import { QUERY_MAX_LENGTH } from '@/src/lib/catalog';

import type { CardScanCard, CardScanPrinting, ScanRead } from './types';

/** The search inside the scan, without its screen (owner spec 2026-10-15, section 4). Pure. */

/**
 * What the search opens with: what was read on the photo, the name first (the catalog finds a
 * name read with a mistake; a code read wrong finds nothing), else the code.
 */
export function searchTextOf(read: ScanRead | null): string {
  const text = read?.names[0] ?? read?.codes[0] ?? '';
  return text.trim().slice(0, QUERY_MAX_LENGTH);
}

/** A card of the suggestions, as the scan holds it. */
export function scanCardOf(suggestion: CardSuggestion): CardScanCard | null {
  if (!suggestion.id) {
    return null;
  }
  return {
    id: suggestion.id,
    name: suggestion.name ?? '',
    ...(suggestion.imageUrl ? { imageUrl: suggestion.imageUrl } : {}),
  };
}

/** An exact printing of the suggestions, as the scan holds it. */
export function scanPrintingOf(suggestion: CardSuggestion): CardScanPrinting | null {
  if (!suggestion.printingId) {
    return null;
  }
  const code = suggestion.printingCode ?? '';
  return {
    id: suggestion.printingId,
    setCode: suggestion.setCode ?? code.split('-')[0] ?? '',
    setName: suggestion.setName ?? '',
    ...(code ? { printingCode: code } : {}),
    ...(suggestion.rarity ? { rarity: suggestion.rarity } : {}),
  };
}
