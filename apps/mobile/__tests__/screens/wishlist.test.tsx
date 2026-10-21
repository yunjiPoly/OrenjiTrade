import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import SearchScreen from '@/app/(tabs)/search';
import EditWishScreen from '@/app/wishlist/edit';
import NewWishScreen from '@/app/wishlist/new';
import { useBrowsingGameStore } from '@/src/features/games/browsingGame';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CARD_ID,
  PRINTING_A,
  PRINTING_B,
  WISH_ID,
  cardDetailFixture,
  locationFixture,
  limitsFixture,
  printingFixture,
  notificationsFixture,
  wishFixture,
  wishlistAvailabilityFixture,
} from '../support/fixtures';
import { mockApi, noContent, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  // Search shows one game at a time (stage G): these cases browse Yu-Gi-Oh!.
  useBrowsingGameStore.setState({
    picked: { 'uid-maika': 'yugioh' },
    stored: { 'uid-maika': 'yugioh' },
  });
});

const LIMITS = {
  ...limitsFixture(25),
  limits: [
    ...(limitsFixture(25).limits ?? []),
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
        game: 'yugioh',
        rarity: 'Secret Rare',
        note: '',
        nearMintOnly: false,
        priceTerm: { label: '100% TCG+', percent: 100, orMore: true },
      }),
    ]),
    'GET /api/v1/me/limits': ok(LIMITS),
    ...extra,
    // Last: `{id}` would also match `/cards/suggest`.
    'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
  });
}

const port = () => new FakeAuthPort(testUser());

