import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import ConversationScreen from '@/app/messages/[id]';
import OfferScreen from '@/app/offers/[id]';
import TradeScreen from '@/app/trades/[id]';
import {
  SAFETY_NOTICE_STORAGE_KEY,
  isSafetyNoticeDismissed,
  useSafetyNoticeStore,
} from '@/src/features/safety/safetyNoticeStore';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CONVERSATION_ID,
  OFFER_ID,
  SELF_ID,
  TRADE_ID,
  conversationPage,
  eligibilityFixture,
  meFixture,
  messagePage,
  offerFixture,
  tradeFixture,
} from '../support/fixtures';
import { mockApi, noContent, ok, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

const port = () => new FakeAuthPort(testUser());

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/conversations': ok(conversationPage()),
    'GET /api/v1/conversations/{id}/messages': ok(messagePage()),
    'POST /api/v1/conversations/{id}/read': noContent,
    'GET /api/v1/notifications/unread-count': ok({ count: 0 }),
    'GET /api/v1/offers/{id}': ok(offerFixture()),
    'GET /api/v1/trades/{id}': ok(tradeFixture()),
    'GET /api/v1/ratings/eligibility': ok(eligibilityFixture()),
    'POST /api/v1/users/{id}/block': noContent,
    ...extra,
  });
}

/**
 * A fresh store reading the device storage again (what an app restart does). A persisted store
 * writes on every `setState`, so only the hydration flag is reset here: what `rehydrate` reads
 * back from AsyncStorage is what the test asserts on.
 */
async function rehydrate(): Promise<void> {
  useSafetyNoticeStore.setState({ hydrated: false });
  await act(async () => {
    await useSafetyNoticeStore.persist.rehydrate();
  });
}

beforeEach(async () => {
  resetRouterMock();
  resetAppState();
  useSafetyNoticeStore.setState({ dismissals: {}, hydrated: false });
  await AsyncStorage.clear();
  await rehydrate();
});

describe('safety notice store', () => {
  it('remembers a dismissal per collector and per context, on this device', async () => {
    const { dismiss } = useSafetyNoticeStore.getState();
    expect(isSafetyNoticeDismissed({}, SELF_ID, 'conversation')).toBe(false);
    dismiss(SELF_ID, 'conversation', '2026-10-06T10:00:00Z');
    const state = useSafetyNoticeStore.getState();
    expect(isSafetyNoticeDismissed(state.dismissals, SELF_ID, 'conversation')).toBe(true);
    expect(isSafetyNoticeDismissed(state.dismissals, SELF_ID, 'trade')).toBe(false);
    expect(isSafetyNoticeDismissed(state.dismissals, 'someone-else', 'conversation')).toBe(false);
    expect(isSafetyNoticeDismissed(state.dismissals, null, 'conversation')).toBe(false);
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(SAFETY_NOTICE_STORAGE_KEY)).toContain(
        '2026-10-06T10:00:00Z'
      )
    );
  });

  it('reads the dismissals stored on the device when the app starts', async () => {
    // What an earlier run of the app left in AsyncStorage: written after the in-memory reset
    // (a persisted store writes on every `setState`), then read back by the hydration.
    useSafetyNoticeStore.setState({ hydrated: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await AsyncStorage.setItem(
      SAFETY_NOTICE_STORAGE_KEY,
      JSON.stringify({
        state: { dismissals: { [SELF_ID]: { trade: '2026-10-05T09:00:00Z' } } },
        version: 1,
      })
    );
    await act(async () => {
      await useSafetyNoticeStore.persist.rehydrate();
    });
    const state = useSafetyNoticeStore.getState();
    expect(state.hydrated).toBe(true);
    expect(isSafetyNoticeDismissed(state.dismissals, SELF_ID, 'trade')).toBe(true);
    expect(isSafetyNoticeDismissed(state.dismissals, SELF_ID, 'conversation')).toBe(false);
  });
});

