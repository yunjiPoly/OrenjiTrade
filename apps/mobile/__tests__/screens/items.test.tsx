import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import EditCardScreen from '@/app/items/[id]';
import AddCardsScreen from '@/app/items/new';
import { useInventoryUiStore } from '@/src/features/inventory/inventoryUiStore';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  binderFixture,
  BINDER_ID,
  cardDetailFixture,
  CARD_ID,
  ITEM_ID,
  itemFixture,
  listingStatusFixture,
  meFixture,
  NOT_ONBOARDED,
  PRINTING_A,
  PRINTING_B,
  printingFixture,
  privacyFixture,
} from '../support/fixtures';
import { mockApi, noContent, ok, problem } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockDispatch, mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

/** What Edit card asked of the navigation: whether leaving is held back, and a way to try to leave. */
const mockLeave: { held: boolean; tryToLeave: () => void } = {
  held: false,
  tryToLeave: () => undefined,
};
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (held: boolean, callback: (options: { data: { action: unknown } }) => void) => {
    mockLeave.held = held;
    mockLeave.tryToLeave = () => callback({ data: { action: { type: 'GO_BACK' } } });
  },
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  useInventoryUiStore.setState({ lastSavedId: null, failedPhotos: {} });
  picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
  picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as never);
});

const port = () => new FakeAuthPort(testUser());

const PHOTO = {
  id: '00000000-0000-4000-8c10-000000000001',
  url: '/api/v1/public/media/items/photo-1.jpg',
  width: 1200,
  height: 900,
  sortOrder: 0,
};

function libraryPick(...names: string[]) {
  picker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: names.map((name) => ({
      uri: `file:///${name}`,
      mimeType: 'image/jpeg',
      fileName: name,
      fileSize: 120_000,
    })),
  } as never);
}

/** "Add photos" → "Choose from your photos" (the library), as on a phone. */
async function addFromLibrary() {
  fireEvent.press(screen.getByTestId('card-photos-add'));
  fireEvent.press(await screen.findByTestId('card-photos-library'));
}

const SUGGESTIONS = [
  {
    kind: 'PRINTING',
    id: CARD_ID,
    printingId: PRINTING_A,
    name: 'Emberfang Fox VMAX',
    game: 'pokemon',
    printingCode: 'SVX-001',
    setCode: 'SVX',
    setName: 'Stellar Vortex',
    rarity: 'Ultra Rare',
  },
  {
    kind: 'CARD',
    id: CARD_ID,
    name: 'Emberfang Fox VMAX',
    game: 'pokemon',
    printingCount: 2,
  },
];

