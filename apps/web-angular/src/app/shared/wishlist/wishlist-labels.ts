import type {
  MarketPrice,
  PrintingSummary,
  WishPriceTerm,
  WishlistItemResponse,
} from '@orenji/api-client';
import { printingCode } from '../inventory/inventory-labels';

/**
 * Display vocabulary of the wishlist (stage S2): which copy, the "Near Mint only" and price term
 * chips, the approximate amount of a term and the card page link of a wish. Every screen words
 * them the same way.
 */

/** One chip of a wish. */
export interface WishChip {
  kind: 'near-mint' | 'price-term';
  icon: string;
  label: string;
  /** Longer text for a tooltip / screen readers (the market price source). */
  detail?: string;
}

/** "≈ 21.25 USD": `percent` of a market price, two decimals; `null` without a price. */
export function approximateAmount(
  term: Pick<WishPriceTerm, 'percent'> | null | undefined,
  price: MarketPrice | null | undefined,
): string | null {
  if (!term || !price || price.amount === undefined || price.amount === null) {
    return null;
  }
  const cents = Math.round(price.amount * term.percent);
  const amount = (cents / 100).toFixed(2);
  return `≈ ${amount} ${price.currency ?? ''}`.trim();
}

/** "85% TCG ≈ 21.25 USD" with a printing's market price; the term alone otherwise. */
export function priceTermLabel(
  term: Pick<WishPriceTerm, 'label' | 'percent'>,
  price: MarketPrice | null | undefined,
): string {
  const amount = approximateAmount(term, price);
  return amount ? `${term.label} ${amount}` : term.label;
}

type WishCriteria = Pick<WishlistItemResponse, 'printing' | 'nearMintOnly' | 'priceTerm'>;

/** The chips of a wish: Near Mint only, then the price term (with its amount for one printing). */
export function wishChips(wish: WishCriteria): WishChip[] {
  const chips: WishChip[] = [];
  if (wish.nearMintOnly) {
    chips.push({ kind: 'near-mint', icon: 'verified', label: 'Near Mint only' });
  }
  if (wish.priceTerm) {
    chips.push({
      kind: 'price-term',
      icon: 'sell',
      label: priceTermLabel(wish.priceTerm, wish.printing?.marketPrice),
    });
  }
  return chips;
}

/**
 * Which copy: "Any printing", "Any printing · Quarter Century Secret Rare", or
 * "AZR-EN001 · Ultra Rare · Azure Dawn".
 */
export function whichCopyLabel(
  printing: PrintingSummary | null | undefined,
  rarity?: string | null,
): string {
  if (!printing) {
    return rarity ? `Any printing · ${rarity}` : 'Any printing';
  }
  return (
    [printingCode(printing), printing.rarity, printing.setName].filter(Boolean).join(' · ') ||
    'One printing'
  );
}

/** Query parameters of the card page for a wish's selection (`?printing=` or `?rarity=`). */
export function wishCardQuery(
  wish: Pick<WishlistItemResponse, 'printing' | 'rarity'>,
): Record<string, string> {
  if (wish.printing?.id) {
    return { printing: wish.printing.id };
  }
  return wish.rarity ? { rarity: wish.rarity } : {};
}
