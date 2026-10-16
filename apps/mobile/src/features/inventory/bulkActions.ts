import type { BulkInventoryRequest, BulkInventoryResponse } from '@/src/api/types';

/**
 * Bulk actions of the Inventory's Select mode (owner spec 2026-10-14, section 6: Move to binder,
 * Make public, Make private, Still available, Delete; availability and temporary publication are
 * gone from the phone): the request of `POST /inventory/items/bulk` and the outcome sentence (with
 * the reasons of skipped items). A bulk delete can be undone from its toast.
 */
export type BulkAction =
  | { kind: 'visibility'; visibility: 'PUBLIC' | 'PRIVATE' }
  | { kind: 'move'; binderId: string | null; binderName: string | null }
  | { kind: 'confirm' }
  | { kind: 'delete' };

/** `POST /inventory/items/bulk` body for an action on the selected items. */
export function toBulkRequest(
  action: BulkAction,
  itemIds: readonly string[]
): BulkInventoryRequest {
  const base = { itemIds: [...itemIds] };
  switch (action.kind) {
    case 'visibility':
      return { ...base, action: 'SET_VISIBILITY', visibility: action.visibility };
    case 'move': {
      const request: BulkInventoryRequest = { ...base, action: 'MOVE_TO_BINDER' };
      if (action.binderId) {
        request.binderId = action.binderId;
      }
      return request;
    }
    case 'confirm':
      return { ...base, action: 'CONFIRM' };
    case 'delete':
      return { ...base, action: 'DELETE' };
  }
}

function cards(count: number): string {
  return `${count} ${count === 1 ? 'card' : 'cards'}`;
}

function done(action: BulkAction, count: number): string {
  const subject = cards(count);
  const verb = count === 1 ? 'is' : 'are';
  switch (action.kind) {
    case 'visibility':
      return `${subject} ${verb} now ${action.visibility === 'PUBLIC' ? 'public' : 'private'}.`;
    case 'move':
      return action.binderId
        ? `${subject} moved to “${action.binderName ?? 'the binder'}”.`
        : `${subject} moved out of their binder.`;
    case 'confirm':
      return `${subject} confirmed as still available.`;
    case 'delete':
      return `${subject} deleted.`;
  }
}

/** Outcome sentence of a bulk action, with the reasons of skipped items. */
export function bulkResultMessage(action: BulkAction, response: BulkInventoryResponse): string {
  const parts = [response.updated > 0 ? done(action, response.updated) : 'Nothing changed.'];
  const unchanged = response.skipped.filter((entry) => entry.reason === 'UNCHANGED').length;
  const missing = response.skipped.length - unchanged;
  if (unchanged > 0) {
    parts.push(`${cards(unchanged)} skipped: already in that state.`);
  }
  if (missing > 0) {
    parts.push(`${cards(missing)} skipped: no longer in your inventory.`);
  }
  return parts.join(' ');
}
