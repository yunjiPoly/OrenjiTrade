import type {
  BinderResponse,
  InventoryImportResponse,
  InventoryImportRow,
  InventoryItemResponse,
} from '@orenji/api-client';

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

/** A fictional line of an import preview (unit tests only). */
export function importRow(
  id: string,
  position: number,
  overrides: Partial<InventoryImportRow> = {},
): InventoryImportRow {
  return {
    id,
    position,
    status: 'READY' as InventoryImportRow['status'],
    source: { name: `Fixture card ${id}` },
    card: { id: `card-${id}`, name: `Fixture card ${id}`, game: 'yugioh' },
    printingCount: 1,
    suggestedPrintingIds: [],
    conditionSource: 'DEFAULT' as InventoryImportRow['conditionSource'],
    quantity: 1,
    fileQuantity: 1,
    quantityEdited: false,
    included: true,
    inScope: true,
    willImport: true,
    ownedQuantity: 0,
    shownQuantity: 1,
    ...overrides,
  };
}

/** A fictional import preview, a Collectr export of two lines (unit tests only). */
export function importPreview(
  overrides: Partial<InventoryImportResponse> = {},
): InventoryImportResponse {
  return {
    id: 'imp-1',
    source: 'COLLECTR_CSV' as InventoryImportResponse['source'],
    status: 'PENDING' as InventoryImportResponse['status'],
    createdAt: '2026-10-29T08:00:00Z',
    expiresAt: '2099-10-29T09:00:00Z',
    ignoredLines: 0,
    summary: {
      rows: 2,
      ready: 2,
      toChoose: 0,
      unmatched: 0,
      leftOut: 0,
      copies: 2,
      items: 2,
      mergedItems: 0,
      defaultConditions: 0,
      assumedPrintings: 0,
    },
    result: {
      itemsCreated: 0,
      itemsMerged: 0,
      copiesAdded: 0,
      rowsImported: 0,
      copiesNotAdded: 0,
      chunksDone: 0,
      totalChunks: 0,
    },
    ...overrides,
  };
}
