import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ConversationParticipantOnlineStatusEnum as Online,
  ConversationSummary,
  MessageResponse,
  MessageResponseKindEnum as Kind,
  MessageResponseModerationStateEnum as Moderation,
  MessagingService,
  SendMessageRequestKindEnum,
  UploadsService,
} from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError } from '../../../core/http/api-error';
import { ReadReceiptNotice, TypingNotice } from '../../../core/realtime/realtime-events';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import {
  TYPING_THROTTLE_MS,
  TYPING_VISIBLE_MS,
  ThreadStore,
  sendErrorMessage,
} from './thread.store';

const conversation: ConversationSummary = {
  id: 'c1',
  other: { id: 'other', handle: 'bea', displayName: 'Bea', onlineStatus: Online.Hidden },
  unreadCount: 1,
  muted: false,
  archived: false,
  createdAt: '2026-09-30T09:00:00Z',
};

function message(id: string, senderId: string, at: string, conversationId = 'c1'): MessageResponse {
  return {
    id,
    conversationId,
    senderId,
    kind: Kind.Text,
    body: id,
    payload: {},
    createdAt: at,
    readByOther: false,
    moderationState: Moderation.Ok,
  };
}

function apiError(errorCode: string, status: number, retryAfterSeconds?: number): ApiError {
  return new ApiError(
    { errorCode, message: errorCode, requestId: null, status, fieldErrors: {} },
    { problem: retryAfterSeconds ? { retryAfterSeconds } : undefined },
  );
}

