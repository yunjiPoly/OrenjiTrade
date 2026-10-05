import type { InfiniteData } from '@tanstack/react-query';

import { ApiError } from '@/src/api/ApiError';
import type { ConversationPage, MessagePage, MessageResponse } from '@/src/api/types';
import {
  applyMessageToInbox,
  applyOwnReceipt,
  applyPresence,
  applyReceiptToThread,
  findConversation,
  inboxConversations,
  patchConversation,
  removeConversation,
  threadMessages,
  upsertConversation,
  upsertThreadMessage,
} from '@/src/features/messages/conversationCache';
import { matchingBinders, printingForSuggestion } from '@/src/features/messages/LinkPickers';
import {
  IMAGE_MAX_BYTES,
  draftProblem,
  fileSizeLabel,
  imageProblem,
  photoType,
  sendErrorMessage,
  sendRequest,
} from '@/src/features/messages/messageDraft';
import {
  MESSAGE_MAX_LENGTH,
  PREVIEW_MAX,
  badgeCount,
  listPreview,
  messagePreview,
  sortByActivity,
  toLastMessage,
  totalUnread,
} from '@/src/features/messages/messageText';
import { threadStatus } from '@/src/features/messages/ThreadHeader';
import { rowLabel } from '@/src/features/messages/InboxView';
import { realtimeStatusLabel } from '@/src/features/messages/RealtimeStatus';
import {
  applyReadReceipt,
  buildThreadItems,
  dayLabel,
  mergeMessages,
  type MessageItem,
} from '@/src/features/messages/threadItems';

import { SELF_ID, binderFixture, conversationFixture, messageFixture } from '../support/fixtures';

const OTHER = '00000000-0000-4000-8000-0000000000b1';

function message(id: string, senderId: string | null, createdAt: string, overrides = {}) {
  return messageFixture({ id, senderId, createdAt, body: id, ...overrides });
}

function inbox(...pages: ConversationPage['items'][]): InfiniteData<ConversationPage> {
  return {
    pages: pages.map((items) => ({ items, nextCursor: null, hasMore: false })),
    pageParams: pages.map(() => null),
  };
}

function thread(...pages: MessageResponse[][]): InfiniteData<MessagePage> {
  return {
    pages: pages.map((items) => ({ items, nextCursor: null, hasMore: false })),
    pageParams: pages.map(() => null),
  };
}

describe('message text', () => {
  it('previews each kind like the server, truncated', () => {
    expect(messagePreview({ kind: 'TEXT', body: ' Hi\n  there ', payload: {} })).toBe('Hi there');
    expect(
      messagePreview({
        kind: 'CARD_LINK',
        body: '',
        payload: { card: { id: 'p', cardId: 'c', name: 'Lantern Fox' } },
      })
    ).toBe('Card: Lantern Fox');
    expect(
      messagePreview({
        kind: 'BINDER_LINK',
        body: '',
        payload: { binder: { id: 'b', name: 'Trades', ownerHandle: 'x' } },
      })
    ).toBe('Binder: Trades');
    expect(messagePreview({ kind: 'IMAGE', body: '', payload: {} })).toBe('Photo');
    expect(messagePreview({ kind: 'IMAGE', body: 'Front', payload: {} })).toBe('Photo: Front');
    expect(messagePreview({ kind: 'OFFER_LINK', body: 'x', payload: {} })).toBe('Offer');
    const long = messagePreview({ kind: 'TEXT', body: 'é'.repeat(300), payload: {} });
    expect([...long]).toHaveLength(PREVIEW_MAX);
    expect(long.endsWith('…')).toBe(true);
  });

  it('builds inbox lines, badges and the unread total (muted conversations excluded)', () => {
    const own = conversationFixture({
      lastMessage: { id: 'm', preview: 'Hello', kind: 'TEXT', createdAt: 'x', senderId: SELF_ID },
    });
    expect(listPreview(own, SELF_ID)).toBe('You: Hello');
    expect(listPreview(conversationFixture(), SELF_ID)).toBe('No messages yet. Say hello!');
    expect(badgeCount(3)).toBe('3');
    expect(badgeCount(120)).toBe('99+');
    expect(
      totalUnread([
        conversationFixture({ unreadCount: 2 }),
        conversationFixture({ id: 'b', unreadCount: 5, muted: true }),
        conversationFixture({ id: 'c', unreadCount: 1 }),
      ])
    ).toBe(3);
    const older = conversationFixture({ id: 'old', createdAt: '2026-09-01T00:00:00Z' });
    const newer = conversationFixture({ id: 'new', createdAt: '2026-10-01T00:00:00Z' });
    expect(sortByActivity([older, newer]).map((item) => item.id)).toEqual(['new', 'old']);
    expect(toLastMessage(message('m1', OTHER, '2026-10-05T10:00:00Z'))).toEqual({
      id: 'm1',
      preview: 'm1',
      kind: 'TEXT',
      createdAt: '2026-10-05T10:00:00Z',
      senderId: OTHER,
    });
  });

  it('names inbox rows for screen readers and labels the header status', () => {
    const conversation = conversationFixture({
      unreadCount: 2,
      muted: true,
      other: { ...conversationFixture().other, onlineStatus: 'ONLINE' },
    });
    expect(rowLabel(conversation, SELF_ID)).toBe(
      'Noé Verdun, online, 2 unread messages, muted, No messages yet. Say hello!'
    );
    expect(threadStatus(conversation, false, false)).toBe('Online now');
    expect(threadStatus(conversation, true, false)).toBe('typing…');
    expect(threadStatus(conversation, true, true)).toBe('Blocked');
    expect(threadStatus(conversationFixture(), false, false)).toBe('@collector2');
    expect(realtimeStatusLabel('connected')).toBe('Live');
    expect(realtimeStatusLabel('reconnecting')).toBe('Reconnecting…');
    expect(realtimeStatusLabel('disabled')).toBeNull();
  });
});

