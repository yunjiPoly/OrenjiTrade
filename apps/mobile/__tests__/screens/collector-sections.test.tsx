import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import CollectorBindersScreen from '@/app/collectors/[id]/binders';
import CollectorCardsScreen from '@/app/collectors/[id]/cards';
import CollectorReferencesScreen from '@/app/collectors/[id]/references';
import CollectorWishesScreen from '@/app/collectors/[id]/wishes';
import { sectionTitle } from '@/src/features/collectors/CollectorSectionScreen';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CARD_ID,
  CONVERSATION_ID,
  PUBLIC_BINDER_ID,
  blockedUserFixture,
  collectorFixture,
  conversationFixture,
  inventoryPage,
  publicBinderSummaryFixture,
  publicItemFixture,
  ratingsPageFixture,
  referencesPageFixture,
  wishlistEntryFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

const OTHER = collectorFixture({
  id: '00000000-0000-4000-8000-0000000000b1',
  handle: 'collector2',
  displayName: 'Noé Verdun',
});

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockParams.current = { id: 'collector2' };
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/collectors/{handle}': ok(OTHER),
    'GET /api/v1/collectors/{handle}/ratings': ok(ratingsPageFixture()),
    'GET /api/v1/collectors/{handle}/references': ok(referencesPageFixture()),
    'GET /api/v1/ratings/eligibility': ok({ eligible: false, interactions: [] }),
    ...extra,
  });
}

const port = () => new FakeAuthPort(testUser());

