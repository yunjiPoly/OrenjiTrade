import type { BinderResponse, InventoryItemResponse } from '@orenji/api-client';

/** A fictional card of the collector's inventory (unit tests only). */
export function item(
  id: string,
  overrides: Partial<InventoryItemResponse> = {},
): InventoryItemResponse {
  return {
    id,
    printing: {
      id: `p-${id}`,
      printingCode: `AZR-EN00${id.length}`,
      setName: 'Azure Dawn',
      rarity: 'Ultra Rare',
      images: [],
    },
    card: { id: `c-${id}`, name: `Card ${id}`, game: 'yugioh' },
    quantity: 1,
    condition: '',
    conditionStated: false,
    language: 'en',
    edition: '',
    finish: 'NORMAL',
    currency: 'CAD',
    availability: 'TRADE_OR_SALE' as InventoryItemResponse['availability'],
    acceptsOffers: false,
    notes: '',
    publicNotes: '',
    visibility: 'PRIVATE' as InventoryItemResponse['visibility'],
    effectivePublic: false,
    freshness: {
      state: 'ACTIVE' as InventoryItemResponse['freshness']['state'],
      confirmedAt: '2026-10-28T10:00:00Z',
      updatedAt: '2026-10-28T10:00:00Z',
      label: 'Updated just now',
    },
    images: [],
    createdAt: '2026-10-28T10:00:00Z',
    updatedAt: '2026-10-28T10:00:00Z',
    ...overrides,
  };
}

/** A fictional binder (unit tests only). */
export function binder(id: string, overrides: Partial<BinderResponse> = {}): BinderResponse {
  return {
    id,
    name: `Binder ${id}`,
    description: '',
    kind: 'TRADE' as BinderResponse['kind'],
    visibility: 'PRIVATE' as BinderResponse['visibility'],
    sortOrder: 0,
    itemCount: 0,
    publicItemCount: 0,
    effectivePublic: false,
    games: ['yugioh'],
    game: 'yugioh',
    gameLocked: false,
    freshness: item('x').freshness,
    createdAt: '2026-10-28T10:00:00Z',
    updatedAt: '2026-10-28T10:00:00Z',
    ...overrides,
  };
}