describe('Trading safety notice', () => {
  it('shows in a conversation with the guide link, Report and Block, and never blocks the composer', async () => {
    mockParams.current = { id: CONVERSATION_ID };
    mockApi(routes());
    renderWithProviders(<ConversationScreen />, { port: port() });
    const notice = await screen.findByTestId('safety-notice');
    expect(within(notice).getByText('Trade safely')).toBeOnTheScreen();
    expect(within(notice).getByText(/Meet in a busy public place in daylight/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Message')).toBeOnTheScreen();

    fireEvent.press(within(notice).getByRole('link', { name: 'Read our trading safety advice' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/legal/[key]',
      params: { key: 'trading-safely' },
    });
    fireEvent.press(within(notice).getByRole('button', { name: 'Report Noé Verdun' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pathname: '/report',
        params: expect.objectContaining({
          source: 'CONVERSATION',
          conversationId: CONVERSATION_ID,
        }),
      })
    );
    fireEvent.press(within(notice).getByRole('button', { name: 'Block Noé Verdun' }));
    expect(
      within(screen.getByTestId('block-dialog')).getByText('Block Noé Verdun?')
    ).toBeOnTheScreen();
    fireEvent.press(
      within(screen.getByTestId('block-dialog')).getByRole('button', { name: 'Cancel' })
    );
    expect(screen.getByTestId('safety-notice')).toBeOnTheScreen();
  });

  it('is dismissed once per collector and stays hidden after a restart (stored on the device)', async () => {
    mockParams.current = { id: CONVERSATION_ID };
    mockApi(routes());
    const first = renderWithProviders(<ConversationScreen />, { port: port() });
    const notice = await screen.findByTestId('safety-notice');
    fireEvent.press(within(notice).getByRole('button', { name: 'Dismiss the safety notice' }));
    expect(screen.queryByTestId('safety-notice')).toBeNull();
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(SAFETY_NOTICE_STORAGE_KEY)).toContain(SELF_ID)
    );
    first.unmount();

    await rehydrate();
    const second = renderWithProviders(<ConversationScreen />, { port: port() });
    expect(await screen.findByText('Hi! Still have the Lantern Fox?')).toBeOnTheScreen();
    expect(screen.queryByTestId('safety-notice')).toBeNull();
    second.unmount();

    // Another collector on the same device sees it.
    mockApi(
      routes({
        'GET /api/v1/me': ok(meFixture({ id: '00000000-0000-4000-8000-0000000000ee' })),
      })
    );
    renderWithProviders(<ConversationScreen />, {
      port: new FakeAuthPort(testUser({ uid: 'uid-other', email: 'other@example.test' })),
    });
    expect(await screen.findByTestId('safety-notice')).toBeOnTheScreen();
  });

  it('shows on the offer screen (trade context) with Report and Block of the other collector', async () => {
    mockParams.current = { id: OFFER_ID };
    const api = mockApi(routes());
    renderWithProviders(<OfferScreen />, { port: port() });
    const notice = await screen.findByTestId('safety-notice');
    expect(within(notice).getByText(/Be wary of pressure/)).toBeOnTheScreen();
    fireEvent.press(within(notice).getByRole('button', { name: /^Report / }));
    expect(mockRouter.push).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pathname: '/report',
        params: expect.objectContaining({ source: 'PROFILE' }),
      })
    );
    fireEvent.press(within(notice).getByRole('button', { name: /^Block / }));
    const dialog = screen.getByTestId('block-dialog');
    fireEvent.press(within(dialog).getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(api.callsTo('POST /api/v1/users/{id}/block')).toHaveLength(1));
    expect(screen.getByTestId('snackbar')).toHaveTextContent(/is blocked\./);
    // Dismissed in the trade context: the conversation context is untouched.
    fireEvent.press(
      within(screen.getByTestId('safety-notice')).getByRole('button', {
        name: 'Dismiss the safety notice',
      })
    );
    expect(screen.queryByTestId('safety-notice')).toBeNull();
    const state = useSafetyNoticeStore.getState();
    expect(isSafetyNoticeDismissed(state.dismissals, SELF_ID, 'trade')).toBe(true);
    expect(isSafetyNoticeDismissed(state.dismissals, SELF_ID, 'conversation')).toBe(false);
  });

  it('shows on the trade screen until dismissed there', async () => {
    mockParams.current = { id: TRADE_ID };
    mockApi(routes());
    renderWithProviders(<TradeScreen />, { port: port() });
    const notice = await screen.findByTestId('safety-notice');
    expect(within(notice).getByText('Trade safely')).toBeOnTheScreen();
    expect(within(notice).getByRole('button', { name: /^Block / })).toBeOnTheScreen();
    fireEvent.press(within(notice).getByRole('button', { name: 'Dismiss the safety notice' }));
    expect(screen.queryByTestId('safety-notice')).toBeNull();
  });
});
