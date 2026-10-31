import type { AdminRating, AdminReference } from '@orenji/api-client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RatingsTab = 'ratings' | 'references';
export type ShowFilter = 'ALL' | 'OK' | 'HIDDEN';

/** The URL's tab (`?tab=references`), Ratings by default. */
export function ratingsTabOf(value: string | undefined): RatingsTab {
  return value === 'references' ? 'references' : 'ratings';
}

/** The URL's state (`?state=OK|HIDDEN`), All by default. */
export function showFilterOf(value: string | undefined): ShowFilter {
  return value === 'OK' || value === 'HIDDEN' ? value : 'ALL';
}

/** The list request of a URL: unknown ids are left out. */
export function ratingsParams(
  query: { state?: string; rateeId?: string; raterId?: string; page?: string },
  size: number,
): {
  state: 'OK' | 'HIDDEN' | undefined;
  rateeId: string | undefined;
  raterId: string | undefined;
  page: number;
  size: number;
} {
  const show = showFilterOf(query.state);
  const page = Number.parseInt(query.page ?? '', 10);
  return {
    state: show === 'ALL' ? undefined : show,
    rateeId: query.rateeId && UUID.test(query.rateeId) ? query.rateeId : undefined,
    raterId: query.raterId && UUID.test(query.raterId) ? query.raterId : undefined,
    page: Number.isFinite(page) && page >= 0 ? page : 0,
    size,
  };
}

interface Person {
  handle: string;
  displayName: string;
}

/**
 * The people of a page added to the ones already known (the "Rated collector" and "Rated by"
 * pickers list them by @handle, never an id).
 */
export function peopleOf(
  known: ReadonlyMap<string, Person>,
  items: readonly (AdminRating | AdminReference)[],
  tab: RatingsTab,
): Map<string, Person> {
  const people = new Map(known);
  for (const item of items) {
    if (tab === 'ratings') {
      const rating = item as AdminRating;
      people.set(rating.raterId, rating.rating.rater);
      people.set(rating.rateeId, rating.ratee);
    } else {
      const reference = item as AdminReference;
      people.set(reference.authorId, reference.reference.author);
      people.set(reference.subjectId, reference.subject);
    }
  }
  return people;
}

/**
 * What a rating followed, as board A6 words it (review fix 1): a sale or a qualified conversation
 * is a deal in the chat; trades and offers are history since ADR 0018 ("(old)"). The console's
 * own words: the profile keeps the shared labels.
 */
const FOLLOWED: Readonly<Record<string, string>> = {
  SALE: 'Deal in the chat',
  CONVERSATION_QUALIFIED: 'Deal in the chat',
  TRADE: 'Completed trade (old)',
  OFFER_ACCEPTED: 'Accepted offer (old)',
};

export function ratingFollowedLabel(kind: string | null | undefined): string {
  return kind ? (FOLLOWED[kind] ?? 'Deal in the chat') : '';
}
