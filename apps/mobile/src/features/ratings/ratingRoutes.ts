import type { InteractionKind } from '@/src/api/types';

/** The collector a rating or a reference is about, as the entry points know them. */
export interface RatedCollector {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl?: string | null;
}

const ID = /^[\w-]{1,64}$/;
const HANDLE = /^[\w.-]{1,40}$/;
const KINDS: readonly InteractionKind[] = ['TRADE', 'OFFER_ACCEPTED', 'CONVERSATION_QUALIFIED'];

/**
 * Route params of the rating and reference screens (`/ratings/rate`, `/ratings/reference`): the
 * collector, and for a rating optionally the interaction kind to rate (`TRADE` from a completed
 * trade) or the caller's own rating to edit (`rating`).
 */
export function ratingParams(
  collector: Pick<RatedCollector, 'id' | 'displayName' | 'handle'>,
  options: { kind?: InteractionKind; ratingId?: string } = {}
): Record<string, string> {
  return {
    userId: collector.id,
    handle: collector.handle,
    name: collector.displayName,
    ...(options.kind ? { kind: options.kind } : {}),
    ...(options.ratingId ? { rating: options.ratingId } : {}),
  };
}

export interface ParsedRatingParams {
  collector: RatedCollector;
  kind: InteractionKind | null;
  ratingId: string | null;
}

/** The screen's collector and options from its route params (`null` when unusable). */
export function parseRatingParams(
  params: Record<string, string | string[] | undefined>
): ParsedRatingParams | null {
  const one = (key: string) => {
    const value = params[key];
    return typeof value === 'string' ? value : null;
  };
  const userId = one('userId');
  const handle = one('handle');
  if (!userId || !ID.test(userId) || !handle || !HANDLE.test(handle)) {
    return null;
  }
  const kind = one('kind');
  const rating = one('rating');
  return {
    collector: { id: userId, handle, displayName: one('name')?.trim() || `@${handle}` },
    kind: KINDS.includes(kind as InteractionKind) ? (kind as InteractionKind) : null,
    ratingId: rating && ID.test(rating) ? rating : null,
  };
}
