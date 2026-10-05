import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import ConversationScreen from '@/app/messages/[id]';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CONVERSATION_ID,
  SELF_ID,
  conversationFixture,
  messageFixture,
  messagePage,
} from '../support/fixtures';
import { mockApi, noContent, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockParams.current = { id: CONVERSATION_ID };
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/conversations': ok({
      items: [conversationFixture()],
      nextCursor: null,
      hasMore: false,
    }),
    'GET /api/v1/conversations/{id}/messages': ok(messagePage()),
    'POST /api/v1/conversations/{id}/read': noContent,
    ...extra,
  });
}

const render = () =>
  renderWithProviders(<ConversationScreen />, { port: new FakeAuthPort(testUser()) });

describe('Conversation (minimal thread)', () => {
  it('loads the messages, names the other collector and marks the thread read', async () => {
    const api = mockApi(routes());
    render();
    expect(screen.getByTestId('conversation-loading')).toBeOnTheScreen();
    expect(await screen.findByText('Hi! Still have the Lantern Fox?')).toBeOnTheScreen();
    expect(await screen.findByTestId('conversation-profile')).toHaveTextContent(/Noé Verdun/);
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/conversations/{id}/read')[0]?.body).toEqual({
        lastReadMessageId: messageFixture().id,
      })
    );
    fireEvent.press(screen.getByTestId('conversation-profile'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'collector2' },
    });
  });

  it('sends a text message and shows it at once', async () => {
    const sent = messageFixture({
      id: 'sent-1',
      senderId: SELF_ID,
      body: 'Yes! Saturday at the café?',
    });
    const api = mockApi(
      routes({
        'GET /api/v1/conversations/{id}/messages': ok(messagePage([])),
        'POST /api/v1/conversations/{id}/messages': ok(sent, 201),
      })
    );
    render();
    expect(await screen.findByTestId('conversation-empty')).toHaveTextContent(/No messages yet/);
    expect(screen.getByTestId('conversation-send')).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Message'), '  Yes! Saturday at the café?  ');
    fireEvent.press(screen.getByTestId('conversation-send'));
    expect(await screen.findByText('Yes! Saturday at the café?')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/conversations/{id}/messages')[0]?.body).toEqual({
      kind: 'TEXT',
      body: 'Yes! Saturday at the café?',
    });
    expect(screen.getByLabelText('Message').props.value).toBe('');
    // The viewer's own message is never marked read by the viewer.
    expect(api.callsTo('POST /api/v1/conversations/{id}/read')).toHaveLength(0);
  });

  it('explains a refused message under the composer', async () => {
    mockApi(
      routes({
        'POST /api/v1/conversations/{id}/messages': problem(
          422,
          'MESSAGE_BLOCKED',
          'Blocked by moderation'
        ),
      })
    );
    render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    fireEvent.changeText(screen.getByLabelText('Message'), 'Something');
    fireEvent.press(screen.getByTestId('conversation-send'));
    expect(await screen.findByTestId('conversation-send-error')).toHaveTextContent(
      /Message not sent/
    );
    expect(screen.getByLabelText('Message').props.value).toBe('Something');
  });

  it('shows "not available" for a conversation hidden by a block', async () => {
    mockApi(
      routes({
        'GET /api/v1/conversations/{id}/messages': problem(404, 'NOT_FOUND', 'Not found'),
      })
    );
    render();
    expect(await screen.findByTestId('conversation-not-found')).toBeOnTheScreen();
  });

  it('shows an error with retry', async () => {
    mockApi(
      routes({
        'GET /api/v1/conversations/{id}/messages': [
          problem(500, 'INTERNAL_ERROR', 'Boom'),
          ok(messagePage()),
        ],
      })
    );
    render();
    expect(await screen.findByTestId('conversation-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Hi! Still have the Lantern Fox?')).toBeOnTheScreen();
  });
});
