import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import CollectorReferencesScreen from '@/app/collectors/[id]/references';
import RateCollectorScreen from '@/app/ratings/rate';
import WriteReferenceScreen from '@/app/ratings/reference';

import { expectBoundedBarMessage } from '../support/barMessage';
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
    renderWithProviders(<RateCollectorScreen />, { port: port() });
    expect(screen.getByTestId('rate-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId('rate-person-line')).toHaveTextContent(/Completed trade · /);
    // "Publish rating" waits for the overall score, and says so.
    expect(screen.getByTestId('rate-submit')).toHaveTextContent('Publish rating');
    expect(screen.getByTestId('rate-submit')).toBeDisabled();
    expect(screen.getByTestId('rate-overall-error')).toHaveTextContent(
      'Choose an overall score first.'
    );
    fireEvent.press(screen.getByTestId('rate-submit'));
    expect(api.callsTo('POST /api/v1/ratings')).toHaveLength(0);
    fireEvent.press(screen.getByTestId('rate-overall-5'));
    expect(screen.getByTestId('rate-overall-5')).toBeChecked();
    expect(screen.getByTestId('rate-overall-4')).not.toBeChecked();
    expect(
      screen.getByTestId('rate-overall-word', { includeHiddenElements: true })
    ).toHaveTextContent('Excellent');
    expect(screen.queryByTestId('rate-overall-error')).toBeNull();
    expect(screen.getByTestId('rate-note')).toHaveTextContent(
      'Your rating appears on collector2’s profile with your name. You can change it for 14 days.'
    );
    // Overall, Communication, Card condition and Shipping; never "Meetup reliability" (ADR 0018).
    for (const label of ['Communication', 'Card condition', 'Shipping']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText(/Meetup reliability/)).toBeNull();
    expect(screen.queryByTestId('rate-meetupReliability-5')).toBeNull();
    expect(screen.queryByText(/agreed place/)).toBeNull();
    fireEvent.press(screen.getByTestId('rate-communication-4'));
    fireEvent.press(screen.getByTestId('rate-shipping-2'));
    expect(screen.getByTestId('rate-shipping-2')).toBeChecked();
    // A details row clears when its chosen star is pressed again.
    fireEvent.press(screen.getByTestId('rate-shipping-2'));
    expect(screen.getByTestId('rate-shipping-2')).not.toBeChecked();
    fireEvent.changeText(screen.getByTestId('rate-comment'), ' Well packed, quick shipping. ');
    fireEvent.press(screen.getByTestId('rate-submit'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('POST /api/v1/ratings')[0]?.body).toEqual({
      interactionId: '00000000-0000-4000-9e00-000000000001',
      overall: 5,
      communication: 4,
      comment: 'Well packed, quick shipping.',
    });
    expect(screen.getByTestId('snackbar')).toHaveTextContent(
      'Thanks! Your rating of Noé Verdun is published.'
    );
  });

  it('keeps the comment to 600 characters: “Publish rating” waits and says why (R14 review fix 1, F3)', async () => {
    const api = mockApi(routes());
    renderWithProviders(<RateCollectorScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('rate-overall-4'));
    fireEvent.changeText(screen.getByTestId('rate-comment'), 'x'.repeat(601));
    expect(await screen.findByText('Keep the comment under 600 characters.')).toBeOnTheScreen();
    expect(screen.getByTestId('rate-submit')).toBeDisabled();
    fireEvent.press(screen.getByTestId('rate-submit'));
    expect(api.callsTo('POST /api/v1/ratings')).toHaveLength(0);
    // 600 is allowed.
    fireEvent.changeText(screen.getByTestId('rate-comment'), 'x'.repeat(600));
    expect(screen.queryByText('Keep the comment under 600 characters.')).toBeNull();
    expect(screen.getByTestId('rate-submit')).not.toBeDisabled();
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
    renderWithProviders(<RateCollectorScreen />, { port: port() });
    expect(await screen.findByTestId('rate-interaction')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Which deal are you rating?' })).toBeOnTheScreen();
    expect(screen.getByTestId('rate-interaction-i-chat')).toHaveTextContent(
      /^Conversation · Sep 3/
    );
    fireEvent.press(screen.getByTestId('rate-interaction-i-chat'));
    fireEvent.press(screen.getByTestId('rate-overall-3'));
    fireEvent.press(screen.getByTestId('rate-submit'));
    expect(await screen.findByTestId('rating-error')).toHaveTextContent(
      /You already rated this interaction/
    );
    expect(
      within(screen.getByTestId('screen-rate-footer')).getByTestId('rating-error')
    ).toBeOnTheScreen();
    expectBoundedBarMessage('rating-error', /You already rated this interaction/);
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
    renderWithProviders(<RateCollectorScreen />, { port: port() });
    expect(await screen.findByTestId('rate-not-eligible')).toHaveTextContent(
      /You cannot rate Noé Verdun now/
    );
  });

  it('edits the caller’s own rating with PUT, keeping an old meetup score it no longer asks', async () => {
    mockParams.current = { ...mockParams.current, rating: RATING_ID };
    const old = { ...OWN_RATING, breakdown: { ...OWN_RATING.breakdown, meetupReliability: 4 } };
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/ratings': ok(ratingsPageFixture({ items: [old] })),
      })
    );
    renderWithProviders(<RateCollectorScreen />, { port: port() });
    expect(await screen.findByTestId('rate-person-line')).toHaveTextContent(
      /Conversation · you can change it until/
    );
    expect(screen.getByTestId('rate-submit')).toHaveTextContent('Save changes');
    expect(screen.queryByTestId('rate-reference-instead')).toBeNull();
    expect(screen.getByTestId('rate-comment').props.value).toBe('Friendly.');
    fireEvent.press(screen.getByTestId('rate-overall-2'));
    // A details row the rating had is cleared with its chosen star: the edit drops it, never
    // falling back to the old score (R14 review fix 1, F3).
    expect(screen.getByTestId('rate-communication-5')).toBeChecked();
    fireEvent.press(screen.getByTestId('rate-communication-5'));
    expect(screen.getByTestId('rate-communication-5')).not.toBeChecked();
    fireEvent.press(screen.getByTestId('rate-submit'));
    await waitFor(() => expect(api.callsTo('PUT /api/v1/ratings/{id}')).toHaveLength(1));
    expect(screen.queryByText(/Meetup reliability/)).toBeNull();
    expect(api.callsTo('PUT /api/v1/ratings/{id}')[0]?.body).toEqual({
      overall: 2,
      shipping: 3,
      meetupReliability: 4,
      comment: 'Friendly.',
    });
    expect(await screen.findByTestId('snackbar')).toHaveTextContent('Your rating is updated.');
  });
});

