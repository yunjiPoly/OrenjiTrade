import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import ConversationScreen from '@/app/messages/[id]';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  BINDER_ID,
  CARD_ID,
  CONVERSATION_ID,
  PRINTING_A,
  SELF_ID,
  binderFixture,
  cardDetailFixture,
  conversationFixture,
  conversationPage,
  messageFixture,
  messagePage,
} from '../support/fixtures';
import { mockApi, noContent, ok, problem, type MockRoutes } from '../support/mockApi';
import { fakeRealtime, type FakeRealtime } from '../support/realtime';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const OTHER_ID = '00000000-0000-4000-8000-0000000000b1';
const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockParams.current = { id: CONVERSATION_ID };
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/conversations': ok(conversationPage()),
    'GET /api/v1/conversations/{id}/messages': ok(messagePage()),
    'POST /api/v1/conversations/{id}/read': noContent,
    'GET /api/v1/notifications/unread-count': ok({ count: 0 }),
    ...extra,
  });
}

const render = (realtime?: FakeRealtime) =>
  renderWithProviders(<ConversationScreen />, {
    port: new FakeAuthPort(testUser()),
    realtime: realtime?.client,
  });

/** A sent message as the API answers it. */
function sentMessage(overrides: Parameters<typeof messageFixture>[0] = {}) {
  return messageFixture({
    id: 'sent-1',
    senderId: SELF_ID,
    body: 'Yes! Saturday at the café?',
    createdAt: new Date().toISOString(),
    ...overrides,
  });
}

