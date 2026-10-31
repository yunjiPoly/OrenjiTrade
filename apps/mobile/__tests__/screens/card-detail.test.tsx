import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Dimensions, Linking } from 'react-native';

import CardScreen from '@/app/cards/[id]';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CARD_ID,
  ONTARIO,
  PRINTING_A,
  PRINTING_B,
  QUEBEC,
  cardDetailFixture,
  cardHolderFixture,
  cardHoldersPage,
  conversationFixture,
  markerFixture,
  printingFixture,
  publicBinderSummaryFixture,
  publicItemFixture,
  wishFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

const ASH = cardDetailFixture({
  game: 'yugioh',
  name: 'Ash Blossom & Joyous Spring',
  text: 'Quick Effect: discard this card.',
  cardType: 'Monster',
  subtype: 'Tuner',
  printings: [
    printingFixture({ printingCode: 'LAVD-EN008', rarity: 'Ultra Rare' }),
    printingFixture({ id: PRINTING_B, printingCode: 'RA01-EN008', rarity: 'Secret Rare' }),
  ],
});

/** A holder in `place` with a price text and copies. */
function holder(id: string, handle: string, place = QUEBEC, price = '85% TCG', copies = 2) {
  return cardHolderFixture({
    collector: markerFixture({ id: `collector-${id}`, handle, displayName: handle, place }),
    item: publicItemFixture({
      id,
      quantity: copies,
      askingPriceText: price,
      printing: printingFixture({ printingCode: 'LAVD-EN008', rarity: 'Ultra Rare' }),
    }),
  });
}

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/cards/{id}': ok(ASH),
    'GET /api/v1/search/card-holders': ok(
      cardHoldersPage([
        holder('i1', 'maya_k'),
        holder('i2', 'leo_cards', QUEBEC, 'Trade only', 1),
        holder('i3', 'northstar', ONTARIO, '$18', 3),
      ])
    ),
    'GET /api/v1/search/deck-cores': ok([]),
    'GET /api/v1/wishlist': ok([]),
    ...extra,
  });
}

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockParams.current = { id: CARD_ID };
});

function render() {
  return renderWithProviders(<CardScreen />, { port: new FakeAuthPort(testUser()) });
}

