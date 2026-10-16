import { formatMoney } from '@/src/lib/catalog';

/**
 * How the phone shows a card's asking price (owner spec 2026-10-14, sections 6 and 12): the text
 * exactly as the owner typed it ("85% TCG", "$12.50"); for a card priced before stage R2 (or on the
 * paused web), its amount in its currency ("$42.00"); nothing when there is no price.
 */
export function itemPriceText(item: {
  askingPriceText?: string | null;
  askingPrice?: number | null;
  currency?: string | null;
}): string | null {
  const text = item.askingPriceText?.trim();
  if (text) {
    return text;
  }
  return formatMoney(item.askingPrice ?? null, item.currency ?? 'CAD');
}

/**
 * The condition a card states, or null when its owner stated none (cards added on the phone since
 * stage R2: the API sends `conditionStated: false` and an empty `condition`).
 */
export function statedCondition(item: {
  condition?: string | null;
  conditionStated?: boolean | null;
}): string | null {
  if (item.conditionStated === false) {
    return null;
  }
  const condition = item.condition?.trim();
  return condition ? condition : null;
}

/** The longest asking price text (the API trims it and refuses more). */
export const ASKING_PRICE_MAX = 40;

/** What the form sends: the trimmed text, or null for no price. */
export function priceTextOf(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** The form's starting text for a card: its text, or its amount written plainly ("42.00"). */
export function priceFieldText(item: {
  askingPriceText?: string | null;
  askingPrice?: number | null;
}): string {
  const text = item.askingPriceText?.trim();
  if (text) {
    return text;
  }
  if (item.askingPrice === null || item.askingPrice === undefined) {
    return '';
  }
  return item.askingPrice.toFixed(2);
}
