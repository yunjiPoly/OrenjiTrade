import { deckCoreTag, INVENTORY_BINDERS_COPY } from '@/src/features/binders/binderCopy';
import {
  binderFormChanged,
  binderFormOf,
  binderRowLine,
  binderVisibilityChoice,
  hasBinderErrors,
  orderBinders,
  toBinderPatch,
  toCreateBinderBody,
  validateBinderForm,
  withDeckCore,
} from '@/src/features/binders/binderForm';
import { ownerProvince } from '@/src/features/binders/SellerRow';
import { pageAt } from '@/src/features/binders/PhotoPager';

import { binderFixture, BINDER_PHOTO, deckCoreFixture, QUEBEC } from '../support/fixtures';

const NOW = Date.parse('2026-10-15T12:00:00Z');

describe('the deck core tag (spec 2026-10-14, section 7)', () => {
  it('reads "Deck core · {price}" exactly as typed, "Deck core" without a price', () => {
    expect(deckCoreTag('$180')).toBe('Deck core · $180');
    expect(deckCoreTag(' Trade only ')).toBe('Deck core · Trade only');
    expect(deckCoreTag('85% TCG')).toBe('Deck core · 85% TCG');
    expect(deckCoreTag(null)).toBe('Deck core');
    expect(deckCoreTag('  ')).toBe('Deck core');
  });
});

describe('Inventory › Binders lines (screen 17)', () => {
  it('summarises "{n} binders · {n} deck cores", the second part dropped at 0', () => {
    expect(INVENTORY_BINDERS_COPY.summary(3, 1)).toEqual({
      binders: '3 binders',
      rest: ' · 1 deck core',
    });
    expect(INVENTORY_BINDERS_COPY.summary(1, 2)).toEqual({
      binders: '1 binder',
      rest: ' · 2 deck cores',
    });
    expect(INVENTORY_BINDERS_COPY.summary(2, 0)).toEqual({ binders: '2 binders', rest: '' });
    // Deck cores only: no "0 binders".
    expect(INVENTORY_BINDERS_COPY.summary(0, 1)).toEqual({ binders: '1 deck core', rest: '' });
  });

  it('counts a deck core in photos and a binder in cards, with who can see it', () => {
    const core = deckCoreFixture({
      photos: [BINDER_PHOTO, { ...BINDER_PHOTO, id: 'p2', sortOrder: 1 }],
    });
    expect(binderRowLine(core, NOW)).toBe('2 photos · Public');
    expect(binderRowLine(deckCoreFixture({ photos: [], visibility: 'PRIVATE' }), NOW)).toBe(
      '0 photos · Private'
    );
    expect(binderRowLine(binderFixture({ itemCount: 9, visibility: 'PUBLIC' }), NOW)).toBe(
      '9 cards · Public'
    );
    expect(binderRowLine(binderFixture({ itemCount: 1 }), NOW)).toBe('1 card · Private');
    // A temporary publication of the paused web that ended reads Private.
    expect(
      binderRowLine(
        binderFixture({ visibility: 'TEMPORARILY_PUBLIC', publicUntil: '2026-10-01T00:00:00Z' }),
        NOW
      )
    ).toBe('1 card · Private');
  });

  it('puts the deck cores first and keeps the owner’s order inside each group; sold ones go', () => {
    const plainA = binderFixture({ id: 'a', name: 'A' });
    const coreB = deckCoreFixture({ id: 'b', name: 'B' });
    const plainC = binderFixture({ id: 'c', name: 'C' });
    const sold = deckCoreFixture({ id: 'd', soldAt: '2026-10-14T00:00:00Z' });
    const ordered = orderBinders([plainA, coreB, plainC, sold]);
    expect(ordered.cores.map((binder) => binder.id)).toEqual(['b']);
    expect(ordered.binders.map((binder) => binder.id)).toEqual(['a', 'c']);
  });
});

