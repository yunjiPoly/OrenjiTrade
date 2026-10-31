import { formatPrice } from '../../../shared/inventory/inventory-labels';

/**
 * A card's asking price on the web (web redesign decision 8: the phone's card model). The phone's
 * rules (`apps/mobile/src/features/inventory/itemPrice.ts`) ported as they are: the price is typed
 * as an amount in dollars ("$") or a percent of the TCGplayer market price ("% TCG") and saved as
 * one text ("$12.50", "85% TCG"); a card priced on the old web form shows its amount ("$42.00").
 */

/** The two ways a price is typed. */
export type PriceMode = 'usd' | 'pct';

/** The longest asking price text the API keeps. */
export const ASKING_PRICE_MAX = 40;

const USD_MAX_CENTS = 9_999_999;
export const PRICE_USD_MAX = USD_MAX_CENTS / 100;
export const PRICE_PCT_MIN = 1;
export const PRICE_PCT_MAX = 200;

/** The phone's words for the price (mockup v50, screens 6 and 7). */
export const PRICE_COPY = {
  modes: {
    usd: { label: '$', spoken: 'Dollars' },
    pct: { label: '% TCG', spoken: 'Percent of the TCGplayer price' },
  },
  inputLabel: {
    usd: 'Asking price in dollars',
    pct: 'Asking price in percent of the TCGplayer price',
  },
  placeholder: { usd: '12.50', pct: '85' },
  hint: {
    usd: 'Leave it empty to agree on a price in the chat.',
    pct: 'Percent of the TCGplayer market price.',
  },
  was: (text: string) => `Was: ${text}`,
  usdFormat: 'Enter an amount like 12.50.',
  usdDecimals: 'Use at most 2 decimals, like 12.50.',
  usdZero: 'Enter more than $0, or leave it empty.',
  usdMax: 'At most $99,999.99.',
  pctFormat: 'Enter a whole number, like 85.',
  pctRange: 'Enter a percent from 1 to 200.',
} as const;

/** The price a card shows: its text as typed, else its old amount, else null. */
export function itemPriceText(item: {
  askingPriceText?: string | null;
  askingPrice?: number | null;
  currency?: string | null;
}): string | null {
  const text = item.askingPriceText?.trim();
  if (text) {
    return text;
  }
  return formatPrice(item.askingPrice ?? null, item.currency || 'CAD');
}

/** What the number box keeps of a typed or pasted text. */
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
    return { kind: 'error', message: PRICE_COPY.usdFormat };
  }
  if (decimals.length > 2) {
    return { kind: 'error', message: PRICE_COPY.usdDecimals };
  }
  const digits = whole.replace(/^0+/, '');
  if (digits.length > 5) {
    return { kind: 'error', message: PRICE_COPY.usdMax };
  }
  const cents = Number(digits || '0') * 100 + Number(decimals.padEnd(2, '0'));
  if (cents <= 0) {
    return { kind: 'error', message: PRICE_COPY.usdZero };
  }
  if (cents > USD_MAX_CENTS) {
    return { kind: 'error', message: PRICE_COPY.usdMax };
  }
  const number = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
  return { kind: 'ok', text: `$${number}`, number };
}

function checkPercent(typed: string): PriceCheck {
  if (!/^\d+$/.test(typed)) {
    return { kind: 'error', message: PRICE_COPY.pctFormat };
  }
  const digits = typed.replace(/^0+/, '');
  const percent = digits.length > 3 ? Number.POSITIVE_INFINITY : Number(digits || '0');
  if (percent < PRICE_PCT_MIN || percent > PRICE_PCT_MAX) {
    return { kind: 'error', message: PRICE_COPY.pctRange };
  }
  return { kind: 'ok', text: `${percent}% TCG`, number: String(percent) };
}

/**
 * Checks the number typed in a mode: empty is no price; "$" takes more than 0, at most 2 decimals
 * and at most 99999.99; "% TCG" a whole number from 1 to 200.
 */
export function checkPrice(mode: PriceMode, typed: string): PriceCheck {
  const trimmed = typed.trim();
  if (!trimmed) {
    return { kind: 'empty' };
  }
  return mode === 'pct' ? checkPercent(trimmed) : checkDollars(trimmed);
}

/** The text a card saves for a typed price; null when empty or wrong. */
export function askingPriceTextOf(mode: PriceMode, typed: string): string | null {
  const check = checkPrice(mode, typed);
  return check.kind === 'ok' ? check.text : null;
}

/** A saved price as the price field shows it. */
export interface PriceFieldValue {
  /** The mode it reads in; null when the card has no price. */
  mode: PriceMode | null;
  /** The number in the box ("12.50", "85"). */
  number: string;
  /** A saved text neither mode can show ("Trade only"): shown as "Was: {text}". */
  was: string | null;
}

const SPACES = '[\\s\\u00A0\\u202F]*';
const AMOUNT = '(\\d{1,10})(?:[.,](\\d{1,2}))?';
const DOLLARS_SIGN_FIRST = new RegExp(`^\\$${SPACES}${AMOUNT}$`);
const DOLLARS_SIGN_AFTER = new RegExp(`^${AMOUNT}${SPACES}\\$?$`);
const PERCENT_TCG = /^(\d{1,3})\s*%\s*(?:tcg)?$/i;

/** Reads a card's saved price back into the price field (the phone's `readAskingPrice`). */
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

const PRICE_MODE_KEY = 'orenji.inventory.priceMode';

/** The price mode used last in this browser ("$" the first time); storage may be unavailable. */
export function lastPriceMode(): PriceMode {
  try {
    return globalThis.localStorage?.getItem(PRICE_MODE_KEY) === 'pct' ? 'pct' : 'usd';
  } catch {
    return 'usd';
  }
}

export function rememberPriceMode(mode: PriceMode): void {
  try {
    globalThis.localStorage?.setItem(PRICE_MODE_KEY, mode);
  } catch {
    // Private windows and blocked storage: the mode is simply not remembered.
  }
}