describe('Search › Wishlist (screen 15)', () => {
  function renderWishlist() {
    mockParams.current = { segment: 'wishlist' };
    return renderWithProviders(<SearchScreen />, { port: port() });
  }

  it('shows the browsed game’s wishes only, and names the game when it has none', async () => {
    mockApi(
      routes({
        'GET /api/v1/wishlist': ok([
          wishFixture({ printing: printingFixture() }),
          wishFixture({ id: 'wish-pokemon', game: 'pokemon' }),
        ]),
        'GET /api/v1/wishlist/availability': ok(wishlistAvailabilityFixture([])),
      })
    );
    renderWishlist();
    expect(await screen.findByTestId(`wish-${WISH_ID}`)).toBeOnTheScreen();
    expect(screen.queryByTestId('wish-wish-pokemon')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Wishlist, 1' })).toBeSelected();

    useBrowsingGameStore.setState({
      picked: { 'uid-maika': 'pokemon' },
      stored: { 'uid-maika': 'pokemon' },
    });
    expect(await screen.findByTestId('wish-wish-pokemon')).toBeOnTheScreen();
    expect(screen.queryByTestId(`wish-${WISH_ID}`)).toBeNull();
  });

  it('names the browsed game when the collector has wishes of other games only', async () => {
    useBrowsingGameStore.setState({
      picked: { 'uid-maika': 'pokemon' },
      stored: { 'uid-maika': 'pokemon' },
    });
    mockApi(
      routes({
        'GET /api/v1/wishlist': ok([wishFixture({ printing: printingFixture() })]),
        'GET /api/v1/wishlist/availability': ok(wishlistAvailabilityFixture([])),
      })
    );
    renderWishlist();
    expect(await screen.findByTestId('wishlist-empty')).toHaveTextContent(/No Pokémon wishes yet/);
    expect(screen.getByTestId('wishlist-empty')).toHaveTextContent(
      /Add the Pokémon cards you are looking for/
    );
    expect(screen.getByRole('tab', { name: 'Wishlist, 0' })).toBeSelected();
    // "Switch game" opens "Choose a game" (review fix 1, U4); the other game's wish shows.
    fireEvent.press(screen.getByRole('button', { name: 'Switch game' }));
    expect(await screen.findByText('Choose a game')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('radio', { name: 'Yu-Gi-Oh!' }));
    expect(await screen.findByTestId(`wish-${WISH_ID}`)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Switch game' })).toBeNull();
  });

  it('has no Switch game while the collector has no wish at all', async () => {
    mockApi(
      routes({
        'GET /api/v1/wishlist': ok([]),
        'GET /api/v1/wishlist/availability': ok(wishlistAvailabilityFixture([])),
      })
    );
    renderWishlist();
    expect(await screen.findByTestId('wishlist-empty')).toHaveTextContent(/No wishes yet/);
    expect(screen.queryByRole('button', { name: 'Switch game' })).toBeNull();
  });

  it('lists the wishes with their terms, Available or None yet, and no count', async () => {
    const api = mockApi(
      routes({ 'GET /api/v1/wishlist/availability': ok(wishlistAvailabilityFixture([WISH_ID])) })
    );
    renderWishlist();
    expect(await screen.findByTestId(`wish-${WISH_ID}`)).toHaveTextContent(/Azure-Eyes Sky Dragon/);
    expect(screen.getByTestId(`wish-${WISH_ID}-terms`)).toHaveTextContent(
      'SVX-001 · NM only · 85% TCG'
    );
    expect(screen.getByTestId('wish-wish-rarity-terms')).toHaveTextContent(
      'Any printing · Secret Rare · 100% TCG+'
    );
    expect(await screen.findByTestId(`wish-${WISH_ID}-available`)).toHaveTextContent('Available');
    expect(screen.getByTestId('wish-wish-rarity-none')).toHaveTextContent('None yet');
    // The browsed region and game are asked for; no usage line while the cap is far.
    expect(api.callsTo('GET /api/v1/wishlist/availability')[0]?.query.get('region')).toBe(
      'americas-north'
    );
    expect(api.callsTo('GET /api/v1/wishlist/availability')[0]?.query.get('game')).toBe('yugioh');
    expect(screen.queryByTestId('wishlist-usage')).toBeNull();
    // "Let others see what you want" lives in Settings › Privacy now.
    expect(screen.queryByText('Let others see what you want')).toBeNull();
    // The segment's tab carries the number of wishes.
    expect(screen.getByRole('tab', { name: 'Wishlist, 2' })).toBeSelected();

    // Available opens Who has this card on the wished printing; a row edits the wish.
    fireEvent.press(screen.getByTestId(`wish-${WISH_ID}-available`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: CARD_ID, printing: PRINTING_A },
    });
    fireEvent.press(screen.getByTestId('wish-wish-rarity-edit'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/wishlist/edit',
      params: { id: 'wish-rarity' },
    });
    fireEvent.press(screen.getByRole('button', { name: 'Add a wish' }));
    // The card search offers the browsed game's cards (review fix 1, U1).
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/wishlist/new',
      params: { game: 'yugioh' },
    });
  });

  it('turns the wishlist alerts on and off (the setting of Settings › Notifications)', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/wishlist/availability': ok(wishlistAvailabilityFixture()),
        'GET /api/v1/me/settings/notifications': ok(notificationsFixture({ wishlistAlerts: true })),
        'PUT /api/v1/me/settings/notifications': (request) =>
          ok(
            notificationsFixture({
              wishlistAlerts: (request.body as { wishlistAlerts: boolean }).wishlistAlerts,
            })
          ),
      })
    );
    renderWishlist();
    const alerts = await screen.findByTestId('wishlist-alerts-switch');
    await waitFor(() => expect(alerts).toHaveProp('value', true));
    fireEvent(alerts, 'valueChange', false);
    await waitFor(() =>
      expect(api.callsTo('PUT /api/v1/me/settings/notifications')).toHaveLength(1)
    );
    expect(api.callsTo('PUT /api/v1/me/settings/notifications')[0]?.body).toMatchObject({
      wishlistAlerts: false,
    });
    expect(await screen.findByText('Wishlist alerts are off.')).toBeOnTheScreen();
  });

  it("puts the alert sentence under the bell and the switch, and a wish's status under it, at the largest text size", async () => {
    mockApi(routes({ 'GET /api/v1/wishlist/availability': ok(wishlistAvailabilityFixture()) }));
    const window = Dimensions.get('window');
    const textSize = (fontScale: number) =>
      act(() => {
        Dimensions.set({
          window: { ...window, fontScale },
          screen: { ...window, fontScale },
        });
      });
    const order = () => {
      const row = screen.getByTestId('wishlist-alerts-row');
      const ids = (row.children as { props: { testID?: string } }[])
        .map((child) => child.props.testID)
        .filter((id) => id === 'wishlist-alerts-switch' || id === 'wishlist-alerts-text');
      return ids;
    };
    textSize(3.1);
    try {
      renderWishlist();
      await screen.findByTestId('wishlist-alerts-switch');
      // The switch shares the first line with the bell; the sentence takes the whole width
      // under them (beside them, "someone" broke in the middle).
      expect(order()).toEqual(['wishlist-alerts-switch', 'wishlist-alerts-text']);
      expect(screen.getByTestId('wishlist-alerts-text')).toHaveStyle({ width: '100%' });
      expect(screen.getByTestId('wishlist-alerts-row')).toHaveStyle({ flexWrap: 'wrap' });
      // A wish: "Available" or "None yet" under the card, not beside it.
      await screen.findByTestId(`wish-${WISH_ID}-none`);
      expect(screen.getByTestId(`wish-${WISH_ID}`)).toHaveStyle({ flexDirection: 'column' });
    } finally {
      textSize(window.fontScale);
    }
  });

  it('keeps the alert sentence and its switch on one line at the default text size', async () => {
    mockApi(routes({ 'GET /api/v1/wishlist/availability': ok(wishlistAvailabilityFixture()) }));
    const window = Dimensions.get('window');
    const textSize = (fontScale: number) =>
      act(() => {
        Dimensions.set({
          window: { ...window, fontScale },
          screen: { ...window, fontScale },
        });
      });
    textSize(1);
    try {
      renderWishlist();
      await screen.findByTestId('wishlist-alerts-switch');
      const row = screen.getByTestId('wishlist-alerts-row');
      const ids = (row.children as { props: { testID?: string } }[])
        .map((child) => child.props.testID)
        .filter((id) => id === 'wishlist-alerts-switch' || id === 'wishlist-alerts-text');
      expect(ids).toEqual(['wishlist-alerts-text', 'wishlist-alerts-switch']);
      expect(screen.getByTestId('wishlist-alerts-text')).not.toHaveStyle({ width: '100%' });
      await screen.findByTestId(`wish-${WISH_ID}-none`);
      expect(screen.getByTestId(`wish-${WISH_ID}`)).toHaveStyle({ flexDirection: 'row' });
    } finally {
      textSize(window.fontScale);
    }
  });

  it('shows a usage line only near the cap, and the location prompt without a location', async () => {
    mockApi(
      routes({
        'GET /api/v1/wishlist/availability': ok(wishlistAvailabilityFixture()),
        'GET /api/v1/me/location': ok(locationFixture({ location: undefined })),
        'GET /api/v1/me/limits': ok({
          ...LIMITS,
          limits: [
            {
              key: 'wishlist.items.max',
              allowed: true,
              kind: 'CAP',
              window: 'TOTAL',
              limit: 20,
              used: 18,
            },
          ],
        }),
      })
    );
    renderWishlist();
    expect(await screen.findByTestId('wishlist-usage')).toHaveTextContent('18 of 20 wishes');
    expect(await screen.findByTestId('wishlist-location-prompt')).toBeOnTheScreen();
  });

  it('shows the empty wishlist and an error with retry', async () => {
    mockApi(routes({ 'GET /api/v1/wishlist': ok([]) }));
    const first = renderWishlist();
    expect(await screen.findByTestId('wishlist-empty')).toHaveTextContent(/No wishes yet/);
    first.unmount();
    mockApi(routes({ 'GET /api/v1/wishlist': problem(500, 'INTERNAL_ERROR', 'Down') }));
    renderWishlist();
    expect(await screen.findByTestId('wishlist-error')).toBeOnTheScreen();
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

  it('starts from the card autocomplete, keeps the printing of a code only one printing has, and explains refusals', async () => {
    const api = mockApi({
      ...routes({
        'GET /api/v1/cards/suggest': ok([
          {
            kind: 'PRINTING',
            id: CARD_ID,
            printingId: PRINTING_A,
            name: 'Emberfang Fox VMAX',
            game: 'pokemon',
            printingCode: 'SVX-001',
            imageUrl: null,
          },
        ]),
        'POST /api/v1/wishlist': [
          problem(409, 'CONFLICT', ''),
          problem(429, 'LIMIT_REACHED', 'Limit', { limitKey: 'wishlist.items.max', limit: 20 }),
        ],
      }),
      // One printing only carries SVX-001 here.
      'GET /api/v1/cards/{id}': ok(
        cardDetailFixture({
          printings: [
            printingFixture(),
            printingFixture({ id: 'printing-2', printingCode: 'SVX-002', rarity: 'Common' }),
          ],
        })
      ),
    });
    renderWithProviders(<NewWishScreen />, { port: port() });
    expect(await screen.findByTestId('wish-card-step')).toHaveTextContent(
      /Which card are you looking for\?/
    );
    fireEvent.changeText(screen.getByTestId('card-picker-input'), 'SVX');
    fireEvent.press(await screen.findByTestId('suggestion-PRINTING-SVX-001'));
    expect(await screen.findByTestId('wish-copy')).toHaveTextContent(/SVX-001/);
    // The chosen printing is written out in full under the field.
    expect(screen.getByTestId('wish-copy-hint')).toHaveTextContent(
      'Only SVX-001 · Ultra Rare · Stellar Vortex · Unlimited · English · Holo.'
    );
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
      /Your wishlist is full: it holds up to 20 wishes\. Remove one to add another\.$/
    );
    // Another card can be chosen.
    fireEvent.press(screen.getByTestId('wish-change-card'));
    expect(await screen.findByTestId('wish-card-step')).toBeOnTheScreen();
  });

  it('offers the browsed game’s cards only when it opens from Search › Wishlist (review fix 1, U1)', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/cards/suggest': ok([
          {
            kind: 'CARD',
            id: CARD_ID,
            name: 'Emberfang Fox VMAX',
            game: 'pokemon',
            imageUrl: null,
          },
        ]),
      })
    );
    mockParams.current = { game: 'pokemon' };
    renderWithProviders(<NewWishScreen />, { port: port() });
    expect(await screen.findByLabelText('Pokémon card name or printing code')).toBeOnTheScreen();
    expect(screen.getByTestId('card-picker-hint')).toHaveTextContent(
      'Type at least two letters of the name, or a printing code.'
    );
    fireEvent.changeText(screen.getByTestId('card-picker-input'), 'ember');
    expect(await screen.findByTestId('card-picker-results')).toBeOnTheScreen();
    const asked = api.callsTo('GET /api/v1/cards/suggest');
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.map((call) => call.query.get('game'))).toEqual(asked.map(() => 'pokemon'));
  });

  it('offers every game when it opens without a game (a link, the old Wishlist tab)', async () => {
    const api = mockApi(routes({ 'GET /api/v1/cards/suggest': ok([]) }));
    renderWithProviders(<NewWishScreen />, { port: port() });
    expect(await screen.findByLabelText('Card name or printing code')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('card-picker-input'), 'ember');
    expect(await screen.findByTestId('card-picker-empty')).toHaveTextContent(
      'No cards match “ember”.'
    );
    expect(api.callsTo('GET /api/v1/cards/suggest').at(-1)?.query.get('game')).toBeNull();
  });

  it('starts on any printing for a typed code that two printings share (never a silent pick)', async () => {
    // The fixture card has two printings with the code SVX-001 (English holo, French reverse holo).
    const api = mockApi(
      routes({
        'GET /api/v1/cards/suggest': ok([
          {
            kind: 'PRINTING',
            id: CARD_ID,
            printingId: PRINTING_A,
            name: 'Emberfang Fox VMAX',
            game: 'pokemon',
            printingCode: 'SVX-001',
            imageUrl: null,
          },
        ]),
        'POST /api/v1/wishlist': (request) => ok(wishFixture(request.body as object), 201),
      })
    );
    renderWithProviders(<NewWishScreen />, { port: port() });
    fireEvent.changeText(await screen.findByTestId('card-picker-input'), 'SVX-001');
    fireEvent.press(await screen.findByTestId('suggestion-PRINTING-SVX-001'));
    expect(await screen.findByTestId('wish-copy')).toHaveTextContent(/Any printing/);
    expect(screen.getByTestId('wish-copy')).not.toHaveTextContent(/SVX-001/);
    expect(screen.getByTestId('wish-copy-hint')).toHaveTextContent(
      'Any printing of the card. 2 printings share the code SVX-001: choose one in “Which copy” for that copy only.'
    );
    // "Which copy" offers both printings of the code, each named in full.
    fireEvent.press(screen.getByTestId('wish-copy'));
    expect(await screen.findByTestId(`wish-copy-option-${PRINTING_A}`)).toHaveTextContent(
      /SVX-001 · Ultra Rare · Stellar Vortex · Unlimited · English · Holo/
    );
    expect(screen.getByTestId(`wish-copy-option-${PRINTING_B}`)).toHaveTextContent(
      /SVX-001 · Ultra Rare · Stellar Vortex · Unlimited · French · Reverse holo/
    );
    fireEvent.press(screen.getByTestId('wish-copy-option-'));
    // Saved as it stands, the wish is for any printing of the card.
    fireEvent.press(screen.getByTestId('wish-save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('POST /api/v1/wishlist')[0]?.body).toEqual({
      cardId: CARD_ID,
      nearMintOnly: false,
    });
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

  it('removes a wish from its edit screen after asking (the Wishlist tab is gone)', async () => {
    mockParams.current = { id: WISH_ID };
    mockRouter.canGoBack.mockReturnValue(false);
    const api = mockApi(routes({ 'DELETE /api/v1/wishlist/{id}': noContent }));
    renderWithProviders(<EditWishScreen />, { port: port() });
    fireEvent.press(await screen.findByRole('button', { name: 'Remove from wishlist' }));
    expect(await screen.findByTestId('wish-remove-dialog')).toHaveTextContent(
      /Your wish for Azure-Eyes Sky Dragon .* will be removed/
    );
    fireEvent.press(screen.getByTestId('wish-remove-dialog-confirm'));
    await waitFor(() => expect(api.callsTo('DELETE /api/v1/wishlist/{id}')).toHaveLength(1));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/search',
        params: { segment: 'wishlist' },
      })
    );
    expect(screen.getByTestId('snackbar')).toHaveTextContent(
      'Azure-Eyes Sky Dragon left your wishlist.'
    );
    mockRouter.canGoBack.mockReturnValue(true);
  });

  it('says when the wish to edit no longer exists', async () => {
    mockParams.current = { id: 'gone' };
    mockApi(routes());
    renderWithProviders(<EditWishScreen />, { port: port() });
    expect(await screen.findByTestId('wish-not-found')).toBeOnTheScreen();
  });
});
