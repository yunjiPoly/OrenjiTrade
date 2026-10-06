import type {
  BulkInventoryRequest,
  BulkInventoryResponse,
  InventoryAvailability,
  Visibility,
} from '@/src/api/types';
import {
  AVAILABILITY_LABELS,
  TEMPORARY_DURATIONS,
  VISIBILITY_INFO,
  publicUntilFor,
  type TemporaryDuration,
} from '@/src/lib/inventory';

/**
 * Bulk actions of the Inventory tab's selection (mirror of the web's
 * `features/inventory/data/bulk-actions.ts`): the request of `POST /inventory/items/bulk` and
 * the outcome sentence (with the reasons of skipped items).
 */
export type BulkAction =
  | { kind: 'visibility'; visibility: Visibility; duration?: TemporaryDuration }
  | { kind: 'move'; binderId: string | null; binderName: string | null }
  | { kind: 'availability'; availability: InventoryAvailability }
  | { kind: 'confirm' }
  | { kind: 'delete' };

/** `POST /inventory/items/bulk` body for an action on the selected items. */
export function toBulkRequest(
  action: BulkAction,
  itemIds: readonly string[],
  now: number = Date.now()
): BulkInventoryRequest {
  const base = { itemIds: [...itemIds] };
  switch (action.kind) {
    case 'visibility': {
      const request: BulkInventoryRequest = {
        ...base,
        action: 'SET_VISIBILITY',
        visibility: action.visibility,
      };
      if (action.visibility === 'TEMPORARILY_PUBLIC') {
        request.publicUntil = publicUntilFor(action.duration ?? '24h', now);
      }
      return request;
    }
    case 'move': {
      const request: BulkInventoryRequest = { ...base, action: 'MOVE_TO_BINDER' };
      if (action.binderId) {
        request.binderId = action.binderId;
      }
      return request;
    }
    case 'availability':
      return { ...base, action: 'SET_AVAILABILITY', availability: action.availability };
    case 'confirm':
      return { ...base, action: 'CONFIRM' };
    case 'delete':
      return { ...base, action: 'DELETE' };
  }
}

function cards(count: number): string {
  return `${count} ${count === 1 ? 'card' : 'cards'}`;
}

function durationLabel(duration: TemporaryDuration): string {
  return TEMPORARY_DURATIONS.find((option) => option.value === duration)?.label ?? duration;
}

function done(action: BulkAction, count: number): string {
  const subject = cards(count);
  const verb = count === 1 ? 'is' : 'are';
  switch (action.kind) {
    case 'visibility':
      if (action.visibility === 'TEMPORARILY_PUBLIC') {
        return `${subject} ${verb} now public for ${durationLabel(action.duration ?? '24h')}.`;
      }
      return `${subject} ${verb} now ${VISIBILITY_INFO[action.visibility].label.toLowerCase()}.`;
    case 'move':
      return action.binderId
        ? `${subject} moved to “${action.binderName ?? 'the binder'}”.`
        : `${subject} moved out of their binder.`;
    case 'availability':
      return `${subject} set to ${AVAILABILITY_LABELS[action.availability].toLowerCase()}.`;
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

/** "Delete 3 cards?" confirmation of the bulk delete (web wording). */
export function bulkDeleteTitle(count: number): string {
  return `Delete ${cards(count)}?`;
}

export const BULK_DELETE_MESSAGE =
  'They are removed from your inventory, your binders and every listing.';
