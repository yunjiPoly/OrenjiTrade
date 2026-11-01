import type { MessageResponse } from '@/src/api/types';
import { MARK_SOLD_COPY } from '@/src/features/messages/chatCopy';
import { threadMessages } from '@/src/features/messages/conversationCache';
import {
  attachRows,
  chatSide,
  cleanTracking,
  inboxTime,
  markSoldSentence,
  pinnedEnd,
  pinnedLine,
  quickReplies,
  saleSentence,
  trackingProblem,
} from '@/src/features/messages/dealRules';
import { listPreview, toLastMessage } from '@/src/features/messages/messageText';
import { sendRequest } from '@/src/features/messages/messageDraft';

import {
  SELF_ID,
  conversationFixture,
  deckCoreSubjectFixture,
  messageFixture,
  saleMessageFixture,
  subjectFixture,
} from '../support/fixtures';

const OTHER = '00000000-0000-4000-8000-0000000000b1';

function said(senderId: string | null, body: string, id = body): MessageResponse {
  return messageFixture({ id, senderId, body, createdAt: '2026-10-15T12:00:00Z' });
}

describe('which side of the deal the reader is on', () => {
  it('is selling their own card, buying someone else’s, or neither without a card', () => {
    expect(chatSide(subjectFixture({ ownerId: SELF_ID }), SELF_ID)).toBe('selling');
    expect(chatSide(subjectFixture(), SELF_ID)).toBe('buying');
    expect(chatSide(null, SELF_ID)).toBe('none');
    expect(chatSide(deckCoreSubjectFixture(), SELF_ID)).toBe('buying');
  });
});

describe('quick replies (spec section 10; default 10)', () => {
  it('buying: until the seller replies, then the replies after it', () => {
    expect(quickReplies('buying', [], SELF_ID, OTHER)).toEqual([
      'Is it still available?',
      'How much with shipping?',
    ]);
    // The buyer's own messages do not count as the seller's answer.
    expect(quickReplies('buying', [said(SELF_ID, 'Hi!')], SELF_ID, OTHER)).toHaveLength(2);
    expect(quickReplies('buying', [said(OTHER, 'Yes, $32 + $4')], SELF_ID, OTHER)).toEqual([
      'e-Transfer sent!',
      'Tracking number?',
      'Thanks!',
    ]);
    // A SYSTEM message is nobody's answer.
    expect(
      quickReplies('buying', [saleMessageFixture({ sellerId: OTHER })], SELF_ID, OTHER)
    ).toHaveLength(2);
  });

  describe('once the card is marked sold (owner decision of 2026-10-28, R8 follow-up 3)', () => {
    const SELLING_AFTER = ['Got your e-Transfer', 'Shipped!', 'Thanks for buying!'];
    const BUYING_AFTER = ['e-Transfer sent!', 'Tracking number?', 'Thanks!'];
    const buyerAsked = [said(OTHER, 'Is it still available?')];
    const sale = saleMessageFixture({ sellerId: SELF_ID });

    it.each([
      ['a seller who never wrote', 'selling', buyerAsked, SELLING_AFTER],
      ['a seller who wrote', 'selling', [...buyerAsked, said(SELF_ID, 'Yes!')], SELLING_AFTER],
      ['a buyer the seller never answered', 'buying', [said(SELF_ID, 'Hi!')], BUYING_AFTER],
      ['a buyer nobody wrote to', 'buying', [], BUYING_AFTER],
      ['a buyer the seller answered', 'buying', [said(OTHER, 'Yes, $32')], BUYING_AFTER],
    ] as const)('%s has the replies after the sale', (_who, side, messages, after) => {
      expect(quickReplies(side, [...messages, sale], SELF_ID, OTHER, true)).toEqual(after);
    });

    it.each([
      [
        'a seller who never wrote',
        'selling',
        buyerAsked,
        ['Yes, still available', 'Send me your address'],
      ],
      ['a seller who wrote', 'selling', [...buyerAsked, said(SELF_ID, 'Yes!')], SELLING_AFTER],
      [
        'a buyer the seller never answered',
        'buying',
        [said(SELF_ID, 'Hi!')],
        ['Is it still available?', 'How much with shipping?'],
      ],
      ['a buyer the seller answered', 'buying', [said(OTHER, 'Yes, $32')], BUYING_AFTER],
    ] as const)(
      'after the undo, %s is back to the rule of the messages',
      (_who, side, messages, replies) => {
        expect(quickReplies(side, messages, SELF_ID, OTHER, false)).toEqual(replies);
        // The default (no sale known) is the same rule.
        expect(quickReplies(side, messages, SELF_ID, OTHER)).toEqual(replies);
      }
    );

    it('still hides a reply the reader already sent, and gives none without a card', () => {
      expect(quickReplies('selling', [said(SELF_ID, 'Shipped!')], SELF_ID, OTHER, true)).toEqual([
        'Got your e-Transfer',
        'Thanks for buying!',
      ]);
      expect(quickReplies('none', [], SELF_ID, OTHER, true)).toEqual([]);
    });
  });

  it('selling: until the reader writes, then the replies after it', () => {
    expect(quickReplies('selling', [said(OTHER, 'Still there?')], SELF_ID, OTHER)).toEqual([
      'Yes, still available',
      'Send me your address',
    ]);
    expect(quickReplies('selling', [said(SELF_ID, 'Yes!')], SELF_ID, OTHER)).toEqual([
      'Got your e-Transfer',
      'Shipped!',
      'Thanks for buying!',
    ]);
  });

  it('hides a reply once the reader sent that exact text in this chat; none without a card', () => {
    const messages = [said(OTHER, 'Sent!'), said(SELF_ID, '  Shipped!  ', 'mine')];
    expect(quickReplies('selling', messages, SELF_ID, OTHER)).toEqual([
      'Got your e-Transfer',
      'Thanks for buying!',
    ]);
    // The same text from the other collector does not hide it.
    expect(
      quickReplies('buying', [said(OTHER, 'Thanks!'), said(OTHER, 'x', 'x')], SELF_ID, OTHER)
    ).toContain('Thanks!');
    expect(quickReplies('none', [], SELF_ID, OTHER)).toEqual([]);
  });
});

