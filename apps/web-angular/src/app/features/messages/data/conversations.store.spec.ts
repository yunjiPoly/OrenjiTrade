import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ConversationParticipantOnlineStatusEnum as Online,
  ConversationSummary,
  LastMessageKindEnum,
  MessageResponse,
  MessageResponseKindEnum as Kind,
  MessageResponseModerationStateEnum as Moderation,
  MessagingService,
} from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { PresenceNotice, ReadReceiptNotice } from '../../../core/realtime/realtime-events';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { ConversationsStore } from './conversations.store';

function conversation(
  id: string,
  at: string,
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    id,
    other: {
      id: `user-${id}`,
      handle: id,
      displayName: `Collector ${id}`,
      onlineStatus: Online.Hidden,
    },
    lastMessage: { id: `last-${id}`, preview: 'Hi', kind: LastMessageKindEnum.Text, createdAt: at },
    unreadCount: 0,
    muted: false,
    archived: false,
    createdAt: at,
    ...overrides,
  };
}

function message(
  id: string,
  conversationId: string,
  senderId: string,
  at: string,
): MessageResponse {
  return {
    id,
    conversationId,
    senderId,
    kind: Kind.Text,
    body: `Message ${id}`,
    payload: {},
    createdAt: at,
    readByOther: false,
    moderationState: Moderation.Ok,
  };
}