describe('Rate a collector after a sale (stage R14)', () => {
  const sale = (soldToYou: boolean) =>
    ok(
      eligibilityFixture({
        interactions: [
          {
            id: 'i-sale',
            kind: 'SALE',
            occurredAt: '2026-10-17T15:00:00Z',
            alreadyRated: false,
            dealName: 'Ash Blossom & Joyous Spring',
            soldToYou,
          },
        ],
      })
    );

  it('names the deal for the buyer and the seller', async () => {
    mockParams.current = { ...mockParams.current, kind: 'SALE' };
    mockApi(routes({ 'GET /api/v1/ratings/eligibility': sale(true) }));
    const view = renderWithProviders(<RateCollectorScreen />, { port: port() });
    expect(await screen.findByTestId('rate-person-line')).toHaveTextContent(
      /^Ash Blossom & Joyous Spring · sold to you Oct 17/
    );
    expect(screen.getByText('Rate Noé Verdun')).toBeOnTheScreen();
    view.unmount();
    mockApi(routes({ 'GET /api/v1/ratings/eligibility': sale(false) }));
    renderWithProviders(<RateCollectorScreen />, { port: port() });
    expect(await screen.findByTestId('rate-person-line')).toHaveTextContent(
      /^Ash Blossom & Joyous Spring · bought from you Oct 17/
    );
  });

  it('shows the overall stars with their words and the details as clearable rows', async () => {
    mockApi(routes({ 'GET /api/v1/ratings/eligibility': sale(true) }));
    renderWithProviders(<RateCollectorScreen />, { port: port() });
    await screen.findByTestId('rating-form');
    const words = ['Poor', 'Not great', 'Okay', 'Good', 'Excellent'];
    for (const [index, word] of words.entries()) {
      fireEvent.press(screen.getByTestId(`rate-overall-${index + 1}`));
      expect(
        screen.getByTestId('rate-overall-word', { includeHiddenElements: true })
      ).toHaveTextContent(word);
    }
    // Overall never clears: pressing its chosen star keeps it.
    fireEvent.press(screen.getByTestId('rate-overall-5'));
    expect(screen.getByTestId('rate-overall-5')).toBeChecked();
    for (const key of ['communication', 'conditionAccuracy', 'shipping']) {
      expect(screen.getByTestId(`rate-row-${key}`)).toBeOnTheScreen();
      fireEvent.press(screen.getByTestId(`rate-${key}-3`));
      expect(screen.getByTestId(`rate-${key}-3`)).toBeChecked();
      fireEvent.press(screen.getByTestId(`rate-${key}-3`));
      expect(screen.getByTestId(`rate-${key}-3`)).not.toBeChecked();
    }
    expect(screen.getByLabelText('Communication: 4 stars, Good')).toBeOnTheScreen();
    expect(screen.getByText('Clear, timely and friendly')).toBeOnTheScreen();
    expect(screen.getByText('Matched what was described')).toBeOnTheScreen();
  });

  it('puts a details row’s stars under its words at the largest text size', async () => {
    mockApi(routes({ 'GET /api/v1/ratings/eligibility': sale(true) }));
    const window = Dimensions.get('window');
    act(() => {
      Dimensions.set({
        window: { ...window, fontScale: 3.1 },
        screen: { ...window, fontScale: 3.1 },
      });
    });
    try {
      renderWithProviders(<RateCollectorScreen />, { port: port() });
      expect(await screen.findByTestId('rate-row-shipping')).toHaveStyle({
        flexDirection: 'column',
      });
      expect(screen.getByText('Shipping').props.maxFontSizeMultiplier).toBe(2.5);
    } finally {
      act(() => {
        Dimensions.set({ window, screen: window });
      });
    }
  });

  it('writes a reference instead', async () => {
    mockApi(routes({ 'GET /api/v1/ratings/eligibility': sale(true) }));
    renderWithProviders(<RateCollectorScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('rate-reference-instead'));
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/ratings/reference',
      params: { userId: OTHER_ID, handle: 'collector2', name: 'Noé Verdun' },
    });
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
    renderWithProviders(<WriteReferenceScreen />, { port: port() });
    fireEvent.press(screen.getByTestId('reference-submit'));
    expect(await screen.findByText('Write a few words first.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('reference-body'), 'x'.repeat(401));
    expect(screen.getByText('Keep it under 400 characters.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('reference-body'), 'A zorblax trader');
    fireEvent.press(screen.getByTestId('reference-submit'));
    expect(await screen.findByTestId('reference-error')).toHaveTextContent(
      /Your text breaks the community guidelines\. Please rephrase it\./
    );
    expectBoundedBarMessage('reference-error', /Your text breaks the community guidelines/);
    fireEvent.changeText(screen.getByTestId('reference-body'), 'Great trader');
    fireEvent.press(screen.getByTestId('reference-submit'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('POST /api/v1/references').at(-1)?.body).toEqual({
      subjectId: OTHER_ID,
      body: 'Great trader',
    });
  });
});

describe('Ratings & references of a profile, in full (its "See all references", stage R6)', () => {
  beforeEach(() => {
    mockParams.current = { id: 'collector2' };
  });

  it('offers to rate and to write a reference after an interaction', async () => {
    mockApi(routes());
    renderWithProviders(<CollectorReferencesScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('collector-rate'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/ratings/rate',
      params: { userId: OTHER_ID, handle: 'collector2', name: 'Noé Verdun' },
    });
    fireEvent.press(await screen.findByTestId('collector-write-reference'));
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
    renderWithProviders(<CollectorReferencesScreen />, { port: port() });
    expect(await screen.findByTestId('rating-hint')).toHaveTextContent(
      /You already rated your interactions with Noé Verdun/
    );
    expect(screen.queryByTestId('collector-rate')).not.toBeOnTheScreen();
    // One reference per author: the caller already wrote theirs.
    expect(screen.queryByTestId('collector-write-reference')).not.toBeOnTheScreen();
    expect(screen.getByTestId(`rating-criteria-${RATING_ID}`)).toHaveTextContent(
      'Communication 5★ · Shipping 3★'
    );
    fireEvent.press(screen.getByTestId(`rating-edit-${RATING_ID}`));
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
    renderWithProviders(<CollectorReferencesScreen />, { port: port() });
    expect(await screen.findByTestId('rating-hint')).toHaveTextContent(
      /You can rate Noé Verdun after a deal with them or a conversation/
    );
    expect(screen.queryByTestId('collector-write-reference')).not.toBeOnTheScreen();
  });
});
