/** File name of a data export, e.g. `orenjitrade-export-maika-2026-09-29.json` (web wording). */
export function exportFileName(handle: string | null | undefined, now: Date = new Date()): string {
  const safeHandle = (handle ?? 'account').replace(/[^a-z0-9_-]/gi, '') || 'account';
  return `orenjitrade-export-${safeHandle}-${now.toISOString().slice(0, 10)}.json`;
}
