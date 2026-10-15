import type { QueryClient } from '@tanstack/react-query';

import { meKeys } from '../queryKeys';

/**
 * The lists that show a collector's binders and cards to others, as this viewer reads them:
 * profiles (the owner's "Public binders" rows, with a deck core's price and photo, the card counts
 * and games of a binder, and the binder counts), the map's counts and state lists, and search. A
 * binder write or delete, and every bulk change of cards (moved between binders, made public or
 * private, deleted), marks them out of date (the ones on screen read again now, the others when
 * next shown), so the owner's own rows never keep an old price, an old photo, an old card count or
 * a deleted binder (review fix 2 of stage R3; R3 leftover R2-2 for the cards that "Save changes"
 * moves). Not awaited: a save does not wait for lists that are not its own.
 */
export function refreshBinderListings(queryClient: QueryClient, uid: string | null): void {
  void queryClient.invalidateQueries({ queryKey: meKeys.collectors(uid) });
  void queryClient.invalidateQueries({ queryKey: meKeys.regionMap(uid) });
  void queryClient.invalidateQueries({ queryKey: meKeys.searches(uid) });
}