describe('Add cards (screens 3 and 4)', () => {
  it('starts with the search, the two imports and the camera "Coming later"', async () => {
    mockApi(signedInRoutes());
    renderWithProviders(<AddCardsScreen />, { port: port() });
    expect(screen.getByRole('header', { name: 'Add cards' })).toBeOnTheScreen();
    expect(
      screen.getByText('The fastest way to add one card. You pick the printing next.')
    ).toBeOnTheScreen();
    expect(screen.getByText('ADD MANY AT ONCE')).toBeOnTheScreen();
    expect(screen.getByText('.ydk file from YGOPRODeck or EDOPro')).toBeOnTheScreen();
    expect(
      screen.getByText(".csv export. You check every match before it's added")
    ).toBeOnTheScreen();
    expect(screen.getByTestId('add-cards-scan')).toHaveTextContent(
      /Scan with camera.*Coming later/
    );
    expect(screen.getByTestId('add-cards-scan').props['aria-disabled']).toBe(true);
    expect(
      screen.getByText('New cards start private. You choose what to publish.')
    ).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Import a deck' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/items/import',
      params: { source: 'YDK' },
    });
    fireEvent.press(screen.getByRole('button', { name: 'Import from Collectr' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/items/import',
      params: { source: 'COLLECTR_CSV' },
    });
    fireEvent.press(screen.getByRole('button', { name: 'Back to Inventory' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('lists cards and the exact printings of a code while typing', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/cards/suggest': ok(SUGGESTIONS),
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
      })
    );
    renderWithProviders(<AddCardsScreen />, { port: port() });
    fireEvent.press(screen.getByTestId('add-cards-search'));
    const input = await screen.findByTestId('add-search-input');
    expect(screen.getByTestId('add-search-hint')).toHaveTextContent(
      'Tap a card to pick its printing, or an exact printing to go straight to the details.'
    );
    fireEvent.changeText(input, 'svx-0');
    const results = await screen.findByTestId('add-search-results');
    expect(results).toHaveTextContent(/CARDS.*Emberfang Fox VMAX.*Pokémon · 2 printings/);
    expect(results).toHaveTextContent(/EXACT PRINTINGS.*SVX-001.*Stellar Vortex.*Ultra Rare/);
    expect(api.callsTo('GET /api/v1/cards/suggest')[0]?.query.get('limit')).toBe('12');

    // Clear empties the field; Cancel goes back to Add cards.
    fireEvent.press(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByTestId('add-search-input').props.value).toBe('');
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByTestId('add-cards-start')).toBeOnTheScreen();
  });

  it('says when nothing matches, and when the search fails', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/cards/suggest': (request) =>
          request.query.get('q') === 'zz' ? ok([]) : problem(500, 'INTERNAL_ERROR', 'boom'),
      })
    );
    renderWithProviders(<AddCardsScreen />, { port: port() });
    fireEvent.press(screen.getByTestId('add-cards-search'));
    fireEvent.changeText(await screen.findByTestId('add-search-input'), 'zz');
    expect(await screen.findByText('No card matches “zz”')).toBeOnTheScreen();
    expect(
      screen.getByText('Try fewer letters, or the code printed on the card, like LAVD-EN008.')
    ).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('add-search-input'), 'boom');
    expect(await screen.findByText('Cards could not load')).toBeOnTheScreen();
    expect(screen.getByTestId('add-search-retry')).toBeOnTheScreen();
  });

  it('lists the printings that share a code apart, says what tells them apart, adds the one tapped', async () => {
    const twin = (printingId: string, edition: string) => ({
      kind: 'PRINTING',
      id: CARD_ID,
      printingId,
      name: 'Emberfang Fox VMAX',
      game: 'pokemon',
      printingCode: 'SVX-001',
      setCode: 'SVX',
      setName: 'Stellar Vortex',
      rarity: 'Ultra Rare',
      edition,
      language: 'en',
      finish: 'HOLO',
    });
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/cards/suggest': ok([
          twin(PRINTING_A, 'FIRST_EDITION'),
          twin(PRINTING_B, 'UNLIMITED'),
        ]),
        'GET /api/v1/cards/{id}': ok(
          cardDetailFixture({
            printings: [
              printingFixture({ edition: 'FIRST_EDITION' }),
              printingFixture({ id: PRINTING_B, edition: 'UNLIMITED' }),
            ],
          })
        ),
        'POST /api/v1/inventory/items': ok(itemFixture(), 201),
      })
    );
    renderWithProviders(<AddCardsScreen />, { port: port() });
    fireEvent.press(screen.getByTestId('add-cards-search'));
    fireEvent.changeText(await screen.findByTestId('add-search-input'), 'SVX-001');
    // Two rows, not one: each names its edition next to the code.
    const first = await screen.findByTestId(`add-printing-SVX-001-${PRINTING_A}`);
    const unlimited = screen.getByTestId(`add-printing-SVX-001-${PRINTING_B}`);
    expect(first).toHaveTextContent(/^SVX-0011st EditionStellar VortexUltra Rare$/);
    expect(unlimited).toHaveTextContent(/^SVX-001UnlimitedStellar VortexUltra Rare$/);
    expect(unlimited.props.accessibilityLabel).toMatch(/^SVX-001, Unlimited, /);

    fireEvent.press(unlimited);
    expect(await screen.findByTestId('card-header-variant')).toHaveTextContent('Unlimited');
    fireEvent.press(screen.getByTestId('add-item-submit'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/inventory/items')[0]?.body).toMatchObject({
        printingId: PRINTING_B,
      })
    );
  });
});

