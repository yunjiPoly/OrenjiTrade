import { listingQuery, type ListingRef } from '@/src/account/guestAction';
import { api, required } from '@/src/api/client';
import type { PublicListingOwner } from '@/src/api/types';

/**
 * `GET /api/v1/listings/owner` (stage R15): who owns a public card, binder or wish, for a member.
 * A guest's action is kept by its listing (a guest never gets a collector's id); once the guest
 * has signed in this names the collector so the action can finish. 404 when the listing is no
 * longer public or its owner is hidden from the caller.
 */
export async function fetchListingOwner(listing: ListingRef): Promise<PublicListingOwner> {
  return required(
    (await api.GET('/api/v1/listings/owner', { params: { query: listingQuery(listing) } })).data
  );
}