describe('Who has this card (screen 13)', () => {
  it('shows the card with its game and the TCGplayer link, and no card text, type line or price', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    mockApi(routes());
    render();
    expect(screen.getByTestId('card-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId('card-name')).toHaveTextContent('Ash Blossom & Joyous Spring');
    expect(screen.getByTestId('card-game')).toHaveTextContent('YU-GI-OH!');
    expect(screen.queryByText(/Quick Effect/)).toBeNull();
    expect(screen.queryByText(/Tuner|Monster/)).toBeNull();
    fireEvent.press(screen.getByRole('link', { name: /Check the TCGplayer price/ }));
    expect(open).toHaveBeenCalledWith(
      'https://www.tcgplayer.com/search/yugioh/product?q=Ash%20Blossom%20%26%20Joyous%20Spring'
    );
    open.mockRestore();
  });

  it("groups the holders by province, the collector's own first, with no count", async () => {
    const api = mockApi(routes());
    render();
    expect(await screen.findByTestId('holders-group-CA-QC')).toHaveTextContent(
      'Quebec · your province'
    );
    expect(screen.getByTestId('holders-group-CA-ON')).toHaveTextContent('Ontario');
    const row = screen.getByTestId('holder-i1');
    expect(row).toHaveTextContent(/maya_k/);
    expect(row).toHaveTextContent(/LAVD-EN008 · Ultra Rare/);
    expect(screen.getByTestId('holder-i1-price')).toHaveTextContent('85% TCG');
    expect(row).toHaveTextContent(/×2/);
    expect(screen.getByTestId('holder-i2-price')).toHaveTextContent('Trade only');
    // No counts anywhere on this page.
    expect(screen.queryByText(/\d+ (holders?|listings?|collectors?)/i)).toBeNull();
    const asked = api.callsTo('GET /api/v1/search/card-holders')[0];
    expect(asked?.query.get('cardId')).toBe(CARD_ID);
    expect(asked?.query.get('sort')).toBe('province');
    expect(asked?.query.get('excludeDeckCoreItems')).toBe('true');
    expect(asked?.query.get('region')).toBe('americas-north');
    fireEvent.press(screen.getByTestId('holder-i3-collector'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'northstar' },
    });
  });

  it("puts a holder's price under the handle at large text sizes, beside it otherwise", async () => {
    mockApi(routes());
    const window = Dimensions.get('window');
    const textSize = (fontScale: number) =>
      act(() => {
        Dimensions.set({
          window: { ...window, fontScale },
          screen: { ...window, fontScale },
        });
      });
    try {
      textSize(1);
      const first = render();
      await screen.findByTestId('holder-i2-price');
      expect(screen.getByTestId('holder-i2-collector')).toHaveStyle({ flexDirection: 'row' });
      expect(screen.getByTestId('holder-i2-price')).toHaveStyle({ textAlign: 'right' });
      first.unmount();
      // The largest size: beside the price, "leo_cards" kept a third of the row and broke in the
      // middle of the word; now the avatar, the handle and the price go one under the other.
      textSize(3.1);
      render();
      await screen.findByTestId('holder-i2-price');
      expect(screen.getByTestId('holder-i2-collector')).toHaveStyle({ flexDirection: 'column' });
      expect(screen.getByTestId('holder-i2-price')).not.toHaveStyle({ textAlign: 'right' });
      expect(screen.getByTestId('holder-i2-price')).toHaveTextContent('Trade only');
    } finally {
      textSize(window.fontScale);
    }
  });

  it('puts the picture above the card name at large text sizes, so its longest word fits (R8 review U1)', async () => {
    mockApi(
      routes({
        'GET /api/v1/cards/{id}': ok(
          cardDetailFixture({ ...ASH, name: 'Shadowvale Revenant King' })
        ),
      })
    );
    const window = Dimensions.get('window');
    const textSize = (fontScale: number) =>
      act(() => {
        Dimensions.set({
          window: { ...window, fontScale },
          screen: { ...window, fontScale },
        });
      });
    try {
      textSize(1);
      const first = render();
      expect(await screen.findByTestId('card-name')).toHaveTextContent('Shadowvale Revenant King');
      // The default size: the picture beside the name, as in the mockup.
      expect(screen.getByTestId('card-hero')).toHaveStyle({ flexDirection: 'row' });
      first.unmount();
      // The largest size: beside the 56 pt picture, "Shadowvale" at twice 24 pt broke in two.
      textSize(3.1);
      render();
      expect(await screen.findByTestId('card-name')).toHaveTextContent('Shadowvale Revenant King');
      expect(screen.getByTestId('card-hero')).toHaveStyle({ flexDirection: 'column' });
      expect(screen.getByTestId('card-name')).toHaveProp('maxFontSizeMultiplier', 2);
    } finally {
      textSize(window.fontScale);
    }
  });

  it('Message opens or reuses the chat with that card pinned', async () => {
    const api = mockApi(
      routes({ 'POST /api/v1/conversations': ok(conversationFixture({ id: 'chat-1' }), 201) })
    );
    render();
    fireEvent.press(await screen.findByRole('button', { name: 'Message northstar' }));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/messages/[id]',
        params: { id: 'chat-1' },
      })
    );
    expect(api.callsTo('POST /api/v1/conversations')[0]?.body).toEqual({
      recipientId: 'collector-i3',
      subjectItemId: 'i3',
    });
  });

  it('"Any printing ▾" filters the rows by one printing of the card, and back', async () => {
    const api = mockApi(routes());
    render();
    fireEvent.press(await screen.findByTestId('card-printing'));
    const sheet = await screen.findByTestId('card-printing-sheet');
    expect(
      within(sheet).getByRole('radio', { name: 'RA01-EN008 · Secret Rare' })
    ).toBeOnTheScreen();
    fireEvent.press(within(sheet).getByRole('radio', { name: 'RA01-EN008 · Secret Rare' }));
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/search/card-holders').at(-1)?.query.get('printingId')).toBe(
        PRINTING_B
      )
    );
    expect(screen.getByTestId('card-printing')).toHaveTextContent(/RA01-EN008 · Secret Rare/);
    fireEvent.press(screen.getByTestId('card-printing'));
    fireEvent.press(await screen.findByTestId('card-printing-any'));
    // Back on every printing (the answer of the first request, kept).
    await waitFor(() =>
      expect(screen.getByTestId('card-printing')).toHaveTextContent(/Any printing/)
    );
    expect(await screen.findByTestId('holder-i3')).toBeOnTheScreen();
  });

  it('starts on the printing a link names (a wishlist alert, an Available wish)', async () => {
    mockParams.current = { id: CARD_ID, printing: PRINTING_A };
    const api = mockApi(routes());
    render();
    await screen.findByTestId('card-name');
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/search/card-holders')[0]?.query.get('printingId')).toBe(
        PRINTING_A
      )
    );
    expect(screen.getByTestId('card-printing')).toHaveTextContent(/LAVD-EN008 · Ultra Rare/);
  });

  it('starts on "Any printing · <rarity>" when a wish of one rarity opens it, and back to any printing', async () => {
    // "Available" and the alert of a wish of any printing in one rarity (stage R5 review, F3).
    mockParams.current = { id: CARD_ID, rarity: 'Secret Rare' };
    const api = mockApi(routes());
    render();
    await screen.findByTestId('card-name');
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/search/card-holders')[0]?.query.get('rarity')).toBe(
        'Secret Rare'
      )
    );
    const first = api.callsTo('GET /api/v1/search/card-holders')[0];
    expect(first?.query.get('cardId')).toBe(CARD_ID);
    expect(first?.query.get('printingId')).toBeNull();
    expect(screen.getByTestId('card-printing')).toHaveTextContent(/Any printing · Secret Rare/);
    fireEvent.press(screen.getByTestId('card-printing'));
    const sheet = await screen.findByTestId('card-printing-sheet');
    expect(within(sheet).getByRole('radio', { name: 'Any printing · Secret Rare' })).toBeChecked();
    fireEvent.press(within(sheet).getByRole('radio', { name: 'Any printing' }));
    await waitFor(() =>
      expect(screen.getByTestId('card-printing')).toHaveTextContent(/^Any printing\W*$/)
    );
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/search/card-holders').at(-1)?.query.get('rarity')).toBeNull()
    );
  });

  it('ignores a rarity none of the printings has', async () => {
    mockParams.current = { id: CARD_ID, rarity: 'Mythic' };
    const api = mockApi(routes());
    render();
    await screen.findByTestId('card-name');
    await waitFor(() => expect(api.callsTo('GET /api/v1/search/card-holders')).not.toEqual([]));
    expect(api.callsTo('GET /api/v1/search/card-holders')[0]?.query.get('rarity')).toBeNull();
    expect(screen.getByTestId('card-printing')).toHaveTextContent(/^Any printing\W*$/);
  });

  it('follows a new link to the card on screen with another printing', async () => {
    // The route stays and only its parameters change (a link opened while the page shows).
    mockParams.current = { id: CARD_ID, printing: PRINTING_A };
    mockApi(routes());
    const view = render();
    await waitFor(() =>
      expect(screen.getByTestId('card-printing')).toHaveTextContent(/LAVD-EN008 · Ultra Rare/)
    );
    mockParams.current = { id: CARD_ID, printing: 'any' };
    view.rerender(<CardScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('card-printing')).toHaveTextContent(/^Any printing\W*$/)
    );
    mockParams.current = { id: CARD_ID, printing: PRINTING_B };
    view.rerender(<CardScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('card-printing')).toHaveTextContent(/RA01-EN008 · Secret Rare/)
    );
  });

  it('says when a copy is a 1st Edition or of a special finish, so twins of one code read apart', async () => {
    // Two printings of one code and rarity, a 1st Edition and an Unlimited one (stage R5 review,
    // U3): under "Any printing" each row says which it is.
    mockApi(
      routes({
        'GET /api/v1/search/card-holders': ok(
          cardHoldersPage([
            cardHolderFixture({
              collector: markerFixture({ id: 'c-first', handle: 'first_ed', place: QUEBEC }),
              item: publicItemFixture({
                id: 'first',
                edition: 'FIRST_EDITION',
                finish: 'NORMAL',
                printing: printingFixture({ printingCode: 'GLM-EN022', rarity: 'Rare' }),
              }),
            }),
            cardHolderFixture({
              collector: markerFixture({ id: 'c-unl', handle: 'unlimited', place: QUEBEC }),
              item: publicItemFixture({
                id: 'unl',
                edition: 'UNLIMITED',
                finish: 'NORMAL',
                printing: printingFixture({ printingCode: 'GLM-EN022', rarity: 'Rare' }),
              }),
            }),
            cardHolderFixture({
              collector: markerFixture({ id: 'c-rev', handle: 'reverse', place: QUEBEC }),
              item: publicItemFixture({
                id: 'rev',
                edition: 'UNLIMITED',
                finish: 'REVERSE_HOLO',
                printing: printingFixture({ printingCode: 'SVX-001', rarity: 'Rare' }),
              }),
            }),
          ])
        ),
      })
    );
    render();
    expect(await screen.findByTestId('holder-first')).toHaveTextContent(
      /GLM-EN022 · Rare · 1st Edition/
    );
    expect(screen.getByTestId('holder-unl')).toHaveTextContent(/GLM-EN022 · Rare(?! ·)/);
    expect(screen.getByTestId('holder-rev')).toHaveTextContent(/SVX-001 · Rare · Reverse holo/);
    expect(screen.getByTestId('holder-first-collector')).toHaveProp(
      'accessibilityLabel',
      expect.stringContaining('GLM-EN022 · Rare · 1st Edition')
    );
  });

  it('shows "Also in a deck core" with the public cores of the region, each opening its page', async () => {
    const core = publicBinderSummaryFixture({
      id: 'core-1',
      name: 'Yubel core',
      sellsAsCore: true,
      askingPriceText: '$95',
      owner: {
        id: 'o1',
        handle: 'duelist.jp',
        displayName: 'Duelist',
        avatarUrl: null,
        place: QUEBEC,
      },
    });
    const api = mockApi(routes({ 'GET /api/v1/search/deck-cores': ok([core]) }));
    render();
    const banner = await screen.findByTestId('card-deck-cores');
    expect(within(banner).getByText('Also in a deck core')).toBeOnTheScreen();
    expect(screen.getByTestId('card-deck-core-core-1')).toHaveTextContent(
      /^Yubel core · duelist\.jp · Quebec · \$95/
    );
    expect(api.callsTo('GET /api/v1/search/deck-cores')[0]?.query.get('limit')).toBe('3');
    fireEvent.press(screen.getByTestId('card-deck-core-core-1'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: 'core-1', view: 'public' },
    });
  });

  it('adds an "Any printing" wish, and asks before taking the card off the wishlist', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/wishlist': (request) =>
          ok(
            api.callsTo('POST /api/v1/wishlist').length > 0 &&
              api.callsTo('DELETE /api/v1/wishlist/{id}').length === 0
              ? [
                  wishFixture({
                    id: 'w-new',
                    card: { id: CARD_ID, name: ASH.name ?? '', imageUrl: null },
                  }),
                ]
              : []
          ),
        'POST /api/v1/wishlist': ok(
          wishFixture({ id: 'w-new', card: { id: CARD_ID, name: ASH.name ?? '', imageUrl: null } }),
          201
        ),
        'DELETE /api/v1/wishlist/{id}': { status: 204 },
      })
    );
    render();
    fireEvent.press(await screen.findByRole('button', { name: 'Add to wishlist' }));
    await waitFor(() => expect(api.callsTo('POST /api/v1/wishlist')).toHaveLength(1));
    expect(api.callsTo('POST /api/v1/wishlist')[0]?.body).toEqual({ cardId: CARD_ID });
    const on = await screen.findByRole('button', { name: 'On your wishlist' });
    fireEvent.press(on);
    fireEvent.press(await screen.findByTestId('card-wishlist-remove-confirm'));
    await waitFor(() => expect(api.callsTo('DELETE /api/v1/wishlist/{id}')).toHaveLength(1));
    expect(api.callsTo('DELETE /api/v1/wishlist/{id}')[0]?.path).toBe('/api/v1/wishlist/w-new');
  });

  it('says nobody in the region lists the card, with the wishlist as the next step', async () => {
    mockApi(routes({ 'GET /api/v1/search/card-holders': ok(cardHoldersPage([])) }));
    render();
    const empty = await screen.findByTestId('holders-empty');
    expect(empty).toHaveTextContent(/Nobody in Americas \(North\) lists this card yet\./);
    expect(within(empty).getByRole('button', { name: 'Add to wishlist' })).toBeOnTheScreen();
  });

  it('shows a chosen Magic printing with its own artwork, and the Scryfall credit (stage R10)', async () => {
    const art = (id: string) => [
      { kind: 'FRONT' as const, url: `/api/v1/public/card-images/${id}`, width: 320, height: 446 },
    ];
    const archivist = cardDetailFixture({
      game: 'mtg',
      name: 'Zephyrine Archivist',
      primaryImageUrl: '/api/v1/public/card-images/art-ztk',
      printings: [
        printingFixture({ printingCode: 'ZTK-12', rarity: 'Uncommon', images: art('art-ztk') }),
        printingFixture({
          id: PRINTING_B,
          printingCode: 'ZCL-45',
          rarity: 'Rare',
          images: art('art-zcl'),
        }),
      ],
    });
    mockApi(routes({ 'GET /api/v1/cards/{id}': ok(archivist) }));
    render();
    const source = () => screen.getByTestId('card-picture-img').props.source;
    await waitFor(() =>
      expect(source()).toEqual([{ uri: 'http://localhost:8080/api/v1/public/card-images/art-ztk' }])
    );
    fireEvent.press(screen.getByTestId('card-printing'));
    const sheet = await screen.findByTestId('card-printing-sheet');
    fireEvent.press(within(sheet).getByRole('radio', { name: 'ZCL-45 · Rare' }));
    await waitFor(() =>
      expect(source()).toEqual([{ uri: 'http://localhost:8080/api/v1/public/card-images/art-zcl' }])
    );
    expect(screen.getByTestId('card-data-credit')).toHaveTextContent(
      /Card data and images courtesy of Scryfall\./
    );
  });

  it('credits the picture provider of Yu-Gi-Oh! cards', async () => {
    mockApi(routes());
    render();
    expect(await screen.findByTestId('card-data-credit')).toBeOnTheScreen();
  });

  it('says when a card does not exist, and when the holders could not load', async () => {
    mockApi(routes({ 'GET /api/v1/cards/{id}': problem(404, 'NOT_FOUND', 'Card not found') }));
    const first = render();
    expect(await screen.findByTestId('card-not-found')).toBeOnTheScreen();
    first.unmount();
    mockApi(routes({ 'GET /api/v1/search/card-holders': problem(500, 'INTERNAL_ERROR', 'Down') }));
    render();
    expect(await screen.findByTestId('holders-error')).toBeOnTheScreen();
  });
});
