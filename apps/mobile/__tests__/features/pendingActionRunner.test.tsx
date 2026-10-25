import { act, screen, waitFor } from '@testing-library/react-native';

import type { Gate } from '@/src/account/gate';
import { useGuestAction, type GuestAction } from '@/src/account/guestAction';
import { usePendingLink } from '@/src/account/pendingLink';
import { PendingActionRunner } from '@/src/features/guest/PendingActionRunner';
import { RootNavigator } from '@/src/navigation/RootNavigator';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CARD_ID,
  CONVERSATION_ID,
  OTHER_ID,
  conversationFixture,
  inventoryPage,
  meFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import {
  mockParams,
  mockPathname,
  mockRouter,
  mockSegments,
  resetRouterMock,
} from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('expo-splash-screen', () => ({
  hideAsync: jest.fn(async () => undefined),
  preventAutoHideAsync: jest.fn(async () => undefined),
}));

/**
 * A guest's action finished after signing in (stage R15): kept by its listing, the owner named by
 * `GET /listings/owner`, the chat with the card pinned, "I have it", the wish form, the profile,
 * Report; nothing while Sign in, Review our terms or the welcome is on screen; a listing gone in
 * between or the collector's own says so.
 */

const OWNER = {
  id: OTHER_ID,
  handle: 'collector2',
  displayName: 'Noé Verdun',
  avatarUrl: null,
};

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/listings/owner': ok(OWNER),
    'POST /api/v1/conversations': ok(conversationFixture()),
    'GET /api/v1/inventory/items': ok(inventoryPage([])),
    ...extra,
  });
}

function keep(action: GuestAction) {
  useGuestAction.getState().open(action);
  useGuestAction.getState().hide();
}

function renderRunner(gate: Gate) {
  return renderWithProviders(<PendingActionRunner gate={gate} />, {
    port: new FakeAuthPort(testUser()),
  });
}

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockSegments.current = ['cards', '[id]'];
});

describe('the pending action of a guest (stage R15)', () => {
  it('opens the chat with the card pinned, the owner named by the card', async () => {
    keep({ kind: 'message', listing: { itemId: 'item-1' } });
    const api = mockApi(routes());
    renderRunner('app');
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/messages/[id]',
        params: { id: CONVERSATION_ID },
      })
    );
    expect(api.callsTo('GET /api/v1/listings/owner')[0]!.query.get('itemId')).toBe('item-1');
    expect(api.callsTo('POST /api/v1/conversations')[0]!.body).toEqual({
      recipientId: OTHER_ID,
      subjectItemId: 'item-1',
    });
    expect(useGuestAction.getState().pending).toBeNull();
  });

  it('opens the chat about a deck core by its binder', async () => {
    keep({ kind: 'message', listing: { binderId: 'core-1' } });
    const api = mockApi(routes());
    renderRunner('app');
    await waitFor(() => expect(api.callsTo('POST /api/v1/conversations')).toHaveLength(1));
    expect(api.callsTo('GET /api/v1/listings/owner')[0]!.query.get('binderId')).toBe('core-1');
    expect(api.callsTo('POST /api/v1/conversations')[0]!.body).toEqual({
      recipientId: OTHER_ID,
      subjectBinderId: 'core-1',
    });
  });

  it('opens the chat with the owner of a plain public binder, nothing pinned (review fix 1)', async () => {
    // Only a deck core can be a chat's subject: the binder names its owner, nothing more.
    keep({ kind: 'message', listing: { binderId: 'binder-1' }, pin: false });
    const api = mockApi(routes());
    renderRunner('app');
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/messages/[id]',
        params: { id: CONVERSATION_ID },
      })
    );
    expect(api.callsTo('GET /api/v1/listings/owner')[0]!.query.get('binderId')).toBe('binder-1');
    expect(api.callsTo('POST /api/v1/conversations')[0]!.body).toEqual({ recipientId: OTHER_ID });
  });

  it('"I have it" opens the chat with the wish’s owner, found by the wish', async () => {
    keep({
      kind: 'have',
      wishId: 'wish-1',
      card: { cardId: CARD_ID, cardName: 'Ash Blossom & Joyous Spring' },
    });
    const api = mockApi(routes());
    renderRunner('app');
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/messages/[id]',
        params: { id: CONVERSATION_ID },
      })
    );
    expect(api.callsTo('GET /api/v1/listings/owner')[0]!.query.get('wishId')).toBe('wish-1');
    // The chat is opened without a subject: nothing is pinned before send (R6).
    expect(api.callsTo('POST /api/v1/conversations')[0]!.body).toEqual({ recipientId: OTHER_ID });
  });

  it('opens the wish form of the card (and printing) without asking who', async () => {
    keep({ kind: 'wish', cardId: CARD_ID, printingId: 'printing-2' });
    const api = mockApi(routes());
    renderRunner('app');
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/wishlist/new',
        params: { cardId: CARD_ID, printingId: 'printing-2' },
      })
    );
    expect(api.callsTo('GET /api/v1/listings/owner')).toHaveLength(0);
  });

  it('opens the profile, or the collector’s cards, by handle', async () => {
    keep({ kind: 'profile', listing: { wishId: 'wish-1' }, page: 'profile' });
    mockApi(routes());
    const first = renderRunner('app');
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/collectors/[id]',
        params: { id: 'collector2' },
      })
    );
    first.unmount();

    resetRouterMock();
    mockSegments.current = ['(tabs)'];
    keep({ kind: 'profile', listing: { itemId: 'item-1' }, page: 'cards' });
    mockApi(routes());
    renderRunner('app');
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/collectors/[id]/cards',
        params: { id: 'collector2' },
      })
    );
  });

  it('opens Report collector about the binder', async () => {
    keep({ kind: 'report', binderId: 'core-1' });
    mockApi(routes());
    renderRunner('app');
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/report',
        params: {
          userId: OTHER_ID,
          name: 'Noé Verdun',
          handle: 'collector2',
          source: 'BINDER',
          binderId: 'core-1',
        },
      })
    );
  });

  it('says so when the listing is gone, and when it is the collector’s own', async () => {
    keep({ kind: 'message', listing: { itemId: 'gone' } });
    const api = mockApi(
      routes({ 'GET /api/v1/listings/owner': problem(404, 'NOT_FOUND', 'Gone') })
    );
    const first = renderRunner('app');
    expect(await screen.findByText('That listing is no longer available.')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/conversations')).toHaveLength(0);
    first.unmount();

    keep({ kind: 'message', listing: { itemId: 'mine' } });
    const own = mockApi(
      routes({
        'GET /api/v1/me': ok(meFixture({ id: OTHER_ID })),
      })
    );
    renderRunner('app');
    expect(await screen.findByText('That’s one of your own listings.')).toBeOnTheScreen();
    expect(own.callsTo('POST /api/v1/conversations')).toHaveLength(0);
  });

  it('waits while Sign in, Review our terms or the welcome is on screen', async () => {
    keep({ kind: 'message', listing: { itemId: 'item-1' } });
    const api = mockApi(routes());
    mockSegments.current = ['onboarding'];
    const view = renderRunner('app');
    await new Promise((resolve) => setTimeout(resolve, 30));
    view.rerender(<PendingActionRunner gate="onboarding" />);
    mockSegments.current = ['(auth)', 'sign-in'];
    view.rerender(<PendingActionRunner gate="app" />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(api.callsTo('GET /api/v1/listings/owner')).toHaveLength(0);
    expect(useGuestAction.getState().pending).not.toBeNull();

    // Back on the guest's screen after the welcome: the action finishes there.
    mockSegments.current = ['cards', '[id]'];
    view.rerender(<PendingActionRunner gate="app" />);
    await waitFor(() => expect(api.callsTo('POST /api/v1/conversations')).toHaveLength(1));
  });
});