describe('Choose the printing and Add to inventory (screens 5 and 6)', () => {
  it('adds a card with a text price, a binder, a note and a photo, then says Saved with View', async () => {
    libraryPick('front.jpg');
    let created = false;
    const api = mockApi(
      signedInRoutes({
        // On the map, in a region, with a public binder: collectors can find the card.
        'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })),
        'GET /api/v1/me/settings/privacy': ok(privacyFixture({ discoverable: true })),
        'GET /api/v1/cards/suggest': ok(SUGGESTIONS),
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
        'GET /api/v1/binders': ok([
          binderFixture({ visibility: 'PUBLIC', effectivePublic: true, publicItemCount: 1 }),
        ]),
        'POST /api/v1/inventory/items': () => {
          created = true;
          return ok(itemFixture({ askingPriceText: '85% TCG' }), 201);
        },
        'POST /api/v1/inventory/items/{id}/images': ok(itemFixture({ images: [PHOTO] }), 201),
      })
    );
    renderWithProviders(<AddCardsScreen />, { port: port() });
    fireEvent.press(screen.getByTestId('add-cards-search'));
    fireEvent.changeText(await screen.findByTestId('add-search-input'), 'ember');
    fireEvent.press(await screen.findByTestId(`add-card-${CARD_ID}`));

    // Screen 5: the card, its printings and the rarity chips.
    expect(await screen.findByTestId('printing-picker-name')).toHaveTextContent(
      'Emberfang Fox VMAX'
    );
    expect(screen.getByTestId('printing-count')).toHaveTextContent(
      '2 printings. Pick the one on your card.'
    );
    // Two printings share the code: what tells them apart is said.
    const french = screen.getByTestId(`printing-SVX-001-${PRINTING_B}`);
    expect(french).toHaveTextContent(/Stellar Vortex · French · Reverse Holo/i);
    fireEvent.press(french);

    // Screen 6, in the order of the spec; the printing shares its code, so the header says which.
    expect(await screen.findByTestId('card-header-name')).toHaveTextContent('Emberfang Fox VMAX');
    expect(screen.getByTestId('card-header-code')).toHaveTextContent('SVX-001 · Stellar Vortex');
    expect(screen.getByTestId('card-header-variant')).toHaveTextContent('French · Reverse holo');
    expect(screen.getByTestId('card-quantity').props.value).toBe('1');
    expect(screen.getByTestId('card-price').props.placeholder).toBe('85% TCG or 12.50');
    expect(screen.getByRole('radio', { name: 'Private' })).toBeChecked();
    expect(screen.getByTestId('card-visibility-hint')).toHaveTextContent(
      'Only you see it until you make it public.'
    );
    expect(screen.getByRole('button', { name: 'Binder: No binder (unfiled)' })).toBeOnTheScreen();
    expect(screen.getByTestId('card-note').props.placeholder).toBe('NM, English, 1st, for trade');
    expect(screen.getByText('0 / 500')).toBeOnTheScreen();
    expect(screen.getByTestId('card-photos-count')).toHaveTextContent('0 / 4');
    expect(
      screen.getByText('Show the real card, front and back. Location data is removed.')
    ).toBeOnTheScreen();
    expect(
      screen.getByText('Change any of this later by tapping the card in Inventory.')
    ).toBeOnTheScreen();
    // Gone from the phone's form (section 6).
    for (const gone of [
      /Condition/,
      /Language/,
      /Edition/,
      /Finish/,
      /Available for/,
      /offers/i,
      /Currency/,
      /Temporarily/,
      /Private notes/,
    ]) {
      expect(screen.queryByText(gone)).toBeNull();
    }

    fireEvent.press(screen.getByRole('button', { name: 'One more' }));
    expect(screen.getByTestId('card-quantity').props.value).toBe('2');
    fireEvent.changeText(screen.getByTestId('card-price'), '85% TCG');
    fireEvent.press(screen.getByRole('radio', { name: 'Public' }));
    expect(screen.getByTestId('card-visibility-hint')).toHaveTextContent(
      'Collectors in Americas (North) can find it.'
    );
    fireEvent.press(screen.getByTestId('card-binder'));
    expect(await screen.findByRole('radio', { name: 'Trade binder' })).toBeOnTheScreen();
    expect(screen.queryByTestId(`card-binder-private-${BINDER_ID}`)).toBeNull();
    fireEvent.press(await screen.findByTestId(`card-binder-option-${BINDER_ID}`));
    expect(screen.getByTestId('card-visibility-hint')).toHaveTextContent(
      'Collectors in Americas (North) can find it.'
    );
    fireEvent.changeText(screen.getByTestId('card-note'), 'NM, English, 1st');
    expect(screen.getByText('16 / 500')).toBeOnTheScreen();
    await addFromLibrary();
    await waitFor(() => expect(screen.getByTestId('card-photos-count')).toHaveTextContent('1 / 4'));
    expect(created).toBe(false);

    fireEvent.press(screen.getByTestId('add-item-submit'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('POST /api/v1/inventory/items')[0]?.body).toEqual({
      printingId: PRINTING_B,
      quantity: 2,
      visibility: 'PUBLIC',
      availability: 'TRADE_OR_SALE',
      acceptsOffers: false,
      conditionStated: false,
      askingPriceText: '85% TCG',
      publicNotes: 'NM, English, 1st',
      binderId: BINDER_ID,
    });
    // The photo after the card (section 12, "Photos while adding").
    const upload = api.callsTo('POST /api/v1/inventory/items/{id}/images')[0];
    expect(upload?.path).toBe(`/api/v1/inventory/items/${ITEM_ID}/images`);
    expect(upload?.headers.get('content-type')).toMatch(/multipart\/form-data/);

    // "Saved · {card}" with "View", which opens Edit card; the card is ringed in Inventory.
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      /Saved.*Emberfang Fox VMAX.*View/
    );
    expect(useInventoryUiStore.getState().lastSavedId).toBe(ITEM_ID);
    fireEvent.press(screen.getByTestId('snackbar-view'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/items/[id]',
      params: { id: ITEM_ID },
    });
  });

  it('keeps the card when a photo fails and opens Edit card with "Try again"', async () => {
    libraryPick('front.jpg', 'back.jpg');
    mockParams.current = { cardId: CARD_ID, printingId: PRINTING_A };
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
        'POST /api/v1/inventory/items': ok(itemFixture(), 201),
        'POST /api/v1/inventory/items/{id}/images': [
          ok(itemFixture({ images: [PHOTO] }), 201),
          problem(500, 'INTERNAL_ERROR', 'boom'),
        ],
      })
    );
    renderWithProviders(<AddCardsScreen />, { port: port() });
    await screen.findByTestId('card-header-name');
    await addFromLibrary();
    await waitFor(() => expect(screen.getByTestId('card-photos-count')).toHaveTextContent('2 / 4'));
    fireEvent.press(screen.getByTestId('add-item-submit'));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/items/[id]',
        params: { id: ITEM_ID },
      })
    );
    expect(api.callsTo('POST /api/v1/inventory/items/{id}/images')).toHaveLength(2);
    // The photo that failed waits for Edit card ("Try again": a server error may pass).
    const failed = useInventoryUiStore.getState().failedPhotos[ITEM_ID] ?? [];
    expect(failed.map((photo) => photo.fileName)).toEqual(['back.jpg']);
    expect(failed[0]?.problem).toBeNull();
    expect(mockRouter.back).not.toHaveBeenCalled();
    // The toast says it, not a plain "Saved".
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      /^Saved · 1 photo wasn't saved.*Emberfang Fox VMAX$/
    );
    expect(screen.queryByTestId('snackbar-view')).toBeNull();
  });

  it('keeps why the API refused a photo while adding, for Edit card', async () => {
    libraryPick('panorama.jpg');
    mockParams.current = { cardId: CARD_ID, printingId: PRINTING_A };
    mockApi(
      signedInRoutes({
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
        'POST /api/v1/inventory/items': ok(itemFixture(), 201),
        'POST /api/v1/inventory/items/{id}/images': problem(
          400,
          'VALIDATION_FAILED',
          'Validation failed',
          {
            errors: [
              {
                field: 'file',
                message: 'The image dimensions are not acceptable (at most 8192 pixels per side)',
              },
            ],
          }
        ),
      })
    );
    renderWithProviders(<AddCardsScreen />, { port: port() });
    await screen.findByTestId('card-header-name');
    await addFromLibrary();
    await waitFor(() => expect(screen.getByTestId('card-photos-count')).toHaveTextContent('1 / 4'));
    fireEvent.press(screen.getByTestId('add-item-submit'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
    expect(useInventoryUiStore.getState().failedPhotos[ITEM_ID]?.[0]?.problem).toBe(
      'This photo is too large: at most 8192 pixels on each side. Choose another one.'
    );
  });

  it('says why nobody can find a public card: a private binder (marked in the picker)', async () => {
    mockParams.current = { cardId: CARD_ID, printingId: PRINTING_A };
    mockApi(
      signedInRoutes({
        'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })),
        'GET /api/v1/me/settings/privacy': ok(privacyFixture({ discoverable: true })),
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
        // Private, as binders start.
        'GET /api/v1/binders': ok([binderFixture({ name: 'Personal collection' })]),
      })
    );
    renderWithProviders(<AddCardsScreen />, { port: port() });
    await screen.findByTestId('card-header-name');
    fireEvent.press(screen.getByRole('radio', { name: 'Public' }));
    const hint = () => screen.getByTestId('card-visibility-hint');
    await waitFor(() =>
      expect(hint()).toHaveTextContent('Collectors in Americas (North) can find it.')
    );
    fireEvent.press(screen.getByTestId('card-binder'));
    expect(await screen.findByTestId(`card-binder-private-${BINDER_ID}`)).toHaveTextContent(
      /Private$/
    );
    expect(
      screen.getByRole('radio', {
        name: "Personal collection, private binder: its cards don't show",
      })
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId(`card-binder-option-${BINDER_ID}`));
    expect(hint()).toHaveTextContent(
      'Its binder “Personal collection” is private, so nobody can find it yet. Publish the binder to show it.'
    );
    // Private again: the usual hint.
    fireEvent.press(screen.getByRole('radio', { name: 'Private' }));
    expect(hint()).toHaveTextContent('Only you see it until you make it public.');
  });

  it('says why nobody can find a public card: no location', async () => {
    mockParams.current = { cardId: CARD_ID, printingId: PRINTING_A };
    mockApi(
      signedInRoutes({
        'GET /api/v1/me': ok(
          meFixture({
            homeRegion: null,
            onboarding: { ...NOT_ONBOARDED, profileComplete: true, interestsSet: true },
          })
        ),
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
      })
    );
    renderWithProviders(<AddCardsScreen />, { port: port() });
    await screen.findByTestId('card-header-name');
    fireEvent.press(screen.getByRole('radio', { name: 'Public' }));
    await waitFor(() =>
      expect(screen.getByTestId('card-visibility-hint')).toHaveTextContent(
        'Nobody can find it yet: add your state or province in Settings › Location, then turn on “Show me on the map”.'
      )
    );
  });

  it('goes straight to the details from an exact printing, and back to the search', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/cards/suggest': ok(SUGGESTIONS),
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
      })
    );
    renderWithProviders(<AddCardsScreen />, { port: port() });
    fireEvent.press(screen.getByTestId('add-cards-search'));
    fireEvent.changeText(await screen.findByTestId('add-search-input'), 'svx-001');
    fireEvent.press(await screen.findByTestId('add-printing-SVX-001'));
    expect(await screen.findByTestId('card-header-code')).toHaveTextContent(
      'SVX-001 · Stellar Vortex'
    );
    fireEvent.press(screen.getByRole('button', { name: 'Back to the printings' }));
    // From an exact printing, back is the search, with what was typed.
    expect((await screen.findByTestId('add-search-input')).props.value).toBe('svx-001');
  });

  it('starts from a binder or a card page, validates, maps server errors', async () => {
    mockParams.current = { cardId: CARD_ID, printingId: PRINTING_A, binderId: BINDER_ID };
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
        'GET /api/v1/binders': ok([binderFixture()]),
        'POST /api/v1/inventory/items': problem(400, 'VALIDATION_FAILED', 'Invalid item', {
          errors: [{ field: 'askingPriceText', message: 'must be at most 40 characters' }],
        }),
      })
    );
    renderWithProviders(<AddCardsScreen />, { port: port() });
    await screen.findByTestId('card-header-name');
    expect(screen.getByRole('button', { name: 'Binder: Trade binder' })).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('card-quantity'), '0');
    fireEvent.changeText(screen.getByTestId('card-price'), 'x'.repeat(41));
    fireEvent.press(screen.getByTestId('add-item-submit'));
    expect(await screen.findByText('Check the highlighted fields.')).toBeOnTheScreen();
    expect(screen.getByText('At least 1 copy.')).toBeOnTheScreen();
    expect(screen.getByText('At most 40 characters.')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/inventory/items')).toHaveLength(0);

    fireEvent.changeText(screen.getByTestId('card-quantity'), '1');
    fireEvent.changeText(screen.getByTestId('card-price'), '12');
    fireEvent.press(screen.getByTestId('add-item-submit'));
    expect(await screen.findByText('must be at most 40 characters')).toBeOnTheScreen();
    expect(screen.getByTestId('add-item-error')).toBeOnTheScreen();
  });

  it('explains a reached limit as a plain cap', async () => {
    mockParams.current = { cardId: CARD_ID, printingId: PRINTING_A };
    mockApi(
      signedInRoutes({
        // Free for all (owner, 2026-10-14): no upgrade, even while a Premium flag is still on.
        'GET /api/v1/public/feature-flags': ok({ premiumPlans: true }),
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
        'POST /api/v1/inventory/items': problem(429, 'LIMIT_REACHED', 'Limit reached', {
          limitKey: 'inventory.items.max',
          limit: 100,
          used: 100,
          planCode: 'FREE',
        }),
      })
    );
    renderWithProviders(<AddCardsScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('add-item-submit'));
    expect(await screen.findByTestId('add-item-error')).toHaveTextContent(
      /Your inventory is full: it holds at most 100 cards\. Delete a card you no longer have to add another\.$/
    );
    expect(screen.queryByText(/Premium|plan/)).toBeNull();
    expect(screen.queryByTestId('limit-reached')).toBeNull();
  });

  it('filters the printings by set and rarity, and shows an error when the card cannot load', async () => {
    mockParams.current = { cardId: CARD_ID };
    const many = cardDetailFixture({
      printings: [
        { code: 'LAVD-EN008', set: 'Legendary Arc-V Decks', rarity: 'Common', date: '2025-01-10' },
        { code: 'MACR-EN036', set: 'Maximum Crisis', rarity: 'Secret', date: '2017-05-04' },
        {
          code: 'RA01-EN008',
          set: '25th Anniversary Rarity Collection',
          rarity: 'Quarter Century',
          date: null,
        },
        { code: 'MAGO-EN021', set: 'Maximum Gold', rarity: 'Secret', date: '2020-11-13' },
      ].map((entry, index) => ({
        ...cardDetailFixture().printings![0]!,
        id: `p-${index}`,
        printingCode: entry.code,
        setName: entry.set,
        rarity: entry.rarity,
        setReleaseDate: entry.date,
      })),
    });
    mockApi(signedInRoutes({ 'GET /api/v1/cards/{id}': ok(many) }));
    const { unmount } = renderWithProviders(<AddCardsScreen />, { port: port() });
    expect(await screen.findByTestId('printing-MACR-EN036')).toHaveTextContent(
      /Maximum Crisis · 2017/
    );
    // No year known: the set alone.
    expect(screen.getByTestId('printing-RA01-EN008')).toHaveTextContent(
      /25th Anniversary Rarity Collection(?! ·)/
    );
    fireEvent.press(screen.getByTestId('printing-rarity-Secret'));
    expect(screen.queryByTestId('printing-LAVD-EN008')).toBeNull();
    expect(screen.getByTestId('printing-MAGO-EN021')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('printing-rarity-all'));
    fireEvent.changeText(screen.getByTestId('printing-filter'), 'lavd');
    expect(screen.getByTestId('printing-LAVD-EN008')).toBeOnTheScreen();
    expect(screen.queryByTestId('printing-MACR-EN036')).toBeNull();
    fireEvent.changeText(screen.getByTestId('printing-filter'), 'nothing');
    expect(screen.getByTestId('printing-none')).toBeOnTheScreen();
    unmount();

    mockApi(signedInRoutes({ 'GET /api/v1/cards/{id}': problem(500, 'INTERNAL_ERROR', 'boom') }));
    renderWithProviders(<AddCardsScreen />, { port: port() });
    expect(await screen.findByText('This card could not load')).toBeOnTheScreen();
  });
});

