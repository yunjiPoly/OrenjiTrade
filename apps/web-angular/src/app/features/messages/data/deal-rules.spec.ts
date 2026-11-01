import type { ConversationSubject, ConversationSummary, MessageResponse } from '@orenji/api-client';
import {
  SALE_UNDO_MS,
  canUndoSale,
  chatSide,
  chatStatusLine,
  cleanTracking,
  filterChats,
  inboxTime,
  isEmail,
  isUndoneSale,
  latestSale,
  markSoldSentence,
  pinnedEnd,
  pinnedLine,
  provinceOf,
  quickReplies,
  saleSentence,
  subjectPrice,
  trackingProblem,
  undoLeftMs,
} from './deal-rules';

function subject(overrides: Partial<ConversationSubject> = {}): ConversationSubject {
  return {
    kind: 'CARD',
    id: 'item-1',
    ownerId: 'seller',
    name: 'Ash Blossom & Joyous Spring',
    printingCode: 'RA01-EN008',
    rarity: 'Secret Rare',
    sold: false,
    listed: true,
    copies: 2,
    ...overrides,
  } as ConversationSubject;
}

function msg(id: string, senderId: string | null, overrides: Partial<MessageResponse> = {}) {
  return {
    id,
    conversationId: 'c1',
    senderId,
    kind: 'TEXT',
    body: '',
    payload: {},
    createdAt: '2026-10-20T12:00:00Z',
    readByOther: false,
    moderationState: 'OK',
    ...overrides,
  } as MessageResponse;
}

function saleMessage(createdAt: string, overrides: Record<string, unknown> = {}): MessageResponse {
  return msg('sale-msg', null, {
    kind: 'SYSTEM' as MessageResponse['kind'],
    createdAt,
    payload: {
      sale: {
        saleId: 'sale-1',
        sellerId: 'seller',
        buyerId: 'buyer',
        kind: 'CARD',
        name: 'Ash Blossom & Joyous Spring',
        quantity: 1,
        trackingNumber: '1Z999AA10123456784',
        undone: false,
        ...overrides,
      },
    } as MessageResponse['payload'],
  });
}

function chat(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'c1',
    other: {
      id: 'buyer',
      handle: 'theo.duels',
      displayName: 'Theo',
      onlineStatus: 'ONLINE',
      place: {
        countryCode: 'CA',
        countryName: 'Canada',
        subdivisionCode: 'CA-QC',
        subdivisionName: 'Quebec',
        label: 'Quebec, Canada',
      },
    },
    unreadCount: 0,
    muted: false,
    archived: false,
    createdAt: '2026-10-20T10:00:00Z',
    ...overrides,
  } as ConversationSummary;
}

