import type { InventoryItemResponse } from '@orenji/api-client';
import { VisibilityStatus } from '../data/visibility-status';

/** An item as the grid and table render it. */
export interface InventoryRow {
  item: InventoryItemResponse;
  status: VisibilityStatus;
  selected: boolean;
  busy: boolean;
}

export interface QuantityChange {
  item: InventoryItemResponse;
  quantity: number;
}

export interface SelectionChange {
  id: string;
  selected: boolean;
}
