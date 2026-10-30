/**
 * What a signed-out visitor (a guest) tried to do on the web (spec 14, decision 4; the phone's
 * R15 `guestAction.ts`): the sign-in dialog says it in its title, and the web finishes it once the
 * guest has signed in or created an account (and gone through the welcome), back on the page they
 * were on.
 *
 * An action names a listing only (an inventory item, a binder or deck core, a wish) or a card:
 * never a collector, as a guest never gets a collector's id (R15). Once signed in,
 * `GET /listings/owner` names the collector.
 */
export type GuestAskKind = 'message' | 'have' | 'profile' | 'wish' | 'report' | 'add';

/** A public listing: exactly one of an inventory item, a binder (a deck core too) or a wish. */
export type ListingRef = { itemId: string } | { binderId: string } | { wishId: string };

/** The card a wish asks for ("I have it"): catalog data only, never who made the wish. */
export interface GuestWishedCard {
  cardId: string;
  name: string;
  printingId?: string | null;
  rarity?: string | null;
}

export type GuestAction =
  /**
   * "Message" on a card or a deck core: the chat with its owner, that card or core pinned. A
   * plain public binder (`pin: false`) only names its owner: the chat opens with nothing pinned.
   */
  | { kind: 'message'; listing: { itemId: string } | { binderId: string }; pin?: false }
  /** "I have it" on a wish: the chat drawer to its owner, "Hi! I have {card}." in the box. */
  | { kind: 'have'; wishId: string; card: GuestWishedCard }
  /** A post's header, a holder's row, a binder's owner: their profile ("+n": their cards). */
  | { kind: 'profile'; listing: ListingRef }
  /** "Add to wishlist" on a card page: the wish dialog of that card (and printing or rarity). */
  | { kind: 'wish'; cardId: string; printingId?: string | null; rarity?: string | null }
  /** "Report" on a public binder or deck core: Report collector, about that binder. */
  | { kind: 'report'; binderId: string }
  /**
   * "I have this card" on a card page, or "Add from this set" on a set page: the page itself
   * opens its Add drawer, or the set's adding mode, once back (it takes the action).
   */
  | { kind: 'add'; cardId?: string; printingId?: string | null; setId?: string };

/**
 * What the dialog shows under its words (board W26): the card ("Infinite Impermanence", "A
 * collector · New York · $24.00") or the collector ("A collector", "Quebec"). Places only.
 */
export interface GuestAskSubject {
  kind: 'card' | 'person';
  /** The card's name, or "A collector". */
  title: string;
  /** "A collector · {province} · {price}", "Wanted by a collector · {province}", "{province}". */
  line: string;
  /** The card's picture (`/public/card-images/{id}` only), for a card. */
  imageUrl?: string | null;
  game?: string | null;
}

/** The dialog's title for each kind of action (spec 14; the phone's R15 words). */
export const GUEST_ASK_TITLES: Readonly<Record<GuestAskKind, string>> = {
  message: 'Sign in to message this collector',
  have: 'Sign in to tell them you have it',
  profile: 'Sign in to see collector profiles',
  wish: 'Sign in to save your wishes',
  // Not in the spec's list: a guest can reach these too (the phone's words for Report).
  report: 'Sign in to report this collector',
  add: 'Sign in to add your cards',
};

/** Every word of browsing without an account on the web, in one place. English only. */
export const GUEST_COPY = {
  aCollector: 'A collector',
  dialogText: 'It’s free. When you’re done, you come right back here.',
  createAccount: 'Create account',
  signIn: 'Sign in',
  notNow: 'Not now',
  /** A finished action whose listing is gone, or the guest's own (after signing in). */
  gone: 'That listing is no longer available.',
  own: 'That’s one of your own listings.',
  /** The buttons' and rows' spoken names for a guest (the board's labels). */
  needsAccount: 'Needs an account',
  messageLabel: (card: string) => `Message this collector about ${card}. Needs an account`,
  // It starts with the visible "I have it" (SC 2.5.3, as the members' label: WG review A6).
  haveLabel: (card: string) => `I have it: ${card}. Needs an account`,
  moreLabel: (count: number) =>
    `${count} more ${count === 1 ? 'card' : 'cards'} from this collector. Needs an account`,
  whoLabel: (summary: string) => `${summary}. Sign in to see collector profiles`,
} as const;

/** The dialog's title of an action. */
export function askTitle(action: GuestAction): string {
  return GUEST_ASK_TITLES[action.kind];
}

/** The query of `GET /listings/owner` for an action that needs the collector, else null. */
export function ownerQuery(
  action: GuestAction,
): { itemId?: string; binderId?: string; wishId?: string } | null {
  switch (action.kind) {
    case 'message':
    case 'profile':
      return { ...action.listing };
    case 'have':
      return { wishId: action.wishId };
    case 'report':
      return { binderId: action.binderId };
    default:
      return null;
  }
}

/** Whether an action is finished by the page it was asked on (the Add drawer, "Add from this set"). */
export function finishedByPage(action: GuestAction): boolean {
  return action.kind === 'add';
}

/**
 * The address a pending action finishes on: the guest's page without what only a visit meant
 * (the fragment), compared by path and query (in any order: a page merges its parameters) so the
 * action never finishes on another page.
 */
export function samePage(a: string, b: string): boolean {
  const key = (url: string) => {
    const [path = '', query = ''] = (url.split('#')[0] ?? '').split('?');
    const params = new URLSearchParams(query);
    params.sort();
    return `${path}?${params.toString()}`;
  };
  return key(a) === key(b);
}

/** The pages an action never finishes on: the sign-in steps, the account states, the welcome. */
export function isStepPage(url: string): boolean {
  return /^\/(auth|onboarding)(\/|$|\?)/.test(url);
}

/** A place as a guest reads it: the state or province (else the country), never a city. */
export function guestPlace(
  place: { subdivisionName?: string | null; countryName?: string | null } | null | undefined,
): string {
  return place?.subdivisionName || place?.countryName || '';
}

/** "A collector · Quebec · $24.00": a card a guest wants to message about (board W26). */
export function cardSubject(
  card: { name: string; imageUrl?: string | null; game?: string | null },
  place: string,
  price?: string | null,
): GuestAskSubject {
  return {
    kind: 'card',
    title: card.name,
    line: [GUEST_COPY.aCollector, place, price].filter(Boolean).join(' · '),
    imageUrl: card.imageUrl ?? null,
    game: card.game ?? null,
  };
}

/** "Wanted by a collector · Ontario": a wish a guest says they have (board W26). */
export function wishSubject(
  card: { name: string; imageUrl?: string | null; game?: string | null },
  place: string,
): GuestAskSubject {
  return {
    kind: 'card',
    title: card.name,
    line: place ? `Wanted by a collector · ${place}` : 'Wanted by a collector',
    imageUrl: card.imageUrl ?? null,
    game: card.game ?? null,
  };
}

/** "A collector", "Quebec": a collector a guest wants to see (board W26). */
export function personSubject(place: string): GuestAskSubject {
  return { kind: 'person', title: GUEST_COPY.aCollector, line: place };
}

/** A card a guest wants to wish for or add (its name and picture only). */
export function plainCardSubject(card: {
  name: string;
  imageUrl?: string | null;
  game?: string | null;
  line?: string | null;
}): GuestAskSubject {
  return {
    kind: 'card',
    title: card.name,
    line: card.line ?? '',
    imageUrl: card.imageUrl ?? null,
    game: card.game ?? null,
  };
}
