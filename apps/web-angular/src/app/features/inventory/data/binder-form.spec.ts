import { binder } from '../testing/fixtures';
import {
  BINDER_COPY,
  binderFormChanged,
  binderFormOf,
  binderLine,
  deckCoreTag,
  toBinderPatch,
  toCreateBinderBody,
  validateBinderForm,
  withDeckCore,
} from './binder-form';

describe('Edit binder and New binder (spec 9.12)', () => {
  it('creates a binder of a game, with the deck core\'s price and note', () => {
    const form = { ...binderFormOf(null, 0, 'pokemon'), name: ' Trades ', sellsAsCore: true, price: '$180', note: 'Snake-Eye' };
    expect(toCreateBinderBody(form, 'g1')).toEqual({
      name: 'Trades',
      visibility: 'PRIVATE',
      sellsAsCore: true,
      gameId: 'g1',
      askingPriceText: '$180',
      description: 'Snake-Eye',
    });
    expect(toCreateBinderBody({ ...form, sellsAsCore: false }, 'g1').askingPriceText).toBeUndefined();
  });

  it('turning "Sell as a deck core" on makes the binder public', () => {
    expect(withDeckCore(binderFormOf(null), true).visibility).toBe('PUBLIC');
  });

  it('patches the changed fields with confirm, a new game only with its id', () => {
    const saved = binder('b', { name: 'Trades', description: '' });
    const form = binderFormOf(saved);
    expect(binderFormChanged(form, saved)).toBe(false);
    expect(toBinderPatch({ ...form, name: 'Deck' }, saved)).toEqual({ confirm: true, name: 'Deck' });
    expect(toBinderPatch({ ...form, game: 'pokemon' }, saved, 0, 'gp')).toEqual({ confirm: true, gameId: 'gp' });
  });

  it('validates the name, the price and the note', () => {
    expect(validateBinderForm(binderFormOf(null)).name).toBe(BINDER_COPY.nameRequired);
    const core = { ...binderFormOf(null), name: 'X', sellsAsCore: true };
    expect(validateBinderForm({ ...core, price: 'x'.repeat(41) }).price).toBe(BINDER_COPY.priceTooLong);
    expect(validateBinderForm({ ...core, price: 'a\nb' }).price).toBe(BINDER_COPY.priceOneLine);
  });

  it('words a binder: "9 cards · Public", "2 photos · Public", "Deck core · $180"', () => {
    expect(binderLine(binder('a', { itemCount: 9, visibility: 'PUBLIC' as never }))).toBe('9 cards · Public');
    expect(
      binderLine(binder('a', { sellsAsCore: true, photos: [{ id: 'x', url: '', width: 1, height: 1, sortOrder: 0 }, { id: 'y', url: '', width: 1, height: 1, sortOrder: 1 }] })),
    ).toBe('2 photos · Private');
    expect(deckCoreTag('$180')).toBe('Deck core · $180');
    expect(deckCoreTag(null)).toBe('Deck core');
    expect(BINDER_COPY.limit(5)).toBe(
      'You have 5 binders, the most each collector can have. Every collector has the same limits.',
    );
  });
});
