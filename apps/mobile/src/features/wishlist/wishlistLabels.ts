import type { PrintingSummary, TradePreference, WishlistItemResponse } from '@/src/api/types';
import type { IconName } from '@/src/components/ui/EmptyState';
import { editionLabel, formatMoney, languageName, printingCode } from '@/src/lib/catalog';
import { conditionLabel } from '@/src/lib/inventory';

/**
 * Display vocabulary of the wishlist (Phase 6 contract, mirror of the web's `wishlist-labels.ts`):
 * trade preferences, the criteria of a wish as chips, printings and match counts.
 */
export interface TradePreferenceInfo {
  value: TradePreference;
  label: string;
  icon: IconName;
  hint: string;
}

export const TRADE_PREFERENCES: readonly TradePreferenceInfo[] = [
  {
    value: 'ANY',
    label: 'Trade or buy',
    icon: 'swap-horizontal',
    hint: 'Every listing counts: for trade, for sale or both.',
  },
  {
    value: 'TRADE',
    label: 'Trade only',
    icon: 'swap-horizontal-bold',
    hint: 'Only listings open to trades.',
  },
  { value: 'SALE', label: 'Buy only', icon: 'tag-outline', hint: 'Only listings for sale.' },
];

export function isTradePreference(value: unknown): value is TradePreference {
  return TRADE_PREFERENCES.some((option) => option.value === value);
}

export function tradePreferenceInfo(value: string | null | undefined): TradePreferenceInfo {
  return (
    TRADE_PREFERENCES.find((option) => option.value === value) ??
    (TRADE_PREFERENCES[0] as TradePreferenceInfo)
  );
}

/** One criterion of a wish, shown as a chip. */
export interface WishChip {
  kind: 'condition' | 'edition' | 'language' | 'rarity' | 'price' | 'trade';
  icon: IconName;
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
  | 'tradePreference'
>;

/** The criteria of a wish as chips, most selective first (unset filters are left out). */
export function wishCriteriaChips(wish: WishCriteria): WishChip[] {
  const chips: WishChip[] = [];
  if (wish.conditionMin) {
    chips.push({
      kind: 'condition',
      icon: 'check-decagram-outline',
      label: `${conditionLabel(wish.conditionMin)} or better`,
    });
  }
  if (wish.edition) {
    chips.push({ kind: 'edition', icon: 'layers-outline', label: editionLabel(wish.edition) });
  }
  if (wish.language) {
    chips.push({ kind: 'language', icon: 'translate', label: languageName(wish.language) });
  }
  if (wish.rarity && !wish.printing) {
    chips.push({ kind: 'rarity', icon: 'diamond-stone', label: wish.rarity });
  }
  const price = formatMoney(wish.maxPrice ?? null, wish.currency);
  if (price) {
    chips.push({ kind: 'price', icon: 'cash', label: `Up to ${price}` });
  }
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
    printing.language ? languageName(printing.language) : null,
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

/** The confirmation of a new wish (web: `addedMessage`). */
export function addedMessage(item: WishlistItemResponse): string {
  const name = item.card?.name ?? 'The card';
  if (item.matchCount > 0) {
    return `${name} is on your wishlist: ${matchCountLabel(item.matchCount)} in your region already.`;
  }
  return item.active
    ? `${name} is on your wishlist. We'll tell you when a collector of your region lists it.`
    : `${name} is on your wishlist (alerts paused).`;
}
