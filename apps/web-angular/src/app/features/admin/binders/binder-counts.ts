/**
 * Board A10's count line after the total: "42 public · 3 temporarily public · 14 private" (web
 * stage WH2 review fix 2), each visibility's count read with the page's other filters. A
 * visibility without binders still shows ("0 private"); nothing when a count is missing.
 */
export function visibilityBreakdown(
  counts: readonly { visibility: string; count: number }[],
): string {
  const words: Record<string, string> = {
    PUBLIC: 'public',
    TEMPORARILY_PUBLIC: 'temporarily public',
    PRIVATE: 'private',
  };
  if (counts.length === 0 || counts.some((entry) => !Number.isFinite(entry.count))) {
    return '';
  }
  return counts
    .map(
      (entry) =>
        `${entry.count.toLocaleString('en-US')} ${words[entry.visibility] ?? entry.visibility.toLowerCase()}`,
    )
    .join(' · ');
}