describe('the "+" sheet (spec section 10)', () => {
  it('puts the reader’s saved detail first: the address buying, the e-Transfer email selling', () => {
    expect(attachRows('buying')).toEqual(['address', 'photo', 'card', 'binder']);
    expect(attachRows('selling')).toEqual(['etransfer', 'photo', 'card', 'binder']);
    expect(attachRows('none')).toEqual(['address', 'etransfer', 'photo', 'card', 'binder']);
  });

  it('shares one of the reader’s own cards as a CARD_LINK with its inventory item', () => {
    expect(
      sendRequest({
        text: '  ',
        attachment: {
          kind: 'item',
          item: {
            itemId: 'item-1',
            name: 'Ash Blossom',
            printingCode: 'LAVD-EN008',
            imageUrl: null,
            game: 'yugioh',
            askingPriceText: '85% TCG',
          },
        },
      })
    ).toEqual({ kind: 'CARD_LINK', body: undefined, inventoryItemId: 'item-1' });
  });
});

describe('the pinned bar (screens 23 and 24)', () => {
  it('reads "{code} · {rarity}" buying and "{code} · {price} · your card" selling', () => {
    expect(pinnedLine(subjectFixture(), 'buying')).toBe('SVX-001 · Ultra Rare');
    expect(pinnedLine(subjectFixture({ askingPriceText: '85% TCG' }), 'selling')).toBe(
      'SVX-001 · 85% TCG · your card'
    );
    expect(pinnedLine(subjectFixture({ askingPriceText: null }), 'selling')).toBe(
      'SVX-001 · your card'
    );
    expect(pinnedLine(deckCoreSubjectFixture(), 'buying')).toBe('Deck core');
    expect(pinnedLine(deckCoreSubjectFixture(), 'selling')).toBe(
      'Deck core · $95 · your deck core'
    );
  });

  it('ends with the price, "Mark as sold", "Sold" or "No longer listed"', () => {
    expect(pinnedEnd(subjectFixture(), 'buying')).toEqual({ kind: 'price', text: '$32' });
    expect(pinnedEnd(subjectFixture({ askingPriceText: null }), 'buying')).toEqual({
      kind: 'none',
    });
    expect(pinnedEnd(subjectFixture({ listed: false }), 'buying')).toEqual({ kind: 'unlisted' });
    expect(pinnedEnd(subjectFixture({ sold: true }), 'buying')).toEqual({ kind: 'sold' });
    expect(pinnedEnd(subjectFixture({ copies: 2 }), 'selling')).toEqual({ kind: 'markAsSold' });
    expect(pinnedEnd(subjectFixture({ copies: null }), 'selling')).toEqual({ kind: 'none' });
    expect(pinnedEnd(subjectFixture({ copies: 1, sold: true }), 'selling')).toEqual({
      kind: 'sold',
    });
    expect(pinnedEnd(deckCoreSubjectFixture(), 'selling')).toEqual({ kind: 'markAsSold' });
  });
});

