import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import WishlistScreen from '@/app/(tabs)/wishlist';
import EditWishScreen from '@/app/wishlist/edit';
import NewWishScreen from '@/app/wishlist/new';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CARD_ID,
  PRINTING_A,
  WISH_ID,
  cardDetailFixture,
  locationFixture,
  planFixture,
  printingFixture,
  privacyFixture,
  wishFixture,
} from '../support/fixtures';
import { mockApi, noContent, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

const PLAN = {
  ...planFixture(25),
  limits: [
    ...(planFixture(25).limits ?? []),
    {
      key: 'wishlist.items.max',
      allowed: true,
      kind: 'CAP' as const,
      window: 'TOTAL' as const,
      limit: 20,
      used: 2,
    },
  ],
};

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/wishlist': ok([
      wishFixture({ printing: printingFixture() }),
      wishFixture({
        id: 'wish-rarity',
        card: { id: 'card-2', name: 'Lantern Fox', imageUrl: null },
        game: 'pokemon',
        rarity: 'Secret Rare',
        note: '',
        nearMintOnly: false,
        priceTerm: { label: '100% TCG+', percent: 100, orMore: true },
      }),
    ]),
    'GET /api/v1/me/plan': ok(PLAN),
    ...extra,
    // Last: `{id}` would also match `/cards/suggest`.
    'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
  });
}

const port = () => new FakeAuthPort(testUser());

