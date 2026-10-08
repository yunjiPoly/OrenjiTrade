export type LastActiveBucket = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LONGER_AGO' | 'HIDDEN';

export const LAST_ACTIVE_LABELS: Record<LastActiveBucket, string> = {
  TODAY: 'Active today',
  THIS_WEEK: 'Active this week',
  THIS_MONTH: 'Active this month',
  LONGER_AGO: 'Active a while ago',
  HIDDEN: 'Activity hidden',
};

/** Maps a last-active bucket to the freshness palette (fresh / aging / stale / hidden). */
export function lastActiveTone(bucket: string): 'fresh' | 'aging' | 'stale' | 'hidden' {
  switch (bucket) {
    case 'TODAY':
    case 'THIS_WEEK':
      return 'fresh';
    case 'THIS_MONTH':
      return 'aging';
    case 'LONGER_AGO':
      return 'stale';
    default:
      return 'hidden';
  }
}

/** Initials for avatars: first letters of the first two words, or of the handle. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}