describe('Mark as sold (screen 25) and the sale message', () => {
  it('says what happens to the copies, a last copy, or a deck core', () => {
    expect(markSoldSentence({ kind: 'CARD', copies: 1 }, 1, 'theo.duels')).toBe(
      'Sold to theo.duels. It was your last copy, so the card leaves your inventory. You can rate each other next.'
    );
    expect(markSoldSentence({ kind: 'CARD', copies: 4 }, 3, 'theo.duels')).toBe(
      "Sold to theo.duels. You'll have 1 left. You can rate each other next."
    );
    expect(markSoldSentence({ kind: 'DECK_CORE', copies: null }, 1, 'theo.duels')).toBe(
      MARK_SOLD_COPY.deckCore('theo.duels')
    );
  });

  it('cleans and checks a tracking number like the API', () => {
    expect(cleanTracking('  7023 2109\t 8876  5432 ')).toBe('7023 2109 8876 5432');
    expect(cleanTracking('  7023   2109 ')).toBe('7023 2109');
    expect(trackingProblem('')).toBeNull();
    expect(trackingProblem('LX123456789CA')).toBeNull();
    expect(trackingProblem('1Z999AA10123456784')).toBeNull();
    expect(trackingProblem('see https://x.io')).toBe(MARK_SOLD_COPY.trackingInvalid);
    expect(trackingProblem('-12')).toBe(MARK_SOLD_COPY.trackingInvalid);
    expect(trackingProblem('1'.repeat(65))).toBe(MARK_SOLD_COPY.trackingTooLong);
    expect(trackingProblem('1'.repeat(64))).toBeNull();
  });

  it('words the sale for each side, in the chat and in the inbox', () => {
    const sale = saleMessageFixture().payload.sale!;
    expect(saleSentence(sale, SELF_ID, 'collector2')).toBe(
      'collector2 marked Emberfang Fox VMAX as sold to you.'
    );
    expect(saleSentence({ ...sale, sellerId: SELF_ID }, SELF_ID, 'collector2')).toBe(
      'You marked Emberfang Fox VMAX as sold to collector2.'
    );
    const last = toLastMessage(saleMessageFixture());
    expect(last.systemTopic).toBe('SALE');
    expect(listPreview(conversationFixture({ lastMessage: last }), SELF_ID)).toBe(
      'collector2 marked Emberfang Fox VMAX as sold to you.'
    );
    // An undone sale is dropped from the thread.
    expect(
      threadMessages({
        pages: [
          {
            items: [saleMessageFixture({ undone: true }), messageFixture()],
            nextCursor: null,
            hasMore: false,
          },
        ],
        pageParams: [null],
      }).map((message) => message.id)
    ).toEqual([messageFixture().id]);
  });
});

describe('inbox times (screen 22)', () => {
  const now = new Date(2026, 9, 15, 14, 30);
  it('reads "2 min", "1 h", "Yesterday", the weekday, then the date', () => {
    expect(inboxTime(new Date(2026, 9, 15, 14, 29, 50).toISOString(), now)).toBe('now');
    expect(inboxTime(new Date(2026, 9, 15, 14, 28).toISOString(), now)).toBe('2 min');
    expect(inboxTime(new Date(2026, 9, 15, 13, 10).toISOString(), now)).toBe('1 h');
    expect(inboxTime(new Date(2026, 9, 15, 0, 5).toISOString(), now)).toBe('14 h');
    expect(inboxTime(new Date(2026, 9, 14, 23, 50).toISOString(), now)).toBe('Yesterday');
    expect(inboxTime(new Date(2026, 9, 12, 9, 0).toISOString(), now)).toBe('Mon');
    expect(inboxTime(new Date(2026, 8, 28, 9, 0).toISOString(), now)).toBe('Sep 28');
    expect(inboxTime('not a date', now)).toBe('');
  });
});
