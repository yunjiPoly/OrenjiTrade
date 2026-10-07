import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import CollectorScreen from '@/app/collectors/[id]';
import RateCollectorScreen from '@/app/ratings/rate';
import WriteReferenceScreen from '@/app/ratings/reference';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  OTHER_ID,
  collectorFixture,
  eligibilityFixture,
  publicBinderSummaryFixture,
  publicItemsPage,
  ratingsPageFixture,
  referencesPageFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('@/src/components/map/mapEngine', () => ({ currentMapEngine: () => 'native' }));

const OTHER = collectorFixture({ id: OTHER_ID, handle: 'collector2', displayName: 'Noé Verdun' });
const RATING_ID = '00000000-0000-4000-8d00-000000000009';
/** A rating by the signed-in collector (handle `maika`), still editable. */
const OWN_RATING = {
  id: RATING_ID,
  rater: { handle: 'maika', displayName: 'Maïka Test', avatarUrl: null },
  overall: 4,
  breakdown: { communication: 5, shipping: 3 },
  comment: 'Friendly.',
  createdAt: '2026-10-04T12:00:00Z',
  updatedAt: '2026-10-04T12:00:00Z',
  interactionKind: 'CONVERSATION_QUALIFIED' as const,
  editableUntil: '2099-10-18T12:00:00Z',
};

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/ratings/eligibility': ok(eligibilityFixture()),
    'POST /api/v1/ratings': ok({ ...OWN_RATING, overall: 5 }, 201),
    'PUT /api/v1/ratings/{id}': ok(OWN_RATING),
    'POST /api/v1/references': ok(
      {
        id: 'ref-1',
        author: { handle: 'maika', displayName: 'Maïka Test' },
        body: 'Great',
        createdAt: '2026-10-05T12:00:00Z',
      },
      201
    ),
    'GET /api/v1/collectors/{handle}/binders': ok([publicBinderSummaryFixture()]),
    'GET /api/v1/collectors/{handle}/inventory': ok(publicItemsPage([])),
    'GET /api/v1/collectors/{handle}/ratings': ok(ratingsPageFixture()),
    'GET /api/v1/collectors/{handle}/references': ok(referencesPageFixture()),
    'GET /api/v1/collectors/{handle}': ok(OTHER),
    ...extra,
  });
}

const port = () => new FakeAuthPort(testUser());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockParams.current = { userId: OTHER_ID, handle: 'collector2', name: 'Noé Verdun' };
});