describe('Conversation', () => {
  it('loads the messages, names the other collector and marks the thread read', async () => {
    const api = mockApi(routes());
    const release = api.hold();
    await render();
    expect(screen.getByTestId('conversation-loading')).toBeOnTheScreen();
    release();
    expect(await screen.findByText('Hi! Still have the Lantern Fox?')).toBeOnTheScreen();
    expect(await screen.findByTestId('conversation-profile')).toHaveTextContent(/Noé Verdun/);
    expect(screen.getByTestId('conversation-status')).toHaveTextContent('@collector2');
    expect(screen.getByTestId('conversation-start')).toHaveTextContent(
      'This is the beginning of your conversation with Noé Verdun.'
    );
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/conversations/{id}/read')[0]?.body).toEqual({
        lastReadMessageId: messageFixture().id,
      })
    );
    await fireEvent.press(screen.getByTestId('conversation-profile'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'collector2' },
    });
  });

  it('sends a text message, shows it with "Sent" and clears the composer', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/conversations/{id}/messages': ok(messagePage([])),
        'POST /api/v1/conversations/{id}/messages': ok(sentMessage(), 201),
      })
    );
    await render();
    expect(await screen.findByTestId('conversation-empty')).toHaveTextContent(
      /Say hello to Noé Verdun/
    );
    expect(screen.getByTestId('conversation-send')).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Message'), '  Yes! Saturday at the café?  ');
    await fireEvent.press(screen.getByTestId('conversation-send'));
    expect(await screen.findByText('Yes! Saturday at the café?')).toBeOnTheScreen();
    expect(screen.getByTestId('receipt-sent')).toHaveTextContent('Sent');
    expect(api.callsTo('POST /api/v1/conversations/{id}/messages')[0]?.body).toEqual({
      kind: 'TEXT',
      body: 'Yes! Saturday at the café?',
    });
    expect(screen.getByLabelText('Message').props.value).toBe('');
    // The viewer's own message is never marked read by the viewer.
    expect(api.callsTo('POST /api/v1/conversations/{id}/read')).toHaveLength(0);
  });

  it('shares a card: the picker resolves the printing and sends a card link', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/cards/suggest': ok([
          {
            kind: 'CARD',
            id: CARD_ID,
            name: 'Azure-Eyes Sky Dragon',
            game: 'yugioh',
            printingCode: 'AZR-EN001',
            imageUrl: null,
          },
        ]),
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
        'POST /api/v1/conversations/{id}/messages': ok(
          sentMessage({
            kind: 'CARD_LINK',
            body: '',
            payload: {
              card: {
                id: PRINTING_A,
                cardId: CARD_ID,
                name: 'Azure-Eyes Sky Dragon',
                printingCode: 'AZR-EN001',
                imageUrl: null,
              },
            },
          }),
          201
        ),
      })
    );
    await render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    await fireEvent.press(screen.getByTestId('composer-attach'));
    await fireEvent.press(await screen.findByTestId('composer-share-card'));
    await fireEvent.changeText(await screen.findByTestId('card-picker-input'), 'Azure');
    await fireEvent.press(await screen.findByTestId('suggestion-CARD-AZR-EN001'));
    expect(await screen.findByTestId('composer-attachment')).toHaveTextContent(
      /Azure-Eyes Sky Dragon/
    );
    await fireEvent.press(screen.getByTestId('conversation-send'));
    expect(await screen.findByTestId('shared-card-link')).toBeOnTheScreen();
    const body = api.callsTo('POST /api/v1/conversations/{id}/messages')[0]?.body as Record<
      string,
      unknown
    >;
    expect(body.kind).toBe('CARD_LINK');
    expect(typeof body.cardPrintingId).toBe('string');
    expect(screen.queryByTestId('composer-attachment')).toBeNull();
    // The link opens the card with the shared printing.
    await fireEvent.press(screen.getByTestId('shared-card-link'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: CARD_ID, printing: PRINTING_A },
    });
  });

  it('shares one of the caller’s public binders, and explains when there is none', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/binders': ok([
          binderFixture({ name: 'Private stash', effectivePublic: false, id: 'b-private' }),
          binderFixture({ name: 'Trade binder', effectivePublic: true, publicItemCount: 4 }),
        ]),
        'POST /api/v1/conversations/{id}/messages': ok(
          sentMessage({
            kind: 'BINDER_LINK',
            body: '',
            payload: { binder: { id: BINDER_ID, name: 'Trade binder', ownerHandle: 'maika' } },
          }),
          201
        ),
      })
    );
    await render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    await fireEvent.press(screen.getByTestId('composer-attach'));
    await fireEvent.press(await screen.findByTestId('composer-share-binder'));
    expect(await screen.findByText('Trade binder')).toBeOnTheScreen();
    expect(screen.queryByText('Private stash')).toBeNull();
    await fireEvent.press(screen.getByText('Trade binder'));
    await fireEvent.press(screen.getByTestId('conversation-send'));
    expect(await screen.findByTestId('shared-binder-link')).toHaveTextContent(/by @maika/);
    expect(api.callsTo('POST /api/v1/conversations/{id}/messages')[0]?.body).toEqual({
      kind: 'BINDER_LINK',
      binderId: BINDER_ID,
    });
  });

  it('attaches a photo: uploads it first, then sends an IMAGE message', async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
    } as never);
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///photo.jpg',
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg',
          fileSize: 120_000,
          width: 800,
          height: 600,
        },
      ],
    } as never);
    const api = mockApi(
      routes({
        'POST /api/v1/uploads/images': ok(
          {
            uploadId: 'upload-1',
            url: '/api/v1/public/media/messages/abc.jpg',
            width: 800,
            height: 600,
            expiresAt: '2026-10-05T13:00:00Z',
          },
          201
        ),
        'POST /api/v1/conversations/{id}/messages': ok(
          sentMessage({
            kind: 'IMAGE',
            body: 'The card',
            payload: {
              image: {
                url: '/api/v1/public/media/m/abc.jpg',
                width: 800,
                height: 600,
              },
            },
          }),
          201
        ),
      })
    );
    await render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    await fireEvent.press(screen.getByTestId('composer-attach'));
    await fireEvent.press(await screen.findByTestId('composer-attach-photo'));
    expect(await screen.findByTestId('composer-attachment')).toHaveTextContent(/photo\.jpg/);
    expect(screen.getByTestId('composer-attachment')).toHaveTextContent(/117 KB/);
    await fireEvent.changeText(screen.getByLabelText('Message'), 'The card');
    await fireEvent.press(screen.getByTestId('conversation-send'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/conversations/{id}/messages')[0]?.body).toEqual({
        kind: 'IMAGE',
        body: 'The card',
        imageUploadId: 'upload-1',
      })
    );
    const upload = api.callsTo('POST /api/v1/uploads/images')[0];
    expect(upload?.query.get('kind')).toBe('MESSAGE');
    expect(await screen.findByTestId('message-photo')).toBeOnTheScreen();
  });

  it('refuses unsupported or too large photos, and explains a denied permission', async () => {
    mockApi(routes());
    await render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false } as never);
    await fireEvent.press(screen.getByTestId('composer-attach'));
    await fireEvent.press(await screen.findByTestId('composer-attach-photo'));
    expect(await screen.findByText('Allow access to your photos to attach one.')).toBeOnTheScreen();

    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///a.gif', mimeType: 'image/gif', fileName: 'a.gif', width: 1, height: 1 },
      ],
    } as never);
    await fireEvent.press(screen.getByTestId('composer-attach'));
    await fireEvent.press(await screen.findByTestId('composer-attach-photo'));
    expect(await screen.findByText('Use a JPEG, PNG or WebP photo.')).toBeOnTheScreen();

    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///big.jpg',
          mimeType: 'image/jpeg',
          fileName: 'big.jpg',
          fileSize: 9 * 1024 * 1024,
          width: 1,
          height: 1,
        },
      ],
    } as never);
    await fireEvent.press(screen.getByTestId('composer-attach'));
    await fireEvent.press(await screen.findByTestId('composer-attach-photo'));
    expect(await screen.findByText('Choose a photo up to 8 MB.')).toBeOnTheScreen();
    expect(screen.queryByTestId('composer-attachment')).toBeNull();
  });

  it('explains refused messages: moderation, rate limit, and a block that stops messaging', async () => {
    const api = mockApi(
      routes({
        'POST /api/v1/conversations/{id}/messages': [
          problem(422, 'MESSAGE_BLOCKED', 'Blocked by moderation'),
          problem(429, 'RATE_LIMITED', 'Too many', { retryAfterSeconds: 42 }),
          problem(403, 'MESSAGING_BLOCKED', 'Blocked'),
        ],
      })
    );
    await render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    await fireEvent.changeText(screen.getByLabelText('Message'), 'Something');
    await fireEvent.press(screen.getByTestId('conversation-send'));
    expect(await screen.findByTestId('conversation-send-error')).toHaveTextContent(
      /breaks the community guidelines/
    );
    expect(screen.getByLabelText('Message').props.value).toBe('Something');
    await fireEvent.press(screen.getByTestId('conversation-send'));
    expect(await screen.findByTestId('conversation-send-error')).toHaveTextContent(
      'You are sending messages too quickly. Try again in 42 seconds.'
    );
    await fireEvent.press(screen.getByTestId('conversation-send'));
    expect(await screen.findByTestId('conversation-cannot-message')).toHaveTextContent(
      /You can no longer message Noé Verdun\./
    );
    expect(screen.getByLabelText('Message').props.editable).toBe(false);
    expect(api.callsTo('POST /api/v1/conversations/{id}/messages')).toHaveLength(3);
  });

  it('renders shared cards, binders, photos, offers, system lines and removed messages', async () => {
    mockApi(
      routes({
        'GET /api/v1/conversations/{id}/messages': ok(
          messagePage([
            messageFixture({
              id: 'm-offer',
              kind: 'OFFER_LINK',
              body: '',
              createdAt: '2026-10-04T12:05:00Z',
              payload: {
                offer: {
                  id: 'o1',
                  status: 'OPEN',
                  summary: '45.00 CAD for Lantern Fox',
                  imageUrl: null,
                },
              },
            }),
            messageFixture({
              id: 'm-system',
              kind: 'SYSTEM',
              senderId: null,
              body: 'Noé countered the offer.',
              createdAt: '2026-10-04T12:04:00Z',
            }),
            messageFixture({
              id: 'm-removed',
              moderationState: 'REMOVED',
              createdAt: '2026-10-04T12:03:00Z',
            }),
            messageFixture({
              id: 'm-photo',
              kind: 'IMAGE',
              body: '',
              createdAt: '2026-10-04T12:02:00Z',
              payload: { image: { url: 'https://elsewhere.example/x.jpg', width: 10, height: 10 } },
            }),
            messageFixture({
              id: 'm-binder',
              kind: 'BINDER_LINK',
              body: 'My binder',
              createdAt: '2026-10-04T12:01:00Z',
              payload: {
                binder: { id: BINDER_ID, name: 'Trade binder', ownerHandle: 'collector2' },
              },
            }),
          ])
        ),
      })
    );
    await render();
    expect(await screen.findByTestId('offer-link-card')).toHaveTextContent(/Open/);
    expect(screen.getByText('Noé countered the offer.')).toBeOnTheScreen();
    expect(screen.getByText('This message was removed by moderation.')).toBeOnTheScreen();
    // A photo outside the API's media routes is never loaded.
    expect(screen.getByTestId('message-photo-unavailable')).toBeOnTheScreen();
    expect(screen.getByTestId('shared-binder-link')).toHaveTextContent(/Trade binder/);
    await fireEvent.press(screen.getByTestId('shared-binder-link'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: BINDER_ID },
    });
    // An offer link opens the offer.
    await fireEvent.press(screen.getByTestId('offer-link-card'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/offers/[id]',
      params: { id: 'o1' },
    });
  });

  it('is live: pushed messages, typing, receipts and the read marker', async () => {
    jest.useFakeTimers();
    try {
      const rt = fakeRealtime();
      const api = mockApi(
        routes({
          'GET /api/v1/conversations/{id}/messages': ok(
            messagePage([sentMessage({ id: 'mine', createdAt: '2026-10-05T12:00:00Z' })])
          ),
        })
      );
      await render(rt);
      expect(await screen.findByText('Yes! Saturday at the café?')).toBeOnTheScreen();
      await waitFor(() => expect(rt.client.state).toBe('connected'));
      const session = rt.current();

      await act(() =>
        session.push('/user/queue/typing', { conversationId: CONVERSATION_ID, userId: OTHER_ID })
      );
      expect(await screen.findByTestId('typing-indicator')).toHaveTextContent(
        'Noé Verdun is typing…'
      );
      expect(screen.getByTestId('conversation-status')).toHaveTextContent('typing…');

      await act(() =>
        session.push('/user/queue/receipts', {
          conversationId: CONVERSATION_ID,
          userId: OTHER_ID,
          lastReadMessageId: 'mine',
          readAt: '2026-10-05T12:01:00Z',
        })
      );
      expect(await screen.findByTestId('receipt-seen')).toHaveTextContent('Seen');

      await act(() =>
        session.push(
          '/user/queue/messages',
          messageFixture({
            id: 'pushed',
            body: 'See you there!',
            createdAt: '2026-10-05T12:02:00Z',
          })
        )
      );
      expect(await screen.findByText('See you there!')).toBeOnTheScreen();
      expect(screen.queryByTestId('typing-indicator')).toBeNull();
      await waitFor(() =>
        expect(api.callsTo('POST /api/v1/conversations/{id}/read').at(-1)?.body).toEqual({
          lastReadMessageId: 'pushed',
        })
      );

      // Typing notices of the caller are throttled to one every few seconds.
      await fireEvent.changeText(screen.getByLabelText('Message'), 'O');
      await fireEvent.changeText(screen.getByLabelText('Message'), 'Ok');
      expect(session.sent).toEqual([
        { destination: '/app/typing', body: JSON.stringify({ conversationId: CONVERSATION_ID }) },
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('mutes, archives (back to the inbox) and unmutes from the options', async () => {
    const api = mockApi(
      routes({
        'PATCH /api/v1/conversations/{id}': (request) =>
          ok(conversationFixture({ ...(request.body as object) })),
      })
    );
    await render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    await fireEvent.press(screen.getByTestId('conversation-menu'));
    await fireEvent.press(await screen.findByTestId('conversation-mute'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent('Conversation muted.');
    expect(api.callsTo('PATCH /api/v1/conversations/{id}')[0]?.body).toEqual({ muted: true });
    expect(await screen.findByTestId('conversation-status')).toHaveTextContent(/Muted/);

    await fireEvent.press(screen.getByTestId('conversation-menu'));
    await fireEvent.press(await screen.findByTestId('conversation-archive'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('PATCH /api/v1/conversations/{id}')[1]?.body).toEqual({ archived: true });
  });

  it('rates and reports the other collector from the options', async () => {
    mockApi(
      routes({
        'GET /api/v1/ratings/eligibility': ok({
          eligible: true,
          interactions: [
            {
              id: 'i-chat',
              kind: 'CONVERSATION_QUALIFIED',
              occurredAt: '2026-10-04T12:00:00Z',
              alreadyRated: false,
            },
          ],
        }),
      })
    );
    await render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    await fireEvent.press(screen.getByTestId('conversation-menu'));
    await fireEvent.press(await screen.findByTestId('conversation-rate'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/ratings/rate',
      params: { userId: OTHER_ID, handle: 'collector2', name: 'Noé Verdun' },
    });
    await fireEvent.press(screen.getByTestId('conversation-menu'));
    await fireEvent.press(await screen.findByTestId('conversation-report'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/report',
      params: {
        userId: OTHER_ID,
        name: 'Noé Verdun',
        handle: 'collector2',
        source: 'CONVERSATION',
        conversationId: CONVERSATION_ID,
      },
    });
  });

  it('offers no rating without an eligible interaction (silently)', async () => {
    mockApi(routes({ 'GET /api/v1/ratings/eligibility': problem(500, 'INTERNAL_ERROR', 'Boom') }));
    await render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    await fireEvent.press(screen.getByTestId('conversation-menu'));
    expect(await screen.findByTestId('conversation-report')).toBeOnTheScreen();
    expect(screen.queryByTestId('conversation-rate')).not.toBeOnTheScreen();
  });

  it('shares an offer with the other collector, and explains when there is none', async () => {
    const offer = {
      id: 'o-shared',
      rootOfferId: 'o-shared',
      item: null,
      counterparty: {
        id: OTHER_ID,
        handle: 'collector2',
        displayName: 'Noé Verdun',
        rating: { count: 0 },
      },
      viewerRole: 'BUYER',
      kind: 'CASH',
      cashAmount: 40,
      currency: 'CAD',
      tradeItemCount: 0,
      status: 'OPEN',
      currentTurn: 'SELLER',
      yourTurn: false,
      allowedActions: ['CANCEL'],
      expiresAt: '2099-01-01T00:00:00Z',
      version: 0,
      createdAt: '2026-10-05T10:00:00Z',
      updatedAt: '2026-10-05T10:00:00Z',
    };
    const other = { ...offer, id: 'o-other', counterparty: { ...offer.counterparty, id: 'x' } };
    const api = mockApi(
      routes({
        'GET /api/v1/offers': [
          ok({ items: [other], hasMore: false }),
          ok({ items: [offer, other], hasMore: false }),
        ],
        'POST /api/v1/conversations/{id}/messages': ok(
          sentMessage({
            kind: 'OFFER_LINK',
            body: '',
            payload: { offer: { id: 'o-shared', status: 'OPEN', summary: '40.00 CAD for A card' } },
          }),
          201
        ),
      })
    );
    await render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    await fireEvent.press(screen.getByTestId('composer-attach'));
    await fireEvent.press(await screen.findByTestId('composer-share-offer'));
    expect(await screen.findByTestId('offer-link-picker-empty')).toHaveTextContent(
      /No offer with Noé Verdun yet/
    );
    await fireEvent.press(screen.getByTestId('link-picker-cancel'));
    await fireEvent.press(screen.getByTestId('composer-attach'));
    await fireEvent.press(await screen.findByTestId('composer-share-offer'));
    await fireEvent.press(await screen.findByTestId('offer-option-o-shared'));
    expect(screen.getByTestId('composer-attachment')).toHaveTextContent(/Offer.*\$40\.00/);
    await fireEvent.press(screen.getByTestId('conversation-send'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/conversations/{id}/messages')[0]?.body).toEqual({
        kind: 'OFFER_LINK',
        offerId: 'o-shared',
      })
    );
    expect(api.callsTo('GET /api/v1/offers')[0]?.query.get('limit')).toBe('50');
  });

  it('blocks the other collector after a confirmation, then unblocks', async () => {
    const api = mockApi(
      routes({
        'POST /api/v1/users/{id}/block': ok({
          id: OTHER_ID,
          handle: 'collector2',
          displayName: 'Noé Verdun',
          blockedAt: '2026-10-05T12:00:00Z',
        }),
        'DELETE /api/v1/users/{id}/block': noContent,
      })
    );
    await render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    await fireEvent.press(screen.getByTestId('conversation-menu'));
    await fireEvent.press(await screen.findByTestId('conversation-block'));
    const dialog = await screen.findByTestId('block-dialog');
    expect(dialog).toHaveTextContent(/Block Noé Verdun\?/);
    await fireEvent.press(within(dialog).getByTestId('block-dialog-cancel'));
    expect(api.callsTo('POST /api/v1/users/{id}/block')).toHaveLength(0);

    await fireEvent.press(screen.getByTestId('conversation-menu'));
    await fireEvent.press(await screen.findByTestId('conversation-block'));
    await fireEvent.press(await screen.findByTestId('block-dialog-confirm'));
    expect(await screen.findByTestId('conversation-blocked-banner')).toHaveTextContent(
      /You blocked Noé Verdun/
    );
    expect(api.callsTo('POST /api/v1/users/{id}/block')[0]?.path).toBe(
      `/api/v1/users/${OTHER_ID}/block`
    );
    expect(screen.getByTestId('conversation-status')).toHaveTextContent('Blocked');
    expect(screen.getByLabelText('Message').props.editable).toBe(false);

    await fireEvent.press(screen.getByTestId('conversation-banner-unblock'));
    await waitFor(() =>
      expect(screen.queryByTestId('conversation-blocked-banner')).not.toBeOnTheScreen()
    );
    expect(api.callsTo('DELETE /api/v1/users/{id}/block')).toHaveLength(1);
    // The snackbar of the block is replaced by the one of the unblock.
    await waitFor(() =>
      expect(screen.getByTestId('snackbar')).toHaveTextContent('Noé Verdun is unblocked.')
    );
  });

  it('shows "not available" for a conversation hidden by a block', async () => {
    mockApi(
      routes({
        'GET /api/v1/conversations/{id}/messages': problem(404, 'NOT_FOUND', 'Not found'),
      })
    );
    await render();
    expect(await screen.findByTestId('conversation-not-found')).toHaveTextContent(
      /This conversation is not available/
    );
    await fireEvent.press(screen.getByText('Back to messages'));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/messages');
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
    await render();
    expect(await screen.findByTestId('conversation-error')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Hi! Still have the Lantern Fox?')).toBeOnTheScreen();
  });
});