describe('deal rules (web WC, spec 10)', () => {
  it('puts the subject owner on the selling side and the other collector on the buying side', () => {
    expect(chatSide(subject(), 'seller')).toBe('selling');
    expect(chatSide(subject(), 'buyer')).toBe('buying');
    expect(chatSide(null, 'buyer')).toBe('none');
    expect(chatSide(subject(), null)).toBe('none');
  });

  it('offers the first quick replies until the other side wrote, then the later ones', () => {
    expect(quickReplies('buying', [], 'buyer', 'seller')).toEqual([
      'Is it still available?',
      'How much with shipping?',
    ]);
    const answered = [msg('1', 'buyer', { body: 'Is it still available?' }), msg('2', 'seller')];
    expect(quickReplies('buying', answered, 'buyer', 'seller')).toEqual([
      'e-Transfer sent!',
      'Tracking number?',
      'Thanks!',
    ]);
    expect(quickReplies('selling', [], 'seller', 'buyer')).toEqual([
      'Yes, still available',
      'Send me your address',
    ]);
    const sent = [msg('1', 'seller', { body: 'Shipped!' })];
    expect(quickReplies('selling', sent, 'seller', 'buyer')).toEqual([
      'Got your e-Transfer',
      'Thanks for buying!',
    ]);
    expect(quickReplies('none', [], 'a', 'b')).toEqual([]);
  });

  it('gives both sides the later replies once the card is sold (owner decision 2026-10-28)', () => {
    expect(quickReplies('buying', [], 'buyer', 'seller', true)).toEqual([
      'e-Transfer sent!',
      'Tracking number?',
      'Thanks!',
    ]);
    expect(quickReplies('selling', [], 'seller', 'buyer', true)).toEqual([
      'Got your e-Transfer',
      'Shipped!',
      'Thanks for buying!',
    ]);
  });

  it('words the pinned bar for each side, with Mark as sold for the seller only', () => {
    expect(pinnedLine(subject(), 'buying')).toBe('RA01-EN008 · Secret Rare');
    expect(pinnedLine(subject(), 'selling')).toBe('RA01-EN008 · Secret Rare · your card');
    const core = subject({
      kind: 'DECK_CORE' as ConversationSubject['kind'],
      printingCode: null,
      rarity: null,
    });
    expect(pinnedLine(core, 'buying', 'duelist.jp')).toBe('duelist.jp’s deck core');
    expect(pinnedLine(core, 'selling', 'theo.duels')).toBe('your deck core');

    expect(pinnedEnd(subject(), 'selling')).toBe('markAsSold');
    expect(pinnedEnd(subject({ copies: 0 }), 'selling')).toBe('none');
    expect(pinnedEnd(core, 'selling')).toBe('markAsSold');
    expect(pinnedEnd(subject({ sold: true }), 'buying')).toBe('sold');
    expect(pinnedEnd(subject({ listed: false }), 'buying')).toBe('unlisted');
    expect(pinnedEnd(subject(), 'buying')).toBe('none');
    expect(subjectPrice(subject({ askingPriceText: ' 85% TCG ' }))).toBe('85% TCG');
    expect(subjectPrice(subject({ askingPriceText: null }))).toBeNull();
  });

  it('shows the state or province only, never a city (ADR 0017)', () => {
    expect(provinceOf(chat().other)).toBe('Quebec');
    expect(chatStatusLine(chat(), false, false)).toBe('Online · Quebec');
    expect(chatStatusLine(chat({ muted: true }), false, false)).toBe('Online · Quebec · Muted');
    expect(chatStatusLine(chat(), true, false)).toBe('typing…');
    expect(chatStatusLine(chat(), false, true)).toBe('Blocked');
    const offline = chat();
    offline.other = {
      ...offline.other,
      onlineStatus: 'HIDDEN' as ConversationSummary['other']['onlineStatus'],
      place: undefined,
    };
    expect(chatStatusLine(offline, false, false)).toBe('');
  });

  it('words the sale note for the reader', () => {
    const sale = { sellerId: 'seller', name: 'Ash Blossom & Joyous Spring' };
    expect(saleSentence(sale, 'seller', 'theo.duels')).toBe(
      'You marked Ash Blossom & Joyous Spring as sold to theo.duels.',
    );
    expect(saleSentence(sale, 'buyer', 'duelist.jp')).toBe(
      'duelist.jp marked Ash Blossom & Joyous Spring as sold to you.',
    );
  });

  it('keeps Undo on the note for the seller for 10 minutes only', () => {
    const at = Date.parse('2026-10-20T12:00:00Z');
    const note = saleMessage('2026-10-20T12:00:00Z');
    expect(canUndoSale(note, 'seller', at + 60_000)).toBe(true);
    expect(canUndoSale(note, 'seller', at + SALE_UNDO_MS + 1)).toBe(false);
    expect(canUndoSale(note, 'buyer', at + 60_000)).toBe(false);
    expect(canUndoSale(saleMessage('2026-10-20T12:00:00Z', { undone: true }), 'seller', at)).toBe(
      false,
    );
    expect(canUndoSale(msg('x', 'seller'), 'seller', at)).toBe(false);
    expect(undoLeftMs(note, at + 60_000)).toBe(SALE_UNDO_MS - 60_000);
    expect(isUndoneSale(saleMessage('2026-10-20T12:00:00Z', { undone: true }))).toBe(true);
  });

  it('finds the newest sale note that is not undone', () => {
    const first = saleMessage('2026-10-19T12:00:00Z');
    const undone = { ...saleMessage('2026-10-20T12:00:00Z', { undone: true }), id: 'later' };
    expect(latestSale([first, msg('t', 'buyer'), undone])).toBe(first);
    expect(latestSale([msg('t', 'buyer')])).toBeNull();
  });

  it('writes Mark as sold’s live sentence as the board does', () => {
    expect(markSoldSentence(subject({ copies: 2 }), 1, 'theo.duels')).toBe(
      'Sold to theo.duels. You keep 1 copy in your inventory. You can rate each other next.',
    );
    expect(markSoldSentence(subject({ copies: 4 }), 1, 'theo.duels')).toContain(
      'You keep 3 copies in your inventory.',
    );
    expect(markSoldSentence(subject({ copies: 2 }), 2, 'theo.duels')).toBe(
      'Sold to theo.duels. It was your last copy, so the card leaves your inventory. You can rate each other next.',
    );
    expect(
      markSoldSentence(
        subject({ kind: 'DECK_CORE' as ConversationSubject['kind'] }),
        1,
        'theo.duels',
      ),
    ).toContain('The deck core and its cards leave Search and your inventory.');
  });

  it('checks a tracking number with the API’s rule', () => {
    expect(cleanTracking('  1Z 999   AA1 ')).toBe('1Z 999 AA1');
    expect(trackingProblem('')).toBeNull();
    expect(trackingProblem('1Z999AA10123456784')).toBeNull();
    expect(trackingProblem('-1Z')).toBe('Use letters, digits, spaces, dots and dashes only.');
    expect(trackingProblem('1Z/999')).toBe('Use letters, digits, spaces, dots and dashes only.');
    expect(trackingProblem('A'.repeat(65))).toBe('At most 64 characters.');
  });

  it('words the inbox times like the phone', () => {
    const now = new Date(2026, 9, 20, 15, 0, 0);
    expect(inboxTime(new Date(2026, 9, 20, 14, 59, 30).toISOString(), now)).toBe('now');
    expect(inboxTime(new Date(2026, 9, 20, 14, 52).toISOString(), now)).toBe('8 min');
    expect(inboxTime(new Date(2026, 9, 20, 12, 0).toISOString(), now)).toBe('3 h');
    expect(inboxTime(new Date(2026, 9, 19, 12, 0).toISOString(), now)).toBe('Yesterday');
    expect(inboxTime(new Date(2026, 9, 17, 12, 0).toISOString(), now)).toBe('Sat');
    expect(inboxTime(new Date(2026, 9, 1, 12, 0).toISOString(), now)).toBe('Oct 1');
    expect(inboxTime('nonsense', now)).toBe('');
  });

  it('accepts an email shape for the e-Transfer dialog', () => {
    expect(isEmail('sam@example.com')).toBe(true);
    expect(isEmail(' sam@example.com ')).toBe(true);
    expect(isEmail('sam@example')).toBe(false);
    expect(isEmail('sam example.com')).toBe(false);
  });

  it('filters the inbox by Unread and by a handle, a name, a message or the chat’s card', () => {
    const a = chat({ id: 'a', unreadCount: 2 });
    const b = chat({
      id: 'b',
      other: { ...chat().other, handle: 'duelist.jp', displayName: 'Dee' },
      subject: subject({ name: 'Yubel core' }),
    });
    expect(filterChats([a, b], 'unread', '').map((c) => c.id)).toEqual(['a']);
    expect(filterChats([a, b], 'all', 'YUBEL').map((c) => c.id)).toEqual(['b']);
    expect(filterChats([a, b], 'all', 'duelist').map((c) => c.id)).toEqual(['b']);
    expect(filterChats([a, b], 'all', '  ').map((c) => c.id)).toEqual(['a', 'b']);
  });
});
