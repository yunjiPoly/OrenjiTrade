import type {
  MarketPrice,
  PrintingSummary,
  WishPriceTerm,
  WishlistItemResponse,
} from '@orenji/api-client';
import {
  editionLabel,
  finishLabel,
  formatAmountWithCode,
  marketPriceInfo,
} from '../catalog/catalog-labels';
import { selectionQuery } from '../catalog/printing-picker/printing-selection';
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

/** A price term as far as its amount goes: the percent and whether it means "or more". */
type TermAmount = Pick<WishPriceTerm, 'percent'> & Partial<Pick<WishPriceTerm, 'orMore'>>;

/**
 * "≈ 21.25 USD": `percent` of a market price, two decimals; "≥ 42.00 CAD" for an "or more" term
 * ("100% TCG+"); `null` without a price.
 */
export function approximateAmount(
  term: TermAmount | null | undefined,
  price: MarketPrice | null | undefined,
): string | null {
  if (!term || !price || price.amount === undefined || price.amount === null) {
    return null;
  }
  const cents = Math.round(price.amount * term.percent);
  return `${term.orMore ? '≥' : '≈'} ${formatAmountWithCode(cents / 100, price.currency)}`;
}

/**
 * "85% TCG ≈ 21.25 USD" (or "100% TCG+ ≥ 25.00 USD") with a printing's market price; the term
 * alone otherwise.
 */
export function priceTermLabel(
  term: Pick<WishPriceTerm, 'label'> & TermAmount,
  price: MarketPrice | null | undefined,
): string {
  const amount = approximateAmount(term, price);
  return amount ? `${term.label} ${amount}` : term.label;
}

type WishCriteria = Pick<WishlistItemResponse, 'printing' | 'nearMintOnly' | 'priceTerm'>;

/**
 * The chips of a wish: Near Mint only, then the price term (with its amount for one printing, and
 * then the market price's source and date as `detail`).
 */
export function wishChips(wish: WishCriteria): WishChip[] {
  const chips: WishChip[] = [];
  if (wish.nearMintOnly) {
    chips.push({ kind: 'near-mint', icon: 'verified', label: 'Near Mint only' });
  }
  if (wish.priceTerm) {
    const price = wish.printing?.marketPrice;
    const chip: WishChip = {
      kind: 'price-term',
      icon: 'sell',
      label: priceTermLabel(wish.priceTerm, price),
    };
    const info = approximateAmount(wish.priceTerm, price) ? marketPriceInfo(price) : null;
    if (info) {
      chip.detail = `${info.label}: ${info.detail}`;
    }
    chips.push(chip);
  }
  return chips;
}

/**
 * Which copy: "Any printing", "Any printing · Quarter Century Secret Rare", or
 * "AZR-EN001 · Ultra Rare · Azure Dawn" (plus an edition other than Unlimited and a finish other
 * than Normal: two printings of one code can differ only by them).
 */
export function whichCopyLabel(
  printing: PrintingSummary | null | undefined,
  rarity?: string | null,
): string {
  if (!printing) {
    return rarity ? `Any printing · ${rarity}` : 'Any printing';
  }
  return (
    [
      printingCode(printing),
      printing.rarity,
      printing.setName,
      specialEdition(printing.edition),
      specialFinish(printing.finish),
    ]
      .filter(Boolean)
      .join(' · ') || 'One printing'
  );
}

/**
 * The confirmation before a wish is removed: "Your wish for Mirrorblade Knight (any printing)
 * will be removed. You can add the card again later." It names the card and which copy (two
 * wishes of one card differ only by it).
 */
export function removeConfirmation(
  wish: Pick<WishlistItemResponse, 'card' | 'printing' | 'rarity'>,
): string {
  const name = wish.card?.name ?? 'this card';
  const copy = wish.printing
    ? whichCopyLabel(wish.printing)
    : wish.rarity
      ? `any printing in ${wish.rarity}`
      : 'any printing';
  return `Your wish for ${name} (${copy}) will be removed. You can add the card again later.`;
}

/** The edition of a printing when it is not the usual Unlimited one ("1st Edition"), else `null`. */
export function specialEdition(edition: string | null | undefined): string | null {
  return edition && edition !== 'UNLIMITED' ? editionLabel(edition) : null;
}

/** The finish of a printing when it is not the normal one ("Reverse holo"), else `null`. */
export function specialFinish(finish: string | null | undefined): string | null {
  return finish && finish !== 'NORMAL' ? finishLabel(finish) : null;
}

/**
 * Query parameters of the card page for a wish's selection: `?printing=<id>`, `?rarity=<rarity>`
 * or `?printing=any` (said explicitly, so the page never shows a printing nobody chose).
 */
export function wishCardQuery(
  wish: Pick<WishlistItemResponse, 'printing' | 'rarity'>,
): Record<string, string> {
  return selectionQuery({ printingId: wish.printing?.id ?? null, rarity: wish.rarity ?? null });
}
