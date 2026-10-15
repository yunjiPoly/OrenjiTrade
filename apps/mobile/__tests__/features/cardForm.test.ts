import { ApiError } from '@/src/api/ApiError';
import {
  cardFormOf,
  formChanged,
  hasErrors,
  newCardForm,
  parseQuantity,
  serverCardErrors,
  stepQuantity,
  toCreateBody,
  toPatch,
  validateCardForm,
} from '@/src/features/inventory/cardForm';
import {
  itemPriceText,
  priceFieldText,
  priceTextOf,
  statedCondition,
} from '@/src/features/inventory/itemPrice';
import { photoRefusal } from '@/src/features/inventory/itemPhotoRules';
import {
  binderVisibilityStatus,
  cardVisibilityHint,
  itemVisibilityStatus,
  ownerIsVisible,
  publicCardHint,
  temporaryPublicationEnded,
  UNKNOWN_FINDABILITY,
  type CardFindability,
} from '@/src/features/inventory/visibilityStatus';
import { withCurrent } from '@/src/lib/inventory';

import { binderFixture, itemFixture, privacyFixture } from '../support/fixtures';

const NOW = Date.parse('2026-10-05T12:00:00Z');

describe('the price a card shows (stage R2)', () => {
  it('shows the text exactly as typed, else the amount in its currency, else nothing', () => {
    expect(itemPriceText({ askingPriceText: '85% TCG', askingPrice: null, currency: 'CAD' })).toBe(
      '85% TCG'
    );
    expect(itemPriceText({ askingPriceText: '$12.50', askingPrice: 12.5, currency: 'CAD' })).toBe(
      '$12.50'
    );
    // A card priced before R2 (or on the paused web) shows its amount.
    expect(itemPriceText({ askingPriceText: null, askingPrice: 42, currency: 'CAD' })).toBe(
      '$42.00'
    );
    expect(itemPriceText({ askingPrice: 42, currency: 'USD' })).toBe('US$42.00');
    expect(itemPriceText({ askingPriceText: '   ', askingPrice: null })).toBeNull();
    expect(itemPriceText({})).toBeNull();
  });

  it('fills the field with the text, or a plain amount for an old price', () => {
    expect(priceFieldText({ askingPriceText: 'Trade only', askingPrice: null })).toBe('Trade only');
    expect(priceFieldText({ askingPriceText: null, askingPrice: 42 })).toBe('42.00');
    expect(priceFieldText({})).toBe('');
    expect(priceTextOf('  90% TCG ')).toBe('90% TCG');
    expect(priceTextOf('   ')).toBeNull();
  });

  it('tells a stated condition from one the owner did not state', () => {
    expect(statedCondition({ condition: 'NEAR_MINT', conditionStated: true })).toBe('NEAR_MINT');
    expect(statedCondition({ condition: 'NEAR_MINT' })).toBe('NEAR_MINT');
    expect(statedCondition({ condition: '', conditionStated: false })).toBeNull();
    expect(statedCondition({ condition: '' })).toBeNull();
  });
});

