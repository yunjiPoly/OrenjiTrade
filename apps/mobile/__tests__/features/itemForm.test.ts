import { ApiError } from '@/src/api/ApiError';
import {
  hasErrors,
  itemFormValue,
  KEEP_END,
  newItemDefaults,
  parsePrice,
  parseQuantity,
  serverItemErrors,
  toCreateRequest,
  toUpdateRequest,
  validateItemForm,
  withCurrent,
} from '@/src/features/inventory/itemForm';
import {
  binderVisibilityStatus,
  itemVisibilityStatus,
  ownerIsVisible,
} from '@/src/features/inventory/visibilityStatus';

import {
  binderFixture,
  itemFixture,
  POKEMON_SCHEMA,
  printingFixture,
  privacyFixture,
} from '../support/fixtures';

const NOW = Date.parse('2026-10-05T12:00:00Z');

describe('item form', () => {
  it('starts a new item from the printing: Near Mint, private, trade or sale', () => {
    const value = newItemDefaults(printingFixture({ language: 'fr' }), POKEMON_SCHEMA, 'b-1');
    expect(value).toMatchObject({
      quantity: '1',
      condition: 'NEAR_MINT',
      language: 'fr',
      edition: 'UNLIMITED',
      finish: 'HOLO',
      askingPrice: '',
      currency: 'CAD',
      availability: 'TRADE_OR_SALE',
      acceptsOffers: false,
      visibility: 'PRIVATE',
      binderId: 'b-1',
    });
    expect(
      newItemDefaults(null, { ...POKEMON_SCHEMA, conditions: ['LIGHTLY_PLAYED'] }, null).condition
    ).toBe('LIGHTLY_PLAYED');
    expect(newItemDefaults(null, null, null)).toMatchObject({
      condition: 'NEAR_MINT',
      language: 'en',
    });
  });

  it('parses quantities and prices as typed', () => {
    expect(parseQuantity('3')).toBe(3);
    expect(Number.isNaN(parseQuantity('2.5'))).toBe(true);
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('12,50')).toBe(12.5);
    expect(Number.isNaN(parsePrice('abc') as number)).toBe(true);
  });

  it('validates like the API', () => {
    const base = newItemDefaults(printingFixture(), POKEMON_SCHEMA, null);
    expect(hasErrors(validateItemForm(base))).toBe(false);
    expect(validateItemForm({ ...base, quantity: '' }).quantity).toBe(
      'Enter how many copies you have.'
    );
    expect(validateItemForm({ ...base, quantity: '0' }).quantity).toBe('At least 1 copy.');
    expect(validateItemForm({ ...base, quantity: '10000' }).quantity).toBe('At most 9999 copies.');
    expect(validateItemForm({ ...base, quantity: '1.5' }).quantity).toBe('Enter a whole number.');
    expect(validateItemForm({ ...base, askingPrice: '1.234' }).askingPrice).toBe(
      'Use at most two decimals.'
    );
    expect(validateItemForm({ ...base, askingPrice: '-3' }).askingPrice).toBe(
      'Enter a valid price.'
    );
    expect(validateItemForm({ ...base, currency: 'ca' }).currency).toMatch(/three-letter/);
    expect(validateItemForm({ ...base, condition: '' }).condition).toBe('Choose a condition.');
    expect(validateItemForm({ ...base, notes: 'x'.repeat(2001) }).notes).toMatch(/2000/);
    expect(validateItemForm({ ...base, publicNotes: 'x'.repeat(501) }).publicNotes).toMatch(/500/);
  });

  it('builds the POST body, leaving empty values out', () => {
    const value = {
      ...newItemDefaults(printingFixture(), POKEMON_SCHEMA, 'b-1'),
      quantity: '3',
      askingPrice: '12.5',
      notes: '  mine ',
      publicNotes: '',
      visibility: 'TEMPORARILY_PUBLIC' as const,
      duration: '1h' as const,
    };
    expect(toCreateRequest(value, 'p-1', NOW)).toEqual({
      printingId: 'p-1',
      quantity: 3,
      condition: 'NEAR_MINT',
      language: 'en',
      edition: 'UNLIMITED',
      finish: 'HOLO',
      askingPrice: 12.5,
      currency: 'CAD',
      availability: 'TRADE_OR_SALE',
      acceptsOffers: false,
      notes: 'mine',
      visibility: 'TEMPORARILY_PUBLIC',
      publicUntil: '2026-10-05T13:00:00.000Z',
      binderId: 'b-1',
    });
    const minimal = toCreateRequest(
      { ...newItemDefaults(null, null, null), edition: '', finish: '' },
      'p-2',
      NOW
    );
    expect(minimal).not.toHaveProperty('askingPrice');
    expect(minimal).not.toHaveProperty('binderId');
    expect(minimal).not.toHaveProperty('edition');
    expect(minimal).not.toHaveProperty('publicUntil');
  });

  it('patches only what changed (null clears)', () => {
    const item = itemFixture();
    const value = itemFormValue(item, NOW);
    expect(toUpdateRequest(value, item, NOW)).toBeNull();
    expect(
      toUpdateRequest(
        { ...value, quantity: '5', askingPrice: '', publicNotes: ' ', acceptsOffers: false },
        item,
        NOW
      )
    ).toEqual({ quantity: 5, askingPrice: null, publicNotes: null, acceptsOffers: false });
    expect(toUpdateRequest({ ...value, binderId: 'b-2', condition: 'DAMAGED' }, item, NOW)).toEqual(
      {
        condition: 'DAMAGED',
        binderId: 'b-2',
      }
    );
    expect(toUpdateRequest({ ...value, visibility: 'PUBLIC' }, item, NOW)).toEqual({
      visibility: 'PUBLIC',
      publicUntil: null,
    });
  });

  it('keeps a running temporary publication end unless a new one is chosen', () => {
    const item = itemFixture({
      visibility: 'TEMPORARILY_PUBLIC',
      publicUntil: '2026-10-06T12:00:00Z',
    });
    const value = itemFormValue(item, NOW);
    expect(value.duration).toBe(KEEP_END);
    expect(toUpdateRequest({ ...value, quantity: '3' }, item, NOW)).toEqual({ quantity: 3 });
    expect(toUpdateRequest({ ...value, duration: '7d' }, item, NOW)).toEqual({
      visibility: 'TEMPORARILY_PUBLIC',
      publicUntil: '2026-10-12T12:00:00.000Z',
    });
    const ended = itemFixture({
      visibility: 'TEMPORARILY_PUBLIC',
      publicUntil: '2026-10-01T00:00:00Z',
    });
    expect(itemFormValue(ended, NOW).duration).toBe('24h');
  });

  it('maps server field errors and keeps unknown current values selectable', () => {
    const error = ApiError.fromProblem(400, {
      status: 400,
      errorCode: 'VALIDATION_FAILED',
      message: 'Invalid',
      errors: [
        { field: 'quantity', message: 'must be at most 9999' },
        { field: 'printingId', message: 'unknown' },
      ],
    });
    expect(serverItemErrors(error)).toEqual({ quantity: 'must be at most 9999' });
    expect(withCurrent(['en', 'fr'], 'ja')).toEqual(['en', 'fr', 'ja']);
    expect(withCurrent(undefined, '')).toEqual([]);
  });
});

