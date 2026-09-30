import {
  ConversationParticipantOnlineStatusEnum as Online,
  ConversationSummary,
  LastMessageKindEnum,
  MessageResponse,
  MessageResponseKindEnum as Kind,
  MessageResponseModerationStateEnum,
} from '@orenji/api-client';
import {
  PREVIEW_MAX,
  activityOf,
  listPreview,
  messagePreview,
  sortByActivity,
  toLastMessage,
} from './message-text';

function conversation(
  id: string,
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    id,
    other: { id: `u-${id}`, handle: id, displayName: id, onlineStatus: Online.Hidden },
    unreadCount: 0,
    muted: false,
    archived: false,
    createdAt: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

describe('message text helpers', () => {
  it('words previews like the server (card, binder, photo, offer, text)', () => {
    expect(
      messagePreview({
        kind: Kind.CardLink,
        body: 'for trade?',
        payload: { card: { id: 'p', cardId: 'c', name: 'Azure Dragon' } },
      }),
    ).toBe('Card: Azure Dragon');
    expect(
      messagePreview({
        kind: Kind.BinderLink,
        body: '',
        payload: { binder: { id: 'b', name: 'Trade binder', ownerHandle: 'maika' } },
      }),
    ).toBe('Binder: Trade binder');
    expect(messagePreview({ kind: Kind.Image, body: '', payload: {} })).toBe('Photo');
    expect(messagePreview({ kind: Kind.Image, body: '  the  page ', payload: {} })).toBe(
      'Photo: the page',
    );
    expect(messagePreview({ kind: Kind.OfferLink, body: 'x', payload: {} })).toBe('Offer');
    expect(messagePreview({ kind: Kind.Text, body: 'Hello\n\nthere', payload: {} })).toBe(
      'Hello there',
    );
  });

  it('truncates long previews with an ellipsis on a code point boundary', () => {
    const preview = messagePreview({ kind: Kind.Text, body: '🃏'.repeat(200), payload: {} });
    expect([...preview]).toHaveLength(PREVIEW_MAX);
    expect(preview.endsWith('…')).toBe(true);
  });

  it('turns a realtime message into the conversation last message', () => {
    const message: MessageResponse = {
      id: 'm1',
      conversationId: 'c1',
      senderId: 'me',
      kind: Kind.Text,
      body: 'Hi',
      payload: {},
      createdAt: '2026-09-02T10:00:00Z',
      readByOther: false,
      moderationState: MessageResponseModerationStateEnum.Ok,
    };
    expect(toLastMessage(message)).toEqual({
      id: 'm1',
      preview: 'Hi',
      kind: LastMessageKindEnum.Text,
      createdAt: '2026-09-02T10:00:00Z',
      senderId: 'me',
    });
  });

  it('sorts by the latest activity and prefixes own messages', () => {
    const old = conversation('old');
    const recent = conversation('recent', {
      lastMessage: {
        id: 'm',
        preview: 'Deal',
        kind: LastMessageKindEnum.Text,
        createdAt: '2026-09-03T10:00:00Z',
        senderId: 'me',
      },
    });
    expect(activityOf(old)).toBe(Date.parse('2026-09-01T10:00:00Z'));
    expect(sortByActivity([old, recent]).map((c) => c.id)).toEqual(['recent', 'old']);
    expect(listPreview(recent, 'me')).toBe('You: Deal');
    expect(listPreview(recent, 'someone-else')).toBe('Deal');
    expect(listPreview(old, 'me')).toBe('No messages yet. Say hello!');
  });
});
