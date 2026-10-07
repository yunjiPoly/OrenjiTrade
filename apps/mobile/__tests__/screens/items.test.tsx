import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import EditItemScreen from '@/app/items/[id]';
import AddItemScreen from '@/app/items/new';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  binderFixture,
  BINDER_ID,
  cardDetailFixture,
  CARD_ID,
  ITEM_ID,
  itemFixture,
  PRINTING_A,
  PRINTING_B,
} from '../support/fixtures';
import { mockApi, noContent, ok, problem } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

const port = () => new FakeAuthPort(testUser());

const PHOTO = {
  id: '00000000-0000-4000-8c10-000000000001',
  url: '/api/v1/public/media/items/photo-1.jpg',
  width: 1200,
  height: 900,
  sortOrder: 0,
};

describe('Item photos', () => {
  beforeEach(() => {
    mockParams.current = { id: ITEM_ID };
  });

  it('adds a photo from the library (multipart) and removes one', async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///card.jpg',
          mimeType: 'image/jpeg',
          fileName: 'card.jpg',
          fileSize: 120_000,
        },
      ],
    } as never);
    // The API keeps the photos of the item: the re-read after each write answers the same.
    let images = [] as (typeof PHOTO)[];
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': () => ok(itemFixture({ images })),
        'POST /api/v1/inventory/items/{id}/images': () => {
          images = [PHOTO];
          return ok(itemFixture({ images }), 201);
        },
        'DELETE /api/v1/inventory/items/{id}/images/{imageId}': () => {
          images = [];
          return noContent;
        },
      })
    );
    await renderWithProviders(<EditItemScreen />, { port: port() });
    const photos = await screen.findByTestId('item-photos');
    expect(photos).toHaveTextContent(/Up to 4 photos \(JPEG, PNG or WebP, 8 MB\)/);
    await fireEvent.press(within(photos).getByTestId('item-photo-add'));
    expect(await screen.findByTestId(`item-photo-${PHOTO.id}`)).toBeOnTheScreen();
    const upload = api.callsTo('POST /api/v1/inventory/items/{id}/images')[0];
    expect(upload?.path).toBe(`/api/v1/inventory/items/${ITEM_ID}/images`);
    expect(upload?.headers.get('content-type')).toMatch(/multipart\/form-data/);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove photo 1' }));
    await waitFor(() => expect(screen.queryByTestId(`item-photo-${PHOTO.id}`)).toBeNull());
    expect(api.callsTo('DELETE /api/v1/inventory/items/{id}/images/{imageId}')[0]?.path).toBe(
      `/api/v1/inventory/items/${ITEM_ID}/images/${PHOTO.id}`
    );
  });

  it('refuses the wrong type before uploading, explains a full card and a denied permission', async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///a.gif', mimeType: 'image/gif', fileName: 'a.gif', fileSize: 100 }],
    } as never);
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': ok(itemFixture()),
        'POST /api/v1/inventory/items/{id}/images': problem(409, 'CONFLICT', 'full'),
      })
    );
    await renderWithProviders(<EditItemScreen />, { port: port() });
    await fireEvent.press(await screen.findByTestId('item-photo-add'));
    expect(await screen.findByTestId('item-photo-error')).toHaveTextContent(
      'Use a JPEG, PNG or WebP photo.'
    );
    expect(api.callsTo('POST /api/v1/inventory/items/{id}/images')).toHaveLength(0);

    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///b.png', mimeType: 'image/png', fileName: 'b.png', fileSize: 100 }],
    } as never);
    await fireEvent.press(screen.getByTestId('item-photo-add'));
    await waitFor(() =>
      expect(screen.getByTestId('item-photo-error')).toHaveTextContent(
        'A card can have at most 4 photos.'
      )
    );
    // The web picker refuses a file that is not an image before the app sees it (a rejection).
    picker.launchImageLibraryAsync.mockRejectedValue(
      new Error('Unsupported file type: text/plain. Only images and videos are supported.')
    );
    await fireEvent.press(screen.getByTestId('item-photo-add'));
    await waitFor(() =>
      expect(screen.getByTestId('item-photo-error')).toHaveTextContent(
        'Use a JPEG, PNG or WebP photo.'
      )
    );
    expect(api.callsTo('POST /api/v1/inventory/items/{id}/images')).toHaveLength(1);
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false } as never);
    await fireEvent.press(screen.getByTestId('item-photo-add'));
    await waitFor(() =>
      expect(screen.getByTestId('item-photo-error')).toHaveTextContent(
        'Allow access to your photos to add one.'
      )
    );
  });

  it('hides "Add photo" once the card has four', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': ok(
          itemFixture({
            images: [0, 1, 2, 3].map((index) => ({ ...PHOTO, id: `p-${index}`, sortOrder: index })),
          })
        ),
      })
    );
    await renderWithProviders(<EditItemScreen />, { port: port() });
    await screen.findByTestId('item-photo-p-3');
    expect(screen.queryByTestId('item-photo-add')).toBeNull();
  });
});

