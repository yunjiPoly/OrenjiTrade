/**
 * Selecting cards in the table or the grid (web redesign spec 9.6): checkboxes, Shift+click ranges,
 * Ctrl/Cmd+A for the loaded rows, Space or `x` on the focused row, Esc to clear. Pure rules; the
 * store keeps the set.
 */

/** The selection with one card added, removed or toggled. */
export function toggleOne(
  selection: ReadonlySet<string>,
  id: string,
  selected?: boolean,
): Set<string> {
  const next = new Set(selection);
  const add = selected ?? !next.has(id);
  if (add) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return next;
}

/**
 * Shift+click: every card between the anchor (the last card clicked) and the target, in the order
 * shown, takes the target's new state. Without an anchor on screen, only the target changes.
 */
export function selectRange(
  selection: ReadonlySet<string>,
  order: readonly string[],
  anchor: string | null,
  target: string,
  selected: boolean,
): Set<string> {
  const from = anchor ? order.indexOf(anchor) : -1;
  const to = order.indexOf(target);
  if (from < 0 || to < 0) {
    return toggleOne(selection, target, selected);
  }
  const next = new Set(selection);
  const [start, end] = from <= to ? [from, to] : [to, from];
  for (const id of order.slice(start, end + 1)) {
    if (selected) {
      next.add(id);
    } else {
      next.delete(id);
    }
  }
  return next;
}

/** Ctrl/Cmd+A: every loaded card; again when all are selected: none. */
export function selectAllLoaded(
  selection: ReadonlySet<string>,
  order: readonly string[],
): Set<string> {
  const all = order.length > 0 && order.every((id) => selection.has(id));
  return all ? new Set() : new Set(order);
}

/** The selection without the cards that are no longer loaded. */
export function pruneSelection(
  selection: ReadonlySet<string>,
  order: readonly string[],
): ReadonlySet<string> {
  const ids = new Set(order);
  const kept = [...selection].filter((id) => ids.has(id));
  return kept.length === selection.size ? selection : new Set(kept);
}

/** The id of the row the arrow keys or `j`/`k` move to from `current`. */
export function stepRow(
  order: readonly string[],
  current: string | null,
  step: 1 | -1,
): string | null {
  if (order.length === 0) {
    return null;
  }
  const at = current ? order.indexOf(current) : -1;
  if (at < 0) {
    return step === 1 ? order[0] : order[order.length - 1];
  }
  return order[Math.max(0, Math.min(order.length - 1, at + step))];
}