describe('a guest signs in from the screen they were on (stage R15)', () => {
  it('goes back to the card page and the chat opens with the card pinned', async () => {
    // The guest is on a card page; they tapped Message, then Sign in on the sheet.
    mockSegments.current = ['(auth)', 'sign-in'];
    mockPathname.current = '/sign-in';
    mockParams.current = {};
    usePendingLink.getState().set('/cards/c1?printing=p2');
    keep({ kind: 'message', listing: { itemId: 'item-1' } });
    const port = new FakeAuthPort(null);
    const api = mockApi(routes());
    const view = renderWithProviders(<RootNavigator />, { port });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();

    await act(async () => {
      await port.signIn('maika@example.test', 'correct-password');
    });
    // Back to the guest's screen (still in the stack: `dismissTo` pops back to it).
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/cards/c1?printing=p2'));
    expect(api.callsTo('POST /api/v1/conversations')).toHaveLength(0);
    // The phone is on the card page again: the chat opens on top of it.
    mockSegments.current = ['cards', '[id]'];
    mockPathname.current = '/cards/c1';
    mockParams.current = { id: 'c1', printing: 'p2' };
    view.rerender(<RootNavigator />);
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/messages/[id]',
        params: { id: CONVERSATION_ID },
      })
    );
    expect(api.callsTo('POST /api/v1/conversations')[0]!.body).toMatchObject({
      subjectItemId: 'item-1',
    });
  });

  it('forgets the action on Sign out', async () => {
    mockSegments.current = ['(tabs)', 'profile'];
    mockPathname.current = '/profile';
    const port = new FakeAuthPort(testUser());
    mockApi(routes());
    renderWithProviders(<RootNavigator />, { port });
    await waitFor(() => expect(screen.queryByTestId('boot-screen')).not.toBeOnTheScreen());
    keep({ kind: 'wish', cardId: CARD_ID });
    await act(async () => {
      await port.signOut();
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
    expect(useGuestAction.getState().pending).toBeNull();
  });
});
