import type { ConversationSummary } from '@orenji/api-client';
import { UnreadChats, inboxUnread } from './unread-chats';

function chat(unreadCount: number, flags: Partial<ConversationSummary> = {}): ConversationSummary {
  return { unreadCount, muted: false, archived: false, ...flags } as ConversationSummary;
}

describe('inboxUnread (the Messages badge, spec 4.6)', () => {
  it('counts unread chats, not unread messages', () => {
    expect(inboxUnread([chat(3)])).toBe(1);
    expect(inboxUnread([chat(3), chat(1), chat(0)])).toBe(2);
    expect(inboxUnread([])).toBe(0);
  });

  it('never counts a muted or an archived chat', () => {
    expect(inboxUnread([chat(4, { muted: true }), chat(2, { archived: true })])).toBe(0);
    expect(inboxUnread([chat(4, { muted: true }), chat(1)])).toBe(1);
  });

  it('keeps the count at zero or more', () => {
    const unread = new UnreadChats();
    unread.set(-2);
    expect(unread.count()).toBe(0);
    unread.set(5);
    expect(unread.count()).toBe(5);
  });
});
