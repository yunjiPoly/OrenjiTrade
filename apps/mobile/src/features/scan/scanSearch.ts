import type { CardSuggestion } from '@/src/api/types';
import { QUERY_MAX_LENGTH } from '@/src/lib/catalog';

import { isEnglishLanguage } from './scanPrintings';
import { SCAN_GAME, type CardScanCard, type CardScanPrinting, type ScanRead } from './types';

/**
 * The search inside the scan, without its screen (owner spec 2026-10-15, sections 4 and 5). Pure.
 * The scan reads Yu-Gi-Oh! English cards only: the search asks for that game's suggestions, and a
 * suggestion of another game (or a printing in another language) is never taken for a photo.
 */

/**
 * What the search opens with: what was read on the photo, the name first (the catalog finds a
 * name read with a mistake; a code read wrong finds nothing), else the code.
 */
export function searchTextOf(read: ScanRead | null): string {
  const text = read?.names[0] ?? read?.codes[0] ?? '';
  return text.trim().slice(0, QUERY_MAX_LENGTH);
}

/** A card of the suggestions, as the scan holds it; null for a card of another game. */
export function scanCardOf(suggestion: CardSuggestion): CardScanCard | null {
  if (!suggestion.id || suggestion.game !== SCAN_GAME) {
    return null;
  }
  return {
    id: suggestion.id,
    name: suggestion.name ?? '',
    ...(suggestion.imageUrl ? { imageUrl: suggestion.imageUrl } : {}),
  };
}

/**
 * An exact printing of the suggestions, as the scan holds it; null for a printing of another game
 * or in another language than English.
 */
export function scanPrintingOf(suggestion: CardSuggestion): CardScanPrinting | null {
  if (
    !suggestion.printingId ||
    suggestion.game !== SCAN_GAME ||
    !isEnglishLanguage(suggestion.language)
  ) {
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