describe('"See all" of another collector\'s profile (stage R6)', () => {
  it('titles each page with the section and the handle', () => {
    expect(sectionTitle('cards', 'collector2')).toBe('Cards · collector2');
    expect(sectionTitle('wishes', 'collector2')).toBe('Looking for · collector2');
    expect(sectionTitle('references', '')).toBe('Ratings & references');
  });

  it('lists every public card, page by page; a card opens Who has this card', async () => {
    const first = Array.from({ length: 24 }, (_, index) =>
      publicItemFixture({ id: `item-${index}`, askingPriceText: `$${index + 1}` })
    );
    const last = publicItemFixture({ id: 'item-last', askingPriceText: '85% TCG' });
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/inventory': (request) =>
          ok(
            request.query.get('page') === '1'
              ? { ...inventoryPage([]), items: [last], page: 1, totalItems: 25, totalPages: 2 }
              : { ...inventoryPage([]), items: first, page: 0, totalItems: 25, totalPages: 2 }
          ),
      })
    );
    renderWithProviders(<CollectorCardsScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('collector-all-card-item-0'));
    // The cards of a deck core sell only with it: the list leaves them out, as the profile does.
    expect(
      api.callsTo('GET /api/v1/collectors/{handle}/inventory')[0]?.query.get('excludeDeckCoreItems')
    ).toBe('true');
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: CARD_ID, printing: first[0]!.printing.id },
    });
    await act(async () => {
      screen.UNSAFE_getByProps({ testID: 'collector-cards-page' }).props.onEndReached();
    });
    // The next page is asked for (the list shows its rows as they scroll into view).
    await waitFor(() =>
      expect(
        api
          .callsTo('GET /api/v1/collectors/{handle}/inventory')
          .map((call) => call.query.get('page'))
      ).toContain('1')
    );
    expect(api.callsTo('GET /api/v1/collectors/{handle}/inventory')[0]?.query.get('size')).toBe(
      '24'
    );
  });

  it('lists every public binder and deck core, the deck cores first; a row opens it', async () => {
    mockApi(
      routes({
        // The owner's order puts the binder first: the deck cores still come first.
        'GET /api/v1/collectors/{handle}/binders': ok([
          publicBinderSummaryFixture(),
          publicBinderSummaryFixture({
            id: 'core-1',
            name: 'Yubel core',
            sellsAsCore: true,
            askingPriceText: '$95',
            itemCount: 0,
          }),
        ]),
      })
    );
    renderWithProviders(<CollectorBindersScreen />, { port: port() });
    const core = await screen.findByTestId('collector-all-binder-core-1');
    expect(
      screen.getAllByTestId(/^collector-all-binder-/).map((row) => row.props.testID)
    ).toEqual(['collector-all-binder-core-1', `collector-all-binder-${PUBLIC_BINDER_ID}`]);
    expect(core).toHaveTextContent(/Yubel core.*Deck core · \$95/);
    expect(screen.getByTestId(`collector-all-binder-${PUBLIC_BINDER_ID}`)).toHaveTextContent(
      /Magic trades.*14 cards/
    );
    fireEvent.press(core);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: 'core-1' },
    });
  });

  it('lists every public wish with "I have it"', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/wishlist': ok([
          wishlistEntryFixture(),
          wishlistEntryFixture({ card: { id: 'card-2', name: 'Dominus Impulse', imageUrl: null } }),
          wishlistEntryFixture({
            card: { id: 'card-3', name: 'Mulcharmy Fuwalos', imageUrl: null },
          }),
          wishlistEntryFixture({
            card: { id: 'card-4', name: 'Droll & Lock Bird', imageUrl: null },
          }),
        ]),
        'GET /api/v1/inventory/items': ok(inventoryPage([])),
        'POST /api/v1/conversations': ok(conversationFixture()),
      })
    );
    renderWithProviders(<CollectorWishesScreen />, { port: port() });
    expect(await screen.findByTestId('profile-have-card-4')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId(`profile-have-${CARD_ID}`));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/messages/[id]',
        params: { id: CONVERSATION_ID },
      })
    );
    expect(api.callsTo('POST /api/v1/conversations')[0]?.body).toEqual({ recipientId: OTHER.id });
  });

  it('holds the full ratings and references', async () => {
    mockApi(routes());
    renderWithProviders(<CollectorReferencesScreen />, { port: port() });
    expect(await screen.findByTestId('rating-summary')).toHaveTextContent(/4\.8/);
    expect(await screen.findByText('“Fair and friendly trader.”')).toBeOnTheScreen();
    expect(screen.getByText('Well packed, shipped with tracking.')).toBeOnTheScreen();
  });

  it('references: a collector who blocked you is "not available", without Rate or Write', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/{handle}': ok({ ...OTHER, isBlocked: true, canMessage: false }),
        'GET /api/v1/me/blocks': ok([]),
        'GET /api/v1/ratings/eligibility': ok({ eligible: true, interactions: [] }),
      })
    );
    renderWithProviders(<CollectorReferencesScreen />, { port: port() });
    expect(await screen.findByTestId('collector-references-page-not-found')).toHaveTextContent(
      /This collector is not available/
    );
    expect(screen.queryByTestId('rating-summary')).toBeNull();
    expect(screen.queryByText(/Rate this collector|Write a reference/)).toBeNull();
    expect(api.callsTo('GET /api/v1/collectors/{handle}/references')).toHaveLength(0);
  });

  it('references: a collector you blocked shows Unblock, then their ratings once unblocked', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/{handle}': [
          ok({ ...OTHER, isBlocked: true, canMessage: false }),
          ok(OTHER),
        ],
        'GET /api/v1/me/blocks': ok([blockedUserFixture({ id: OTHER.id, handle: OTHER.handle })]),
        'DELETE /api/v1/users/{id}/block': ok(undefined),
      })
    );
    renderWithProviders(<CollectorReferencesScreen />, { port: port() });
    const blocked = await screen.findByTestId('collector-references-page-blocked');
    expect(blocked).toHaveTextContent(/You blocked collector2/);
    expect(screen.queryByTestId('rating-summary')).toBeNull();
    fireEvent.press(within(blocked).getByRole('button', { name: 'Unblock' }));
    expect(await screen.findByTestId('rating-summary')).toHaveTextContent(/4\.8/);
    expect(api.callsTo('DELETE /api/v1/users/{id}/block')).toHaveLength(1);
  });

  it('says "not available" for a hidden or blocked collector', async () => {
    mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/binders': problem(404, 'NOT_FOUND', 'hidden'),
      })
    );
    renderWithProviders(<CollectorBindersScreen />, { port: port() });
    expect(await screen.findByTestId('collector-binders-page-not-found')).toHaveTextContent(
      /This collector is not available/
    );
  });

  it('retries a list that failed', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/binders': [
          problem(500, 'INTERNAL_ERROR', 'Boom'),
          problem(500, 'INTERNAL_ERROR', 'Boom'),
          ok([]),
        ],
      })
    );
    renderWithProviders(<CollectorBindersScreen />, { port: port() });
    const failed = await screen.findByTestId('collector-binders-page-error');
    fireEvent.press(within(failed).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No public binders yet.')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/collectors/{handle}/binders').length).toBeGreaterThan(1);
  });
});