describe('Add a card', () => {
  it('searches the catalog, picks a printing, fills the details and adds the card', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/cards/suggest': ok([
          { kind: 'CARD', id: CARD_ID, name: 'Emberfang Fox VMAX', game: 'pokemon' },
          {
            kind: 'PRINTING',
            id: CARD_ID,
            printingId: PRINTING_B,
            name: 'Emberfang Fox VMAX',
            game: 'pokemon',
            printingCode: 'SVX-001',
          },
        ]),
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
        'POST /api/v1/inventory/items': ok(itemFixture(), 201),
      })
    );
    await renderWithProviders(<AddItemScreen />, { port: port() });
    expect(screen.getByText('Step 1 of 3 · Find the card')).toBeOnTheScreen();
    expect(screen.getByTestId('card-picker-hint')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('card-picker-input'), 'ember');
    expect(await screen.findByTestId('suggestion-PRINTING-SVX-001')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId(`suggestion-CARD-${CARD_ID}`));

    expect(await screen.findByText('Step 2 of 3 · Choose the printing')).toBeOnTheScreen();
    expect(await screen.findByTestId('add-item-printing-count')).toHaveTextContent(
      '2 printings. Pick the one you own.'
    );
    expect(screen.getByTestId('add-item-continue')).toBeDisabled();
    await fireEvent.press(screen.getByTestId(`printing-${PRINTING_B}`));
    await fireEvent.press(screen.getByTestId('add-item-continue'));

    expect(await screen.findByText('Step 3 of 3 · Add details')).toBeOnTheScreen();
    // Defaults from the printing (French, reverse holo) and the game schema.
    expect(screen.getByTestId('item-language-fr')).toBeChecked();
    expect(screen.getByTestId('item-finish-REVERSE_HOLO')).toBeChecked();
    expect(screen.getByTestId('item-condition-NEAR_MINT')).toBeChecked();
    expect(screen.getByTestId('item-visibility-PRIVATE')).toBeChecked();

    await fireEvent.changeText(screen.getByTestId('item-quantity'), '3');
    await fireEvent.press(screen.getByTestId('item-condition-LIGHTLY_PLAYED'));
    await fireEvent.press(screen.getByTestId('item-availability-SALE'));
    await fireEvent.press(screen.getByTestId('item-accepts-offers'));
    await fireEvent.changeText(screen.getByTestId('item-price'), '12.50');
    await fireEvent.press(screen.getByTestId('item-binder'));
    await fireEvent.press(await screen.findByTestId(`item-binder-option-${BINDER_ID}`));
    await fireEvent.changeText(screen.getByTestId('item-public-notes'), 'Sleeved since opening.');
    await fireEvent.press(screen.getByTestId('add-item-submit'));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('POST /api/v1/inventory/items')[0]?.body).toEqual({
      printingId: PRINTING_B,
      quantity: 3,
      condition: 'LIGHTLY_PLAYED',
      language: 'fr',
      edition: 'UNLIMITED',
      finish: 'REVERSE_HOLO',
      askingPrice: 12.5,
      currency: 'CAD',
      availability: 'SALE',
      acceptsOffers: true,
      visibility: 'PRIVATE',
      publicNotes: 'Sleeved since opening.',
      binderId: BINDER_ID,
    });
    expect(
      await screen.findByText('Emberfang Fox VMAX added to your inventory.')
    ).toBeOnTheScreen();
  });

  it('starts from a card detail with the printing preselected, and validates', async () => {
    mockParams.current = { cardId: CARD_ID, printingId: PRINTING_A, binderId: BINDER_ID };
    const api = mockApi(signedInRoutes({ 'GET /api/v1/cards/{id}': ok(cardDetailFixture()) }));
    await renderWithProviders(<AddItemScreen />, { port: port() });
    expect(await screen.findByTestId(`printing-${PRINTING_A}`)).toBeChecked();
    await fireEvent.press(screen.getByTestId('add-item-continue'));
    await screen.findByTestId('item-quantity');
    await fireEvent.changeText(screen.getByTestId('item-quantity'), '0');
    await fireEvent.changeText(screen.getByTestId('item-price'), '1.234');
    await fireEvent.press(screen.getByTestId('add-item-submit'));
    expect(await screen.findByText('Check the highlighted fields.')).toBeOnTheScreen();
    expect(screen.getByText('At least 1 copy.')).toBeOnTheScreen();
    expect(screen.getByText('Use at most two decimals.')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/inventory/items')).toHaveLength(0);
    // Back keeps what was typed for the same printing.
    await fireEvent.press(screen.getByTestId('add-item-back'));
    await fireEvent.press(await screen.findByTestId('add-item-continue'));
    expect((await screen.findByTestId('item-quantity')).props.value).toBe('0');
  });

  it('picks the only printing by itself and maps server errors', async () => {
    mockParams.current = { cardId: CARD_ID };
    mockApi(
      signedInRoutes({
        'GET /api/v1/cards/{id}': ok(
          cardDetailFixture({ printings: [cardDetailFixture().printings![0]!] })
        ),
        'POST /api/v1/inventory/items': problem(400, 'VALIDATION_FAILED', 'Invalid item', {
          errors: [{ field: 'quantity', message: 'must be less than or equal to 9999' }],
        }),
      })
    );
    await renderWithProviders(<AddItemScreen />, { port: port() });
    expect(await screen.findByTestId(`printing-${PRINTING_A}`)).toBeChecked();
    expect(screen.getByTestId('add-item-continue')).toBeEnabled();
    await fireEvent.press(screen.getByTestId('add-item-continue'));
    await fireEvent.press(await screen.findByTestId('add-item-submit'));
    expect(await screen.findByText('must be less than or equal to 9999')).toBeOnTheScreen();
    expect(screen.getByTestId('add-item-error')).toBeOnTheScreen();
  });

  it('explains a reached plan limit', async () => {
    mockParams.current = { cardId: CARD_ID, printingId: PRINTING_A };
    mockApi(
      signedInRoutes({
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
        'POST /api/v1/inventory/items': problem(429, 'LIMIT_REACHED', 'Limit reached', {
          limitKey: 'inventory.items.max',
          limit: 100,
          used: 100,
          planCode: 'FREE',
        }),
      })
    );
    await renderWithProviders(<AddItemScreen />, { port: port() });
    await screen.findByTestId(`printing-${PRINTING_A}`);
    await fireEvent.press(screen.getByTestId('add-item-continue'));
    await fireEvent.press(await screen.findByTestId('add-item-submit'));
    expect(await screen.findByTestId('limit-reached-message')).toHaveTextContent(
      /You have used 100 of 100/
    );
  });

  it('shows empty and failing suggestions, and a card that cannot load', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/cards/suggest': (request) =>
          request.query.get('q') === 'zz' ? ok([]) : problem(500, 'INTERNAL_ERROR', 'boom'),
      })
    );
    await renderWithProviders(<AddItemScreen />, { port: port() });
    await fireEvent.changeText(screen.getByTestId('card-picker-input'), 'zz');
    expect(await screen.findByText('No cards match “zz”.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('card-picker-input'), 'boom');
    expect(await screen.findByText('Suggestions are unavailable. Try again.')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/cards/suggest').length).toBeGreaterThanOrEqual(2);
  });

  it('shows an error when the card cannot load', async () => {
    mockParams.current = { cardId: CARD_ID };
    mockApi(signedInRoutes({ 'GET /api/v1/cards/{id}': problem(500, 'INTERNAL_ERROR', 'boom') }));
    await renderWithProviders(<AddItemScreen />, { port: port() });
    expect(await screen.findByText('This card could not load')).toBeOnTheScreen();
  });
});