describe('Edit card (screen 7)', () => {
  beforeEach(() => {
    mockParams.current = { id: ITEM_ID };
  });

  it('is filled in, says "No changes yet" until a change, and a save confirms the card', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': ok(
          itemFixture({ askingPriceText: '85% TCG', askingPrice: null, visibility: 'PUBLIC' })
        ),
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
        'PATCH /api/v1/inventory/items/{id}': ok(itemFixture({ quantity: 3 })),
      })
    );
    renderWithProviders(<EditCardScreen />, { port: port() });
    expect(await screen.findByTestId('card-header-name')).toHaveTextContent('Emberfang Fox VMAX');
    expect(screen.getByTestId('card-header-code')).toHaveTextContent(/^SVX-001$/);
    // Its code is shared by a French reverse holo: the header says which one this is.
    expect(await screen.findByTestId('card-header-variant')).toHaveTextContent('English · Holo');
    // Public, but hidden from the map (the privacy settings of the fixture): nobody can find it.
    expect(screen.getByTestId('card-visibility-hint')).toHaveTextContent(
      'You are hidden from the map, so nobody can find it yet. Turn on “Show me on the map” in Settings › Location.'
    );
    expect(screen.getByTestId('card-quantity').props.value).toBe('2');
    expect(screen.getByTestId('card-price').props.value).toBe('85% TCG');
    expect(screen.getByRole('radio', { name: 'Public' })).toBeChecked();
    expect(screen.getByTestId('card-note').props.value).toBe('Sleeved.');
    const save = screen.getByTestId('edit-item-save');
    expect(save).toBeDisabled();
    expect(save).toHaveTextContent('No changes yet');
    expect(screen.getByRole('button', { name: 'Delete this card' })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'One more' }));
    expect(screen.getByTestId('edit-item-save')).toBeEnabled();
    expect(screen.getByTestId('edit-item-save')).toHaveTextContent('Save changes');
    // Undone by hand: no change again.
    fireEvent.press(screen.getByRole('button', { name: 'One less' }));
    expect(screen.getByTestId('edit-item-save')).toBeDisabled();

    fireEvent.press(screen.getByRole('button', { name: 'One more' }));
    fireEvent.changeText(screen.getByTestId('card-price'), '90% TCG');
    fireEvent.press(screen.getByTestId('edit-item-save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('PATCH /api/v1/inventory/items/{id}')[0]?.body).toEqual({
      quantity: 3,
      askingPriceText: '90% TCG',
      confirm: true,
    });
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      /Saved.*Emberfang Fox VMAX.*View/
    );
  });

  it('saves added and removed photos with the button, and offers "Try again" for one that failed', async () => {
    libraryPick('new.jpg');
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': ok(itemFixture({ images: [PHOTO] })),
        'PATCH /api/v1/inventory/items/{id}': ok(itemFixture()),
        'DELETE /api/v1/inventory/items/{id}/images/{imageId}': noContent,
        'POST /api/v1/inventory/items/{id}/images': [
          problem(500, 'INTERNAL_ERROR', 'boom'),
          ok(itemFixture({ images: [PHOTO] }), 201),
        ],
      })
    );
    renderWithProviders(<EditCardScreen />, { port: port() });
    expect(await screen.findByTestId('card-photos-count')).toHaveTextContent('1 / 4');
    fireEvent.press(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(screen.getByTestId('card-photos-count')).toHaveTextContent('0 / 4');
    expect(screen.getByTestId('edit-item-save')).toBeEnabled();
    await addFromLibrary();
    await waitFor(() => expect(screen.getByTestId('card-photos-count')).toHaveTextContent('1 / 4'));
    // Nothing reaches the server before "Save changes".
    expect(api.callsTo('DELETE /api/v1/inventory/items/{id}/images/{imageId}')).toHaveLength(0);

    fireEvent.press(screen.getByTestId('edit-item-save'));
    expect(await screen.findByTestId('card-photos-failed')).toHaveTextContent(
      /^1 photo wasn't saved\. Try again\.Try again$/
    );
    // Photos alone: the save still confirms the card.
    expect(api.callsTo('PATCH /api/v1/inventory/items/{id}')[0]?.body).toEqual({ confirm: true });
    expect(api.callsTo('DELETE /api/v1/inventory/items/{id}/images/{imageId}')[0]?.path).toBe(
      `/api/v1/inventory/items/${ITEM_ID}/images/${PHOTO.id}`
    );
    expect(mockRouter.back).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByTestId('card-photos-failed')).toBeNull());
    expect(api.callsTo('POST /api/v1/inventory/items/{id}/images')).toHaveLength(2);
  });

  it('shows the photos not saved when the card was added, ready for "Try again"', async () => {
    useInventoryUiStore.setState({
      failedPhotos: {
        [ITEM_ID]: [
          { key: 'local-9', uri: 'file:///back.jpg', mimeType: 'image/jpeg', fileName: 'back.jpg' },
        ],
      },
    });
    mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': ok(itemFixture()),
        'POST /api/v1/inventory/items/{id}/images': ok(itemFixture({ images: [PHOTO] }), 201),
      })
    );
    renderWithProviders(<EditCardScreen />, { port: port() });
    expect(await screen.findByTestId('card-photos-failed')).toHaveTextContent(
      /^1 photo wasn't saved\. Try again\.Try again$/
    );
    expect(useInventoryUiStore.getState().failedPhotos[ITEM_ID]).toBeUndefined();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByTestId('card-photos-failed')).toBeNull());
  });

  it('says why the API refused a photo, and offers only to remove it', async () => {
    libraryPick('panorama.jpg');
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': ok(itemFixture()),
        'PATCH /api/v1/inventory/items/{id}': ok(itemFixture()),
        'POST /api/v1/inventory/items/{id}/images': problem(
          400,
          'VALIDATION_FAILED',
          'Validation failed',
          {
            errors: [
              {
                field: 'file',
                message: 'The image dimensions are not acceptable (at most 8192 pixels per side)',
              },
            ],
          }
        ),
      })
    );
    renderWithProviders(<EditCardScreen />, { port: port() });
    await screen.findByTestId('card-photos-count');
    await addFromLibrary();
    await waitFor(() => expect(screen.getByTestId('card-photos-count')).toHaveTextContent('1 / 4'));
    fireEvent.press(screen.getByTestId('edit-item-save'));
    expect(await screen.findByTestId('card-photos-refused')).toHaveTextContent(
      /^Photo 1 wasn't saved\. This photo is too large: at most 8192 pixels on each side\. Choose another one\.Remove it$/
    );
    // "Try again" could never work: it is not offered, and leaving does not ask for this photo.
    expect(screen.queryByTestId('card-photos-failed')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(mockLeave.held).toBe(false);
    fireEvent.press(screen.getByRole('button', { name: 'Remove it' }));
    expect(screen.queryByTestId('card-photos-refused')).toBeNull();
    expect(screen.getByTestId('card-photos-count')).toHaveTextContent('0 / 4');
    expect(api.callsTo('POST /api/v1/inventory/items/{id}/images')).toHaveLength(1);
  });

  it('asks before leaving photos that were not saved', async () => {
    useInventoryUiStore.setState({
      failedPhotos: {
        [ITEM_ID]: [
          { key: 'local-7', uri: 'file:///back.jpg', mimeType: 'image/jpeg', fileName: 'back.jpg' },
        ],
      },
    });
    mockApi(signedInRoutes({ 'GET /api/v1/inventory/items/{id}': ok(itemFixture()) }));
    renderWithProviders(<EditCardScreen />, { port: port() });
    expect(await screen.findByTestId('card-photos-failed')).toBeOnTheScreen();
    expect(mockLeave.held).toBe(true);

    act(() => mockLeave.tryToLeave());
    const sheet = await screen.findByTestId('edit-item-leave-sheet');
    expect(within(sheet).getByText('Leave without this photo?')).toBeOnTheScreen();
    expect(
      within(sheet).getByText(
        "It wasn't saved, and it is lost when you leave. Try again to save it."
      )
    ).toBeOnTheScreen();
    fireEvent.press(within(sheet).getByRole('button', { name: 'Stay' }));
    expect(mockDispatch).not.toHaveBeenCalled();
    act(() => mockLeave.tryToLeave());
    fireEvent.press(await screen.findByTestId('edit-item-leave-sheet-confirm'));
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' }));
  });

  it('leaves after a delete without asking about the photos that were not saved', async () => {
    useInventoryUiStore.setState({
      failedPhotos: {
        [ITEM_ID]: [
          { key: 'local-8', uri: 'file:///back.jpg', mimeType: 'image/jpeg', fileName: 'back.jpg' },
        ],
      },
    });
    mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': ok(itemFixture()),
        'DELETE /api/v1/inventory/items/{id}': noContent,
      })
    );
    renderWithProviders(<EditCardScreen />, { port: port() });
    await screen.findByTestId('card-photos-failed');
    expect(mockLeave.held).toBe(true);
    fireEvent.press(screen.getByTestId('edit-item-delete'));
    fireEvent.press(await screen.findByTestId('edit-item-delete-sheet-confirm'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(mockLeave.held).toBe(false);
    expect(screen.queryByTestId('edit-item-leave-sheet-confirm')).toBeNull();
  });

  it('refuses the wrong type before uploading, and a denied permission', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/inventory/items/{id}': ok(itemFixture()) }));
    renderWithProviders(<EditCardScreen />, { port: port() });
    await screen.findByTestId('card-photos-add');
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///a.gif', mimeType: 'image/gif', fileName: 'a.gif', fileSize: 100 }],
    } as never);
    await addFromLibrary();
    expect(await screen.findByTestId('card-photos-problem')).toHaveTextContent(
      'Use a JPEG, PNG or WebP photo.'
    );
    expect(screen.getByTestId('card-photos-count')).toHaveTextContent('0 / 4');
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false } as never);
    await addFromLibrary();
    await waitFor(() =>
      expect(screen.getByTestId('card-photos-problem')).toHaveTextContent(
        'Allow access to your photos to add one.'
      )
    );
    // No camera here (a simulator): said plainly.
    picker.launchCameraAsync.mockRejectedValue(new Error('Camera not available on simulator'));
    fireEvent.press(screen.getByTestId('card-photos-add'));
    fireEvent.press(await screen.findByTestId('card-photos-camera'));
    await waitFor(() =>
      expect(screen.getByTestId('card-photos-problem')).toHaveTextContent(
        'The camera is not available here. Choose a photo instead.'
      )
    );
  });

  it('hides "Add" once the card has four photos', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': ok(
          itemFixture({
            images: [0, 1, 2, 3].map((index) => ({ ...PHOTO, id: `p-${index}`, sortOrder: index })),
          })
        ),
      })
    );
    renderWithProviders(<EditCardScreen />, { port: port() });
    expect(await screen.findByTestId('card-photos-count')).toHaveTextContent('4 / 4');
    expect(screen.queryByTestId('card-photos-add')).toBeNull();
  });

  it('confirms a stale card as still available', async () => {
    const stale = itemFixture({
      visibility: 'PUBLIC',
      freshness: {
        state: 'HIDDEN',
        confirmedAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z',
        label: 'Updated 2 months ago',
      },
    });
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': [ok(stale), ok(itemFixture({ visibility: 'PUBLIC' }))],
        'POST /api/v1/inventory/items/{id}/confirm': ok(
          itemFixture({ visibility: 'PUBLIC', effectivePublic: true })
        ),
      })
    );
    renderWithProviders(<EditCardScreen />, { port: port() });
    expect(await screen.findByTestId('edit-item-stale')).toHaveTextContent(
      /hidden from other collectors until you confirm/
    );
    fireEvent.press(screen.getByTestId('edit-item-confirm'));
    expect(
      await screen.findByText('Confirmed: your card is listed as available again.')
    ).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/inventory/items/{id}/confirm')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByTestId('edit-item-stale')).not.toBeOnTheScreen());
  });

  it('deletes after the sheet, then undoes from the toast (screen 9)', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': ok(itemFixture()),
        'DELETE /api/v1/inventory/items/{id}': noContent,
        'POST /api/v1/inventory/items/{id}/restore': ok(itemFixture()),
      })
    );
    renderWithProviders(<EditCardScreen />, { port: port() });
    await screen.findByTestId('card-header-name');
    fireEvent.press(screen.getByTestId('edit-item-delete'));
    const sheet = await screen.findByTestId('edit-item-delete-sheet');
    expect(within(sheet).getByText('Delete Emberfang Fox VMAX?')).toBeOnTheScreen();
    expect(
      within(sheet).getByText(
        'It leaves your inventory and any binder. Its photos are deleted too.'
      )
    ).toBeOnTheScreen();
    fireEvent.press(within(sheet).getByRole('button', { name: 'Keep it' }));
    expect(api.callsTo('DELETE /api/v1/inventory/items/{id}')).toHaveLength(0);

    fireEvent.press(screen.getByTestId('edit-item-delete'));
    fireEvent.press(await screen.findByTestId('edit-item-delete-sheet-confirm'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('DELETE /api/v1/inventory/items/{id}')).toHaveLength(1);
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      /Card deleted.*Emberfang Fox VMAX.*Undo/
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('snackbar-undo'));
    });
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      /Card restored.*Emberfang Fox VMAX/
    );
    expect(api.callsTo('POST /api/v1/inventory/items/{id}/restore')[0]?.path).toBe(
      `/api/v1/inventory/items/${ITEM_ID}/restore`
    );
    expect(useInventoryUiStore.getState().lastSavedId).toBe(ITEM_ID);
  });

  it('says when the card is gone, and shows errors with retry', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': problem(404, 'NOT_FOUND', 'Not found'),
      })
    );
    const { unmount } = renderWithProviders(<EditCardScreen />, { port: port() });
    expect(await screen.findByText('This card is no longer in your inventory')).toBeOnTheScreen();
    unmount();

    mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': [
          problem(500, 'INTERNAL_ERROR', 'boom'),
          ok(itemFixture()),
        ],
      })
    );
    renderWithProviders(<EditCardScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('edit-item-error-retry'));
    expect(await screen.findByTestId('card-header-name')).toBeOnTheScreen();
  });
});
