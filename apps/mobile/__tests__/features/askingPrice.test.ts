import {
  cardFormOf,
  formChanged,
  newCardForm,
  switchPriceMode,
  toCreateBody,
  toPatch,
  typePrice,
  validateCardForm,
  type CardFormValue,
} from '@/src/features/inventory/cardForm';
import {
  askingPriceTextOf,
  checkPrice,
  priceInputOf,
  PRICE_PCT_MAX,
  PRICE_PCT_MIN,
  PRICE_USD_MAX,
  readAskingPrice,
} from '@/src/features/inventory/itemPrice';
import {
  itemVisibilityTag,
  mixColors,
  visibilityTagColors,
} from '@/src/features/inventory/visibilityTag';
import { darkPalette, lightPalette } from '@/src/theme';

import { itemFixture } from '../support/fixtures';

const NOW = Date.parse('2026-10-16T12:00:00Z');

/** WCAG relative luminance of a `#RRGGBB` colour. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe('the asking price in "$" or "% TCG" (owner change of 2026-10-16)', () => {
  it('writes one text from the mode and the number: "$12.50" or "85% TCG"', () => {
    expect(askingPriceTextOf('usd', '12.50')).toBe('$12.50');
    expect(askingPriceTextOf('usd', '12.5')).toBe('$12.50');
    expect(askingPriceTextOf('usd', '12')).toBe('$12.00');
    expect(askingPriceTextOf('usd', ' 3 ')).toBe('$3.00');
    expect(askingPriceTextOf('usd', '.5')).toBe('$0.50');
    expect(askingPriceTextOf('usd', '12.')).toBe('$12.00');
    expect(askingPriceTextOf('usd', '007.10')).toBe('$7.10');
    // No thousands separator: the API reads "$1250.00" as an amount, "$1,250.00" as text only.
    expect(askingPriceTextOf('usd', '1250')).toBe('$1250.00');
    expect(askingPriceTextOf('pct', '85')).toBe('85% TCG');
    expect(askingPriceTextOf('pct', '085')).toBe('85% TCG');
    expect(askingPriceTextOf('pct', '200')).toBe('200% TCG');
  });

  it('takes a comma as the decimal point', () => {
    expect(askingPriceTextOf('usd', '12,50')).toBe('$12.50');
    expect(askingPriceTextOf('usd', '0,99')).toBe('$0.99');
    expect(checkPrice('usd', '1,250.00')).toEqual({
      kind: 'error',
      message: 'Enter an amount like 12.50.',
    });
  });

  it('means no price when empty, in both modes', () => {
    expect(checkPrice('usd', '')).toEqual({ kind: 'empty' });
    expect(checkPrice('usd', '   ')).toEqual({ kind: 'empty' });
    expect(checkPrice('pct', '')).toEqual({ kind: 'empty' });
    expect(askingPriceTextOf('usd', '')).toBeNull();
    expect(askingPriceTextOf('pct', '')).toBeNull();
  });

  it('keeps "$" above 0, at most 2 decimals and at most 99999.99', () => {
    expect(PRICE_USD_MAX).toBe(99999.99);
    expect(checkPrice('usd', '99999.99')).toMatchObject({ kind: 'ok', text: '$99999.99' });
    expect(checkPrice('usd', '0.01')).toMatchObject({ kind: 'ok', text: '$0.01' });
    expect(checkPrice('usd', '100000')).toEqual({ kind: 'error', message: 'At most $99,999.99.' });
    expect(checkPrice('usd', '99999.991')).toEqual({
      kind: 'error',
      message: 'Use at most 2 decimals, like 12.50.',
    });
    expect(checkPrice('usd', '123456789012345678')).toEqual({
      kind: 'error',
      message: 'At most $99,999.99.',
    });
    for (const zero of ['0', '0.00', '00', ',0', '0,']) {
      expect(checkPrice('usd', zero)).toEqual({
        kind: 'error',
        message: 'Enter more than $0, or leave it empty.',
      });
    }
    expect(checkPrice('usd', '12.505')).toEqual({
      kind: 'error',
      message: 'Use at most 2 decimals, like 12.50.',
    });
    for (const wrong of ['.', ',', '1.2.3', '12$', 'abc', '1 2']) {
      expect(checkPrice('usd', wrong)).toEqual({
        kind: 'error',
        message: 'Enter an amount like 12.50.',
      });
    }
  });

  it('keeps "% TCG" a whole number from 1 to 200', () => {
    expect([PRICE_PCT_MIN, PRICE_PCT_MAX]).toEqual([1, 200]);
    expect(checkPrice('pct', '1')).toMatchObject({ kind: 'ok', text: '1% TCG' });
    for (const out of ['0', '000', '201', '1000', '99999']) {
      expect(checkPrice('pct', out)).toEqual({
        kind: 'error',
        message: 'Enter a percent from 1 to 200.',
      });
    }
    for (const wrong of ['85.5', '85,5', '-5', '85%']) {
      expect(checkPrice('pct', wrong)).toEqual({
        kind: 'error',
        message: 'Enter a whole number, like 85.',
      });
    }
  });

  it('keeps of a typed or pasted text only what the mode can hold', () => {
    expect(priceInputOf('usd', '$12.50')).toBe('12.50');
    expect(priceInputOf('usd', '12,50 $')).toBe('12,50');
    expect(priceInputOf('usd', '1 250')).toBe('1250');
    expect(priceInputOf('pct', '85% TCG')).toBe('85');
    expect(priceInputOf('pct', '8.5')).toBe('85');
  });

  it.each([
    ['$12.50', '12.50'],
    ['12.50', '12.50'],
    ['12,50 $', '12.50'],
    ['12,50 $', '12.50'],
    ['$ 12.5', '12.50'],
    ['$12', '12.00'],
    ['  $99999.99 ', '99999.99'],
  ])('reads "%s" back as "$" with %s', (text, number) => {
    expect(readAskingPrice({ askingPriceText: text, askingPrice: Number(number) })).toEqual({
      mode: 'usd',
      number,
      was: null,
    });
  });

  it('reads an old amount without a text as "$", in dollars only', () => {
    expect(readAskingPrice({ askingPriceText: null, askingPrice: 12.5, currency: 'CAD' })).toEqual({
      mode: 'usd',
      number: '12.50',
      was: null,
    });
    expect(readAskingPrice({ askingPrice: 42, currency: 'USD' })).toEqual({
      mode: 'usd',
      number: '42.00',
      was: null,
    });
    // Another currency (set on the paused web) is kept as the Inventory shows it.
    expect(readAskingPrice({ askingPrice: 12.5, currency: 'EUR' })).toEqual({
      mode: 'usd',
      number: '',
      was: '€12.50',
    });
    // An amount today's limits refuse is kept too.
    expect(readAskingPrice({ askingPrice: 250000, currency: 'CAD' })).toEqual({
      mode: 'usd',
      number: '',
      was: '$250,000.00',
    });
  });

  it.each(['85% TCG', '85%', '85 % tcg', '85%TCG', ' 85 % TCG '])(
    'reads "%s" back as "%% TCG" with 85',
    (text) => {
      expect(readAskingPrice({ askingPriceText: text, askingPrice: null })).toEqual({
        mode: 'pct',
        number: '85',
        was: null,
      });
    }
  );

  it.each([
    'Trade only',
    'OBO',
    '$180 or Trade only',
    '250% TCG',
    '85.5% TCG',
    '$0',
    '$12.505',
    '1,200.00',
    '€12',
    '85% of TCG',
  ])('keeps any other old text ("%s") as "Was:", in "$" mode, empty', (text) => {
    expect(readAskingPrice({ askingPriceText: text, askingPrice: null })).toEqual({
      mode: 'usd',
      number: '',
      was: text,
    });
  });

  it('reads no price as no mode: the form takes the one used last', () => {
    expect(readAskingPrice({ askingPriceText: null, askingPrice: null })).toEqual({
      mode: null,
      number: '',
      was: null,
    });
    expect(readAskingPrice({ askingPriceText: '  ' })).toEqual({
      mode: null,
      number: '',
      was: null,
    });
  });
});

describe('the price in the card form (screens 6 and 7)', () => {
  const form = (patch: Partial<CardFormValue> = {}): CardFormValue => ({
    ...newCardForm(),
    ...patch,
  });

  it('starts a new card in the mode used last, "$" the first time', () => {
    expect(newCardForm().priceMode).toBe('usd');
    expect(newCardForm(null, 'pct')).toMatchObject({ priceMode: 'pct', price: '', priceWas: null });
  });

  it('clears the number on a switch, and keeps a "Was:" text nothing replaced', () => {
    expect(switchPriceMode(form({ price: '85', priceMode: 'pct' }), 'usd')).toEqual({
      priceMode: 'usd',
      price: '',
    });
    // The same mode again changes nothing.
    expect(switchPriceMode(form({ price: '12.50' }), 'usd')).toEqual({});
    const old = form({ priceWas: 'Trade only' });
    expect(switchPriceMode(old, 'pct')).toEqual({ priceMode: 'pct', price: '' });
  });

  it('replaces a "Was:" text once the box is typed in or cleared', () => {
    const old = form({ priceWas: 'Trade only' });
    expect(typePrice(old, '$12,50')).toEqual({ price: '12,50', priceWas: null });
    expect(typePrice(old, '')).toEqual({ price: '', priceWas: null });
    expect(typePrice(form({ priceMode: 'pct' }), '85%')).toEqual({ price: '85', priceWas: null });
  });

  it('shows a wrong price under the field and blocks the save, as other field errors', () => {
    expect(validateCardForm(form({ price: '0' })).price).toBe(
      'Enter more than $0, or leave it empty.'
    );
    expect(validateCardForm(form({ priceMode: 'pct', price: '250' })).price).toBe(
      'Enter a percent from 1 to 200.'
    );
    expect(validateCardForm(form({ price: '12,50' })).price).toBeUndefined();
    expect(validateCardForm(form({ price: '' })).price).toBeUndefined();
    // An old text kept as it is is never refused.
    expect(validateCardForm(form({ priceWas: 'Trade only' })).price).toBeUndefined();
  });

  it('adds a card with the price written one way', () => {
    expect(toCreateBody(form({ price: '12,5' }), 'p-1').askingPriceText).toBe('$12.50');
    expect(toCreateBody(form({ priceMode: 'pct', price: '85' }), 'p-1').askingPriceText).toBe(
      '85% TCG'
    );
    expect(toCreateBody(form({ priceMode: 'pct' }), 'p-1')).not.toHaveProperty('askingPriceText');
  });

  it('opens a card in the mode of its price, or the one used last when it has none', () => {
    const pct = itemFixture({ askingPriceText: '85% TCG', askingPrice: null });
    expect(cardFormOf(pct, NOW, 'usd')).toMatchObject({
      priceMode: 'pct',
      price: '85',
      priceWas: null,
    });
    const none = itemFixture({ askingPriceText: null, askingPrice: null });
    expect(cardFormOf(none, NOW, 'pct')).toMatchObject({ priceMode: 'pct', price: '' });
    expect(cardFormOf(none, NOW)).toMatchObject({ priceMode: 'usd', price: '' });
    const old = itemFixture({ askingPriceText: 'OBO', askingPrice: null });
    expect(cardFormOf(old, NOW, 'pct')).toMatchObject({
      priceMode: 'usd',
      price: '',
      priceWas: 'OBO',
    });
  });

  it('keeps an old text on a save that does not touch the price, and replaces it once typed', () => {
    const item = itemFixture({ askingPriceText: 'Trade only', askingPrice: null });
    const opened = cardFormOf(item, NOW);
    expect(formChanged(opened, item)).toBe(false);
    // A switch alone types nothing: the text stays.
    const switched = { ...opened, ...switchPriceMode(opened, 'pct') };
    expect(formChanged(switched, item)).toBe(false);
    expect(toPatch({ ...opened, quantity: '3' }, item)).toEqual({ quantity: 3, confirm: true });
    // Typed: the new price replaces it.
    const typed = { ...opened, ...typePrice(opened, '12.50') };
    expect(toPatch(typed, item)).toEqual({ askingPriceText: '$12.50', confirm: true });
    // Typed and cleared: no price any more.
    const cleared = { ...typed, ...typePrice(typed, '') };
    expect(toPatch(cleared, item)).toEqual({ askingPriceText: null, confirm: true });
  });

  it('leaves a price read back as it was saved until it changes', () => {
    // "$12" and "85%" read back as 12.00 and 85: unchanged, they stay as saved.
    for (const text of ['$12', '85%', '12,50 $']) {
      const item = itemFixture({ askingPriceText: text, askingPrice: null });
      expect(toPatch(cardFormOf(item, NOW), item)).toBeNull();
    }
    const item = itemFixture({ askingPriceText: '85% TCG', askingPrice: null });
    const opened = cardFormOf(item, NOW);
    // A switch clears the number: the card loses its price.
    const switched = { ...opened, ...switchPriceMode(opened, 'usd') };
    expect(toPatch(switched, item)).toEqual({ askingPriceText: null, confirm: true });
    // Switched back and typed again: the same price, nothing to save.
    const back = { ...switched, ...switchPriceMode(switched, 'pct') };
    expect(toPatch({ ...back, ...typePrice(back, '85') }, item)).toBeNull();
    expect(toPatch({ ...back, ...typePrice(back, '90') }, item)).toEqual({
      askingPriceText: '90% TCG',
      confirm: true,
    });
    // A wrong number is a change ("Save changes" turns on, then shows the error).
    expect(formChanged({ ...back, ...typePrice(back, '500') }, item)).toBe(true);
  });

  it('leaves a card without a price alone when the mode alone changes', () => {
    const item = itemFixture({ askingPriceText: null, askingPrice: null });
    const opened = cardFormOf(item, NOW, 'pct');
    expect(formChanged({ ...opened, ...switchPriceMode(opened, 'usd') }, item)).toBe(false);
  });
});

describe('the Public or Private tag of an Inventory row', () => {
  it('says Private, Public, or why a public card is not visible yet', () => {
    expect(itemVisibilityTag(itemFixture({ visibility: 'PRIVATE' }), NOW)).toEqual({
      kind: 'private',
      label: 'Private',
      spoken: 'Private',
      icon: 'lock-outline',
    });
    expect(
      itemVisibilityTag(itemFixture({ visibility: 'PUBLIC', effectivePublic: true }), NOW)
    ).toEqual({ kind: 'public', label: 'Public', spoken: 'Public', icon: 'earth' });
    // Set to Public, but nobody can see it (a profile that is not discoverable, for example).
    expect(
      itemVisibilityTag(itemFixture({ visibility: 'PUBLIC', effectivePublic: false }), NOW)
    ).toEqual({
      kind: 'pending',
      label: 'Public · not visible',
      spoken: 'Public, not visible',
      icon: 'eye-off-outline',
    });
    // A temporary publication (set on the paused web) that ended is not visible either.
    expect(
      itemVisibilityTag(
        itemFixture({
          visibility: 'TEMPORARILY_PUBLIC',
          publicUntil: '2026-10-15T12:00:00Z',
          effectivePublic: false,
        }),
        NOW
      )
    ).toMatchObject({ kind: 'pending', label: 'Public · ended 1 day ago · not visible' });
  });

  it('mixes a faint fill as one solid colour', () => {
    expect(mixColors('#2DD4BF', '#1E1B18', 0.14)).toBe('#20352F');
    expect(mixColors('#FFFFFF', '#000000', 0)).toBe('#000000');
    expect(mixColors('#fff', '#000000', 1)).toBe('#FFFFFF');
  });

  it.each([
    ['dark', darkPalette],
    ['light', lightPalette],
  ] as const)('keeps every tag readable in the %s theme (4.5 : 1 for small text)', (_, palette) => {
    for (const kind of ['private', 'public', 'pending'] as const) {
      const { background, color } = visibilityTagColors(kind, palette);
      expect(contrast(color, background)).toBeGreaterThanOrEqual(4.5);
    }
    // Public in the teal of "Select"; Private on the raised surface.
    expect(visibilityTagColors('public', palette).color).toBe(palette.accent);
    expect(visibilityTagColors('private', palette)).toEqual({
      background: palette.surfaceVariant,
      color: palette.textMuted,
    });
  });

  it('draws the mockup’s faint teal in the dark theme', () => {
    expect(visibilityTagColors('public', darkPalette).background).toBe(
      mixColors('#2DD4BF', darkPalette.surface, 0.14)
    );
    expect(visibilityTagColors('pending', darkPalette).color).toBe(darkPalette.warning);
  });
});
