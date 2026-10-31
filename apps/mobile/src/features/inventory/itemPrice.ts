import { formatMoney } from '@/src/lib/catalog';

import { CARD_FORM_COPY } from './inventoryCopy';

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

/**
 * The longest asking price text (the API trims it and refuses more). The card form writes far
 * shorter texts since the owner's change of 2026-10-16; the deck cores keep their free text.
 */
export const ASKING_PRICE_MAX = 40;

/**
 * The two ways a card's asking price is typed on the phone (owner change of 2026-10-16, mockup
 * v43, screens 6 and 7): an amount in dollars ("$") or a percent of the TCGplayer market price
 * ("% TCG").
 */
export type PriceMode = 'usd' | 'pct';

/** The highest amount in dollars, in cents (99999.99: five digits before the point). */
const USD_MAX_CENTS = 9_999_999;
export const PRICE_USD_MAX = USD_MAX_CENTS / 100;
/** The percents of the TCGplayer price a card may ask, whole numbers only. */
export const PRICE_PCT_MIN = 1;
export const PRICE_PCT_MAX = 200;

/**
 * What the number box keeps of a typed or pasted text: digits and the decimal point or comma in
 * "$" mode, digits only in "% TCG" mode (a pasted "$12.50" or "85%" keeps its number).
 */
export function priceInputOf(mode: PriceMode, text: string): string {
  return text.replace(mode === 'pct' ? /[^0-9]/g : /[^0-9.,]/g, '');
}

/** A typed price: none, the text a card saves, or why it is wrong. */
export type PriceCheck =
  | { kind: 'empty' }
  | { kind: 'ok'; text: string; number: string }
  | { kind: 'error'; message: string };

const DOLLARS = /^(\d*)(?:[.,](\d*))?$/;

function checkDollars(typed: string): PriceCheck {
  const match = DOLLARS.exec(typed);
  const whole = match?.[1] ?? '';
  const decimals = match?.[2] ?? '';
  if (!match || whole.length + decimals.length === 0) {
    return { kind: 'error', message: CARD_FORM_COPY.priceUsdFormat };
  }
  if (decimals.length > 2) {
    return { kind: 'error', message: CARD_FORM_COPY.priceUsdDecimals };
  }
  // In cents, so that 12.5 and 0.1 + 0.2 stay exact. Leading zeros do not count.
  const digits = whole.replace(/^0+/, '');
  if (digits.length > 5) {
    return { kind: 'error', message: CARD_FORM_COPY.priceUsdMax };
  }
  const cents = Number(digits || '0') * 100 + Number(decimals.padEnd(2, '0'));
  if (cents <= 0) {
    return { kind: 'error', message: CARD_FORM_COPY.priceUsdZero };
  }
  if (cents > USD_MAX_CENTS) {
    return { kind: 'error', message: CARD_FORM_COPY.priceUsdMax };
  }
  const number = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
  // No thousands separator: the API reads "$1250.00" as an amount, "$1,250.00" as text only.
  return { kind: 'ok', text: `$${number}`, number };
}

function checkPercent(typed: string): PriceCheck {
  if (!/^\d+$/.test(typed)) {
    return { kind: 'error', message: CARD_FORM_COPY.pricePctFormat };
  }
  const digits = typed.replace(/^0+/, '');
  const percent = digits.length > 3 ? Number.POSITIVE_INFINITY : Number(digits || '0');
  if (percent < PRICE_PCT_MIN || percent > PRICE_PCT_MAX) {
    return { kind: 'error', message: CARD_FORM_COPY.pricePctRange };
  }
  return { kind: 'ok', text: `${percent}% TCG`, number: String(percent) };
}

/**
 * Checks the number typed in a mode (spaces around it do not count): empty means no price in both
 * modes; "$" takes more than 0, at most 2 decimals and at most 99999.99, with a point or a comma
 * as the decimal point; "% TCG" takes a whole number from 1 to 200. A correct one gives the one
 * text a card saves: "$12.50" (always two decimals) or "85% TCG".
 */
export function checkPrice(mode: PriceMode, typed: string): PriceCheck {
  const trimmed = typed.trim();
  if (!trimmed) {
    return { kind: 'empty' };
  }
  return mode === 'pct' ? checkPercent(trimmed) : checkDollars(trimmed);
}

/** The text a card saves for a typed price ("$12.50", "85% TCG"); null when empty or wrong. */
export function askingPriceTextOf(mode: PriceMode, typed: string): string | null {
  const check = checkPrice(mode, typed);
  return check.kind === 'ok' ? check.text : null;
}

/** A saved price as the card form shows it. */
export interface PriceFieldValue {
  /** The mode it reads in; null when the card has no price (the form takes the one used last). */
  mode: PriceMode | null;
  /** The number in the box ("12.50", "85"); empty when there is none. */
  number: string;
  /**
   * A saved text neither mode can show ("Trade only", "OBO"): the form shows "Was: {text}" and
   * keeps it until a price is typed or the field is cleared. Null otherwise.
   */
  was: string | null;
}

// The plain amounts the API reads into `asking_price` (common/AskingPriceText): a dollar sign
// before or after the number, spaces (a no-break one too) between them, a point or a comma.
const SPACES = '[\\s\\u00A0\\u202F]*';
const AMOUNT = '(\\d{1,10})(?:[.,](\\d{1,2}))?';
const DOLLARS_SIGN_FIRST = new RegExp(`^\\$${SPACES}${AMOUNT}$`);
const DOLLARS_SIGN_AFTER = new RegExp(`^${AMOUNT}${SPACES}\\$?$`);
const PERCENT_TCG = /^(\d{1,3})\s*%\s*(?:tcg)?$/i;

/**
 * Reads a card's saved price back into the form (Edit card, screen 7): "$12.50", "12.50", "12,50 $"
 * or an old amount without a text read as "$" with 12.50; "85% TCG", "85%" or "85 % tcg" as
 * "% TCG" with 85; any other text ("Trade only", "OBO"), or a number outside today's limits, as
 * "$", empty, with the old text kept (`was`). An old amount in another currency than dollars is
 * kept the same way, as the Inventory shows it ("€12.50").
 */
export function readAskingPrice(item: {
  askingPriceText?: string | null;
  askingPrice?: number | null;
  currency?: string | null;
}): PriceFieldValue {
  const text = item.askingPriceText?.trim();
  if (text) {
    const dollars = DOLLARS_SIGN_FIRST.exec(text) ?? DOLLARS_SIGN_AFTER.exec(text);
    if (dollars) {
      const check = checkPrice('usd', `${dollars[1]}.${dollars[2] ?? ''}`);
      if (check.kind === 'ok') {
        return { mode: 'usd', number: check.number, was: null };
      }
    }
    const percent = PERCENT_TCG.exec(text);
    if (percent?.[1]) {
      const check = checkPrice('pct', percent[1]);
      if (check.kind === 'ok') {
        return { mode: 'pct', number: check.number, was: null };
      }
    }
    return { mode: 'usd', number: '', was: text };
  }
  const amount = item.askingPrice;
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return { mode: null, number: '', was: null };
  }
  const currency = (item.currency || 'CAD').toUpperCase();
  const check = checkPrice('usd', amount.toFixed(2));
  if ((currency === 'CAD' || currency === 'USD') && check.kind === 'ok') {
    return { mode: 'usd', number: check.number, was: null };
  }
  return { mode: 'usd', number: '', was: itemPriceText(item) };
}
