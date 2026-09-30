import type { PrintingSummary, WishlistItemResponse } from '@orenji/api-client';
import { editionLabel, languageLabel } from '../catalog/catalog-labels';
import { conditionLabel, formatPrice, printingCode } from '../inventory/inventory-labels';

/**
 * Display vocabulary of the wishlist (Phase 6 contract): trade preferences, the criteria of a
 * wish as chips, printings and match counts. Values mirror the generated `@orenji/api-client`
 * enums; every screen words them the same way.
 */

/** What the collector accepts for a wished card (`ANY | TRADE | SALE`). */
export type TradePreference = 'ANY' | 'TRADE' | 'SALE';

export interface TradePreferenceInfo {
  value: TradePreference;
  label: string;
  icon: string;
  hint: string;
}

export const TRADE_PREFERENCES: readonly TradePreferenceInfo[] = [
  {
    value: 'ANY',
    label: 'Trade or buy',
    icon: 'sync_alt',
    hint: 'Every listing counts: for trade, for sale or both.',
  },
  {
    value: 'TRADE',
    label: 'Trade only',
    icon: 'swap_horiz',
    hint: 'Only listings open to trades.',
  },
  { value: 'SALE', label: 'Buy only', icon: 'sell', hint: 'Only listings for sale.' },
];

export function isTradePreference(value: unknown): value is TradePreference {
  return TRADE_PREFERENCES.some((option) => option.value === value);
}

export function tradePreferenceInfo(value: string | null | undefined): TradePreferenceInfo {
  return TRADE_PREFERENCES.find((option) => option.value === value) ?? TRADE_PREFERENCES[0];
}

/** One criterion of a wish, shown as a chip. */
export interface WishChip {
  kind: 'condition' | 'edition' | 'language' | 'rarity' | 'price' | 'radius' | 'trade';
  icon: string;
  label: string;
}

type WishCriteria = Pick<
  WishlistItemResponse,
  | 'printing'
  | 'rarity'
  | 'conditionMin'
  | 'edition'
  | 'language'
  | 'maxPrice'
  | 'currency'
  | 'radiusKm'
  | 'tradePreference'
>;

/** The criteria of a wish as chips, most selective first (unset filters are left out). */
export function wishCriteriaChips(wish: WishCriteria): WishChip[] {
  const chips: WishChip[] = [];
  if (wish.conditionMin) {
    chips.push({
      kind: 'condition',
      icon: 'verified',
      label: `${conditionLabel(wish.conditionMin)} or better`,
    });
  }
  if (wish.edition) {
    chips.push({ kind: 'edition', icon: 'layers', label: editionLabel(wish.edition) });
  }
  if (wish.language) {
    chips.push({ kind: 'language', icon: 'translate', label: languageLabel(wish.language) });
  }
  if (wish.rarity && !wish.printing) {
    chips.push({ kind: 'rarity', icon: 'diamond', label: wish.rarity });
  }
  const price = formatPrice(wish.maxPrice, wish.currency);
  if (price) {
    chips.push({ kind: 'price', icon: 'payments', label: `Up to ${price}` });
  }
  chips.push({ kind: 'radius', icon: 'near_me', label: `Within ${wish.radiusKm} km` });
  const trade = tradePreferenceInfo(wish.tradePreference);
  chips.push({ kind: 'trade', icon: trade.icon, label: trade.label });
  return chips;
}

/** `AZR-EN001 · Azure Dawn`, or "Any printing" when the wish accepts every printing. */
export function wishPrintingLabel(printing: PrintingSummary | null | undefined): string {
  if (!printing) {
    return 'Any printing';
  }
  const code = printingCode(printing);
  return [code, printing.setName].filter(Boolean).join(' · ') || 'One printing';
}

/** One line describing a printing in a picker: code · set · rarity · edition · language. */
export function printingOptionLabel(printing: PrintingSummary): string {
  return [
    printingCode(printing),
    printing.setName,
    printing.rarity,
    printing.edition ? editionLabel(printing.edition) : null,
    printing.language ? languageLabel(printing.language) : null,
  ]
    .filter((part) => part && part !== '—')
    .join(' · ');
}

/** "No matches yet" / "1 match" / "3 matches". */
export function matchCountLabel(count: number | null | undefined): string {
  const value = count ?? 0;
  if (value <= 0) {
    return 'No matches yet';
  }
  return value === 1 ? '1 match' : `${value} matches`;
}