describe('the card form (screens 6 and 7)', () => {
  it('starts a new card with one copy, no price, private, the binder it comes from', () => {
    expect(newCardForm()).toEqual({
      quantity: '1',
      price: '',
      visibility: 'PRIVATE',
      binderId: null,
      publicNote: '',
    });
    expect(newCardForm('b-1').binderId).toBe('b-1');
  });

  it('fills the form of a card; a temporary publication reads as Public while it runs', () => {
    const item = itemFixture({
      askingPrice: 40,
      askingPriceText: null,
      visibility: 'TEMPORARILY_PUBLIC',
      publicUntil: '2026-10-20T00:00:00Z',
      binder: { id: 'b-2', name: 'Trades' },
    });
    expect(cardFormOf(item, NOW)).toEqual({
      quantity: '2',
      price: '40.00',
      visibility: 'PUBLIC',
      binderId: 'b-2',
      publicNote: 'Sleeved.',
    });
  });

  it('reads an ended temporary publication as Private, and Public then publishes it (review fix 2)', () => {
    const ended = itemFixture({
      visibility: 'TEMPORARILY_PUBLIC',
      publicUntil: '2026-10-01T00:00:00Z',
      effectivePublic: false,
    });
    expect(temporaryPublicationEnded(ended, NOW)).toBe(true);
    expect(
      temporaryPublicationEnded({ visibility: 'TEMPORARILY_PUBLIC', publicUntil: null }, NOW)
    ).toBe(true);
    expect(
      temporaryPublicationEnded({ visibility: 'PUBLIC', publicUntil: '2026-10-01T00:00:00Z' }, NOW)
    ).toBe(false);
    const form = cardFormOf(ended, NOW);
    expect(form.visibility).toBe('PRIVATE');
    expect(toPatch(form, ended)).toBeNull();
    expect(toPatch({ ...form, visibility: 'PUBLIC' }, ended)).toEqual({
      visibility: 'PUBLIC',
      confirm: true,
    });
  });

  it('steps the copies between 1 and 9 999 and reads typed ones', () => {
    expect(stepQuantity('1', -1)).toBe('1');
    expect(stepQuantity('1', 1)).toBe('2');
    expect(stepQuantity('9999', 1)).toBe('9999');
    expect(stepQuantity('', 1)).toBe('2');
    expect(parseQuantity(' 12 ')).toBe(12);
    expect(parseQuantity('1.5')).toBeNaN();
  });

  it('validates like the API: copies, 40 characters of price on one line, 500 of note', () => {
    expect(hasErrors(validateCardForm(newCardForm()))).toBe(false);
    expect(validateCardForm({ ...newCardForm(), quantity: '' }).quantity).toMatch(/copies/);
    expect(validateCardForm({ ...newCardForm(), quantity: '0' }).quantity).toBe('At least 1 copy.');
    expect(validateCardForm({ ...newCardForm(), quantity: '10000' }).quantity).toMatch(/9999/);
    expect(validateCardForm({ ...newCardForm(), price: 'x'.repeat(40) }).price).toBeUndefined();
    // Spaces the API trims do not count.
    expect(
      validateCardForm({ ...newCardForm(), price: `  ${'x'.repeat(40)}  ` }).price
    ).toBeUndefined();
    expect(validateCardForm({ ...newCardForm(), price: 'x'.repeat(41) }).price).toBe(
      'At most 40 characters.'
    );
    expect(validateCardForm({ ...newCardForm(), price: '85%\nTCG' }).price).toMatch(/one line/);
    expect(validateCardForm({ ...newCardForm(), publicNote: 'n'.repeat(501) }).publicNote).toBe(
      'At most 500 characters.'
    );
  });

  it('adds a card with the phone fixed values: trade or sale, no offers, no condition', () => {
    expect(
      toCreateBody(
        {
          quantity: '3',
          price: ' 85% TCG ',
          visibility: 'PUBLIC',
          binderId: 'b-1',
          publicNote: ' NM ',
        },
        'p-1'
      )
    ).toEqual({
      printingId: 'p-1',
      quantity: 3,
      visibility: 'PUBLIC',
      availability: 'TRADE_OR_SALE',
      acceptsOffers: false,
      conditionStated: false,
      askingPriceText: '85% TCG',
      publicNotes: 'NM',
      binderId: 'b-1',
    });
    const bare = toCreateBody(newCardForm(), 'p-1');
    expect(bare).not.toHaveProperty('askingPriceText');
    expect(bare).not.toHaveProperty('publicNotes');
    expect(bare).not.toHaveProperty('binderId');
    expect(bare).not.toHaveProperty('condition');
    expect(bare).not.toHaveProperty('language');
  });

  it('patches only what changed, and every save confirms the card', () => {
    const item = itemFixture({ askingPriceText: '85% TCG', askingPrice: null });
    const form = cardFormOf(item);
    expect(toPatch(form, item)).toBeNull();
    expect(formChanged(form, item)).toBe(false);

    expect(toPatch({ ...form, quantity: '3' }, item)).toEqual({ quantity: 3, confirm: true });
    expect(toPatch({ ...form, price: '90% TCG' }, item)).toEqual({
      askingPriceText: '90% TCG',
      confirm: true,
    });
    expect(toPatch({ ...form, price: '' }, item)).toEqual({ askingPriceText: null, confirm: true });
    expect(toPatch({ ...form, publicNote: '' }, item)).toEqual({
      publicNotes: null,
      confirm: true,
    });
    expect(toPatch({ ...form, visibility: 'PUBLIC' }, item)).toEqual({
      visibility: 'PUBLIC',
      confirm: true,
    });
    // A move sends the visibility the form shows, so the card is exactly as it was seen.
    expect(toPatch({ ...form, binderId: 'b-9' }, item)).toEqual({
      binderId: 'b-9',
      visibility: 'PRIVATE',
      confirm: true,
    });
    // Never the fields the phone no longer shows.
    const patch = toPatch({ ...form, quantity: '5' }, item) ?? {};
    for (const gone of ['condition', 'availability', 'acceptsOffers', 'currency', 'notes']) {
      expect(patch).not.toHaveProperty(gone);
    }
  });

  it('leaves an old amount alone until it is edited', () => {
    const item = itemFixture({ askingPriceText: null, askingPrice: 40 });
    expect(toPatch({ ...cardFormOf(item), quantity: '5' }, item)).toEqual({
      quantity: 5,
      confirm: true,
    });
  });

  it('maps the server field errors to the fields', () => {
    const error = ApiError.fromProblem(400, {
      errorCode: 'VALIDATION_FAILED',
      errors: [
        { field: 'askingPriceText', message: 'must be at most 40 characters' },
        { field: 'publicNotes', message: 'must be at most 500 characters' },
        { field: 'quantity', message: 'must be between 1 and 9999' },
      ],
    });
    expect(serverCardErrors(error)).toEqual({
      price: 'must be at most 40 characters',
      publicNote: 'must be at most 500 characters',
      quantity: 'must be between 1 and 9999',
    });
  });

  it('keeps an unknown current value selectable (import rows)', () => {
    expect(withCurrent(['NEAR_MINT'], 'GRADED')).toEqual(['NEAR_MINT', 'GRADED']);
    expect(withCurrent(null, '')).toEqual([]);
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

describe('the Public hint of the card form (review fix 1 of stage R2)', () => {
  const findable: CardFindability = {
    regionName: 'Americas (North)',
    located: true,
    discoverable: true,
    privateProfile: false,
    paused: false,
  };
  const binder = (overrides: Parameters<typeof binderFixture>[0] = {}) =>
    binderFixture({ name: 'Personal collection', ...overrides });

  it('says collectors can find the card only when they can', () => {
    expect(publicCardHint(findable, null, NOW)).toEqual({
      findable: true,
      text: 'Collectors in Americas (North) can find it.',
    });
    expect(
      publicCardHint(findable, binder({ visibility: 'PUBLIC', effectivePublic: true }), NOW)
        .findable
    ).toBe(true);
    // Unknown while the settings load: the spec's hint, no reason invented.
    expect(publicCardHint(UNKNOWN_FINDABILITY, null, NOW)).toEqual({
      findable: true,
      text: 'Collectors in your region can find it.',
    });
  });

  it('says why nobody can find it otherwise', () => {
    const reason = (
      owner: Partial<CardFindability>,
      chosen = null as ReturnType<typeof binder> | null
    ) => publicCardHint({ ...findable, ...owner }, chosen, NOW);
    expect(reason({ located: false, regionName: null, discoverable: false })).toEqual({
      findable: false,
      text: 'Nobody can find it yet: add your state or province in Settings › Location, then turn on “Show me on the map”.',
    });
    expect(reason({ discoverable: false }).text).toBe(
      'You are hidden from the map, so nobody can find it yet. Turn on “Show me on the map” in Settings › Location.'
    );
    expect(reason({ privateProfile: true }).text).toBe(
      'Your profile is private, so nobody can find it yet. Change who sees your profile in Settings › Privacy.'
    );
    expect(reason({ paused: true }).text).toBe(
      'Your public cards are paused, so nobody can find it right now.'
    );
    expect(reason({}, binder()).text).toBe(
      'Its binder “Personal collection” is private, so nobody can find it yet. Publish the binder to show it.'
    );
    // A temporary publication that ended, a binder hidden until confirmed.
    expect(
      reason({}, binder({ visibility: 'TEMPORARILY_PUBLIC', publicUntil: '2026-10-01T00:00:00Z' }))
        .text
    ).toBe('Its binder “Personal collection” is not public right now, so nobody can find it.');
    expect(
      reason(
        {},
        binder({
          visibility: 'PUBLIC',
          freshness: { ...binderFixture().freshness, state: 'HIDDEN' },
        })
      ).findable
    ).toBe(false);
    expect(
      reason({}, binder({ visibility: 'TEMPORARILY_PUBLIC', publicUntil: '2026-10-20T00:00:00Z' }))
        .findable
    ).toBe(true);
  });
});

describe('the hint of Edit card, from the card itself (review fix 2 of stage R2)', () => {
  const findable: CardFindability = {
    regionName: 'Americas (North)',
    located: true,
    discoverable: true,
    privateProfile: false,
    paused: false,
  };
  const hidden = itemFixture({
    visibility: 'PUBLIC',
    effectivePublic: false,
    freshness: { ...itemFixture().freshness, state: 'HIDDEN' },
  });
  const hint = (
    visibility: 'PRIVATE' | 'PUBLIC',
    item: ReturnType<typeof itemFixture>,
    changed: boolean,
    owner: Partial<CardFindability> = {}
  ) => cardVisibilityHint(visibility, { ...findable, ...owner }, null, { item, changed }, NOW);

  it('says a card hidden until confirmed cannot be found, until a save confirms it', () => {
    expect(hint('PUBLIC', hidden, false)).toEqual({
      findable: false,
      text: 'Nobody can find it until you confirm it is still available.',
    });
    // "Save changes" confirms the card.
    expect(hint('PUBLIC', hidden, true)).toEqual({
      findable: true,
      text: 'Collectors in Americas (North) can find it once you save.',
    });
    expect(hint('PUBLIC', hidden, true, { regionName: null }).text).toBe(
      'Collectors in your region can find it once you save.'
    );
    // A reason of the owner comes first: a save does not change it.
    expect(hint('PUBLIC', hidden, true, { paused: true }).text).toBe(
      'Your public cards are paused, so nobody can find it right now.'
    );
  });

  it('says collectors can find a card public now, and a private card once saved as public', () => {
    const listed = itemFixture({ visibility: 'PUBLIC', effectivePublic: true });
    expect(hint('PUBLIC', listed, false).text).toBe('Collectors in Americas (North) can find it.');
    expect(hint('PUBLIC', listed, true).text).toBe('Collectors in Americas (North) can find it.');
    const privateCard = itemFixture({ visibility: 'PRIVATE', effectivePublic: false });
    expect(hint('PRIVATE', privateCard, false).text).toBe(
      'Only you see it until you make it public.'
    );
    expect(hint('PUBLIC', privateCard, true).text).toBe(
      'Collectors in Americas (North) can find it once you save.'
    );
    // Not public for a reason the phone does not know of: no claim either way.
    expect(
      hint('PUBLIC', itemFixture({ visibility: 'PUBLIC', effectivePublic: false }), false)
    ).toEqual({ findable: false, text: 'Nobody can find it right now.' });
  });

  it('says a temporary publication has ended, and Public publishes it again on save', () => {
    const ended = itemFixture({
      visibility: 'TEMPORARILY_PUBLIC',
      publicUntil: '2026-10-01T00:00:00Z',
      effectivePublic: false,
    });
    expect(hint('PRIVATE', ended, false)).toEqual({
      findable: true,
      text: 'Its temporary publication has ended: only you see it until you make it public again.',
    });
    expect(hint('PUBLIC', ended, true).text).toBe(
      'Collectors in Americas (North) can find it once you save.'
    );
    // Adding a card: no card yet, the spec's hints.
    expect(cardVisibilityHint('PUBLIC', findable, null, null, NOW).text).toBe(
      'Collectors in Americas (North) can find it.'
    );
    expect(cardVisibilityHint('PRIVATE', findable, null, null, NOW).text).toBe(
      'Only you see it until you make it public.'
    );
  });
});

describe('a photo the API refused (review fix 1 of stage R2)', () => {
  const refusal = (status: number, file?: string) =>
    photoRefusal(
      new ApiError({
        status,
        errorCode: status === 400 ? 'VALIDATION_FAILED' : 'X',
        message: 'm',
        fieldErrors: file ? { file } : {},
      })
    );

  it('says why, and trying again cannot work', () => {
    expect(
      refusal(400, 'The image dimensions are not acceptable (at most 8192 pixels per side)')
    ).toBe('This photo is too large: at most 8192 pixels on each side. Choose another one.');
    expect(refusal(400, 'The image could not be read; upload a valid image file')).toBe(
      'That photo could not be read. Try another one.'
    );
    expect(refusal(409)).toBe('A card can have at most 4 photos.');
    expect(refusal(413)).toBe('Choose a photo smaller than 8 MB.');
    expect(refusal(415)).toBe('Use a JPEG, PNG or WebP photo.');
  });

  it('leaves a network or server error to "Try again"', () => {
    expect(refusal(0)).toBeNull();
    expect(refusal(500)).toBeNull();
    expect(refusal(503)).toBeNull();
    expect(photoRefusal(null)).toBeNull();
  });
});
