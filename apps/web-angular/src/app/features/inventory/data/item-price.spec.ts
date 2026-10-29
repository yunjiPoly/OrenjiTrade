import {
  askingPriceTextOf,
  checkPrice,
  itemPriceText,
  priceInputOf,
  readAskingPrice,
} from './item-price';

describe('asking price (decision 8: the phone\'s "$ | % TCG")', () => {
  it('saves one text per price', () => {
    expect(askingPriceTextOf('usd', '12.5')).toBe('$12.50');
    expect(askingPriceTextOf('usd', '12,50')).toBe('$12.50');
    expect(askingPriceTextOf('pct', '085')).toBe('85% TCG');
    expect(askingPriceTextOf('usd', '')).toBeNull();
  });

  it('refuses what the API would refuse, in plain words', () => {
    expect(checkPrice('usd', '0')).toEqual({
      kind: 'error',
      message: 'Enter more than $0, or leave it empty.',
    });
    expect(checkPrice('usd', '1.234')).toEqual({
      kind: 'error',
      message: 'Use at most 2 decimals, like 12.50.',
    });
    expect(checkPrice('usd', '100000')).toEqual({ kind: 'error', message: 'At most $99,999.99.' });
    expect(checkPrice('pct', '201')).toEqual({
      kind: 'error',
      message: 'Enter a percent from 1 to 200.',
    });
    expect(checkPrice('pct', '')).toEqual({ kind: 'empty' });
  });

  it('keeps digits only in the box', () => {
    expect(priceInputOf('pct', '85%')).toBe('85');
    expect(priceInputOf('usd', '$12.50')).toBe('12.50');
  });

  it('reads a saved price back, an old web amount too, and keeps any other text as "Was"', () => {
    expect(readAskingPrice({ askingPriceText: '85% TCG' })).toEqual({
      mode: 'pct',
      number: '85',
      was: null,
    });
    expect(readAskingPrice({ askingPriceText: '$12' })).toEqual({
      mode: 'usd',
      number: '12.00',
      was: null,
    });
    expect(readAskingPrice({ askingPriceText: '$25 or trade' })).toEqual({
      mode: 'usd',
      number: '',
      was: '$25 or trade',
    });
    expect(readAskingPrice({ askingPrice: 42, currency: 'CAD' })).toEqual({
      mode: 'usd',
      number: '42.00',
      was: null,
    });
    expect(readAskingPrice({ askingPrice: 42, currency: 'EUR' }).was).toContain('42.00');
    expect(readAskingPrice({})).toEqual({ mode: null, number: '', was: null });
  });

  it('shows the text as typed, else the old amount, else nothing', () => {
    expect(itemPriceText({ askingPriceText: ' 85% TCG ' })).toBe('85% TCG');
    expect(itemPriceText({ askingPrice: 11.5, currency: 'CAD' })).toBe('$11.50');
    expect(itemPriceText({})).toBeNull();
  });
});
