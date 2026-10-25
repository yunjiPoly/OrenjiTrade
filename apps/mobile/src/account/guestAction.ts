import { create } from 'zustand';

import type { PrintingSummary } from '@/src/api/types';

/**
 * What a guest tried to do (stage R15 of the phone redesign, "Browse without an account"): the
 * sheet of mockup screen 71 says it in its title, and the phone finishes it once the guest has
 * signed in or created an account (and gone through the welcome).
 *
 * Kept in memory only, for this run of the app, and only by the listing it was about (an item, a
 * binder, a wish or a printing): never by a collector, as a guest never gets a collector's id. Once
 * signed in, `GET /listings/owner` names the collector (`PendingActionRunner`).
 */
export type GuestAskKind = 'message' | 'have' | 'profile' | 'wish' | 'report';

/** A public listing: exactly one of an inventory item, a binder (a deck core too) or a wish. */
export type ListingRef = { itemId: string } | { binderId: string } | { wishId: string };

/** The card of a wish ("I have it"): catalog data only, never who made the wish. */
export interface WishedCard {
  cardId: string;
  cardName: string;
  printing?: Pick<PrintingSummary, 'id' | 'rarity'> | null;
  rarity?: string | null;
}

export type GuestAction =
  /** "Message" on a card or a deck core: the chat with its owner, the card or core pinned. */
  | { kind: 'message'; listing: { itemId: string } | { binderId: string } }
  /** "I have it" on a wish: the chat with its owner, the text in the box. */
  | { kind: 'have'; wishId: string; card: WishedCard }
  /** A post's header or a holder's row: the owner's profile, or their cards ("+n"). */
  | { kind: 'profile'; listing: ListingRef; page: 'profile' | 'cards' }
  /** "Add to wishlist" on a card page: the wish form of that card (and printing). */
  | { kind: 'wish'; cardId: string; printingId?: string | null; rarity?: string | null }
  /** "Report" on a public binder or deck core: Report collector, about that binder. */
  | { kind: 'report'; binderId: string };

/** The sheet's title for an action: what the guest tried to do. */
export function askOf(action: GuestAction): GuestAskKind {
  return action.kind;
}

interface GuestActionState {
  /** The sheet on screen (what its title says), or null while it is closed. */
  ask: GuestAskKind | null;
  /** The action to finish after signing in; null when there is none. */
  pending: GuestAction | null;
  /** Opens the sheet for this action, which waits for the sign-in. */
  open: (action: GuestAction) => void;
  /** Closes the sheet and keeps the action: Sign in or Create account was tapped. */
  hide: () => void;
  /** "Not now", the sheet dismissed, Sign in closed: the sheet goes and the action is forgotten. */
  dismiss: () => void;
  /** The action to finish now, forgotten once taken. */
  take: () => GuestAction | null;
  /** Forgets everything (signed out, a new run, tests). */
  clear: () => void;
}

export const useGuestAction = create<GuestActionState>()((set, get) => ({
  ask: null,
  pending: null,
  open: (action) => set({ ask: askOf(action), pending: action }),
  hide: () => set({ ask: null }),
  dismiss: () => set({ ask: null, pending: null }),
  take: () => {
    const { pending } = get();
    set({ pending: null });
    return pending;
  },
  clear: () => set({ ask: null, pending: null }),
}));

/** The query of `GET /listings/owner` for a listing. */
export function listingQuery(listing: ListingRef): {
  itemId?: string;
  binderId?: string;
  wishId?: string;
} {
  if ('itemId' in listing) {
    return { itemId: listing.itemId };
  }
  if ('binderId' in listing) {
    return { binderId: listing.binderId };
  }
  return { wishId: listing.wishId };
}