describe('thread items', () => {
  it('labels days relative to today', () => {
    const now = new Date(2026, 9, 5, 15, 0);
    expect(dayLabel(new Date(2026, 9, 5, 8, 0), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 9, 4, 23, 59), now)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 9, 2, 12, 0), now)).toBe('Friday, October 2');
    expect(dayLabel(new Date(2025, 11, 24, 12, 0), now)).toBe('December 24, 2025');
  });

  it('merges pages and realtime echoes without duplicates, oldest first, keeping receipts', () => {
    const a = message('a', SELF_ID, '2026-10-05T10:00:00Z');
    const b = message('b', OTHER, '2026-10-05T10:01:00Z');
    const seen = { ...a, readByOther: true };
    expect(mergeMessages([seen], [b, a]).map((item) => [item.id, item.readByOther])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  it('applies receipts up to a message or a time', () => {
    const a = message('a', SELF_ID, '2026-10-05T10:00:00Z');
    const b = message('b', SELF_ID, '2026-10-05T10:05:00Z');
    expect(applyReadReceipt([a, b], SELF_ID, 'a', null).map((m) => m.readByOther)).toEqual([
      true,
      false,
    ]);
    expect(
      applyReadReceipt([a, b], SELF_ID, 'unknown', '2026-10-05T10:06:00Z').map((m) => m.readByOther)
    ).toEqual([true, true]);
    expect(applyReadReceipt([a], SELF_ID, 'unknown', null)).toEqual([a]);
  });

  it('builds day separators, sender groups and the status of the newest own message', () => {
    const now = new Date('2026-10-05T18:00:00');
    const items = buildThreadItems(
      [
        message('a', OTHER, '2026-10-04T10:00:00'),
        message('b', SELF_ID, '2026-10-05T10:00:00'),
        message('c', SELF_ID, '2026-10-05T10:02:00', { readByOther: true }),
        message('d', null, '2026-10-05T10:03:00', { kind: 'SYSTEM' }),
      ],
      SELF_ID,
      now
    );
    expect(items.map((item) => (item.kind === 'day' ? item.label : item.key))).toEqual([
      'Yesterday',
      'a',
      'Today',
      'b',
      'c',
      'd',
    ]);
    const [b, c] = items.filter((item): item is MessageItem => item.kind === 'message').slice(1);
    expect(b?.firstOfGroup).toBe(true);
    expect(b?.lastOfGroup).toBe(false);
    expect(c?.lastOfGroup).toBe(true);
    expect(b?.status).toBeNull();
    expect(c?.status).toBe('seen');
  });
});

describe('message drafts', () => {
  it('accepts JPEG, PNG and WebP photos up to 8 MB', () => {
    expect(imageProblem({ mimeType: 'image/png', size: 1024 })).toBeNull();
    expect(imageProblem({ mimeType: 'image/webp', size: IMAGE_MAX_BYTES })).toBeNull();
    expect(imageProblem({ mimeType: 'image/jpeg', size: null })).toBeNull();
    expect(imageProblem({ mimeType: 'image/gif', size: 1 })).toBe('Use a JPEG, PNG or WebP photo.');
    expect(imageProblem({ mimeType: 'image/jpeg', size: IMAGE_MAX_BYTES + 1 })).toBe(
      'Choose a photo up to 8 MB.'
    );
    expect(imageProblem({ mimeType: 'image/jpeg', size: 0 })).toBe('This file is empty.');
    expect(photoType(null, 'IMG_1.PNG')).toBe('image/png');
    expect(photoType(undefined, null)).toBe('image/jpeg');
    expect(photoType('IMAGE/WEBP', 'x')).toBe('image/webp');
    expect(fileSizeLabel(120_000)).toBe('117 KB');
    expect(fileSizeLabel(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(fileSizeLabel(null)).toBe('');
  });

  it('needs text or an attachment, within the length limit', () => {
    expect(draftProblem({ text: '  ', attachment: null })).toBe(
      'Write a message or attach something.'
    );
    expect(draftProblem({ text: 'x'.repeat(MESSAGE_MAX_LENGTH + 1), attachment: null })).toContain(
      `${MESSAGE_MAX_LENGTH} characters`
    );
    expect(
      draftProblem({
        text: '',
        attachment: { kind: 'binder', binder: { binderId: 'b', name: 'B', itemCount: 1 } },
      })
    ).toBeNull();
  });

  it('builds the request of each kind', () => {
    expect(sendRequest({ text: '  Hello ', attachment: null })).toEqual({
      kind: 'TEXT',
      body: 'Hello',
    });
    expect(
      sendRequest({
        text: '',
        attachment: {
          kind: 'card',
          card: {
            printingId: 'p1',
            cardId: 'c1',
            name: 'Fox',
            printingCode: null,
            imageUrl: null,
            game: null,
          },
        },
      })
    ).toEqual({ kind: 'CARD_LINK', body: undefined, cardPrintingId: 'p1' });
    expect(
      sendRequest(
        {
          text: 'Front',
          attachment: {
            kind: 'image',
            photo: {
              uri: 'file:///a.jpg',
              mimeType: 'image/jpeg',
              fileName: 'a.jpg',
              size: 1,
              width: 1,
              height: 1,
            },
          },
        },
        'upload-1'
      )
    ).toEqual({ kind: 'IMAGE', body: 'Front', imageUploadId: 'upload-1' });
  });

  it('words refused sends', () => {
    const error = (status: number, errorCode: string, problem = {}) =>
      new ApiError({ status, errorCode, message: 'x', problem });
    expect(sendErrorMessage(error(413, 'PAYLOAD_TOO_LARGE'))).toMatch(/larger than 8 MB/);
    expect(sendErrorMessage(error(415, 'UNSUPPORTED_MEDIA_TYPE'))).toMatch(/JPEG, PNG or WebP/);
    expect(sendErrorMessage(error(429, 'RATE_LIMITED', { retryAfterSeconds: 9 }))).toBe(
      'You are sending messages too quickly. Try again in 9 seconds.'
    );
    expect(sendErrorMessage(error(429, 'RATE_LIMITED'))).toMatch(/Wait a moment/);
    expect(sendErrorMessage(error(403, 'MESSAGING_BLOCKED'))).toMatch(/cannot message/);
    expect(sendErrorMessage(error(422, 'MESSAGE_BLOCKED'))).toMatch(/community guidelines/);
  });
});

describe('conversation cache', () => {
  const a = conversationFixture({ id: 'a', createdAt: '2026-10-01T00:00:00Z' });
  const b = conversationFixture({
    id: 'b',
    createdAt: '2026-10-02T00:00:00Z',
    other: { ...conversationFixture().other, id: 'u-b' },
  });

  it('moves a conversation with a new message to the top, counting unread when off screen', () => {
    const data = inbox([b], [a]);
    const pushed = messageFixture({
      id: 'new',
      conversationId: 'a',
      createdAt: '2026-10-05T00:00:00Z',
    });
    const off = applyMessageToInbox(data, pushed, SELF_ID, false);
    expect(off.found).toBe(true);
    expect(inboxConversations(off.data).map((item) => [item.id, item.unreadCount])).toEqual([
      ['a', 1],
      ['b', 0],
    ]);
    expect(off.data?.pages[0]?.items?.[0]?.lastMessage?.id).toBe('new');
    // The same push again changes nothing.
    expect(applyMessageToInbox(off.data, pushed, SELF_ID, false).data).toBe(off.data);
    // On screen, or sent by the caller: no unread.
    expect(
      findConversation(applyMessageToInbox(data, pushed, SELF_ID, true).data, 'a')?.unreadCount
    ).toBe(0);
    expect(
      findConversation(
        applyMessageToInbox(data, { ...pushed, senderId: SELF_ID }, SELF_ID, false).data,
        'a'
      )?.unreadCount
    ).toBe(0);
    // Unknown conversation: the caller re-reads.
    expect(
      applyMessageToInbox(data, { ...pushed, conversationId: 'z' }, SELF_ID, false).found
    ).toBe(false);
  });

  it('patches, removes, restores and applies receipts and presence', () => {
    const data = inbox([a, b]);
    expect(findConversation(patchConversation(data, 'a', { muted: true }), 'a')?.muted).toBe(true);
    expect(inboxConversations(removeConversation(data, 'a')).map((item) => item.id)).toEqual(['b']);
    expect(inboxConversations(upsertConversation(inbox([b]), a)).map((item) => item.id)).toEqual([
      'b',
      'a',
    ]);
    expect(
      findConversation(
        applyOwnReceipt(inbox([{ ...a, unreadCount: 4 }]), { conversationId: 'a' }),
        'a'
      )?.unreadCount
    ).toBe(0);
    expect(
      findConversation(applyPresence(data, { userId: 'u-b', status: 'ONLINE' }), 'b')?.other
        .onlineStatus
    ).toBe('ONLINE');
    expect(patchConversation(undefined, 'a', {})).toBeUndefined();
  });

  it('puts messages into the newest page and marks own messages seen', () => {
    const mine = message('mine', SELF_ID, '2026-10-05T10:00:00Z');
    const data = thread([mine]);
    const pushed = message('p', OTHER, '2026-10-05T10:01:00Z');
    const updated = upsertThreadMessage(data, pushed);
    expect(updated?.pages[0]?.items?.map((item) => item.id)).toEqual(['p', 'mine']);
    expect(threadMessages(updated).map((item) => item.id)).toEqual(['mine', 'p']);
    const seen = applyReceiptToThread(updated, SELF_ID, {
      lastReadMessageId: 'mine',
      readAt: '2026-10-05T10:02:00Z',
    });
    expect(threadMessages(seen).find((item) => item.id === 'mine')?.readByOther).toBe(true);
    // The REST answer of a pushed message replaces it in place, keeping the receipt.
    const echo = upsertThreadMessage(seen, { ...mine, readByOther: false });
    expect(threadMessages(echo).find((item) => item.id === 'mine')?.readByOther).toBe(true);
  });
});

describe('link pickers', () => {
  it('resolves the printing a suggestion stands for', () => {
    const card = {
      printings: [
        { id: 'p1', printingCode: 'AZR-EN001' },
        { id: 'p2', printingCode: 'AZR-FR001' },
      ],
    };
    expect(
      printingForSuggestion({ kind: 'PRINTING', id: 'c', printingId: 'p9', name: 'x' }, null)
    ).toBe('p9');
    expect(
      printingForSuggestion({ kind: 'CARD', id: 'c', printingCode: 'AZR-FR001', name: 'x' }, card)
    ).toBe('p2');
    expect(printingForSuggestion({ kind: 'CARD', id: 'c', name: 'x' }, card)).toBe('p1');
    expect(printingForSuggestion({ kind: 'CARD', id: 'c', name: 'x' }, null)).toBeNull();
  });

  it('offers only public binders, accent-insensitive', () => {
    const binders = [
      binderFixture({ id: '1', name: 'Échanges', effectivePublic: true }),
      binderFixture({ id: '2', name: 'Private', effectivePublic: false }),
    ];
    expect(matchingBinders(binders, '').map((binder) => binder.id)).toEqual(['1']);
    expect(matchingBinders(binders, 'echan').map((binder) => binder.id)).toEqual(['1']);
    expect(matchingBinders(binders, 'priv')).toEqual([]);
  });
});
