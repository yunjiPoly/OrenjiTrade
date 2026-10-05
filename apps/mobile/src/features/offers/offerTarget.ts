import type {
  CollectorMarker,
  CollectorPreview,
  MatchingItem,
  OfferParty,
  PublicInventoryItem,
} from '@/src/api/types';
import { printingCode, printingImageUrl } from '@/src/lib/catalog';

import { allowedOfferKinds } from './offerLabels';

/**
 * What the "Make an offer" form shows about the seller: identity and, when known, the
 * approximate place (a region label only; never a point). Mirror of the web's
 * `shared/offers/offer-target.ts`.
 */
export interface OfferSeller {
  id: string;
  displayName: string;
  handle?: string | null;
  avatarUrl?: string | null;
  placeLabel?: string | null;
}

/**
 * The card an offer is made on, assembled from whichever public read the entry point has (a
 * public binder item, a profile's public cards, a map "holders" listing, a wishlist match). A
 * view model of the form, not a server DTO: the API only needs `itemId`.
 */
export interface OfferTarget {
  itemId: string;
  cardId: string;
  cardName: string;
  game: string;
  printingId?: string | null;
  printingCode?: string | null;
  setName?: string | null;
  imageUrl?: string | null;
  condition: string;
  availability: string;
  acceptsOffers: boolean;
  askingPrice?: number | null;
  currency: string;
  seller: OfferSeller;
}

/** A public inventory item (binder page, collector page, wishlist match). */
export function offerTargetFromItem(item: PublicInventoryItem, seller: OfferSeller): OfferTarget {
  return {
    itemId: item.id,
    cardId: item.card.id,
    cardName: item.card.name,
    game: item.card.game,
    printingId: item.printing.id ?? null,
    printingCode: printingCode(item.printing) || null,
    setName: item.printing.setName ?? null,
    imageUrl: item.images[0]?.url ?? printingImageUrl(item.printing),
    condition: item.condition,
    availability: item.availability,
    acceptsOffers: item.acceptsOffers,
    askingPrice: item.askingPrice ?? null,
    currency: item.currency,
    seller,
  };
}

/** A matching listing of a map marker ("Who has this near me"), with the card's picture. */
export function offerTargetFromMatch(
  item: MatchingItem,
  seller: OfferSeller,
  imageUrl: string | null = null
): OfferTarget {
  return {
    itemId: item.itemId,
    cardId: item.cardId,
    cardName: item.cardName,
    game: item.game,
    printingId: item.printingId,
    printingCode: item.printingCode ?? null,
    setName: null,
    imageUrl,
    condition: item.condition,
    availability: item.availability,
    acceptsOffers: item.acceptsOffers,
    askingPrice: item.askingPrice ?? null,
    currency: item.currency,
    seller,
  };
}

/** Seller block from a map marker. */
export function sellerFromMarker(collector: CollectorMarker): OfferSeller {
  return {
    id: collector.id,
    displayName: collector.displayName,
    handle: collector.handle,
    avatarUrl: collector.avatarUrl ?? null,
    placeLabel: collector.publicLabel,
  };
}

/** Seller block from a map preview. */
export function sellerFromPreview(preview: CollectorPreview): OfferSeller {
  return {
    id: preview.id,
    displayName: preview.displayName,
    handle: preview.handle,
    avatarUrl: preview.avatarUrl ?? null,
    placeLabel: preview.publicLabel ?? null,
  };
}

/** Seller block from an offer party. */
export function sellerFromParty(party: OfferParty): OfferSeller {
  return {
    id: party.id,
    displayName: party.displayName,
    handle: party.handle,
    avatarUrl: party.avatarUrl ?? null,
    placeLabel: party.location?.publicLabel ?? null,
  };
}

/**
 * Whether "Make an offer" is shown for a card: it accepts at least one kind and it is not the
 * viewer's own card (`viewerId` null when signed out).
 */
export function canOfferOn(target: OfferTarget, viewerId: string | null | undefined): boolean {
  return (
    target.seller.id !== viewerId &&
    allowedOfferKinds(target.availability, target.acceptsOffers).length > 0
  );
}
