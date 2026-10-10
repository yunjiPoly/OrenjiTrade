import type { WishlistItemResponse } from '@orenji/api-client';
import {
  WISH_NOTE_MAX,
  applyServerErrors,
  createWishForm,
  newWishDefaults,
  noteError,
  noteLength,
  selectionOf,
  toCreateWishRequest,
  toUpdateWishRequest,
  wishFormFromItem,
} from './wishlist-form';

function item(overrides: Partial<WishlistItemResponse> = {}): WishlistItemResponse {
  return {
    id: 'w1',
    game: 'pokemon',
    card: { id: 'c1', name: 'Emberfang Fox' },
    printing: { id: 'p1', printingCode: 'PFT-002' },
    rarity: null,
    note: 'For my deck',
    nearMintOnly: true,
    priceTerm: { label: '85% TCG', percent: 85, orMore: false },
    createdAt: '2026-09-30T10:00:00Z',
    updatedAt: '2026-09-30T10:00:00Z',
    ...overrides,
  };
}

describe('wishlist form', () => {
  it('starts a new wish on any printing, one rarity or the given printing', () => {
    expect(newWishDefaults()).toEqual({
      printingId: '',
      rarity: '',
      note: '',
      nearMintOnly: false,
      priceTerm: '',
    });
    expect(newWishDefaults({ printingId: 'p1', rarity: 'Ultra Rare' })).toMatchObject({
      printingId: 'p1',
      rarity: '',
    });
    expect(newWishDefaults({ printingId: null, rarity: 'Secret Rare' })).toMatchObject({
      printingId: '',
      rarity: 'Secret Rare',
    });
  });

  it('has only which copy, the public note, Near Mint only and one price term', () => {
    const form = createWishForm(newWishDefaults());
    expect(Object.keys(form.controls).sort()).toEqual(
      ['nearMintOnly', 'note', 'priceTerm', 'printingId', 'rarity'].sort(),
    );
  });

  it('reads an existing wish', () => {
    expect(wishFormFromItem(item())).toEqual({
      printingId: 'p1',
      rarity: '',
      note: 'For my deck',
      nearMintOnly: true,
      priceTerm: '85% TCG',
    });
    expect(
      wishFormFromItem(item({ printing: undefined, rarity: 'Ultra Rare', priceTerm: undefined })),
    ).toMatchObject({ printingId: '', rarity: 'Ultra Rare', priceTerm: '' });
    expect(selectionOf({ printingId: 'p1', rarity: 'x' })).toEqual({
      printingId: 'p1',
      rarity: null,
    });
    expect(selectionOf({ printingId: '', rarity: 'Ultra Rare' })).toEqual({
      printingId: null,
      rarity: 'Ultra Rare',
    });
  });

  it('builds the create body: the card for any printing, the printing otherwise', () => {
    expect(
      toCreateWishRequest(
        {
          printingId: '',
          rarity: 'Secret Rare',
          note: '  Mint copy  ',
          nearMintOnly: true,
          priceTerm: '90% TCG',
        },
        'c1',
      ),
    ).toEqual({
      cardId: 'c1',
      rarity: 'Secret Rare',
      note: 'Mint copy',
      nearMintOnly: true,
      priceTerm: '90% TCG',
    });
    const exact = toCreateWishRequest(
      { printingId: 'p1', rarity: 'ignored', note: '', nearMintOnly: false, priceTerm: '' },
      'c1',
    );
    expect(exact).toEqual({ printingId: 'p1', nearMintOnly: false });
    for (const removed of [
      'maxPrice',
      'currency',
      'tradePreference',
      'notes',
      'conditionMin',
      'edition',
      'language',
      'active',
    ]) {
      expect(exact).not.toHaveProperty(removed);
    }
  });

  it('builds the update body with nulls clearing the choices', () => {
    expect(
      toUpdateWishRequest({
        printingId: '',
        rarity: '',
        note: ' ',
        nearMintOnly: false,
        priceTerm: '',
      }),
    ).toEqual({ printingId: null, rarity: null, note: null, nearMintOnly: false, priceTerm: null });
    expect(
      toUpdateWishRequest({
        printingId: 'p2',
        rarity: 'Ultra Rare',
        note: 'x',
        nearMintOnly: true,
        priceTerm: '100% TCG+',
      }),
    ).toEqual({
      printingId: 'p2',
      rarity: null,
      note: 'x',
      nearMintOnly: true,
      priceTerm: '100% TCG+',
    });
  });

  it('limits the note to 280 characters the way the API counts them', () => {
    const form = createWishForm(newWishDefaults());
    form.controls.note.setValue('é'.repeat(WISH_NOTE_MAX));
    expect(form.controls.note.valid).toBe(true);
    form.controls.note.setValue('🃏'.repeat(WISH_NOTE_MAX));
    expect(noteLength(form.controls.note.value)).toBe(WISH_NOTE_MAX);
    expect(form.controls.note.valid).toBe(true);
    form.controls.note.setValue('x'.repeat(WISH_NOTE_MAX + 1));
    expect(form.controls.note.invalid).toBe(true);
    expect(noteError(form.controls.note.errors)).toBe('The note is limited to 280 characters.');
  });

  it('puts the API field errors on their controls', () => {
    const form = createWishForm(newWishDefaults());
    const unmapped = applyServerErrors(form, {
      note: 'contains a term that is not allowed',
      priceTerm: 'must be one of 80% TCG',
      cardId: 'unknown card',
    });
    expect(noteError(form.controls.note.errors)).toBe(
      'The note contains a word that is not allowed here. Please rephrase it.',
    );
    expect(form.controls.priceTerm.errors).toEqual({ server: 'must be one of 80% TCG' });
    expect(unmapped).toEqual(['cardId: unknown card']);
  });

  it('words the API note errors as sentences', () => {
    expect(noteError({ server: 'must be plain text' })).toBe('Use plain text only in the note.');
    expect(noteError({ server: 'at most 280 characters' })).toBe(
      'The note is limited to 280 characters.',
    );
    expect(noteError({ server: 'something else' })).toBe('Something else');
    expect(noteError(null)).toBeNull();
  });
});
