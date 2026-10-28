import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { Dimensions, Keyboard, ScrollView, StyleSheet } from 'react-native';

import ConversationScreen from '@/app/messages/[id]';
import { peekPendingDraft, setPendingDraft } from '@/src/features/messages/pendingDraft';
import { PINNED_MAX_FONT_SCALE, TITLE_MAX_FONT_SCALE } from '@/src/theme';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  BINDER_ID,
  CARD_ID,
  CONVERSATION_ID,
  ONTARIO,
  PRINTING_A,
  SELF_ID,
  binderFixture,
  conversationFixture,
  conversationPage,
  deckCoreSubjectFixture,
  inventoryPage,
  ITEM_ID,
  itemFixture,
  messageFixture,
  messagePage,
  saleMessageFixture,
  subjectFixture,
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
/** The other collector, in Ontario (the chat's status line says "Ontario", never a city). */
const OTHER = {
  id: OTHER_ID,
  handle: 'collector2',
  displayName: 'Noé Verdun',
  avatarUrl: null,
  onlineStatus: 'HIDDEN' as const,
  place: ONTARIO,
};
const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockParams.current = { id: CONVERSATION_ID };
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/conversations': ok(conversationPage()),
    'GET /api/v1/conversations/{id}': ok(conversationFixture({ other: OTHER })),
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
    body: 'Yes! How much with shipping?',
    createdAt: new Date().toISOString(),
    ...overrides,
  });
}

