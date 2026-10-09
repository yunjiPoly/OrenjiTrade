import type {
  MarketPrice,
  PrintingSummary,
  WishPriceTerm,
  WishlistItemResponse,
} from '@/src/api/types';
import type { IconName } from '@/src/components/ui/EmptyState';
import { editionLabel, finishLabel, languageName, printingCode } from '@/src/lib/catalog';

/**
 * Display vocabulary of the wishlist (stage S2, mirror of the web's `wishlist-labels.ts`): which
 * copy, the "Near Mint only" and price term chips, the approximate amount of a term, the market
 * price source and the card page link of a wish.
 */

/** One chip of a wish. */
export interface WishChip {
  kind: 'near-mint' | 'price-term';
  icon: IconName;
  label: string;
}

/** "≈ 21.25 USD": `percent` of a market price, two decimals; `null` without a price. */
export function approximateAmount(
  term: Pick<WishPriceTerm, 'percent'> | null | undefined,
  price: MarketPrice | null | undefined
): string | null {
  if (!term || !price || price.amount === undefined || price.amount === null) {
    return null;
  }
  const cents = Math.round(price.amount * term.percent);
  return `≈ ${(cents / 100).toFixed(2)} ${price.currency ?? ''}`.trim();
}

/** "85% TCG ≈ 21.25 USD" with a printing's market price; the term alone otherwise. */
export function priceTermLabel(
  term: Pick<WishPriceTerm, 'label' | 'percent'>,
  price: MarketPrice | null | undefined
): string {
  const amount = approximateAmount(term, price);
  return amount ? `${term.label} ${amount}` : term.label;
}

/** The chips of a wish: Near Mint only, then the price term (with its amount for one printing). */
export function wishChips(
  wish: Pick<WishlistItemResponse, 'printing' | 'nearMintOnly' | 'priceTerm'>
): WishChip[] {
  const chips: WishChip[] = [];
  if (wish.nearMintOnly) {
    chips.push({ kind: 'near-mint', icon: 'check-decagram-outline', label: 'Near Mint only' });
  }
  if (wish.priceTerm) {
    chips.push({
      kind: 'price-term',
      icon: 'tag-outline',
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
  rarity?: string | null
): string {
  if (!printing) {
    return rarity ? `Any printing · ${rarity}` : 'Any printing';
  }
  return (
    [printingCode(printing), printing.rarity, printing.setName, specialFinish(printing.finish)]
      .filter(Boolean)
      .join(' · ') || 'One printing'
  );
}

/** The finish of a printing when it is not the normal one ("Reverse holo"), else `null`. */
export function specialFinish(finish: string | null | undefined): string | null {
  return finish && finish !== 'NORMAL' ? finishLabel(finish) : null;
}

/**
 * One line describing a printing in a chooser: code · rarity · set · edition · language · finish
 * (two printings of one set often differ only by their finish).
 */
export function printingOptionLabel(printing: PrintingSummary): string {
  return [
    printingCode(printing),
    printing.rarity,
    printing.setName,
    printing.edition ? editionLabel(printing.edition) : null,
    printing.language ? languageName(printing.language) : null,
    printing.finish ? finishLabel(printing.finish) : null,
  ]
    .filter((part) => part && part !== '—')
    .join(' · ');
}

/** What a market price is and where it comes from (web: `marketPriceInfo`). */
export function marketPriceSource(price: MarketPrice | null | undefined): string | null {
  if (!price || price.amount === undefined || price.amount === null) {
    return null;
  }
  const date = price.updatedAt ? ` · updated ${price.updatedAt.slice(0, 10)}` : '';
  switch (price.source) {
    case 'YGOPRODECK':
      return `TCG market price: YGOPRODeck set price (TCGplayer-based, ${price.currency ?? 'USD'})${date}`;
    case 'SAMPLE':
      return `Sample market price: fictional price of the local sample catalog${date}`;
    default:
      return `Market price: set by OrenjiTrade${date}`;
  }
}

/** The card page params of a wish's selection (`printing` or `rarity`). */
export function wishCardParams(
  wish: Pick<WishlistItemResponse, 'card' | 'printing' | 'rarity'>
): { id: string; printing?: string; rarity?: string } | null {
  const id = wish.card?.id;
  if (!id) {
    return null;
  }
  if (wish.printing?.id) {
    return { id, printing: wish.printing.id };
  }
  return wish.rarity ? { id, rarity: wish.rarity } : { id };
}

/** The confirmation of a new wish (web: `addedMessage`). */
export function addedMessage(item: WishlistItemResponse): string {
  const name = item.card?.name ?? 'The card';
  return `${name} is on your wishlist. We'll tell you when a collector of your region lists it.`;
}
