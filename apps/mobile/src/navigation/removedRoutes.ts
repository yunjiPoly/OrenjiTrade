import {
  DEALS_IN_CHAT_NOTE,
  FREE_FOR_ALL_NOTE,
} from '@/src/features/notifications/notificationKinds';

/** Where a link to a removed screen lands, and what the snackbar says on arrival. */
export interface RemovedRoute {
  href: '/messages' | '/settings' | '/profile';
  note: string;
}

const TO_MESSAGES: RemovedRoute = { href: '/messages', note: DEALS_IN_CHAT_NOTE };
const TO_SETTINGS: RemovedRoute = { href: '/settings', note: DEALS_IN_CHAT_NOTE };
const TO_PROFILE: RemovedRoute = { href: '/profile', note: FREE_FOR_ALL_NOTE };

/**
 * Screens that left the phone, so that a link still pointing at one (`orenjitrade://offers/…`, an
 * old bookmark, an old notification) lands on a screen that exists, with a short note, instead of
 * the not-found screen:
 * - offers, trades, protected payments and disputes (ADR 0018: deals happen in the chat) land on
 *   Messages, or on Settings for the two removed settings pages;
 * - Premium, credits, "Support OrenjiTrade" and their checkouts (ADR 0019: free for all) land on
 *   the Profile tab, where their rows used to be.
 *
 * `null` for any other path.
 */
export function removedRouteTarget(pathname: string | null | undefined): RemovedRoute | null {
  const [root, page] = (pathname ?? '').split('?')[0]?.split('/').filter(Boolean) ?? [];
  switch (root) {
    case 'offers':
    case 'trades':
    case 'disputes':
      return TO_MESSAGES;
    case 'premium':
    case 'credits':
    case 'support':
      return TO_PROFILE;
    case 'checkout':
      // The protected-payment checkout (`/checkout/fake/<ref>`), and the Premium and donation ones.
      if (page === 'fake') {
        return TO_MESSAGES;
      }
      return page === 'fake-billing' || page === 'fake-donation' ? TO_PROFILE : null;
    case 'settings':
      return page === 'offers' || page === 'payouts' ? TO_SETTINGS : null;
    default:
      return null;
  }
}