describe('visibility status', () => {
  it('explains items', () => {
    expect(itemVisibilityStatus(itemFixture()).note).toBe('Only you can see this card.');
    const visible = itemVisibilityStatus(
      itemFixture({ visibility: 'PUBLIC', effectivePublic: true })
    );
    expect(visible).toMatchObject({ pending: false, label: 'Public' });
    const hidden = itemVisibilityStatus(
      itemFixture({
        visibility: 'PUBLIC',
        freshness: { ...itemFixture().freshness, state: 'HIDDEN' },
      })
    );
    expect(hidden).toMatchObject({
      pending: true,
      label: 'Public · not visible',
      note: 'Hidden until you confirm it is still available.',
    });
    expect(
      itemVisibilityStatus(itemFixture({ visibility: 'PUBLIC', binder: { id: 'b', name: 'T' } }), {
        binder: binderFixture({ name: 'T' }),
      }).note
    ).toBe('Its binder “T” is private. Publish the binder to show it.');
    expect(
      itemVisibilityStatus(itemFixture({ visibility: 'PUBLIC' }), { ownerVisible: false }).note
    ).toMatch(/hidden from the map/);
    expect(
      itemVisibilityStatus(
        itemFixture({ visibility: 'TEMPORARILY_PUBLIC', publicUntil: '2026-10-01T00:00:00Z' }),
        { now: NOW }
      ).note
    ).toBe('The temporary publication has ended.');
    expect(
      itemVisibilityStatus(
        itemFixture({
          visibility: 'TEMPORARILY_PUBLIC',
          publicUntil: '2026-10-05T15:00:00Z',
          effectivePublic: true,
        }),
        { now: NOW }
      ).label
    ).toBe('Public · ends in 3 hours');
  });

  it('explains binders and the owner', () => {
    expect(binderVisibilityStatus(binderFixture()).label).toBe('Private');
    expect(
      binderVisibilityStatus(binderFixture({ visibility: 'PUBLIC', effectivePublic: true })).note
    ).toBe('Collectors can open this binder and see its public cards.');
    expect(
      binderVisibilityStatus(binderFixture({ visibility: 'PUBLIC' }), { ownerVisible: false }).note
    ).toMatch(/hidden from the map/);
    expect(ownerIsVisible(null)).toBeNull();
    expect(ownerIsVisible(privacyFixture({ discoverable: true }))).toBe(true);
    expect(ownerIsVisible(privacyFixture({ discoverable: false }))).toBe(false);
    expect(
      ownerIsVisible(privacyFixture({ profileVisibility: 'PRIVATE', discoverable: true }))
    ).toBe(false);
  });
});
