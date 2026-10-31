import type { InventoryItemResponse } from '@orenji/api-client';
import { VisibilityTag } from '../data/visibility-status';

/** A card as the table and the grid render it (spec 9.4 and 9.5). */
export interface InventoryRow {
  item: InventoryItemResponse;
  tag: VisibilityTag;
  /** The binder's name, or null when unfiled. */
  binderName: string | null;
  /** "$11.50", "85% TCG", the old text, or null ("No price"). */
  price: string | null;
  /** "2 h", "5 d", "3 w". */
  age: string;
  /** `aging` or `stale` (a dot beside the age), else null. */
  dot: 'aging' | 'stale' | null;
  selected: boolean;
  busy: boolean;
  /** Just added or restored: a 1.5 s tint. */
  highlighted: boolean;
  /** Just saved inline: a teal check for 600 ms. */
  saved: boolean;
}

export interface QuantityChange {
  item: InventoryItemResponse;
  quantity: number;
}

export interface SelectionChange {
  id: string;
  selected: boolean;
  /** Shift+click: every card since the last one clicked. */
  range?: boolean;
}

/** An action of a row's "⋯" menu (spec 9.4) or of a tile's. */
export type RowAction =
  | { kind: 'edit'; item: InventoryItemResponse }
  | { kind: 'move'; item: InventoryItemResponse; binderId: string | null }
  | { kind: 'visibility'; item: InventoryItemResponse; visibility: 'PRIVATE' | 'PUBLIC' }
  | { kind: 'confirm'; item: InventoryItemResponse }
  | { kind: 'delete'; item: InventoryItemResponse };

/** "now", "5 min", "2 h", "3 d", "5 w", "4 mo", "2 y": the table's Updated column. */
export function shortAge(iso: string | null | undefined, now = Date.now()): string {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(at)) {
    return '';
  }
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 28) {
    return days < 14 ? `${days} d` : `${Math.floor(days / 7)} w`;
  }
  const months = Math.floor(days / 30);
  return months < 12 ? `${Math.max(1, months)} mo` : `${Math.floor(days / 365)} y`;
}

/** The spoken form of {@link shortAge} ("2 h" -> "2 hours ago"). */
export function spokenAge(age: string): string {
  const match = /^(\d+) (min|h|d|w|mo|y)$/.exec(age);
  if (!match) {
    return age === 'now' ? 'just now' : age;
  }
  const count = Number(match[1]);
  const unit = { min: 'minute', h: 'hour', d: 'day', w: 'week', mo: 'month', y: 'year' }[
    match[2] as 'min' | 'h' | 'd' | 'w' | 'mo' | 'y'
  ];
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}
