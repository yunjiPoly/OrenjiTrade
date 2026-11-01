import { fireEvent, screen, within } from '@testing-library/react-native';

import ConversationScreen from '@/app/messages/[id]';
import { ChatSafetyTip } from '@/src/features/safety/ChatSafetyTip';
import {
  CHAT_SAFETY_TIPS,
  chatSafetyTip,
  dealSideOf,
  type DealSide,
} from '@/src/features/safety/chatSafetyTips';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CONVERSATION_ID,
  SELF_ID,
  conversationFixture,
  conversationPage,
  deckCoreSubjectFixture,
  eligibilityFixture,
  messagePage,
  subjectFixture,
} from '../support/fixtures';
import { mockApi, noContent, ok, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

const port = () => new FakeAuthPort(testUser());

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/conversations': ok(conversationPage()),
    'GET /api/v1/conversations/{id}': ok(conversationFixture()),
    'GET /api/v1/conversations/{id}/messages': ok(messagePage()),
    'POST /api/v1/conversations/{id}/read': noContent,
    'GET /api/v1/notifications/unread-count': ok({ count: 0 }),
    'GET /api/v1/ratings/eligibility': ok(eligibilityFixture()),
    'POST /api/v1/users/{id}/block': noContent,
    ...extra,
  });
}

/** Meetup wording the redesign removed (ADR 0018: collectors don't meet, cards ship by mail). */
const MEETUP_WORDS = /meet|meetup|public place|daylight|in person|game store/i;

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

describe('chat safety tips (spec 2026-10-14, section 10)', () => {
  it('words each side as approved', () => {
    expect(CHAT_SAFETY_TIPS).toEqual({
      buying: 'Check their rating before you send an e-Transfer, and ask for tracking.',
      selling:
        'Ship after the e-Transfer arrives, and add the tracking number when you mark it sold.',
      none: 'Agree on the price and shipping here. Check ratings before you send an e-Transfer.',
    });
    for (const text of Object.values(CHAT_SAFETY_TIPS)) {
      expect(text).not.toMatch(MEETUP_WORDS);
      // No protection claim: payment stays outside the app.
      expect(text).not.toMatch(/protect|escrow|guarantee/i);
    }
  });

  it('takes the side from the owner of the card the chat is about', () => {
    expect(dealSideOf(null, SELF_ID)).toBe('none');
    expect(dealSideOf(undefined, SELF_ID)).toBe('none');
    expect(dealSideOf(SELF_ID, SELF_ID)).toBe('selling');
    expect(dealSideOf('00000000-0000-4000-8000-0000000000b1', SELF_ID)).toBe('buying');
    // Without a known caller, someone's card is never "yours".
    expect(dealSideOf(SELF_ID, null)).toBe('buying');
    expect(chatSafetyTip('none')).toBe(CHAT_SAFETY_TIPS.none);
  });

  it.each<DealSide>(['buying', 'selling', 'none'])(
    'shows the %s tip with its shield and opens the Trading safely page',
    (side) => {
      renderWithProviders(<ChatSafetyTip side={side} />, { port: port() });
      const tip = screen.getByRole('link', { name: `Safety tip: ${CHAT_SAFETY_TIPS[side]}` });
      expect(within(tip).getByTestId('chat-safety-tip-text')).toHaveTextContent(
        CHAT_SAFETY_TIPS[side]
      );
      fireEvent.press(tip);
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/legal/[key]',
        params: { key: 'trading-safely' },
      });
    }
  );
});

describe('the tip in a conversation', () => {
  it('sits at the start of the chat with the "without a card" wording and no meetup line', async () => {
    mockParams.current = { id: CONVERSATION_ID };
    mockApi(routes());
    renderWithProviders(<ConversationScreen />, { port: port() });
    expect(await screen.findByText('Hi! Still have the Lantern Fox?')).toBeOnTheScreen();
    // A chat without a pinned card reads the "none" tip.
    expect(screen.getByTestId('chat-safety-tip-text')).toHaveTextContent(CHAT_SAFETY_TIPS.none);
    expect(screen.getByTestId('conversation-start')).toBeOnTheScreen();
    expect(screen.queryByText(MEETUP_WORDS)).toBeNull();
    expect(screen.queryByTestId('safety-notice')).toBeNull();
    // It never blocks the composer.
    expect(screen.getByLabelText('Message')).toBeOnTheScreen();
  });

  it('greets a new chat with the tip, without the old meetup line', async () => {
    mockParams.current = { id: CONVERSATION_ID };
    mockApi(routes({ 'GET /api/v1/conversations/{id}/messages': ok(messagePage([])) }));
    renderWithProviders(<ConversationScreen />, { port: port() });
    expect(await screen.findByTestId('conversation-empty')).toHaveTextContent(
      /Ask about a card, or share one of yours with the \+ button\./
    );
    expect(screen.getByTestId('chat-safety-tip')).toBeOnTheScreen();
    expect(screen.queryByText(/Meetup details/)).toBeNull();
  });

  it('goes once the collector blocked the other person', async () => {
    mockParams.current = { id: CONVERSATION_ID };
    mockApi(routes());
    renderWithProviders(<ConversationScreen />, { port: port() });
    expect(await screen.findByTestId('chat-safety-tip')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('conversation-menu'));
    fireEvent.press(await screen.findByTestId('conversation-block'));
    fireEvent.press(await screen.findByTestId('block-dialog-confirm'));
    expect(await screen.findByTestId('conversation-blocked-banner')).toBeOnTheScreen();
    expect(screen.queryByTestId('chat-safety-tip')).toBeNull();
  });

  it.each([
    ['buying', subjectFixture(), CHAT_SAFETY_TIPS.buying],
    ['selling', subjectFixture({ ownerId: SELF_ID, copies: 1 }), CHAT_SAFETY_TIPS.selling],
    ['buying a deck core', deckCoreSubjectFixture(), CHAT_SAFETY_TIPS.buying],
  ])(
    'reads the tip of the reader’s side when the chat is about a card (%s)',
    async (_, subject, text) => {
      mockParams.current = { id: CONVERSATION_ID };
      mockApi(routes({ 'GET /api/v1/conversations/{id}': ok(conversationFixture({ subject })) }));
      renderWithProviders(<ConversationScreen />, { port: port() });
      expect(await screen.findByTestId('pinned-bar')).toBeOnTheScreen();
      expect(await screen.findByTestId('chat-safety-tip-text')).toHaveTextContent(text);
    }
  );
});
