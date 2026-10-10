import type { AnalyticsSummary } from '@orenji/api-client';

/** Readable names of the analytics event types (unknown ones are shown with spaces). */
export const EVENT_LABELS: Record<string, string> = {
  search_performed: 'Searches',
  search_no_results: 'Searches without results',
  card_viewed: 'Card views',
  collector_viewed: 'Profile views',
  binder_viewed: 'Binder views',
  message_sent: 'Messages sent',
  community_post_created: 'Community posts',
  wishlist_item_created: 'Wishes added',
  collector_reported: 'Collector reports',
  rating_submitted: 'Ratings',
  user_signed_up: 'Sign-ups',
};

export function eventLabel(type: string): string {
  if (EVENT_LABELS[type]) {
    return EVENT_LABELS[type];
  }
  const words = type.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface EventTotal {
  type: string;
  label: string;
  count: number;
  /** Width of the bar relative to the largest total (0–100). */
  percent: number;
}

/** Totals per event type, largest first. */
export function eventTotals(summary: AnalyticsSummary | null): EventTotal[] {
  const entries = Object.entries(summary?.totals ?? {}).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const max = Math.max(1, ...entries.map(([, count]) => count));
  return entries.map(([type, count]) => ({
    type,
    label: eventLabel(type),
    count,
    percent: (count / max) * 100,
  }));
}

export interface DayTotal {
  day: string;
  count: number;
  percent: number;
}

/** Every day of the period (`from`..`to`, inclusive) with its event count, oldest first. */
export function dailyTotals(summary: AnalyticsSummary | null): DayTotal[] {
  if (!summary) {
    return [];
  }
  const counts = new Map<string, number>();
  for (const entry of summary.daily ?? []) {
    counts.set(entry.day, (counts.get(entry.day) ?? 0) + entry.count);
  }
  const days: string[] = [];
  const start = Date.parse(`${summary.from}T00:00:00Z`);
  const end = Date.parse(`${summary.to}T00:00:00Z`);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    for (let time = start; time <= end && days.length < 366; time += 86_400_000) {
      days.push(new Date(time).toISOString().slice(0, 10));
    }
  } else {
    days.push(...[...counts.keys()].sort());
  }
  const max = Math.max(1, ...days.map((day) => counts.get(day) ?? 0));
  return days.map((day) => {
    const count = counts.get(day) ?? 0;
    return { day, count, percent: (count / max) * 100 };
  });
}
