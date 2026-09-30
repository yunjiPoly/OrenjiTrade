import type { GameSchema, InventoryItemResponse } from '@orenji/api-client';
import {
  KEEP_END,
  createItemForm,
  itemFieldError,
  itemFormValue,
  newItemDefaults,
  toCreateRequest,
  toUpdateRequest,
} from './item-form';

const NOW = Date.parse('2026-09-29T12:00:00Z');

const schema: GameSchema = {
  conditions: ['MINT', 'NEAR_MINT', 'LIGHTLY_PLAYED'],
  editions: ['FIRST_EDITION', 'UNLIMITED'],
  languages: ['en', 'fr'],
  finishes: ['NORMAL'],
  rarities: [],
  metadataFields: [],
  summaryFields: [],
};

function item(overrides: Partial<InventoryItemResponse> = {}): InventoryItemResponse {
  return {
    id: 'i1',
    printing: { id: 'p1', printingCode: 'AZR-EN001' },
    card: { id: 'c1', name: 'Azure-Eyes Sky Dragon', game: 'yugioh' },
    quantity: 1,
    condition: 'NEAR_MINT',
    language: 'en',
    edition: 'FIRST_EDITION',
    finish: 'NORMAL',
    askingPrice: 45,
    currency: 'CAD',
    availability: 'TRADE_OR_SALE' as InventoryItemResponse['availability'],
    acceptsOffers: true,
    notes: 'Pulled at locals.',
    publicNotes: 'Sleeved.',
    visibility: 'PRIVATE' as InventoryItemResponse['visibility'],
    publicUntil: null,
    effectivePublic: false,
    freshness: {
      state: 'ACTIVE' as InventoryItemResponse['freshness']['state'],
      confirmedAt: '',
      updatedAt: '',
      label: 'Updated just now',
    },
    images: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('item form', () => {
  it('defaults a new item to the printing, Near Mint and private', () => {
    const value = newItemDefaults(
      { language: 'fr', edition: 'UNLIMITED', finish: 'NORMAL' },
      schema,
      'b1',
    );
    expect(value).toMatchObject({
      quantity: 1,
      condition: 'NEAR_MINT',
      language: 'fr',
      edition: 'UNLIMITED',
      visibility: 'PRIVATE',
      binderId: 'b1',
      currency: 'CAD',
    });
  });

  it('builds a create request without empty optional fields', () => {
    const value = newItemDefaults(null, schema, null);
    const request = toCreateRequest({ ...value, notes: '  ', askingPrice: null }, 'p1', NOW);
    expect(request).toEqual({
      printingId: 'p1',
      quantity: 1,
      condition: 'NEAR_MINT',
      language: 'en',
      edition: 'FIRST_EDITION',
      finish: 'NORMAL',
      currency: 'CAD',
      availability: 'TRADE_OR_SALE',
      acceptsOffers: false,
      visibility: 'PRIVATE',
    });

    const temporary = toCreateRequest(
      { ...value, visibility: 'TEMPORARILY_PUBLIC', duration: '1h', askingPrice: 12.5 },
      'p1',
      NOW,
    );
    expect(temporary.publicUntil).toBe('2026-09-29T13:00:00.000Z');
    expect(temporary.askingPrice).toBe(12.5);
  });

  it('sends only what changed', () => {
    const original = item();
    expect(toUpdateRequest(itemFormValue(original, NOW), original, NOW)).toBeNull();

    const changed = {
      ...itemFormValue(original, NOW),
      condition: 'LIGHTLY_PLAYED',
      askingPrice: null,
      notes: '',
      binderId: 'b2',
    };
    expect(toUpdateRequest(changed, original, NOW)).toEqual({
      condition: 'LIGHTLY_PLAYED',
      askingPrice: null,
      notes: null,
      binderId: 'b2',
    });
  });

  it('sends visibility with its end only when it changed', () => {
    const original = item();
    const toPublic = { ...itemFormValue(original, NOW), visibility: 'PUBLIC' as const };
    expect(toUpdateRequest(toPublic, original, NOW)).toEqual({
      visibility: 'PUBLIC',
      publicUntil: null,
    });

    const running = item({
      visibility: 'TEMPORARILY_PUBLIC' as InventoryItemResponse['visibility'],
      publicUntil: '2026-09-30T00:00:00Z',
    });
    const keep = itemFormValue(running, NOW);
    expect(keep.duration).toBe(KEEP_END);
    expect(toUpdateRequest(keep, running, NOW)).toBeNull();
    expect(toUpdateRequest({ ...keep, duration: '7d' }, running, NOW)).toEqual({
      visibility: 'TEMPORARILY_PUBLIC',
      publicUntil: '2026-10-06T12:00:00.000Z',
    });
  });

  it('validates like the API', () => {
    const form = createItemForm(newItemDefaults(null, schema, null));
    form.controls.quantity.setValue(0);
    expect(itemFieldError('quantity', form.controls.quantity.errors)).toBe('At least 1 copy.');
    form.controls.quantity.setValue(1.5);
    expect(itemFieldError('quantity', form.controls.quantity.errors)).toBe('Enter a whole number.');
    form.controls.quantity.setValue(3);
    form.controls.askingPrice.setValue(4.999);
    expect(itemFieldError('askingPrice', form.controls.askingPrice.errors)).toBe(
      'Use at most two decimals.',
    );
    form.controls.askingPrice.setValue(-1);
    expect(itemFieldError('askingPrice', form.controls.askingPrice.errors)).toBe(
      'The price cannot be negative.',
    );
    form.controls.askingPrice.setValue(4.99);
    form.controls.publicNotes.setValue('x'.repeat(501));
    expect(form.valid).toBe(false);
    form.controls.publicNotes.setValue('ok');
    expect(form.valid).toBe(true);
  });
});
