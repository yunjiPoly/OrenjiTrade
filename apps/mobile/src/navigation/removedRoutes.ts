import { DEALS_IN_CHAT_NOTE } from '@/src/features/notifications/notificationKinds';

/** Where a link to a removed screen lands, and what the snackbar says on arrival. */
export interface RemovedRoute {
  href: '/messages' | '/settings';
  note: string;
}

const TO_MESSAGES: RemovedRoute = { href: '/messages', note: DEALS_IN_CHAT_NOTE };
const TO_SETTINGS: RemovedRoute = { href: '/settings', note: DEALS_IN_CHAT_NOTE };

/**
 * Screens that left the phone with offers, trades, protected payments and disputes (ADR 0018:
 * deals happen in the chat). A link that still points at one (`orenjitrade://offers/…`, an old
 * bookmark, an old notification) lands on Messages, or on Settings for the two removed settings
 * pages, instead of the not-found screen. `null` for any other path.
 */
export function removedRouteTarget(pathname: string | null | undefined): RemovedRoute | null {
  const [root, page] = (pathname ?? '').split('?')[0]?.split('/').filter(Boolean) ?? [];
  switch (root) {
    case 'offers':
    case 'trades':
    case 'disputes':
      return TO_MESSAGES;
    case 'checkout':
      // The protected-payment checkout (`/checkout/fake/<ref>`); Premium and donations keep theirs.
      return page === 'fake' ? TO_MESSAGES : null;
    case 'settings':
      return page === 'offers' || page === 'payouts' ? TO_SETTINGS : null;
    default:
      return null;
  }
}
