import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Linking } from 'react-native';

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
