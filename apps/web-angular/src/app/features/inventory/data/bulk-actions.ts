import type { BulkInventoryRequest, BulkInventoryResponse } from '@orenji/api-client';
import { AVAILABILITIES } from '../../../shared/ui/availability-chip/availability';
import {
  InventoryAvailability,
  TemporaryDuration,
  VISIBILITY_INFO,
  Visibility,
  publicUntilFor,
  temporaryDurationLabel,
} from '../../../shared/inventory/inventory-labels';

/** One action of the bulk bar. */
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
  now: number = Date.now(),
): BulkInventoryRequest {
  const base = { itemIds: [...itemIds] };
  switch (action.kind) {
    case 'visibility': {
      const request: BulkInventoryRequest = {
        ...base,
        action: 'SET_VISIBILITY' as BulkInventoryRequest['action'],
        visibility: action.visibility as BulkInventoryRequest['visibility'],
      };
      if (action.visibility === 'TEMPORARILY_PUBLIC') {
        request.publicUntil = publicUntilFor(action.duration ?? '24h', now);
      }
      return request;
    }
    case 'move': {
      const request: BulkInventoryRequest = {
        ...base,
        action: 'MOVE_TO_BINDER' as BulkInventoryRequest['action'],
      };
      if (action.binderId) {
        request.binderId = action.binderId;
      }
      return request;
    }
    case 'availability':
      return {
        ...base,
        action: 'SET_AVAILABILITY' as BulkInventoryRequest['action'],
        availability: action.availability as BulkInventoryRequest['availability'],
      };
    case 'confirm':
      return { ...base, action: 'CONFIRM' as BulkInventoryRequest['action'] };
    case 'delete':
      return { ...base, action: 'DELETE' as BulkInventoryRequest['action'] };
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
      if (action.visibility === 'TEMPORARILY_PUBLIC') {
        return `${subject} ${verb} now public for ${temporaryDurationLabel(action.duration ?? '24h')}.`;
      }
      return `${subject} ${verb} now ${VISIBILITY_INFO[action.visibility].label.toLowerCase()}.`;
    case 'move':
      return action.binderId
        ? `${subject} moved to “${action.binderName ?? 'the binder'}”.`
        : `${subject} moved out of their binder.`;
    case 'availability':
      return `${subject} set to ${AVAILABILITIES[action.availability].label.toLowerCase()}.`;
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