describe('Conversation', () => {
  it('loads the messages, names the other collector and marks the thread read', async () => {
    const api = mockApi(routes());
    render();
    expect(screen.getByTestId('conversation-loading')).toBeOnTheScreen();
    expect(await screen.findByText('Hi! Still have the Lantern Fox?')).toBeOnTheScreen();
    expect(await screen.findByTestId('conversation-profile')).toHaveTextContent(/collector2/);
    // The status line names the province, never a city (ADR 0017).
    expect(screen.getByTestId('conversation-status')).toHaveTextContent(/^Ontario$/);
    expect(screen.getByTestId('conversation-start')).toHaveTextContent(
      'This is the beginning of your conversation with collector2.'
    );
    // Dragging the thread puts the keyboard away (review fix 1, F2).
    expect(screen.getByTestId('conversation-messages').props.keyboardDismissMode).toBe(
      'interactive'
    );
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

  it('sends a text message, shows it with "Sent" and clears the composer', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/conversations/{id}/messages': ok(messagePage([])),
        'POST /api/v1/conversations/{id}/messages': ok(sentMessage(), 201),
      })
    );
    render();
    expect(await screen.findByTestId('conversation-empty')).toHaveTextContent(
      /Say hello to collector2/
    );
    expect(screen.getByTestId('conversation-send')).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Message'), '  Yes! How much with shipping?  ');
    fireEvent.press(screen.getByTestId('conversation-send'));
    expect(await screen.findByText('Yes! How much with shipping?')).toBeOnTheScreen();
    expect(screen.getByTestId('receipt-sent')).toHaveTextContent(/Sent$/);
    expect(api.callsTo('POST /api/v1/conversations/{id}/messages')[0]?.body).toEqual({
      kind: 'TEXT',
      body: 'Yes! How much with shipping?',
    });
    expect(screen.getByLabelText('Message').props.value).toBe('');
    // The viewer's own message is never marked read by the viewer.
    expect(api.callsTo('POST /api/v1/conversations/{id}/read')).toHaveLength(0);
  });

  it('shares one of the caller’s own cards from the inventory; the chat is about it then', async () => {
    const shared = {
      card: {
        id: PRINTING_A,
        cardId: CARD_ID,
        name: 'Emberfang Fox VMAX',
        printingCode: 'SVX-001',
        imageUrl: null,
      },
      item: { itemId: ITEM_ID, ownerId: SELF_ID, askingPriceText: '85% TCG', rarity: 'Ultra Rare' },
    };
    const api = mockApi(
      routes({
        'GET /api/v1/inventory/items': ok(
          inventoryPage([itemFixture({ askingPriceText: '85% TCG' })])
        ),
        'GET /api/v1/conversations/{id}': [
          ok(conversationFixture({ other: OTHER })),
          ok(
            conversationFixture({
              other: OTHER,
              subject: subjectFixture({ ownerId: SELF_ID, copies: 2, askingPriceText: '85% TCG' }),
            })
          ),
        ],
        'POST /api/v1/conversations/{id}/messages': ok(
          sentMessage({ kind: 'CARD_LINK', body: '', payload: shared }),
          201
        ),
      })
    );
    render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    fireEvent.press(screen.getByTestId('composer-attach'));
    fireEvent.press(await screen.findByTestId('composer-share-card'));
    const picker = await screen.findByTestId('own-card-picker');
    fireEvent.press(await within(picker).findByTestId(`item-${ITEM_ID}`));
    expect(await screen.findByTestId('composer-attachment')).toHaveTextContent(
      /Your card.*Emberfang Fox VMAX.*SVX-001 · 85% TCG/
    );
    fireEvent.press(screen.getByTestId('conversation-send'));
    expect(await screen.findByTestId('shared-card-link')).toHaveTextContent(
      /Emberfang Fox VMAX.*SVX-001 · 85% TCG/
    );
    expect(api.callsTo('POST /api/v1/conversations/{id}/messages')[0]?.body).toEqual({
      kind: 'CARD_LINK',
      inventoryItemId: ITEM_ID,
    });
    expect(screen.queryByTestId('composer-attachment')).toBeNull();
    // The card shared becomes what the chat is about: the seller's pinned bar.
    expect(await screen.findByTestId('pinned-mark-sold')).toBeOnTheScreen();
    // The link opens the card with the shared printing.
    fireEvent.press(screen.getByTestId('shared-card-link'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: CARD_ID, printing: PRINTING_A },
    });
  });

  it('"I have it": starts with the text and your card in the box, sends both only on send', async () => {
    // Left by the profile's "I have it" (stage R6) for this chat, which pinned your card already.
    setPendingDraft(CONVERSATION_ID, {
      text: 'I have Emberfang Fox VMAX for your wishlist. Interested?',
      attachment: {
        kind: 'item',
        item: {
          itemId: ITEM_ID,
          name: 'Emberfang Fox VMAX',
          printingCode: 'SVX-001',
          imageUrl: null,
          game: 'pokemon',
          askingPriceText: '$12.50',
        },
      },
    });
    const api = mockApi(
      routes({
        'POST /api/v1/conversations/{id}/messages': ok(
          sentMessage({ body: 'I have Emberfang Fox VMAX for your wishlist. Interested?' }),
          201
        ),
      })
    );
    render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    expect(screen.getByTestId('conversation-input').props.value).toBe(
      'I have Emberfang Fox VMAX for your wishlist. Interested?'
    );
    expect(screen.getByTestId('composer-attachment')).toHaveTextContent(/Emberfang Fox VMAX/);
    // Read once: the draft is not left for a later visit.
    await waitFor(() => expect(peekPendingDraft(CONVERSATION_ID)).toBeNull());
    expect(api.callsTo('POST /api/v1/conversations/{id}/messages')).toHaveLength(0);
    fireEvent.press(screen.getByTestId('conversation-send'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/conversations/{id}/messages')).toHaveLength(1)
    );
    // Your card first, then the text: one CARD_LINK with your copy (R4) and the text.
    expect(api.callsTo('POST /api/v1/conversations/{id}/messages')[0]?.body).toEqual({
      kind: 'CARD_LINK',
      inventoryItemId: ITEM_ID,
      body: 'I have Emberfang Fox VMAX for your wishlist. Interested?',
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
    render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    fireEvent.press(screen.getByTestId('composer-attach'));
    fireEvent.press(await screen.findByTestId('composer-share-binder'));
    expect(await screen.findByText('Trade binder')).toBeOnTheScreen();
    expect(screen.queryByText('Private stash')).toBeNull();
    fireEvent.press(screen.getByText('Trade binder'));
    fireEvent.press(screen.getByTestId('conversation-send'));
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
    render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    // iOS shows the picker over whatever is on screen: it must only be asked for once the attach
    // sheet has left, or it goes away with the sheet.
    let sheetGoneAtLaunch = false;
    picker.launchImageLibraryAsync.mockImplementationOnce(async () => {
      sheetGoneAtLaunch = screen.queryByTestId('composer-attach-sheet') === null;
      return (await picker.launchImageLibraryAsync()) as never;
    });
    fireEvent.press(screen.getByTestId('composer-attach'));
    fireEvent.press(await screen.findByTestId('composer-attach-photo'));
    expect(await screen.findByTestId('composer-attachment')).toHaveTextContent(/photo\.jpg/);
    expect(sheetGoneAtLaunch).toBe(true);
    // A library photo is asked for in the compatible format (an iPhone's HEIC arrives as JPEG).
    expect(picker.launchImageLibraryAsync.mock.calls[0]?.[0]).toMatchObject({
      mediaTypes: ['images'],
      preferredAssetRepresentationMode: 'compatible',
    });
    expect(screen.getByTestId('composer-attachment')).toHaveTextContent(/117 KB/);
    fireEvent.changeText(screen.getByLabelText('Message'), 'The card');
    fireEvent.press(screen.getByTestId('conversation-send'));
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
    render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false } as never);
    fireEvent.press(screen.getByTestId('composer-attach'));
    fireEvent.press(await screen.findByTestId('composer-attach-photo'));
    expect(await screen.findByText('Allow access to your photos to send one.')).toBeOnTheScreen();

    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///a.gif', mimeType: 'image/gif', fileName: 'a.gif', width: 1, height: 1 },
      ],
    } as never);
    fireEvent.press(screen.getByTestId('composer-attach'));
    fireEvent.press(await screen.findByTestId('composer-attach-photo'));
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
    fireEvent.press(screen.getByTestId('composer-attach'));
    fireEvent.press(await screen.findByTestId('composer-attach-photo'));
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
    render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    fireEvent.changeText(screen.getByLabelText('Message'), 'Something');
    fireEvent.press(screen.getByTestId('conversation-send'));
    expect(await screen.findByTestId('conversation-send-error')).toHaveTextContent(
      /breaks the community guidelines/
    );
    expect(screen.getByLabelText('Message').props.value).toBe('Something');
    fireEvent.press(screen.getByTestId('conversation-send'));
    expect(await screen.findByTestId('conversation-send-error')).toHaveTextContent(
      'You are sending messages too quickly. Try again in 42 seconds.'
    );
    fireEvent.press(screen.getByTestId('conversation-send'));
    expect(await screen.findByTestId('conversation-cannot-message')).toHaveTextContent(
      /You can no longer message collector2\./
    );
    expect(screen.getByLabelText('Message').props.editable).toBe(false);
    expect(api.callsTo('POST /api/v1/conversations/{id}/messages')).toHaveLength(3);
  });

  it('renders shared cards, binders, photos, system lines and removed messages', async () => {
    mockApi(
      routes({
        'GET /api/v1/conversations/{id}/messages': ok(
          messagePage([
            messageFixture({
              id: 'm-system',
              kind: 'SYSTEM',
              senderId: null,
              body: 'Noé joined the conversation.',
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
    render();
    expect(await screen.findByText('Noé joined the conversation.')).toBeOnTheScreen();
    expect(screen.getByText('This message was removed by moderation.')).toBeOnTheScreen();
    // A photo outside the API's media routes is never loaded.
    expect(screen.getByTestId('message-photo-unavailable')).toBeOnTheScreen();
    expect(screen.getByTestId('shared-binder-link')).toHaveTextContent(/Trade binder/);
    fireEvent.press(screen.getByTestId('shared-binder-link'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: BINDER_ID },
    });
  });

  it('shows old offer and trade messages as one grey line that opens nothing (ADR 0018)', async () => {
    const offer = {
      id: 'o1',
      status: 'OPEN',
      summary: '45.00 CAD for Lantern Fox',
      imageUrl: null,
    };
    mockApi(
      routes({
        'GET /api/v1/conversations/{id}/messages': ok(
          messagePage([
            // A trade update the API posted (it carries the offer too).
            messageFixture({
              id: 'm-trade',
              kind: 'SYSTEM',
              senderId: null,
              body: 'Trade completed: 45.00 CAD for Lantern Fox. You can now rate each other.',
              createdAt: '2026-10-04T12:06:00Z',
              payload: { offer: { ...offer, status: 'ACCEPTED' } },
            }),
            // An offer update the API posted.
            messageFixture({
              id: 'm-offer-system',
              kind: 'SYSTEM',
              senderId: null,
              body: 'Noé countered the offer: 45.00 CAD for Lantern Fox.',
              createdAt: '2026-10-04T12:05:00Z',
              payload: { offer: { ...offer, status: 'COUNTERED' } },
            }),
            // An offer shared with a text: the text stays.
            messageFixture({
              id: 'm-offer-caption',
              kind: 'OFFER_LINK',
              body: 'Here is my offer',
              createdAt: '2026-10-04T12:04:00Z',
              payload: { offer },
            }),
            // An offer shared alone, and one whose payload is gone.
            messageFixture({
              id: 'm-offer',
              kind: 'OFFER_LINK',
              body: '',
              createdAt: '2026-10-04T12:03:00Z',
              payload: { offer },
            }),
            messageFixture({
              id: 'm-offer-empty',
              kind: 'OFFER_LINK',
              body: '',
              createdAt: '2026-10-04T12:02:00Z',
              payload: {},
            }),
          ])
        ),
      })
    );
    render();
    expect(await screen.findByTestId('message-m-offer-offer')).toHaveTextContent(
      /Offer \(no longer available\)$/
    );
    expect(screen.getAllByText('Offer (no longer available)')).toHaveLength(5);
    for (const id of ['m-trade', 'm-offer-system', 'm-offer-caption', 'm-offer-empty']) {
      expect(screen.getByTestId(`message-${id}-offer`)).toBeOnTheScreen();
    }
    // The text sent with an offer stays; what the API wrote about the offer or trade goes.
    expect(screen.getByText('Here is my offer')).toBeOnTheScreen();
    expect(screen.queryByText(/countered the offer/)).toBeNull();
    expect(screen.queryByText(/Trade completed/)).toBeNull();
    expect(screen.queryByText('45.00 CAD for Lantern Fox')).toBeNull();
    expect(screen.queryByTestId('offer-link-card')).toBeNull();
    // Nothing to open: no offer or trade screen on the phone.
    fireEvent.press(screen.getByTestId('message-m-offer-offer'));
    expect(mockRouter.push).not.toHaveBeenCalled();
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
      render(rt);
      expect(await screen.findByText('Yes! How much with shipping?')).toBeOnTheScreen();
      await waitFor(() => expect(rt.client.state).toBe('connected'));
      const session = rt.current();

      act(() =>
        session.push('/user/queue/typing', { conversationId: CONVERSATION_ID, userId: OTHER_ID })
      );
      expect(await screen.findByTestId('typing-indicator')).toHaveTextContent(
        'collector2 is typing…'
      );
      expect(screen.getByTestId('conversation-status')).toHaveTextContent('typing…');

      act(() =>
        session.push('/user/queue/receipts', {
          conversationId: CONVERSATION_ID,
          userId: OTHER_ID,
          lastReadMessageId: 'mine',
          readAt: '2026-10-05T12:01:00Z',
        })
      );
      expect(await screen.findByTestId('receipt-seen')).toHaveTextContent(/Seen$/);

      act(() =>
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
      fireEvent.changeText(screen.getByLabelText('Message'), 'O');
      fireEvent.changeText(screen.getByLabelText('Message'), 'Ok');
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
    render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    fireEvent.press(screen.getByTestId('conversation-menu'));
    fireEvent.press(await screen.findByTestId('conversation-mute'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent('Chat muted.');
    expect(api.callsTo('PATCH /api/v1/conversations/{id}')[0]?.body).toEqual({ muted: true });
    expect(await screen.findByTestId('conversation-status')).toHaveTextContent(/Muted/);

    fireEvent.press(screen.getByTestId('conversation-menu'));
    fireEvent.press(await screen.findByTestId('conversation-archive'));
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
    render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    fireEvent.press(screen.getByTestId('conversation-menu'));
    fireEvent.press(await screen.findByTestId('conversation-rate'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/ratings/rate',
      params: { userId: OTHER_ID, handle: 'collector2', name: 'Noé Verdun' },
    });
    fireEvent.press(screen.getByTestId('conversation-menu'));
    fireEvent.press(await screen.findByTestId('conversation-report'));
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
    render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    fireEvent.press(screen.getByTestId('conversation-menu'));
    expect(await screen.findByTestId('conversation-report')).toBeOnTheScreen();
    expect(screen.queryByTestId('conversation-rate')).not.toBeOnTheScreen();
  });

  it('attaches a card, a binder or a photo, and no offer (ADR 0018)', async () => {
    const api = mockApi(routes());
    render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    fireEvent.press(screen.getByTestId('composer-attach'));
    const sheet = await screen.findByTestId('composer-attach-sheet');
    // A chat without a card: both saved details, then a photo, a card and a binder.
    expect(within(sheet).getByTestId('composer-send-address')).toHaveTextContent(
      /Send my address.*Saved on this phone only/
    );
    expect(within(sheet).getByTestId('composer-send-etransfer')).toHaveTextContent(
      /Send my e-Transfer email.*Saved on this phone only/
    );
    expect(within(sheet).getByTestId('composer-share-card')).toHaveTextContent(
      /Share a card from your inventory$/
    );
    expect(within(sheet).getByTestId('composer-share-binder')).toHaveTextContent(/Share a binder$/);
    expect(within(sheet).getByTestId('composer-attach-photo')).toHaveTextContent(/Send a photo$/);
    expect(within(sheet).getByTestId('composer-attach-cancel')).toHaveTextContent('Cancel');
    expect(screen.queryByTestId('composer-share-offer')).toBeNull();
    expect(screen.queryByText(/Share an offer/)).toBeNull();
    expect(screen.getByLabelText('Share in this chat')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/offers')).toHaveLength(0);
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
    render();
    await screen.findByText('Hi! Still have the Lantern Fox?');
    fireEvent.press(screen.getByTestId('conversation-menu'));
    fireEvent.press(await screen.findByTestId('conversation-block'));
    const dialog = await screen.findByTestId('block-dialog');
    expect(dialog).toHaveTextContent(/Block collector2\?/);
    fireEvent.press(within(dialog).getByTestId('block-dialog-cancel'));
    expect(api.callsTo('POST /api/v1/users/{id}/block')).toHaveLength(0);

    fireEvent.press(screen.getByTestId('conversation-menu'));
    fireEvent.press(await screen.findByTestId('conversation-block'));
    fireEvent.press(await screen.findByTestId('block-dialog-confirm'));
    expect(await screen.findByTestId('conversation-blocked-banner')).toHaveTextContent(
      /You blocked collector2/
    );
    expect(api.callsTo('POST /api/v1/users/{id}/block')[0]?.path).toBe(
      `/api/v1/users/${OTHER_ID}/block`
    );
    expect(screen.getByTestId('conversation-status')).toHaveTextContent('Blocked');
    expect(screen.getByLabelText('Message').props.editable).toBe(false);

    fireEvent.press(screen.getByTestId('conversation-banner-unblock'));
    await waitFor(() =>
      expect(screen.queryByTestId('conversation-blocked-banner')).not.toBeOnTheScreen()
    );
    expect(api.callsTo('DELETE /api/v1/users/{id}/block')).toHaveLength(1);
    // The snackbar of the block is replaced by the one of the unblock.
    await waitFor(() =>
      expect(screen.getByTestId('snackbar')).toHaveTextContent('collector2 is unblocked.')
    );
  });

  it('names its Back after the screen it returns to: Messages, or Notifications', async () => {
    mockApi(routes());
    const first = render();
    expect(await screen.findByTestId('conversation-profile')).toBeOnTheScreen();
    expect(screen.getByTestId('BackButton').props.accessibilityLabel).toBe('Back to messages');
    first.unmount();
    // Opened by a sale notification (stage R9, review fix 1, U1).
    mockParams.current = { id: CONVERSATION_ID, from: 'notifications' };
    render();
    expect(await screen.findByTestId('conversation-profile')).toBeOnTheScreen();
    expect(screen.getByTestId('BackButton').props.accessibilityLabel).toBe('Back to Notifications');
    fireEvent.press(screen.getByTestId('BackButton'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('shows "not available" for a conversation hidden by a block', async () => {
    mockApi(
      routes({
        'GET /api/v1/conversations/{id}/messages': problem(404, 'NOT_FOUND', 'Not found'),
      })
    );
    render();
    expect(await screen.findByTestId('conversation-not-found')).toHaveTextContent(
      /This conversation is not available/
    );
    fireEvent.press(screen.getByText('Back to messages'));
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
    render();
    expect(await screen.findByTestId('conversation-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Hi! Still have the Lantern Fox?')).toBeOnTheScreen();
  });
});

describe('Deals in the chat (stage R4: the pinned card, tips, quick replies, Mark as sold)', () => {
  /** The chat as the API answers it for this test. */
  function chatRoutes(
    subject: ReturnType<typeof subjectFixture> | null,
    extra: MockRoutes = {}
  ): MockRoutes {
    return routes({
      'GET /api/v1/conversations/{id}': ok(
        conversationFixture({ other: OTHER, ...(subject ? { subject } : {}) })
      ),
      ...extra,
    });
  }

  it('buying: the other collector’s card is pinned with its price and opens its page', async () => {
    const api = mockApi(
      chatRoutes(subjectFixture(), {
        'POST /api/v1/conversations/{id}/messages': ok(
          sentMessage({ body: 'Is it still available?' }),
          201
        ),
      })
    );
    render();
    const bar = await screen.findByTestId('pinned-bar');
    expect(within(bar).getByTestId('pinned-name')).toHaveTextContent('Emberfang Fox VMAX');
    expect(within(bar).getByTestId('pinned-line')).toHaveTextContent('SVX-001 · Ultra Rare');
    expect(within(bar).getByTestId('pinned-price')).toHaveTextContent('$32');
    expect(within(bar).queryByTestId('pinned-mark-sold')).toBeNull();
    // The buying tip at the start of the chat.
    expect(await screen.findByTestId('chat-safety-tip-text')).toHaveTextContent(
      'Check their rating before you send an e-Transfer, and ask for tracking.'
    );
    fireEvent.press(bar);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: CARD_ID, printing: PRINTING_A },
    });
    // The seller wrote already ("Hi! Still have…" is theirs): the replies after their answer.
    const replies = screen.getByTestId('quick-replies');
    expect(
      within(replies)
        .getAllByRole('button')
        .map((b) => b.props.accessibilityLabel)
    ).toEqual(['Send “e-Transfer sent!”', 'Send “Tracking number?”', 'Send “Thanks!”']);
    fireEvent.press(within(replies).getByTestId('quick-reply-Thanks!'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/conversations/{id}/messages')[0]?.body).toEqual({
        kind: 'TEXT',
        body: 'Thanks!',
      })
    );
  });

  it('gives the chips, "+", send and "Rate" touch targets of at least 44 pt (F11)', async () => {
    mockApi(
      chatRoutes(subjectFixture(), {
        'GET /api/v1/conversations/{id}/messages': ok(messagePage([saleMessageFixture()])),
      })
    );
    render();
    const target = (id: string) => {
      const node = screen.getByTestId(id);
      const style = StyleSheet.flatten(node.props.style) as {
        minHeight?: number;
        height?: number;
        width?: number;
      };
      const slop = (node.props.hitSlop ?? {}) as Record<string, number | undefined>;
      return {
        height: (style.height ?? style.minHeight ?? 0) + (slop.top ?? 0) + (slop.bottom ?? 0),
        width: style.width === undefined ? 44 : style.width + (slop.left ?? 0) + (slop.right ?? 0),
      };
    };
    const replies = await screen.findByTestId('quick-replies');
    const ids = within(replies)
      .getAllByRole('button')
      .map((chip) => chip.props.testID as string);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of [...ids, 'composer-attach', 'conversation-send', 'sale-message-rate']) {
      const size = target(id);
      expect({ id, ok: size.height >= 44 && size.width >= 44 }).toEqual({ id, ok: true });
    }
    // iOS drops a touch outside the sideways row's frame before it reaches a chip: the row leaves
    // room for the chips' slop above and under them, and takes it back with a negative margin so
    // it sits as before (review fix 2, R1-2: a 2 pt padding left the chips 38 pt to the finger).
    const row = StyleSheet.flatten(replies.props.contentContainerStyle) as {
      paddingVertical?: number;
      paddingTop?: number;
      paddingBottom?: number;
    };
    const frame = StyleSheet.flatten(replies.props.style) as {
      marginVertical?: number;
      marginTop?: number;
      marginBottom?: number;
    };
    const chip = target(ids[0]!);
    const chipSlop = screen.getByTestId(ids[0]!).props.hitSlop as { top: number; bottom: number };
    const padTop = row.paddingTop ?? row.paddingVertical ?? 0;
    const padBottom = row.paddingBottom ?? row.paddingVertical ?? 0;
    expect(padTop).toBeGreaterThanOrEqual(chipSlop.top);
    expect(padBottom).toBeGreaterThanOrEqual(chipSlop.bottom);
    expect(
      chip.height - chipSlop.top - chipSlop.bottom + padTop + padBottom
    ).toBeGreaterThanOrEqual(44);
    expect(padTop + (frame.marginTop ?? frame.marginVertical ?? 0)).toBe(2);
    expect(padBottom + (frame.marginBottom ?? frame.marginVertical ?? 0)).toBe(2);
  });

  it('buying, before the seller answered: the first replies; one sent is hidden', async () => {
    mockApi(
      chatRoutes(subjectFixture(), {
        'GET /api/v1/conversations/{id}/messages': ok(
          messagePage([sentMessage({ id: 'mine', body: 'Is it still available?' })])
        ),
      })
    );
    render();
    const replies = await screen.findByTestId('quick-replies');
    expect(within(replies).getAllByRole('button')).toHaveLength(1);
    expect(within(replies).getByTestId('quick-reply-How much with shipping?')).toBeOnTheScreen();
  });

  it('a card no longer on offer keeps its name and picture, without a price', async () => {
    mockApi(chatRoutes(subjectFixture({ listed: false, askingPriceText: null })));
    render();
    const bar = await screen.findByTestId('pinned-bar');
    expect(within(bar).getByTestId('pinned-unlisted')).toHaveTextContent('No longer listed');
    expect(within(bar).queryByTestId('pinned-price')).toBeNull();
    expect(within(bar).getByTestId('pinned-name')).toHaveTextContent('Emberfang Fox VMAX');
  });

  it('a deck core: "Deck core", its price, and the bar opens the deck core page', async () => {
    mockApi(chatRoutes(deckCoreSubjectFixture()));
    render();
    const bar = await screen.findByTestId('pinned-bar');
    expect(within(bar).getByTestId('pinned-line')).toHaveTextContent(/^Deck core$/);
    expect(within(bar).getByTestId('pinned-price')).toHaveTextContent('$95');
    fireEvent.press(bar);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: BINDER_ID },
    });
  });

  it('selling: "your card", Mark as sold with copies and tracking, then the toast with Undo', async () => {
    const api = mockApi(
      chatRoutes(subjectFixture({ ownerId: SELF_ID, copies: 3, askingPriceText: '85% TCG' }), {
        'GET /api/v1/conversations/{id}/messages': ok(messagePage([])),
        'POST /api/v1/conversations/{id}/sales': ok(
          {
            id: 'sale-1',
            conversationId: CONVERSATION_ID,
            kind: 'CARD',
            itemId: ITEM_ID,
            binderId: null,
            sellerId: SELF_ID,
            buyerId: OTHER_ID,
            name: 'Emberfang Fox VMAX',
            quantity: 2,
            trackingNumber: '7023 2109 8876 5432',
            remaining: 1,
            removed: false,
            createdAt: '2026-10-15T12:00:00Z',
            undoableUntil: '2026-10-15T12:10:00Z',
            undoneAt: null,
          },
          201
        ),
        'POST /api/v1/sales/{id}/undo': ok({}),
      })
    );
    render();
    const bar = await screen.findByTestId('pinned-bar');
    expect(within(bar).getByTestId('pinned-line')).toHaveTextContent(
      'SVX-001 · 85% TCG · your card'
    );
    expect(await screen.findByTestId('chat-safety-tip-text')).toHaveTextContent(
      'Ship after the e-Transfer arrives, and add the tracking number when you mark it sold.'
    );
    // Selling, before the seller wrote anything.
    expect(screen.getByTestId('quick-reply-Yes, still available')).toBeOnTheScreen();
    expect(screen.getByTestId('quick-reply-Send me your address')).toBeOnTheScreen();

    // Mark as sold takes the keyboard from the message box for good: iOS would bring it back
    // over the toast and its Undo when the sheet closes (review fix 1, F2).
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    fireEvent.press(within(bar).getByTestId('pinned-mark-sold'));
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
    const sheet = await screen.findByTestId('mark-sold-sheet');
    expect(within(sheet).getByTestId('mark-sold-sheet-title')).toHaveTextContent('Mark as sold?');
    expect(within(sheet).getByTestId('mark-sold-line')).toHaveTextContent('SVX-001 · 3 copies');
    expect(within(sheet).getByTestId('mark-sold-sentence')).toHaveTextContent(
      "Sold to collector2. You'll have 2 left. You can rate each other next."
    );
    expect(within(sheet).getByTestId('mark-sold-tracking').props.placeholder).toBe(
      'So collector2 can follow the package'
    );
    fireEvent(within(sheet).getByTestId('mark-sold-quantity'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(within(sheet).getByTestId('mark-sold-sentence')).toHaveTextContent(
      /You'll have 1 left\./
    );
    // A tracking number is letters and digits only.
    fireEvent.changeText(within(sheet).getByTestId('mark-sold-tracking'), 'see https://x.io');
    fireEvent.press(within(sheet).getByTestId('mark-sold-confirm'));
    expect(await within(sheet).findByText(/letters, digits, spaces/)).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/conversations/{id}/sales')).toHaveLength(0);
    fireEvent.changeText(within(sheet).getByTestId('mark-sold-tracking'), ' 7023 2109  8876 5432 ');
    fireEvent.press(within(sheet).getByTestId('mark-sold-confirm'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/conversations/{id}/sales')[0]?.body).toEqual({
        quantity: 2,
        trackingNumber: '7023 2109 8876 5432',
        // The card the sheet shows (review fix 1, F1).
        subjectItemId: ITEM_ID,
      })
    );
    const toast = await screen.findByTestId('snackbar');
    expect(toast).toHaveTextContent(/Marked as sold/);
    fireEvent.press(within(toast).getByTestId('mark-sold-undo'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/sales/{id}/undo')[0]?.path).toBe('/api/v1/sales/sale-1/undo')
    );
    await waitFor(() =>
      expect(screen.getByTestId('snackbar')).toHaveTextContent(
        'Sale undone. It is back in your inventory.'
      )
    );
  });

  it('the last copy: the card leaves the inventory; "nothing left" is explained', async () => {
    mockApi(
      chatRoutes(subjectFixture({ ownerId: SELF_ID, copies: 1 }), {
        'POST /api/v1/conversations/{id}/sales': problem(
          409,
          'NOTHING_LEFT_TO_SELL',
          'This card has no copy left to sell'
        ),
      })
    );
    render();
    fireEvent.press(await screen.findByTestId('pinned-mark-sold'));
    const sheet = await screen.findByTestId('mark-sold-sheet');
    expect(within(sheet).queryByTestId('mark-sold-quantity')).toBeNull();
    expect(within(sheet).getByTestId('mark-sold-line')).toHaveTextContent('SVX-001 · 1 copy');
    expect(within(sheet).getByTestId('mark-sold-sentence')).toHaveTextContent(
      'Sold to collector2. It was your last copy, so the card leaves your inventory. You can rate each other next.'
    );
    fireEvent.press(within(sheet).getByTestId('mark-sold-confirm'));
    expect(await within(sheet).findByTestId('mark-sold-error')).toHaveTextContent(
      'Nothing left to sell: this card is no longer in your inventory.'
    );
  });

  it('explains a refused undo and a refused sale in the chat’s words (F9)', async () => {
    const sale = (id: string) => ({
      id,
      conversationId: CONVERSATION_ID,
      kind: 'CARD' as const,
      itemId: ITEM_ID,
      binderId: null,
      sellerId: SELF_ID,
      buyerId: OTHER_ID,
      name: 'Emberfang Fox VMAX',
      quantity: 1,
      trackingNumber: null,
      remaining: 2,
      removed: false,
      createdAt: '2026-10-15T12:00:00Z',
      undoableUntil: '2026-10-15T12:10:00Z',
      undoneAt: null,
    });
    const api = mockApi(
      chatRoutes(subjectFixture({ ownerId: SELF_ID, copies: 3 }), {
        'POST /api/v1/conversations/{id}/sales': [
          ok(sale('sale-a'), 201),
          ok(sale('sale-b'), 201),
          problem(400, 'VALIDATION_FAILED', 'You have 2 copies of this card'),
          problem(403, 'MESSAGING_BLOCKED', 'This collector cannot take part in a sale now'),
        ],
        'POST /api/v1/sales/{id}/undo': [
          problem(409, 'SALE_UNDO_CLOSED', 'A sale can be undone for 10 minutes only', {
            undoableUntil: '2026-10-15T12:10:00Z',
          }),
          problem(409, 'SALE_ALREADY_RATED', 'This sale was already rated'),
        ],
      })
    );
    render();
    const sell = async () => {
      fireEvent.press(await screen.findByTestId('pinned-mark-sold'));
      const sheet = await screen.findByTestId('mark-sold-sheet');
      fireEvent.press(within(sheet).getByTestId('mark-sold-confirm'));
      return sheet;
    };
    const undoFromToast = async () => {
      fireEvent.press(await screen.findByTestId('mark-sold-undo'));
    };

    // Ten minutes passed on the server: the sale stays, and the toast says why.
    await sell();
    await undoFromToast();
    await waitFor(() =>
      expect(screen.getByTestId('snackbar')).toHaveTextContent('This sale can no longer be undone.')
    );
    expect(api.callsTo('POST /api/v1/sales/{id}/undo')[0]?.path).toBe('/api/v1/sales/sale-a/undo');

    // The buyer rated it already.
    await sell();
    await undoFromToast();
    await waitFor(() =>
      expect(screen.getByTestId('snackbar')).toHaveTextContent(
        'This sale was already rated, so it stays.'
      )
    );

    // A refused sale stays in the sheet: the server's own words for a validation error, the
    // app's friendly words otherwise.
    const sheet = await sell();
    expect(await within(sheet).findByTestId('mark-sold-error')).toHaveTextContent(
      'You have 2 copies of this card'
    );
    fireEvent.press(within(sheet).getByTestId('mark-sold-confirm'));
    await waitFor(() =>
      expect(within(sheet).getByTestId('mark-sold-error')).toHaveTextContent(
        'You cannot message this collector. They may have blocked messages or you blocked them.'
      )
    );
  });

  it('names the card it shows; a listing the buyer pinned meanwhile is refused and read again (F1)', async () => {
    const mine = subjectFixture({ ownerId: SELF_ID, copies: 3, askingPriceText: '85% TCG' });
    const core = deckCoreSubjectFixture({
      ownerId: SELF_ID,
      name: 'Lantern core',
      askingPriceText: '$150',
    });
    let current = mine;
    const api = mockApi(
      chatRoutes(null, {
        'GET /api/v1/conversations/{id}': () =>
          ok(conversationFixture({ other: OTHER, subject: current })),
        'POST /api/v1/conversations/{id}/sales': problem(
          409,
          'SUBJECT_CHANGED',
          'What this chat is about changed: check it before you mark it sold'
        ),
      })
    );
    render();
    const bar = await screen.findByTestId('pinned-bar');
    expect(within(bar).getByTestId('pinned-name')).toHaveTextContent('Emberfang Fox VMAX');
    fireEvent.press(within(bar).getByTestId('pinned-mark-sold'));
    const sheet = await screen.findByTestId('mark-sold-sheet');
    expect(within(sheet).getByTestId('mark-sold-line')).toHaveTextContent('SVX-001 · 3 copies');

    // The buyer opens the seller's deck core from its page while the sheet is open.
    current = core;
    const reads = api.callsTo('GET /api/v1/conversations/{id}').length;
    fireEvent.press(within(sheet).getByTestId('mark-sold-confirm'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/conversations/{id}/sales')[0]?.body).toEqual({
        quantity: 1,
        subjectItemId: ITEM_ID,
      })
    );
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      'collector2 opened another of your listings. Check the card above, then mark it sold.'
    );
    await waitFor(() => expect(screen.queryByTestId('mark-sold-sheet')).toBeNull());
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/conversations/{id}').length).toBeGreaterThan(reads)
    );
    await waitFor(() =>
      expect(screen.getByTestId('pinned-name')).toHaveTextContent('Lantern core')
    );

    // Opened again, the sheet shows the deck core and names it.
    fireEvent.press(screen.getByTestId('pinned-mark-sold'));
    const again = await screen.findByTestId('mark-sold-sheet');
    expect(within(again).getByTestId('mark-sold-line')).toHaveTextContent(/^Deck core$/);
    fireEvent.press(within(again).getByTestId('mark-sold-confirm'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/conversations/{id}/sales')[1]?.body).toEqual({
        quantity: 1,
        subjectBinderId: BINDER_ID,
      })
    );
  });

  it('the pinned bar follows a pin the other collector made without writing (F1)', async () => {
    jest.useFakeTimers();
    try {
      const rt = fakeRealtime();
      let current = subjectFixture({ ownerId: SELF_ID, copies: 3 });
      const api = mockApi(
        chatRoutes(null, {
          'GET /api/v1/conversations/{id}': () =>
            ok(conversationFixture({ other: OTHER, subject: current })),
        })
      );
      render(rt);
      expect(await screen.findByTestId('pinned-name')).toHaveTextContent('Emberfang Fox VMAX');
      await waitFor(() => expect(rt.client.state).toBe('connected'));
      // The re-read after connecting is over before the buyer pins anything.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(500);
      });
      const reads = api.callsTo('GET /api/v1/conversations/{id}').length;

      current = deckCoreSubjectFixture({ ownerId: SELF_ID, name: 'Lantern core' });
      act(() =>
        rt.current().push('/user/queue/conversations', { conversationId: CONVERSATION_ID })
      );
      await waitFor(() =>
        expect(screen.getByTestId('pinned-name')).toHaveTextContent('Lantern core')
      );
      expect(api.callsTo('GET /api/v1/conversations/{id}').length).toBe(reads + 1);
      // A message pushed afterwards keeps the conversation's own subject, never the inbox's
      // older copy.
      act(() =>
        rt.current().push(
          '/user/queue/messages',
          messageFixture({
            id: 'pushed-1',
            senderId: OTHER_ID,
            body: 'Is it still available?',
            createdAt: '2026-10-05T12:30:00Z',
          })
        )
      );
      expect(await screen.findByText('Is it still available?')).toBeOnTheScreen();
      expect(screen.getByTestId('pinned-name')).toHaveTextContent('Lantern core');
    } finally {
      jest.useRealTimers();
    }
  });

  it('an open Mark as sold sheet keeps the card it opened with when a pin re-reads the chat (R1-1)', async () => {
    jest.useFakeTimers();
    try {
      const rt = fakeRealtime();
      let current = subjectFixture({ ownerId: SELF_ID, copies: 3, askingPriceText: '85% TCG' });
      const api = mockApi(
        chatRoutes(null, {
          'GET /api/v1/conversations/{id}': () =>
            ok(conversationFixture({ other: OTHER, subject: current })),
          'POST /api/v1/conversations/{id}/sales': problem(
            409,
            'SUBJECT_CHANGED',
            'What this chat is about changed: check it before you mark it sold'
          ),
        })
      );
      render(rt);
      expect(await screen.findByTestId('pinned-name')).toHaveTextContent('Emberfang Fox VMAX');
      await waitFor(() => expect(rt.client.state).toBe('connected'));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(500);
      });
      fireEvent.press(screen.getByTestId('pinned-mark-sold'));
      const sheet = await screen.findByTestId('mark-sold-sheet');
      expect(within(sheet).getByTestId('mark-sold-line')).toHaveTextContent('SVX-001 · 3 copies');
      const reads = api.callsTo('GET /api/v1/conversations/{id}').length;

      // The buyer opens the seller's deck core while the sheet is open: the push re-reads the
      // chat and the bar under the sheet follows it.
      current = deckCoreSubjectFixture({ ownerId: SELF_ID, name: 'Lantern core' });
      act(() =>
        rt.current().push('/user/queue/conversations', { conversationId: CONVERSATION_ID })
      );
      await waitFor(() =>
        expect(screen.getByTestId('pinned-name')).toHaveTextContent('Lantern core')
      );
      expect(api.callsTo('GET /api/v1/conversations/{id}').length).toBe(reads + 1);

      // The sheet still shows the card the seller opened it for, and the sale names that card:
      // the server then refuses it, so nothing is sold that the seller did not see.
      expect(screen.getByTestId('mark-sold-line')).toHaveTextContent('SVX-001 · 3 copies');
      expect(screen.getByTestId('mark-sold-quantity')).toBeOnTheScreen();
      fireEvent.press(screen.getByTestId('mark-sold-confirm'));
      await waitFor(() =>
        expect(api.callsTo('POST /api/v1/conversations/{id}/sales')[0]?.body).toEqual({
          quantity: 1,
          subjectItemId: ITEM_ID,
        })
      );
      expect(await screen.findByTestId('snackbar')).toHaveTextContent(
        'collector2 opened another of your listings. Check the card above, then mark it sold.'
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('the sale message reads for each side, with the tracking number and Rate', async () => {
    // The first sale was undone: its message is dropped.
    const undone = saleMessageFixture(
      { saleId: 'sale-0', undone: true },
      { id: 'm-sale-undone', createdAt: '2026-10-04T12:09:00Z' }
    );
    mockApi(
      chatRoutes(subjectFixture({ sold: true }), {
        'GET /api/v1/conversations/{id}/messages': ok(messagePage([saleMessageFixture(), undone])),
      })
    );
    render();
    expect(await screen.findByTestId('pinned-sold')).toHaveTextContent('Sold');
    const sale = await screen.findByTestId('message-m-sale');
    expect(within(sale).getByTestId('sale-message-text')).toHaveTextContent(
      'collector2 marked Emberfang Fox VMAX as sold to you.'
    );
    expect(within(sale).getByTestId('sale-message-tracking')).toHaveTextContent(
      /Tracking.*7023 2109 8876 5432/
    );
    expect(screen.queryByTestId('message-m-sale-undone')).toBeNull();
    // The buyer the seller never wrote to has the replies after the sale too.
    expect(screen.getByTestId('quick-reply-e-Transfer sent!')).toBeOnTheScreen();
    expect(screen.queryByTestId('quick-reply-Is it still available?')).toBeNull();
    fireEvent.press(within(sale).getByTestId('sale-message-rate'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/ratings/rate',
      params: { userId: OTHER_ID, handle: 'collector2', name: 'Noé Verdun', kind: 'SALE' },
    });
  });

  it('the seller reads "You marked … as sold to {buyer}."', async () => {
    mockApi(
      chatRoutes(subjectFixture({ ownerId: SELF_ID, sold: true, copies: 1 }), {
        'GET /api/v1/conversations/{id}/messages': ok(
          messagePage([saleMessageFixture({ sellerId: SELF_ID, buyerId: OTHER_ID })])
        ),
      })
    );
    render();
    expect(await screen.findByTestId('sale-message-text')).toHaveTextContent(
      'You marked Emberfang Fox VMAX as sold to collector2.'
    );
    // After a sale the bar says "Sold", not "Mark as sold".
    expect(screen.getByTestId('pinned-sold')).toBeOnTheScreen();
    expect(screen.queryByTestId('pinned-mark-sold')).toBeNull();
    // A seller who never wrote has the replies after the sale (owner decision of 2026-10-28).
    expect(screen.getByTestId('quick-reply-Shipped!')).toBeOnTheScreen();
    expect(screen.getByTestId('quick-reply-Got your e-Transfer')).toBeOnTheScreen();
    expect(screen.queryByTestId('quick-reply-Yes, still available')).toBeNull();
  });

  it('"Send my address": asked once, saved on this phone only, then put into the message box', async () => {
    const secureStore = require('expo-secure-store') as { mockStore: Map<string, string> };
    const api = mockApi(
      chatRoutes(subjectFixture(), {
        'POST /api/v1/conversations/{id}/messages': ok(sentMessage({ body: 'Ship to:' }), 201),
      })
    );
    render();
    await screen.findByTestId('pinned-bar');
    fireEvent.press(screen.getByTestId('composer-attach'));
    const sheet = await screen.findByTestId('composer-attach-sheet');
    // Buying: the address first, no e-Transfer email.
    expect(within(sheet).getByTestId('composer-send-address')).toBeOnTheScreen();
    expect(within(sheet).queryByTestId('composer-send-etransfer')).toBeNull();
    fireEvent.press(within(sheet).getByTestId('composer-send-address'));
    const ask = await screen.findByTestId('saved-detail-sheet');
    expect(ask).toHaveTextContent(/Saved on this phone only, never on OrenjiTrade/);
    fireEvent.press(within(ask).getByTestId('saved-detail-save'));
    expect(await within(ask).findByText('Write it first.')).toBeOnTheScreen();
    fireEvent.changeText(
      within(ask).getByTestId('saved-detail-input'),
      'Sam Tremblay\n  123 Rue Exemple\nMontréal QC H0H 0H0\n'
    );
    fireEvent.press(within(ask).getByTestId('saved-detail-save'));
    await waitFor(() =>
      expect(screen.getByLabelText('Message').props.value).toBe(
        'Ship to:\nSam Tremblay\n123 Rue Exemple\nMontréal QC H0H 0H0'
      )
    );
    // Saved in the phone's secure storage, under this account, and sent nowhere yet.
    expect([...secureStore.mockStore.values()]).toEqual([
      'Sam Tremblay\n123 Rue Exemple\nMontréal QC H0H 0H0',
    ]);
    expect(api.callsTo('POST /api/v1/conversations/{id}/messages')).toHaveLength(0);
    for (const call of api.calls) {
      expect(JSON.stringify(call.body ?? null)).not.toContain('Rue Exemple');
      expect(call.path).not.toContain('Exemple');
    }

    // The second time it goes straight into the message box.
    fireEvent.changeText(screen.getByLabelText('Message'), '');
    fireEvent.press(screen.getByTestId('composer-attach'));
    fireEvent.press(await screen.findByTestId('composer-send-address'));
    await waitFor(() =>
      expect(screen.getByLabelText('Message').props.value).toBe(
        'Ship to:\nSam Tremblay\n123 Rue Exemple\nMontréal QC H0H 0H0'
      )
    );
    expect(screen.queryByTestId('saved-detail-sheet')).toBeNull();
    // Only the message the collector sends carries it.
    fireEvent.press(screen.getByTestId('conversation-send'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/conversations/{id}/messages')[0]?.body).toEqual({
        kind: 'TEXT',
        body: 'Ship to:\nSam Tremblay\n123 Rue Exemple\nMontréal QC H0H 0H0',
      })
    );
  });

  it('keeps every sheet’s last button in reach at the largest text size', async () => {
    const window = Dimensions.get('window');
    act(() => {
      Dimensions.set({
        window: { ...window, fontScale: 3.1 },
        screen: { ...window, fontScale: 3.1 },
      });
    });
    try {
      mockApi(chatRoutes(subjectFixture({ ownerId: SELF_ID, copies: 1 })));
      render();
      await screen.findByTestId('pinned-bar');
      // The message box grows up to twice its size, so the thread keeps room above it.
      expect(screen.getByLabelText('Message')).toHaveProp(
        'maxFontSizeMultiplier',
        TITLE_MAX_FONT_SCALE
      );
      // "+": the rows scroll; Cancel stays under them (it went off the screen).
      fireEvent.press(screen.getByTestId('composer-attach'));
      const sheet = await screen.findByTestId('composer-attach-sheet');
      const rows = within(sheet).getByTestId('composer-attach-rows');
      expect(within(rows).getByTestId('composer-send-etransfer')).toBeOnTheScreen();
      expect(within(rows).queryByTestId('composer-attach-cancel')).toBeNull();
      expect(within(sheet).getByText('Cancel')).toHaveProp(
        'maxFontSizeMultiplier',
        PINNED_MAX_FONT_SCALE
      );
      // The saved detail: the hint and the field scroll, Save and Cancel stay.
      fireEvent.press(within(rows).getByTestId('composer-send-etransfer'));
      const ask = await screen.findByTestId('saved-detail-sheet');
      // The field comes first, its hint under it (at the top, the hint pushed the field out of view).
      const fields = within(ask).UNSAFE_getByType(ScrollView);
      const order = within(fields)
        .getAllByTestId(/^saved-detail-(input|hint)$/)
        .map((node) => node.props.testID);
      expect(order).toEqual(['saved-detail-input', 'saved-detail-hint']);
      expect(within(ask).getByText('Save and use')).toHaveProp(
        'maxFontSizeMultiplier',
        PINNED_MAX_FONT_SCALE
      );
      fireEvent.press(within(ask).getByTestId('saved-detail-cancel'));
      await waitFor(() => expect(screen.queryByTestId('saved-detail-sheet')).toBeNull());
      // Mark as sold: the card row follows the size as far as the pinned bar does.
      fireEvent.press(screen.getByTestId('pinned-mark-sold'));
      const soldSheet = await screen.findByTestId('mark-sold-sheet');
      expect(within(soldSheet).getByTestId('mark-sold-line')).toHaveProp(
        'maxFontSizeMultiplier',
        PINNED_MAX_FONT_SCALE
      );
      fireEvent.press(within(soldSheet).getByTestId('mark-sold-cancel'));
      await waitFor(() => expect(screen.queryByTestId('mark-sold-sheet')).toBeNull());
      // "⋯": the actions scroll, so Block stays in reach.
      fireEvent.press(screen.getByTestId('conversation-menu'));
      const menu = await screen.findByTestId('conversation-menu-sheet');
      expect(within(menu).getByTestId('conversation-block')).toBeOnTheScreen();
      expect(within(menu).UNSAFE_getByType(ScrollView)).toBeTruthy();
    } finally {
      act(() => {
        Dimensions.set({ window, screen: window });
      });
    }
  });

  it('Mark as sold with several copies: one "Copies sold", capped at the largest size (F8)', async () => {
    const window = Dimensions.get('window');
    act(() => {
      Dimensions.set({
        window: { ...window, fontScale: 3.1 },
        screen: { ...window, fontScale: 3.1 },
      });
    });
    try {
      mockApi(chatRoutes(subjectFixture({ ownerId: SELF_ID, copies: 3 })));
      render();
      fireEvent.press(await screen.findByTestId('pinned-mark-sold'));
      const sheet = await screen.findByTestId('mark-sold-sheet');
      // The row's label only: the stepper keeps "Copies sold" as its spoken name.
      expect(within(sheet).getAllByText('Copies sold')).toHaveLength(1);
      expect(within(sheet).getByTestId('mark-sold-quantity-label')).toHaveProp(
        'maxFontSizeMultiplier',
        PINNED_MAX_FONT_SCALE
      );
      const stepper = within(sheet).getByTestId('mark-sold-quantity');
      expect(stepper.props.accessibilityLabel).toBe('Copies sold');
      expect(within(sheet).getByTestId('mark-sold-quantity-value')).toHaveProp(
        'maxFontSizeMultiplier',
        PINNED_MAX_FONT_SCALE
      );
      // The tracking number's label follows as far, which keeps its field in view.
      expect(within(sheet).getByTestId('mark-sold-tracking-label')).toHaveProp(
        'maxFontSizeMultiplier',
        PINNED_MAX_FONT_SCALE
      );
      fireEvent.press(within(sheet).getByTestId('mark-sold-quantity-increase'));
      expect(within(sheet).getByTestId('mark-sold-quantity-value')).toHaveTextContent('2');
    } finally {
      act(() => {
        Dimensions.set({ window, screen: window });
      });
    }
  });

  it('selling: "Send my e-Transfer email" only', async () => {
    mockApi(chatRoutes(subjectFixture({ ownerId: SELF_ID, copies: 1 })));
    render();
    await screen.findByTestId('pinned-bar');
    fireEvent.press(screen.getByTestId('composer-attach'));
    const sheet = await screen.findByTestId('composer-attach-sheet');
    expect(within(sheet).getByTestId('composer-send-etransfer')).toBeOnTheScreen();
    expect(within(sheet).queryByTestId('composer-send-address')).toBeNull();
    fireEvent.press(within(sheet).getByTestId('composer-send-etransfer'));
    const ask = await screen.findByTestId('saved-detail-sheet');
    fireEvent.changeText(within(ask).getByTestId('saved-detail-input'), ' sam@example.com ');
    fireEvent.press(within(ask).getByTestId('saved-detail-save'));
    await waitFor(() =>
      expect(screen.getByLabelText('Message').props.value).toBe('e-Transfer to sam@example.com')
    );
  });
});
