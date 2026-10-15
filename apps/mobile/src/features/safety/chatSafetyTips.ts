/**
 * Which side of a deal the collector is on in a chat (spec 2026-10-14, section 10): buying the
 * other person's card, selling their own, or a chat without a card.
 */
export type DealSide = 'buying' | 'selling' | 'none';

/**
 * The safety tip at the top of every new chat, per side (spec 2026-10-14, section 10; ADR 0018:
 * deals ship by mail and payment stays outside the app). Approved English copy, kept here so the
 * French translation (on hold) can slot in later.
 */
export const CHAT_SAFETY_TIPS: Readonly<Record<DealSide, string>> = {
  buying: 'Check their rating before you send an e-Transfer, and ask for tracking.',
  selling: 'Ship after the e-Transfer arrives, and add the tracking number when you mark it sold.',
  none: 'Agree on the price and shipping here. Check ratings before you send an e-Transfer.',
};

/**
 * The side from the owner of the card or deck core the chat is about (its pinned subject, stage
 * R4): no card is `none`, the caller's own card is `selling`, someone else's is `buying`.
 */
export function dealSideOf(
  subjectOwnerId: string | null | undefined,
  selfId: string | null | undefined
): DealSide {
  if (!subjectOwnerId) {
    return 'none';
  }
  return selfId && subjectOwnerId === selfId ? 'selling' : 'buying';
}

export function chatSafetyTip(side: DealSide): string {
  return CHAT_SAFETY_TIPS[side];
}