describe('ConversationsStore', () => {
  let store: ConversationsStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let realtime: {
    messages$: Subject<MessageResponse>;
    receipts$: Subject<ReadReceiptNotice>;
    presence$: Subject<PresenceNotice>;
    resync$: Subject<void>;
  };
  let pages: ConversationSummary[][];

  beforeEach(() => {
    pages = [
      [
        conversation('a', '2026-09-30T10:00:00Z', { unreadCount: 2 }),
        conversation('b', '2026-09-30T11:00:00Z'),
      ],
    ];
    api = {
      listConversations: vi.fn(() => of({ items: pages.shift() ?? [], hasMore: false })),
      updateConversation: vi.fn(({ id, updateConversationRequest }) =>
        of({
          ...conversation(id, '2026-09-30T10:00:00Z', { unreadCount: 2 }),
          ...updateConversationRequest,
        }),
      ),
    };
    realtime = {
      messages$: new Subject(),
      receipts$: new Subject(),
      presence$: new Subject(),
      resync$: new Subject(),
    };
    TestBed.configureTestingModule({
      providers: [
        ConversationsStore,
        { provide: MessagingService, useValue: api },
        { provide: RealtimeService, useValue: realtime },
        { provide: SessionService, useValue: { me: signal({ id: 'me' }) } },
      ],
    });
    store = TestBed.inject(ConversationsStore);
    store.init();
  });

  it('loads the inbox sorted by activity with the unread total', () => {
    expect(store.status()).toBe('ready');
    expect(store.conversations().map((c) => c.id)).toEqual(['b', 'a']);
    expect(store.totalUnread()).toBe(2);
  });

  it('shows an error state and retries', () => {
    api['listConversations'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    store.load();
    expect(store.status()).toBe('error');
    expect(store.error()?.status).toBe(500);
    pages.push([conversation('c', '2026-09-30T12:00:00Z')]);
    store.load();
    expect(store.conversations().map((c) => c.id)).toEqual(['c']);
  });

  it('moves a conversation to the top on a new message and counts it unread unless open', () => {
    realtime.messages$.next(message('m1', 'a', 'user-a', '2026-09-30T12:00:00Z'));
    expect(store.conversations()[0]).toMatchObject({ id: 'a', unreadCount: 3 });
    expect(store.conversations()[0].lastMessage?.preview).toBe('Message m1');

    store.open('a');
    expect(store.conversations()[0].unreadCount).toBe(0);
    realtime.messages$.next(message('m2', 'a', 'user-a', '2026-09-30T12:01:00Z'));
    expect(store.conversations()[0].unreadCount).toBe(0);
    // The same push twice (REST answer + echo) is applied once.
    store.setVisible(false);
    realtime.messages$.next(message('m3', 'a', 'user-a', '2026-09-30T12:02:00Z'));
    realtime.messages$.next(message('m3', 'a', 'user-a', '2026-09-30T12:02:00Z'));
    expect(store.conversations()[0].unreadCount).toBe(1);
    // Own messages never count.
    realtime.messages$.next(message('m4', 'b', 'me', '2026-09-30T12:03:00Z'));
    expect(store.conversations()[0]).toMatchObject({ id: 'b', unreadCount: 0 });
  });

  it('re-reads the first page for a message of an unknown conversation and on reconnection', async () => {
    pages.push([
      conversation('new', '2026-09-30T12:00:00Z', { unreadCount: 1 }),
      conversation('b', '2026-09-30T11:00:00Z'),
      conversation('a', '2026-09-30T10:00:00Z', { unreadCount: 2 }),
    ]);
    realtime.messages$.next(message('m1', 'new', 'user-new', '2026-09-30T12:00:00Z'));
    await vi.waitFor(() => expect(store.conversations()[0].id).toBe('new'));
    expect(api['listConversations']).toHaveBeenCalledTimes(2);
    realtime.resync$.next();
    await vi.waitFor(() => expect(api['listConversations']).toHaveBeenCalledTimes(3));
  });

  it('clears the count on the caller own receipt and updates presence', () => {
    realtime.receipts$.next({
      conversationId: 'a',
      userId: 'me',
      lastReadMessageId: 'x',
      readAt: '2026-09-30T12:00:00Z',
    });
    expect(store.totalUnread()).toBe(0);
    realtime.presence$.next({ userId: 'user-b', status: 'ONLINE' });
    expect(store.conversations().find((c) => c.id === 'b')?.other.onlineStatus).toBe('ONLINE');
  });

  it('excludes muted conversations from the total and removes archived ones', async () => {
    await store.update('a', { muted: true });
    expect(api['updateConversation']).toHaveBeenCalledWith(
      { id: 'a', updateConversationRequest: { muted: true } },
      'body',
      false,
      expect.anything(),
    );
    expect(store.conversations().find((c) => c.id === 'a')?.muted).toBe(true);
    expect(store.totalUnread()).toBe(0);
    await store.update('b', { archived: true });
    expect(store.conversations().map((c) => c.id)).toEqual(['a']);
  });

  it('pages older conversations while a linked conversation is not loaded yet', () => {
    api['listConversations'].mockReturnValueOnce(
      of({ items: [conversation('x', '2026-09-30T12:00:00Z')], hasMore: true, nextCursor: 'p2' }),
    );
    store.load();
    store.open('old');
    expect(store.searchingActive()).toBe(true);
    api['listConversations'].mockReturnValueOnce(
      of({ items: [conversation('old', '2026-09-01T12:00:00Z')], hasMore: false }),
    );
    store.loadMore();
    expect(store.active()?.id).toBe('old');
    expect(store.searchingActive()).toBe(false);

    // A failing older page stops the search (no retry loop).
    api['listConversations'].mockReturnValueOnce(
      of({ items: [conversation('x', '2026-09-30T12:00:00Z')], hasMore: true, nextCursor: 'p2' }),
    );
    store.load();
    store.open('missing');
    api['listConversations'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    store.loadMore();
    expect(store.moreFailed()).toBe(true);
    expect(store.searchingActive()).toBe(false);
  });

  it('keeps a conversation hidden by a block open until the collector leaves it', () => {
    store.open('b');
    store.remove('b', true);
    expect(store.conversations().map((c) => c.id)).toEqual(['a']);
    expect(store.active()?.id).toBe('b');
    store.open(null);
    expect(store.active()).toBeNull();
  });
});
