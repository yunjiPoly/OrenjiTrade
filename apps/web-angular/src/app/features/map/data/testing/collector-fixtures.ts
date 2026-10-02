import type { CollectorMarker, CollectorPreview, MatchingItem } from '@orenji/api-client';

/** A fictional collector marker for unit tests. */
export function collector(
  handle: string,
  overrides: Partial<CollectorMarker> = {},
): CollectorMarker {
  return {
    id: `id-${handle}`,
    handle,
    displayName: `Collector ${handle}`,
    avatarUrl: null,
    publicPoint: { lat: 45.523, lng: -73.583 },
    publicLabel: 'Plateau-Mont-Royal, Montréal',
    distanceBucket: 'KM_1_5' as CollectorMarker['distanceBucket'],
    rating: { average: null, count: 0 },
    tags: ['trader'],
    games: ['pokemon'],
    lastActiveBucket: 'TODAY' as CollectorMarker['lastActiveBucket'],
    onlineStatus: 'HIDDEN' as CollectorMarker['onlineStatus'],
    binderFreshness: 'ACTIVE' as CollectorMarker['binderFreshness'],
    publicBinderCount: 1,
    publicItemCount: 3,
    matchingItems: [],
    ...overrides,
  };
}

/** A fictional preview payload for unit tests. */
export function preview(
  handle: string,
  overrides: Partial<CollectorPreview> = {},
): CollectorPreview {
  const marker = collector(handle);
  return {
    id: marker.id,
    handle: marker.handle,
    displayName: marker.displayName,
    avatarUrl: marker.avatarUrl,
    publicPoint: marker.publicPoint,
    publicLabel: marker.publicLabel,
    distanceBucket: marker.distanceBucket as CollectorPreview['distanceBucket'],
    rating: marker.rating,
    tags: marker.tags,
    games: marker.games,
    lastActiveBucket: marker.lastActiveBucket as unknown as CollectorPreview['lastActiveBucket'],
    onlineStatus: marker.onlineStatus as unknown as CollectorPreview['onlineStatus'],
    binderFreshness: marker.binderFreshness as unknown as CollectorPreview['binderFreshness'],
    publicBinderCount: marker.publicBinderCount,
    publicItemCount: marker.publicItemCount,
    canMessage: false,
    isBlocked: false,
    ...overrides,
  };
}

/** A fictional listing of the searched card (holders mode) for unit tests. */
export function matchingItem(overrides: Partial<MatchingItem> = {}): MatchingItem {
  return {
    itemId: 'item-1',
    printingId: 'p-en',
    printingCode: 'AZR-EN001',
    cardId: 'card-1',
    cardName: 'Azure-Eyes Sky Dragon',
    game: 'yugioh',
    availability: 'TRADE_OR_SALE' as MatchingItem['availability'],
    askingPrice: 42,
    currency: 'CAD',
    condition: 'NEAR_MINT',
    language: 'en',
    edition: 'FIRST_EDITION',
    acceptsOffers: true,
    freshness: 'ACTIVE' as MatchingItem['freshness'],
    ...overrides,
  };
}
