import { fireEvent, screen, waitFor } from '@testing-library/react-native';

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

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

const port = () => new FakeAuthPort(testUser());

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
    renderWithProviders(<AddItemScreen />, { port: port() });
    expect(screen.getByText('Step 1 of 3 · Find the card')).toBeOnTheScreen();
    expect(screen.getByTestId('card-picker-hint')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('card-picker-input'), 'ember');
    expect(await screen.findByTestId('suggestion-PRINTING-SVX-001')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId(`suggestion-CARD-${CARD_ID}`));

    expect(await screen.findByText('Step 2 of 3 · Choose the printing')).toBeOnTheScreen();
    expect(await screen.findByTestId('add-item-printing-count')).toHaveTextContent(
      '2 printings. Pick the one you own.'
    );
    expect(screen.getByTestId('add-item-continue')).toBeDisabled();
    fireEvent.press(screen.getByTestId(`printing-${PRINTING_B}`));
    fireEvent.press(screen.getByTestId('add-item-continue'));

    expect(await screen.findByText('Step 3 of 3 · Add details')).toBeOnTheScreen();
    // Defaults from the printing (French, reverse holo) and the game schema.
    expect(screen.getByTestId('item-language-fr')).toBeChecked();
    expect(screen.getByTestId('item-finish-REVERSE_HOLO')).toBeChecked();
    expect(screen.getByTestId('item-condition-NEAR_MINT')).toBeChecked();
    expect(screen.getByTestId('item-visibility-PRIVATE')).toBeChecked();

    fireEvent.changeText(screen.getByTestId('item-quantity'), '3');
    fireEvent.press(screen.getByTestId('item-condition-LIGHTLY_PLAYED'));
    fireEvent.press(screen.getByTestId('item-availability-SALE'));
    fireEvent.press(screen.getByTestId('item-accepts-offers'));
    fireEvent.changeText(screen.getByTestId('item-price'), '12.50');
    fireEvent.press(screen.getByTestId('item-binder'));
    fireEvent.press(await screen.findByTestId(`item-binder-option-${BINDER_ID}`));
    fireEvent.changeText(screen.getByTestId('item-public-notes'), 'Sleeved since opening.');
    fireEvent.press(screen.getByTestId('add-item-submit'));

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
    renderWithProviders(<AddItemScreen />, { port: port() });
    expect(await screen.findByTestId(`printing-${PRINTING_A}`)).toBeChecked();
    fireEvent.press(screen.getByTestId('add-item-continue'));
    await screen.findByTestId('item-quantity');
    fireEvent.changeText(screen.getByTestId('item-quantity'), '0');
    fireEvent.changeText(screen.getByTestId('item-price'), '1.234');
    fireEvent.press(screen.getByTestId('add-item-submit'));
    expect(await screen.findByText('Check the highlighted fields.')).toBeOnTheScreen();
    expect(screen.getByText('At least 1 copy.')).toBeOnTheScreen();
    expect(screen.getByText('Use at most two decimals.')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/inventory/items')).toHaveLength(0);
    // Back keeps what was typed for the same printing.
    fireEvent.press(screen.getByTestId('add-item-back'));
    fireEvent.press(await screen.findByTestId('add-item-continue'));
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
    renderWithProviders(<AddItemScreen />, { port: port() });
    expect(await screen.findByTestId(`printing-${PRINTING_A}`)).toBeChecked();
    expect(screen.getByTestId('add-item-continue')).toBeEnabled();
    fireEvent.press(screen.getByTestId('add-item-continue'));
    fireEvent.press(await screen.findByTestId('add-item-submit'));
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
    renderWithProviders(<AddItemScreen />, { port: port() });
    await screen.findByTestId(`printing-${PRINTING_A}`);
    fireEvent.press(screen.getByTestId('add-item-continue'));
    fireEvent.press(await screen.findByTestId('add-item-submit'));
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
    renderWithProviders(<AddItemScreen />, { port: port() });
    fireEvent.changeText(screen.getByTestId('card-picker-input'), 'zz');
    expect(await screen.findByText('No cards match “zz”.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('card-picker-input'), 'boom');
    expect(await screen.findByText('Suggestions are unavailable. Try again.')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/cards/suggest').length).toBeGreaterThanOrEqual(2);
  });

  it('shows an error when the card cannot load', async () => {
    mockParams.current = { cardId: CARD_ID };
    mockApi(signedInRoutes({ 'GET /api/v1/cards/{id}': problem(500, 'INTERNAL_ERROR', 'boom') }));
    renderWithProviders(<AddItemScreen />, { port: port() });
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
    renderWithProviders(<EditItemScreen />, { port: port() });
    expect(await screen.findByTestId('edit-item-name')).toHaveTextContent('Emberfang Fox VMAX');
    expect(screen.getByTestId('edit-item-visibility')).toHaveTextContent('Private');
    expect(screen.getByTestId('item-quantity').props.value).toBe('2');
    expect(screen.getByTestId('item-price').props.value).toBe('40');

    fireEvent.press(screen.getByTestId('edit-item-save'));
    expect(await screen.findByText('No changes to save.')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByTestId('item-quantity'), '4');
    fireEvent.changeText(screen.getByTestId('item-price'), '');
    fireEvent.press(screen.getByTestId('edit-item-save'));
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
    renderWithProviders(<EditItemScreen />, { port: port() });
    await screen.findByTestId('edit-item-name');
    fireEvent.press(screen.getByTestId('item-visibility-TEMPORARILY_PUBLIC'));
    fireEvent.press(await screen.findByTestId('item-duration-1h'));
    fireEvent.press(screen.getByTestId('item-binder'));
    fireEvent.press(await screen.findByTestId(`item-binder-option-${BINDER_ID}`));
    expect(
      screen.getByText('This binder is private: publish it to show its public cards.')
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('edit-item-save'));
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
    renderWithProviders(<EditItemScreen />, { port: port() });
    expect(await screen.findByTestId('edit-item-stale')).toHaveTextContent(
      /hidden from other collectors until you confirm/
    );
    expect(screen.getByText('Hidden until you confirm it is still available.')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('edit-item-confirm'));
    expect(
      await screen.findByText('Confirmed: your card is listed as available again.')
    ).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/inventory/items/{id}/confirm')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByTestId('edit-item-stale')).toBeNull());
  });

  it('deletes a card after a confirmation', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items/{id}': ok(itemFixture()),
        'DELETE /api/v1/inventory/items/{id}': noContent,
      })
    );
    renderWithProviders(<EditItemScreen />, { port: port() });
    await screen.findByTestId('edit-item-name');
    fireEvent.press(screen.getByTestId('edit-item-delete'));
    expect(await screen.findByText('Delete Emberfang Fox VMAX?')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('edit-item-delete-dialog-cancel'));
    expect(api.callsTo('DELETE /api/v1/inventory/items/{id}')).toHaveLength(0);
    fireEvent.press(screen.getByTestId('edit-item-delete'));
    fireEvent.press(await screen.findByTestId('edit-item-delete-dialog-confirm'));
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
    const { unmount } = renderWithProviders(<EditItemScreen />, { port: port() });
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
    renderWithProviders(<EditItemScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('edit-item-error-retry'));
    expect(await screen.findByTestId('edit-item-name')).toBeOnTheScreen();
  });
});
