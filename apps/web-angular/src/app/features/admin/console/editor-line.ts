/** Who changed a setting last (spec 15.8: a name, never an id). */
export interface Edited {
  updatedAt?: string | null;
  updatedByName?: string | null;
  updatedByHandle?: string | null;
  updatedBy?: string | null;
}

/** "Rosa Lima", "@rosa_l", or `null` when nobody (a default) or a gone account. */
export function editorName(edited: Edited | null | undefined): string | null {
  if (!edited?.updatedBy && !edited?.updatedByHandle) {
    return null;
  }
  return edited.updatedByName || (edited.updatedByHandle ? `@${edited.updatedByHandle}` : null);
}

function day(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * "Last changed Oct 14 by Alex Morin" (board A15), "Changed Oct 15 by Alex Morin" with
 * `prefix: 'Changed'` (board A18), "Never changed" for a default nobody touched.
 */
export function changedLine(edited: Edited | null | undefined, prefix = 'Last changed'): string {
  if (!edited?.updatedAt || (!edited.updatedBy && !edited.updatedByHandle)) {
    return prefix === 'Last changed' ? 'The defaults; nobody changed them yet.' : 'Never changed';
  }
  const name = editorName(edited);
  return name
    ? `${prefix} ${day(edited.updatedAt)} by ${name}`
    : `${prefix} ${day(edited.updatedAt)} by a deleted account`;
}
