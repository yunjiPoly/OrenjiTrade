import type { CardSuggestion } from '@orenji/api-client';

/**
 * Printings of one card that share a printing code (1st Edition and Unlimited `AZR-EN011`) lead
 * to the same card page and read the same: keep the first of each. Used by the card pickers (Add
 * card, card links, wishes); the top bar's search dedupes its own rows.
 */
export function uniqueSuggestions(items: readonly CardSuggestion[]): CardSuggestion[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}|${item.id}|${item.printingCode ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