describe('Edit a card', () => {
  beforeEach(() => {
    mockParams.current = { id: ITEM_ID };
  });

  it('shows the card, saves only the changed fields', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': ok(itemFixture()),
        'PATCH /api/v1/inventory/items/{id}': ok(itemFixture({ quantity: 4, askingPrice: null })),
      })
    );
    await renderWithProviders(<EditItemScreen />, { port: port() });
    expect(await screen.findByTestId('edit-item-name')).toHaveTextContent('Emberfang Fox VMAX');
    expect(screen.getByTestId('edit-item-visibility')).toHaveTextContent('Private');
    expect(screen.getByTestId('item-quantity').props.value).toBe('2');
    expect(screen.getByTestId('item-price').props.value).toBe('40');

    await fireEvent.press(screen.getByTestId('edit-item-save'));
    expect(await screen.findByText('No changes to save.')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId('item-quantity'), '4');
    await fireEvent.changeText(screen.getByTestId('item-price'), '');
    await fireEvent.press(screen.getByTestId('edit-item-save'));
    expect(await screen.findByText('Card saved.')).toBeOnTheScreen();
    expect(api.callsTo('PATCH /api/v1/inventory/items/{id}')[0]?.body).toEqual({
      quantity: 4,
      askingPrice: null,
    });
  });

  it('moves a card into a binder and makes it temporarily public', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': ok(itemFixture()),
        'GET /api/v1/binders': ok([binderFixture()]),
        'PATCH /api/v1/inventory/items/{id}': ok(itemFixture()),
      })
    );
    await renderWithProviders(<EditItemScreen />, { port: port() });
    await screen.findByTestId('edit-item-name');
    await fireEvent.press(screen.getByTestId('item-visibility-TEMPORARILY_PUBLIC'));
    await fireEvent.press(await screen.findByTestId('item-duration-1h'));
    await fireEvent.press(screen.getByTestId('item-binder'));
    await fireEvent.press(await screen.findByTestId(`item-binder-option-${BINDER_ID}`));
    expect(
      screen.getByText('This binder is private: publish it to show its public cards.')
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('edit-item-save'));
    await waitFor(() => expect(api.callsTo('PATCH /api/v1/inventory/items/{id}')).toHaveLength(1));
    const body = api.callsTo('PATCH /api/v1/inventory/items/{id}')[0]?.body as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({ visibility: 'TEMPORARILY_PUBLIC', binderId: BINDER_ID });
    expect(typeof body.publicUntil).toBe('string');
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
    await renderWithProviders(<EditItemScreen />, { port: port() });
    expect(await screen.findByTestId('edit-item-stale')).toHaveTextContent(
      /hidden from other collectors until you confirm/
    );
    expect(screen.getByText('Hidden until you confirm it is still available.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('edit-item-confirm'));
    expect(
      await screen.findByText('Confirmed: your card is listed as available again.')
    ).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/inventory/items/{id}/confirm')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByTestId('edit-item-stale')).not.toBeOnTheScreen());
  });

  it('deletes a card after a confirmation', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': ok(itemFixture()),
        'DELETE /api/v1/inventory/items/{id}': noContent,
      })
    );
    await renderWithProviders(<EditItemScreen />, { port: port() });
    await screen.findByTestId('edit-item-name');
    await fireEvent.press(screen.getByTestId('edit-item-delete'));
    expect(await screen.findByText('Delete Emberfang Fox VMAX?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('edit-item-delete-dialog-cancel'));
    expect(api.callsTo('DELETE /api/v1/inventory/items/{id}')).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('edit-item-delete'));
    await fireEvent.press(await screen.findByTestId('edit-item-delete-dialog-confirm'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('DELETE /api/v1/inventory/items/{id}')).toHaveLength(1);
    expect(
      await screen.findByText('Emberfang Fox VMAX deleted from your inventory.')
    ).toBeOnTheScreen();
  });

  it('says when the card is gone, and shows errors with retry', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': problem(404, 'NOT_FOUND', 'Not found'),
      })
    );
    const { unmount } = await renderWithProviders(<EditItemScreen />, { port: port() });
    expect(await screen.findByText('This card is no longer in your inventory')).toBeOnTheScreen();
    await unmount();

    mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': [
          problem(500, 'INTERNAL_ERROR', 'boom'),
          ok(itemFixture()),
        ],
      })
    );
    await renderWithProviders(<EditItemScreen />, { port: port() });
    await fireEvent.press(await screen.findByTestId('edit-item-error-retry'));
    expect(await screen.findByTestId('edit-item-name')).toBeOnTheScreen();
  });
});