describe('Edit binder form (screen 18)', () => {
  it('starts a new binder private and plain', () => {
    expect(binderFormOf(null)).toEqual({
      name: '',
      visibility: 'PRIVATE',
      sellsAsCore: false,
      price: '',
      note: '',
    });
  });

  it('reads a deck core as saved, a running temporary publication as Public', () => {
    expect(binderFormOf(deckCoreFixture(), NOW)).toEqual({
      name: 'Snake-Eye core',
      visibility: 'PUBLIC',
      sellsAsCore: true,
      price: '$180',
      note: 'All NM, English. Sleeves and a deck box included.',
    });
    expect(
      binderVisibilityChoice(
        { visibility: 'TEMPORARILY_PUBLIC', publicUntil: '2099-01-01T00:00:00Z' },
        NOW
      )
    ).toBe('PUBLIC');
  });

  it('turning the switch on makes the binder public; turning it off keeps who can see it', () => {
    const on = withDeckCore(binderFormOf(binderFixture()), true);
    expect(on.sellsAsCore).toBe(true);
    expect(on.visibility).toBe('PUBLIC');
    const privateCore = { ...on, visibility: 'PRIVATE' as const };
    expect(withDeckCore(privateCore, true).visibility).toBe('PRIVATE');
    expect(withDeckCore(on, false)).toEqual({ ...on, sellsAsCore: false });
  });

  it('is unchanged until a field changes (texts trimmed); Save changes is disabled then', () => {
    const binder = deckCoreFixture();
    const form = binderFormOf(binder, NOW);
    expect(binderFormChanged(form, binder, NOW)).toBe(false);
    expect(binderFormChanged({ ...form, price: ' $180 ' }, binder, NOW)).toBe(false);
    expect(binderFormChanged({ ...form, price: '$175' }, binder, NOW)).toBe(true);
    expect(binderFormChanged({ ...form, visibility: 'PRIVATE' }, binder, NOW)).toBe(true);
    expect(binderFormChanged({ ...form, sellsAsCore: false }, binder, NOW)).toBe(true);
    expect(binderFormChanged({ ...form, note: 'Sleeved.' }, binder, NOW)).toBe(true);
  });

  it('checks the name, and the price and note of a deck core only', () => {
    expect(validateBinderForm({ ...binderFormOf(null), name: '  ' })).toEqual({
      name: 'Give your binder a name.',
    });
    expect(validateBinderForm({ ...binderFormOf(null), name: 'x'.repeat(81) }).name).toBe(
      'At most 80 characters.'
    );
    const core = { ...binderFormOf(deckCoreFixture(), NOW) };
    expect(hasBinderErrors(validateBinderForm(core))).toBe(false);
    expect(validateBinderForm({ ...core, price: 'p'.repeat(41) }).price).toBe(
      'At most 40 characters.'
    );
    expect(validateBinderForm({ ...core, price: ` ${'p'.repeat(40)} ` }).price).toBeUndefined();
    expect(validateBinderForm({ ...core, note: 'n'.repeat(501) }).note).toBe(
      'At most 500 characters.'
    );
    // A plain binder keeps its (web) description and price unchecked: the phone does not show them.
    expect(
      hasBinderErrors(validateBinderForm({ ...core, sellsAsCore: false, price: 'p'.repeat(41) }))
    ).toBe(false);
  });

  it('creates a plain binder without price or note, a deck core with them', () => {
    expect(toCreateBinderBody({ ...binderFormOf(null), name: ' Trades ', note: 'x' })).toEqual({
      name: 'Trades',
      visibility: 'PRIVATE',
      sellsAsCore: false,
    });
    expect(
      toCreateBinderBody({
        name: 'Core',
        visibility: 'PUBLIC',
        sellsAsCore: true,
        price: ' $95 ',
        note: ' All NM. ',
      })
    ).toEqual({
      name: 'Core',
      visibility: 'PUBLIC',
      sellsAsCore: true,
      askingPriceText: '$95',
      description: 'All NM.',
    });
  });

  it('saves the fields that changed and confirms the binder', () => {
    const binder = deckCoreFixture();
    const form = binderFormOf(binder, NOW);
    expect(toBinderPatch(form, binder, NOW)).toEqual({ confirm: true });
    expect(toBinderPatch({ ...form, price: '', name: 'Snake-Eye core v2' }, binder, NOW)).toEqual({
      confirm: true,
      name: 'Snake-Eye core v2',
      askingPriceText: null,
    });
    expect(
      toBinderPatch({ ...form, sellsAsCore: false, visibility: 'PRIVATE' }, binder, NOW)
    ).toEqual({ confirm: true, sellsAsCore: false, visibility: 'PRIVATE' });
  });
});

describe('the deck core page (screen 16)', () => {
  it('names the seller’s province, never a city', () => {
    expect(ownerProvince({ place: { ...QUEBEC } })).toBe('Quebec');
    expect(ownerProvince({ place: undefined })).toBe('Location not shared');
  });

  it('pages the photos by the offset of the pager', () => {
    expect(pageAt(0, 390, 3)).toBe(0);
    expect(pageAt(390, 390, 3)).toBe(1);
    expect(pageAt(600, 390, 3)).toBe(2);
    expect(pageAt(5000, 390, 3)).toBe(2);
    expect(pageAt(-40, 390, 3)).toBe(0);
    expect(pageAt(100, 0, 3)).toBe(0);
    expect(pageAt(100, 390, 0)).toBe(0);
  });
});