describe('Rate a collector', () => {
  it('needs an overall score, then publishes the rating with the chosen details', async () => {
    const api = mockApi(routes());
    const release = api.hold();
    await renderWithProviders(<RateCollectorScreen />, { port: port() });
    expect(screen.getByTestId('rate-loading')).toBeOnTheScreen();
    release();
    expect(await screen.findByTestId('rate-interaction-line')).toHaveTextContent(/Completed trade/);
    await fireEvent.press(screen.getByTestId('rate-submit'));
    expect(await screen.findByTestId('rate-overall-error')).toHaveTextContent(
      'Choose an overall score from 1 to 5 stars.'
    );
    expect(api.callsTo('POST /api/v1/ratings')).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('rate-overall-5'));
    expect(screen.getByTestId('rate-overall-5')).toBeChecked();
    expect(screen.getByTestId('rate-overall-4')).not.toBeChecked();
    await fireEvent.press(screen.getByTestId('rate-communication-4'));
    await fireEvent.press(screen.getByTestId('rate-shipping-2'));
    await fireEvent.press(screen.getByTestId('rate-shipping-clear'));
    await fireEvent.changeText(screen.getByTestId('rate-comment'), ' Smooth meetup. ');
    await fireEvent.press(screen.getByTestId('rate-submit'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('POST /api/v1/ratings')[0]?.body).toEqual({
      interactionId: '00000000-0000-4000-9e00-000000000001',
      overall: 5,
      communication: 4,
      comment: 'Smooth meetup.',
    });
    expect(screen.getByTestId('snackbar')).toHaveTextContent(
      'Thanks! Your rating of Noé Verdun is published.'
    );
  });

  it('asks which interaction when there are several, and explains refusals', async () => {
    mockApi(
      routes({
        'GET /api/v1/ratings/eligibility': ok(
          eligibilityFixture({
            interactions: [
              {
                id: 'i-trade',
                kind: 'TRADE',
                occurredAt: '2026-10-03T12:00:00Z',
                alreadyRated: false,
              },
              {
                id: 'i-chat',
                kind: 'CONVERSATION_QUALIFIED',
                occurredAt: '2026-09-03T12:00:00Z',
                alreadyRated: false,
              },
            ],
          })
        ),
        'POST /api/v1/ratings': problem(409, 'ALREADY_RATED', 'Already rated'),
      })
    );
    await renderWithProviders(<RateCollectorScreen />, { port: port() });
    expect(await screen.findByTestId('rate-interaction')).toBeOnTheScreen();
    expect(screen.getByText('Which interaction are you rating?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('rate-interaction-i-chat'));
    await fireEvent.press(screen.getByTestId('rate-overall-3'));
    await fireEvent.press(screen.getByTestId('rate-submit'));
    expect(await screen.findByTestId('rating-error')).toHaveTextContent(
      /You already rated this interaction/
    );
  });

  it('only rates the completed trade from a trade, and says why nothing can be rated', async () => {
    mockParams.current = { ...mockParams.current, kind: 'TRADE' };
    mockApi(
      routes({
        'GET /api/v1/ratings/eligibility': ok(
          eligibilityFixture({
            eligible: true,
            interactions: [
              {
                id: 'i-chat',
                kind: 'CONVERSATION_QUALIFIED',
                occurredAt: '2026-09-03T12:00:00Z',
                alreadyRated: false,
              },
            ],
          })
        ),
      })
    );
    await renderWithProviders(<RateCollectorScreen />, { port: port() });
    expect(await screen.findByTestId('rate-not-eligible')).toHaveTextContent(
      /You cannot rate Noé Verdun now/
    );
  });

  it('edits the caller’s own rating with PUT', async () => {
    mockParams.current = { ...mockParams.current, rating: RATING_ID };
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/ratings': ok(ratingsPageFixture({ items: [OWN_RATING] })),
      })
    );
    await renderWithProviders(<RateCollectorScreen />, { port: port() });
    expect(await screen.findByTestId('rate-interaction-line')).toHaveTextContent(
      /Conversation · editable until/
    );
    expect(screen.getByTestId('rate-comment').props.value).toBe('Friendly.');
    await fireEvent.press(screen.getByTestId('rate-overall-2'));
    await fireEvent.press(screen.getByTestId('rate-submit'));
    await waitFor(() => expect(api.callsTo('PUT /api/v1/ratings/{id}')).toHaveLength(1));
    expect(api.callsTo('PUT /api/v1/ratings/{id}')[0]?.body).toEqual({
      overall: 2,
      communication: 5,
      shipping: 3,
      comment: 'Friendly.',
    });
    expect(await screen.findByTestId('snackbar')).toHaveTextContent('Your rating is updated.');
  });
});