describe('ThreadStore', () => {
  let store: ThreadStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let uploads: Record<string, ReturnType<typeof vi.fn>>;
  let realtime: {
    messages$: Subject<MessageResponse>;
    receipts$: Subject<ReadReceiptNotice>;
    typing$: Subject<TypingNotice>;
    resync$: Subject<void>;
    sendTyping: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      listMessages: vi.fn(({ cursor }) =>
        of(
          cursor
            ? { items: [message('m0', 'other', '2026-09-30T09:59:00Z')], hasMore: false }
            : {
                items: [
                  message('m2', 'other', '2026-09-30T10:01:00Z'),
                  message('m1', 'me', '2026-09-30T10:00:00Z'),
                ],
                hasMore: true,
                nextCursor: 'older',
              },
        ),
      ),
      sendMessage: vi.fn(({ sendMessageRequest }) =>
        of({ ...message('sent', 'me', '2026-09-30T10:05:00Z'), body: sendMessageRequest.body }),
      ),
      markConversationRead: vi.fn(() => of({})),
    };
    uploads = { uploadImage: vi.fn(() => of({ uploadId: 'upload-1', url: '/u/1' })) };
    realtime = {
      messages$: new Subject(),
      receipts$: new Subject(),
      typing$: new Subject(),
      resync$: new Subject(),
      sendTyping: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        ThreadStore,
        { provide: MessagingService, useValue: api },
        { provide: UploadsService, useValue: uploads },
        { provide: RealtimeService, useValue: realtime },
        { provide: SessionService, useValue: { me: signal({ id: 'me' }) } },
      ],
    });
    store = TestBed.inject(ThreadStore);
    store.open(conversation);
  });

  afterEach(() => vi.useRealTimers());

  it('loads the newest page oldest first and marks the newest message read', () => {
    expect(store.status()).toBe('ready');
    expect(store.messages().map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(store.hasOlder()).toBe(true);
    expect(api['markConversationRead']).toHaveBeenCalledWith(
      { id: 'c1', markConversationReadRequest: { lastReadMessageId: 'm2' } },
      'body',
      false,
      expect.anything(),
    );
  });

  it('loads older messages through the cursor', async () => {
    await store.loadOlder();
    expect(api['listMessages']).toHaveBeenLastCalledWith(
      { id: 'c1', limit: 30, cursor: 'older' },
      'body',
      false,
      expect.anything(),
    );
    expect(store.messages().map((m) => m.id)).toEqual(['m0', 'm1', 'm2']);
    expect(store.hasOlder()).toBe(false);
  });

  it('marks nothing read while the thread is not on screen', () => {
    api['markConversationRead'].mockClear();
    store.setVisible(false);
    realtime.messages$.next(message('m3', 'other', '2026-09-30T10:03:00Z'));
    expect(store.messages().at(-1)?.id).toBe('m3');
    expect(api['markConversationRead']).not.toHaveBeenCalled();
    store.setVisible(true);
    expect(api['markConversationRead']).toHaveBeenCalledTimes(1);
    // Messages of other conversations are ignored.
    realtime.messages$.next(message('x', 'other', '2026-09-30T10:04:00Z', 'c2'));
    expect(store.messages().map((m) => m.id)).not.toContain('x');
  });

  it('sends text and adds the message once even when the realtime echo arrives', async () => {
    expect(await store.send({ text: 'Deal!', attachment: null })).toBe(true);
    expect(api['sendMessage']).toHaveBeenCalledWith(
      { id: 'c1', sendMessageRequest: { kind: SendMessageRequestKindEnum.Text, body: 'Deal!' } },
      'body',
      false,
      expect.anything(),
    );
    realtime.messages$.next({ ...message('sent', 'me', '2026-09-30T10:05:00Z'), body: 'Deal!' });
    expect(store.messages().filter((m) => m.id === 'sent')).toHaveLength(1);
  });

  it('uploads a photo before sending it', async () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await store.send({ text: '', attachment: { kind: 'image', file, previewUrl: 'blob:x' } });
    expect(uploads['uploadImage']).toHaveBeenCalledWith(
      { file, kind: 'MESSAGE' },
      'body',
      false,
      expect.anything(),
    );
    expect(api['sendMessage'].mock.calls[0][0].sendMessageRequest).toEqual({
      kind: SendMessageRequestKindEnum.Image,
      body: undefined,
      imageUploadId: 'upload-1',
    });
  });

  it('explains refusals and remembers a block', async () => {
    api['sendMessage'].mockReturnValueOnce(throwError(() => apiError('MESSAGING_BLOCKED', 403)));
    expect(await store.send({ text: 'Hello?', attachment: null })).toBe(false);
    expect(store.messagingBlocked()).toBe(true);
    expect(store.sendError()).toContain('You cannot message this collector');

    expect(await store.send({ text: '  ', attachment: null })).toBe(false);
    expect(store.sendError()).toBe('Write a message or attach something.');
    expect(sendErrorMessage(apiError('RATE_LIMITED', 429, 20))).toBe(
      'You are sending messages too quickly. Try again in 20 seconds.',
    );
    expect(sendErrorMessage(apiError('MESSAGE_BLOCKED', 422))).toContain('community guidelines');
    expect(sendErrorMessage(apiError('PAYLOAD_TOO_LARGE', 413))).toContain('8 MB');
  });

  it('shows read receipts of the other participant', () => {
    realtime.receipts$.next({
      conversationId: 'c1',
      userId: 'other',
      lastReadMessageId: 'm2',
      readAt: '2026-09-30T10:02:00Z',
    });
    expect(store.messages().find((m) => m.id === 'm1')?.readByOther).toBe(true);
  });

  it('throttles typing notices and hides the indicator after a while', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T10:00:00Z'));
    store.userTyping();
    store.userTyping();
    expect(realtime.sendTyping).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(TYPING_THROTTLE_MS);
    store.userTyping();
    expect(realtime.sendTyping).toHaveBeenCalledTimes(2);

    realtime.typing$.next({ conversationId: 'c1', userId: 'other' });
    expect(store.otherTyping()).toBe(true);
    vi.advanceTimersByTime(TYPING_VISIBLE_MS);
    expect(store.otherTyping()).toBe(false);
    // A message from the other participant ends "typing…" at once.
    realtime.typing$.next({ conversationId: 'c1', userId: 'other' });
    realtime.messages$.next(message('m9', 'other', '2026-09-30T10:09:00Z'));
    expect(store.otherTyping()).toBe(false);
  });

  it('reports a conversation hidden by a block as unavailable', () => {
    api['listMessages'].mockReturnValueOnce(throwError(() => apiError('NOT_FOUND', 404)));
    store.open({ ...conversation, id: 'c2' });
    expect(store.status()).toBe('unavailable');
  });

  it('re-reads the newest page after a reconnection', () => {
    api['listMessages'].mockReturnValueOnce(
      of({ items: [message('m5', 'other', '2026-09-30T10:10:00Z')], hasMore: false }),
    );
    realtime.resync$.next();
    expect(store.messages().at(-1)?.id).toBe('m5');
  });
});
