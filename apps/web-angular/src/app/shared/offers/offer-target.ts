import type {
  CollectorMarker,
  MatchingItem,
  OfferParty,
  PublicInventoryItem,
} from '@orenji/api-client';
import { printingCode, printingImageUrl } from '../inventory/inventory-labels';
import { allowedOfferKinds } from './offer-labels';

/**
 * What the "Make an offer" dialog shows about the seller: identity and, when known, the
 * state/province and country (never a city or a point, ADR 0017).
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
 * public binder item, a card-holder result, a map "holders" listing, a wishlist match). It is a
 * view model of the dialog, not a server DTO: the API only needs `itemId`.
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

/** A public inventory item (binder page, collector page, card holders, wishlist match). */
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

/** A matching listing of a map marker ("Holders of X"). */
export function offerTargetFromMatch(item: MatchingItem, collector: CollectorMarker): OfferTarget {
  return {
    itemId: item.itemId,
    cardId: item.cardId,
    cardName: item.cardName,
    game: item.game,
    printingId: item.printingId,
    printingCode: item.printingCode ?? null,
    setName: null,
    imageUrl: null,
    condition: item.condition,
    availability: item.availability,
    acceptsOffers: item.acceptsOffers,
    askingPrice: item.askingPrice ?? null,
    currency: item.currency,
    seller: sellerFromMarker(collector),
  };
}

/** Seller block from a map marker / card-holder collector. */
export function sellerFromMarker(collector: CollectorMarker): OfferSeller {
  return {
    id: collector.id,
    displayName: collector.displayName,
    handle: collector.handle,
    avatarUrl: collector.avatarUrl ?? null,
    placeLabel: collector.place.label,
  };
}

/** Seller block from an offer party. */
export function sellerFromParty(party: OfferParty): OfferSeller {
  return {
    id: party.id,
    displayName: party.displayName,
    handle: party.handle,
    avatarUrl: party.avatarUrl ?? null,
    placeLabel: party.place?.label ?? null,
  };
}

/**
 * Whether "Make an offer" is shown for a card: it accepts at least one kind and it is not the
 * viewer's own card (`viewerId` null when signed out: the button then leads to sign-in).
 */
export function canOfferOn(target: OfferTarget, viewerId: string | null | undefined): boolean {
  return (
    target.seller.id !== viewerId &&
    allowedOfferKinds(target.availability, target.acceptsOffers).length > 0
  );
}