describe('Write a reference', () => {
  it('needs text up to 400 characters and explains banned terms', async () => {
    const api = mockApi(
      routes({
        'POST /api/v1/references': [
          problem(400, 'VALIDATION_FAILED', 'Validation failed', {
            errors: [{ field: 'body', message: 'contains a term that is not allowed' }],
          }),
          ok(
            {
              id: 'ref-1',
              author: { handle: 'maika', displayName: 'Maïka' },
              body: 'Great',
              createdAt: '2026-10-05T12:00:00Z',
            },
            201
          ),
        ],
      })
    );
    await renderWithProviders(<WriteReferenceScreen />, { port: port() });
    await fireEvent.press(screen.getByTestId('reference-submit'));
    expect(await screen.findByText('Write a few words first.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('reference-body'), 'x'.repeat(401));
    expect(screen.getByText('Keep it under 400 characters.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('reference-body'), 'A zorblax trader');
    await fireEvent.press(screen.getByTestId('reference-submit'));
    expect(await screen.findByTestId('reference-error')).toHaveTextContent(
      /Your text breaks the community guidelines\. Please rephrase it\./
    );
    await fireEvent.changeText(screen.getByTestId('reference-body'), 'Great trader');
    await fireEvent.press(screen.getByTestId('reference-submit'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('POST /api/v1/references').at(-1)?.body).toEqual({
      subjectId: OTHER_ID,
      body: 'Great trader',
    });
  });
});

describe('Ratings section of a profile', () => {
  beforeEach(() => {
    mockParams.current = { id: 'collector2' };
  });

  it('offers to rate and to write a reference after an interaction', async () => {
    mockApi(routes());
    await renderWithProviders(<CollectorScreen />, { port: port() });
    await fireEvent.press(await screen.findByTestId('collector-rate'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/ratings/rate',
      params: { userId: OTHER_ID, handle: 'collector2', name: 'Noé Verdun' },
    });
    await fireEvent.press(await screen.findByTestId('collector-write-reference'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/ratings/reference',
      params: { userId: OTHER_ID, handle: 'collector2', name: 'Noé Verdun' },
    });
    expect(screen.queryByTestId('rating-hint')).not.toBeOnTheScreen();
  });

  it('explains why rating is not possible and lets the author edit their rating', async () => {
    mockApi(
      routes({
        'GET /api/v1/ratings/eligibility': ok(
          eligibilityFixture({
            eligible: false,
            interactions: [
              {
                id: 'i-chat',
                kind: 'CONVERSATION_QUALIFIED',
                occurredAt: '2026-09-03T12:00:00Z',
                alreadyRated: true,
              },
            ],
          })
        ),
        'GET /api/v1/collectors/{handle}/ratings': ok(ratingsPageFixture({ items: [OWN_RATING] })),
        'GET /api/v1/collectors/{handle}/references': ok(
          referencesPageFixture({
            items: [
              {
                id: 'ref-own',
                author: { handle: 'maika', displayName: 'Maïka Test' },
                body: 'Already written.',
                createdAt: '2026-10-01T12:00:00Z',
              },
            ],
          })
        ),
      })
    );
    await renderWithProviders(<CollectorScreen />, { port: port() });
    expect(await screen.findByTestId('rating-hint')).toHaveTextContent(
      /You already rated your interactions with Noé Verdun/
    );
    expect(screen.queryByTestId('collector-rate')).not.toBeOnTheScreen();
    // One reference per author: the caller already wrote theirs.
    expect(screen.queryByTestId('collector-write-reference')).not.toBeOnTheScreen();
    expect(screen.getByTestId(`rating-criteria-${RATING_ID}`)).toHaveTextContent(
      'Communication 5★ · Shipping 3★'
    );
    await fireEvent.press(screen.getByTestId(`rating-edit-${RATING_ID}`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/ratings/rate',
      params: { userId: OTHER_ID, handle: 'collector2', name: 'Noé Verdun', rating: RATING_ID },
    });
  });

  it('offers nothing without an interaction, saying how to become eligible', async () => {
    mockApi(
      routes({
        'GET /api/v1/ratings/eligibility': ok(
          eligibilityFixture({ eligible: false, interactions: [] })
        ),
      })
    );
    await renderWithProviders(<CollectorScreen />, { port: port() });
    expect(await screen.findByTestId('rating-hint')).toHaveTextContent(
      /You can rate Noé Verdun after a completed trade/
    );
    expect(screen.queryByTestId('collector-write-reference')).not.toBeOnTheScreen();
  });
});
