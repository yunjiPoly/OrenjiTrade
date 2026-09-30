import {
  MessageResponse,
  MessageResponseKindEnum as Kind,
  MessageResponseModerationStateEnum as Moderation,
} from '@orenji/api-client';
import {
  DayItem,
  MessageItem,
  applyReadReceipt,
  buildThreadItems,
  dayLabel,
  mergeMessages,
} from './thread-items';

function message(
  id: string,
  senderId: string,
  createdAt: string,
  overrides: Partial<MessageResponse> = {},
): MessageResponse {
  return {
    id,
    conversationId: 'c1',
    senderId,
    kind: Kind.Text,
    body: id,
    payload: {},
    createdAt,
    readByOther: false,
    moderationState: Moderation.Ok,
    ...overrides,
  };
}

describe('thread items', () => {
  it('labels days relative to today', () => {
    const now = new Date(2026, 8, 30, 15, 0);
    expect(dayLabel(new Date(2026, 8, 30, 8, 0), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 8, 29, 23, 59), now)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 8, 27, 12, 0), now)).toBe('Sunday, September 27');
    expect(dayLabel(new Date(2025, 11, 24, 12, 0), now)).toBe('December 24, 2025');
  });

  it('merges pages and realtime echoes without duplicates, oldest first', () => {
    const a = message('a', 'me', '2026-09-30T10:00:00Z');
    const b = message('b', 'other', '2026-09-30T10:01:00Z');
    const c = message('c', 'me', '2026-09-30T10:02:00Z');
    const seen = { ...a, readByOther: true };
    const merged = mergeMessages([c, seen], [b, a, c]);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    // A stale copy never undoes a receipt applied locally.
    expect(merged[0].readByOther).toBe(true);
  });

  it('applies a read receipt to own messages up to the read one', () => {
    const messages = [
      message('a', 'me', '2026-09-30T10:00:00Z'),
      message('b', 'other', '2026-09-30T10:01:00Z'),
      message('c', 'me', '2026-09-30T10:02:00Z'),
      message('d', 'me', '2026-09-30T10:03:00Z'),
    ];
    const read = applyReadReceipt(messages, 'me', 'c', null);
    expect(read.map((m) => m.readByOther)).toEqual([true, false, true, false]);
    // Unknown message id: the receipt time decides.
    const byTime = applyReadReceipt(messages, 'me', 'zzz', '2026-09-30T10:05:00Z');
    expect(byTime.filter((m) => m.senderId === 'me').every((m) => m.readByOther)).toBe(true);
    expect(applyReadReceipt(messages, 'me', 'zzz', null)).toEqual(messages);
  });

  it('groups runs of one sender, separates days and shows the status of the newest own message', () => {
    const now = new Date('2026-09-30T18:00:00');
    const messages = [
      message('a', 'other', '2026-09-29T09:00:00'),
      message('b', 'me', '2026-09-30T09:00:00'),
      message('c', 'me', '2026-09-30T09:02:00', { readByOther: true }),
      message('d', 'me', '2026-09-30T09:30:00', { readByOther: true }),
      message('e', 'other', '2026-09-30T09:31:00'),
    ];
    const items = buildThreadItems(messages, 'me', now);
    expect(
      items.filter((item) => item.kind === 'day').map((item) => (item as DayItem).label),
    ).toEqual(['Yesterday', 'Today']);
    const byId = new Map(
      items
        .filter((item): item is MessageItem => item.kind === 'message')
        .map((item) => [item.message.id, item]),
    );
    expect(byId.get('b')).toMatchObject({ own: true, firstOfGroup: true, lastOfGroup: false });
    expect(byId.get('c')).toMatchObject({ firstOfGroup: false, lastOfGroup: true, status: null });
    // More than five minutes later: a new group.
    expect(byId.get('d')).toMatchObject({ firstOfGroup: true, lastOfGroup: true, status: 'seen' });
    expect(byId.get('e')).toMatchObject({ own: false, status: null });

    const unread = buildThreadItems([{ ...messages[3], readByOther: false }], 'me', now);
    expect((unread[1] as MessageItem).status).toBe('sent');
  });
});