describe('Wishlist tab', () => {
  it('lists wishes with which copy, the public note, the chips and the usage; no matches', async () => {
    mockApi(routes());
    renderWithProviders(<WishlistScreen />, { port: port() });
    expect(screen.getByTestId('wishlist-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId(`wish-${WISH_ID}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`wish-copy-${WISH_ID}`)).toHaveTextContent(
      'SVX-001 · Ultra Rare · Stellar Vortex · Holo'
    );
    expect(screen.getByTestId(`wish-note-${WISH_ID}`)).toHaveTextContent('“For my deck.”');
    expect(screen.getByTestId(`wish-chips-${WISH_ID}`)).toHaveTextContent(
      /Near Mint only.*85% TCG ≈ 32\.30 CAD/
    );
    expect(screen.getByTestId('wish-copy-wish-rarity')).toHaveTextContent(
      'Any printing · Secret Rare'
    );
    expect(screen.getByTestId('wish-chips-wish-rarity')).toHaveTextContent(/100% TCG\+$/);
    expect(screen.queryByTestId('wish-note-wish-rarity')).toBeNull();
    expect(screen.getByTestId('wishlist-count')).toHaveTextContent('2 wishes');
    expect(await screen.findByTestId('wishlist-usage')).toHaveTextContent(
      '2 of 20 wishes · Free plan'
    );
    // A location is set: no prompt. No matches, filters or alert switches any more.
    expect(screen.queryByTestId('wishlist-location-prompt')).toBeNull();
    expect(screen.queryByText(/match/i)).toBeNull();
    expect(screen.queryByTestId('wishlist-filter')).toBeNull();
    expect(screen.queryByTestId(`wish-active-${WISH_ID}`)).toBeNull();

    fireEvent.press(screen.getByTestId(`wish-name-${WISH_ID}`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: CARD_ID, printing: PRINTING_A },
    });
    fireEvent.press(screen.getByTestId('wish-name-wish-rarity'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: 'card-2', rarity: 'Secret Rare' },
    });
    fireEvent.press(screen.getByTestId(`wish-edit-${WISH_ID}`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/wishlist/edit',
      params: { id: WISH_ID },
    });
    fireEvent.press(screen.getByTestId('wishlist-add'));
    expect(mockRouter.push).toHaveBeenCalledWith('/wishlist/new');
  });

  it('turns "Let others see what you want" off and on (privacy setting wishlistVisible)', async () => {
    const api = mockApi(
      routes({
        'PUT /api/v1/me/settings/privacy': (request) => ok(request.body as object),
      })
    );
    renderWithProviders(<WishlistScreen />, { port: port() });
    const toggle = await screen.findByTestId('wishlist-visible');
    expect(toggle).toHaveTextContent(/Let others see what you want/);
    fireEvent.press(toggle);
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      'Your wishlist is hidden from others.'
    );
    expect(api.callsTo('PUT /api/v1/me/settings/privacy')[0]?.body).toEqual({
      ...privacyFixture(),
      wishlistVisible: false,
    });
  });

  it('prompts for a location so alerts can arrive, and removes a wish after confirming', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/me/location': ok({ discoverable: false }),
        'DELETE /api/v1/wishlist/{id}': noContent,
      })
    );
    renderWithProviders(<WishlistScreen />, { port: port() });
    expect(await screen.findByTestId('wishlist-location-prompt')).toHaveTextContent(
      /Set your country and state to get wishlist alerts/
    );
    fireEvent.press(screen.getByTestId('wishlist-location-action'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/location');

    fireEvent.press(screen.getByTestId(`wish-remove-${WISH_ID}`));
    const dialog = await screen.findByTestId('wish-remove-dialog');
    expect(dialog).toHaveTextContent(/Remove Azure-Eyes Sky Dragon\?/);
    fireEvent.press(within(dialog).getByTestId('wish-remove-dialog-confirm'));
    await waitFor(() => expect(screen.queryByTestId(`wish-${WISH_ID}`)).not.toBeOnTheScreen());
    expect(api.callsTo('DELETE /api/v1/wishlist/{id}')).toHaveLength(1);
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      'Azure-Eyes Sky Dragon removed from your wishlist.'
    );
  });

  it('shows the empty wishlist and an error with retry', async () => {
    mockApi(
      routes({
        'GET /api/v1/wishlist': [problem(500, 'INTERNAL_ERROR', 'Boom'), ok([])],
        'GET /api/v1/me/location': ok(locationFixture({ location: undefined })),
      })
    );
    renderWithProviders(<WishlistScreen />, { port: port() });
    expect(await screen.findByTestId('wishlist-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('wishlist-empty')).toHaveTextContent(/Your wishlist is empty/);
    expect(await screen.findByTestId('wishlist-location-prompt')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Add a card'));
    expect(mockRouter.push).toHaveBeenCalledWith('/wishlist/new');
  });
});

describe('Add and edit a wish', () => {
  it('adds a card from its page: note, Near Mint only, one price term and one printing', async () => {
    mockParams.current = { cardId: CARD_ID };
    const api = mockApi(
      routes({
        'POST /api/v1/wishlist': (request) => ok(wishFixture(request.body as object), 201),
      })
    );
    renderWithProviders(<NewWishScreen />, { port: port() });
    expect(await screen.findByTestId('wish-card')).toHaveTextContent(/Emberfang Fox VMAX/);
    // Nothing of the old form.
    for (const removed of [
      'wish-max-price',
      'wish-currency',
      'wish-trade',
      'wish-notes',
      'wish-active',
      'wish-condition',
      'wish-radius',
    ]) {
      expect(screen.queryByTestId(removed)).toBeNull();
    }
    expect(screen.getByTestId('wish-copy')).toHaveTextContent(/Any printing/);
    // With "Any printing" the terms have no amount.
    expect(await screen.findByTestId('wish-term-85')).toHaveTextContent('85% TCG');
    expect(screen.getByTestId('wish-term-85')).not.toHaveTextContent(/≈/);

    fireEvent.changeText(screen.getByTestId('wish-note'), 'Fictional wish');
    fireEvent.press(screen.getByTestId('wish-near-mint'));
    fireEvent.press(screen.getByTestId('wish-copy'));
    fireEvent.press(await screen.findByTestId(`wish-copy-option-${PRINTING_A}`));
    expect(screen.getByTestId('wish-term-85')).toHaveTextContent('85% TCG ≈ 32.30 CAD');
    expect(screen.getByTestId('wish-terms')).toHaveTextContent(/Sample market price/);
    // At most one term: the second replaces the first.
    fireEvent.press(screen.getByTestId('wish-term-80'));
    fireEvent.press(screen.getByTestId('wish-term-85'));
    expect(screen.getByTestId('wish-term-80')).not.toBeChecked();
    expect(screen.getByTestId('wish-term-85')).toBeChecked();
    fireEvent.press(screen.getByTestId('wish-save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('POST /api/v1/wishlist')[0]?.body).toEqual({
      printingId: PRINTING_A,
      note: 'Fictional wish',
      nearMintOnly: true,
      priceTerm: '85% TCG',
    });
    expect(screen.getByTestId('snackbar')).toHaveTextContent(/is on your wishlist/);
  });

  it('starts from the card autocomplete, keeps a picked printing, and explains refusals', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/cards/suggest': ok([
          {
            kind: 'PRINTING',
            id: CARD_ID,
            printingId: PRINTING_A,
            name: 'Azure-Eyes Sky Dragon',
            game: 'yugioh',
            printingCode: 'AZR-EN001',
            imageUrl: null,
          },
        ]),
        'POST /api/v1/wishlist': [
          problem(409, 'CONFLICT', ''),
          problem(429, 'LIMIT_REACHED', 'Limit', { limitKey: 'wishlist.items.max', limit: 20 }),
        ],
      })
    );
    renderWithProviders(<NewWishScreen />, { port: port() });
    expect(await screen.findByTestId('wish-card-step')).toHaveTextContent(
      /Which card are you looking for\?/
    );
    fireEvent.changeText(screen.getByTestId('card-picker-input'), 'AZR');
    fireEvent.press(await screen.findByTestId('suggestion-PRINTING-AZR-EN001'));
    expect(await screen.findByTestId('wish-copy')).toHaveTextContent(/SVX-001/);
    // Inline validation first.
    fireEvent.changeText(screen.getByTestId('wish-note'), 'x'.repeat(281));
    fireEvent.press(screen.getByTestId('wish-save'));
    expect(await screen.findByText('The note is limited to 280 characters.')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/wishlist')).toHaveLength(0);
    fireEvent.changeText(screen.getByTestId('wish-note'), '');
    fireEvent.press(screen.getByTestId('wish-save'));
    expect(await screen.findByTestId('wish-error')).toHaveTextContent(
      /This card is already on your wishlist with the same printing or rarity\.$/
    );
    expect(
      (api.callsTo('POST /api/v1/wishlist')[0]?.body as { printingId?: string }).printingId
    ).toBe(PRINTING_A);
    fireEvent.press(screen.getByTestId('wish-save'));
    expect(await screen.findByTestId('wish-error')).toHaveTextContent(
      /Your wishlist is full: your plan allows 20 wishes\. Remove one or upgrade to add more\.$/
    );
    // Another card can be chosen.
    fireEvent.press(screen.getByTestId('wish-change-card'));
    expect(await screen.findByTestId('wish-card-step')).toBeOnTheScreen();
  });

  it('starts on any printing of the rarity a link carries', async () => {
    mockParams.current = { cardId: CARD_ID, rarity: 'Ultra Rare' };
    const api = mockApi(
      routes({
        'POST /api/v1/wishlist': (request) => ok(wishFixture(request.body as object), 201),
      })
    );
    renderWithProviders(<NewWishScreen />, { port: port() });
    expect(await screen.findByTestId('wish-copy-section')).toHaveTextContent(
      /Any printing in Ultra Rare\./
    );
    fireEvent.press(screen.getByTestId('wish-save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('POST /api/v1/wishlist')[0]?.body).toEqual({
      cardId: CARD_ID,
      rarity: 'Ultra Rare',
      nearMintOnly: false,
    });
  });

  it('edits a wish with a PATCH of every field (and only those)', async () => {
    mockParams.current = { id: WISH_ID };
    const api = mockApi(
      routes({ 'PATCH /api/v1/wishlist/{id}': ok(wishFixture({ note: 'For my deck!' })) })
    );
    renderWithProviders(<EditWishScreen />, { port: port() });
    fireEvent.changeText(await screen.findByTestId('wish-note'), 'For my deck!');
    fireEvent.press(screen.getByTestId('wish-term-100-plus'));
    fireEvent.press(screen.getByTestId('wish-save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('PATCH /api/v1/wishlist/{id}')[0]?.body).toEqual({
      printingId: PRINTING_A,
      rarity: null,
      note: 'For my deck!',
      nearMintOnly: true,
      priceTerm: '100% TCG+',
    });
    expect(screen.getByTestId('snackbar')).toHaveTextContent('Wish updated.');
  });

  it('says when the wish to edit no longer exists', async () => {
    mockParams.current = { id: 'gone' };
    mockApi(routes());
    renderWithProviders(<EditWishScreen />, { port: port() });
    expect(await screen.findByTestId('wish-not-found')).toBeOnTheScreen();
  });
});
