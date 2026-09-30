import { relativeTime, updatedRelativeTime } from '@/src/lib/relativeTime';

const NOW = new Date('2026-09-29T12:00:00Z');
const minutes = (n: number) => new Date(NOW.getTime() - n * 60_000);
const hours = (n: number) => minutes(n * 60);
const days = (n: number) => hours(n * 24);

describe('relativeTime', () => {
  it('reports "just now" for anything under 45 seconds', () => {
    expect(relativeTime(NOW, NOW)).toBe('just now');
    expect(relativeTime(new Date(NOW.getTime() - 30_000), NOW)).toBe('just now');
  });

  it('formats minutes, hours, days, weeks, months and years with correct plurals', () => {
    expect(relativeTime(minutes(1), NOW)).toBe('1 minute ago');
    expect(relativeTime(minutes(12), NOW)).toBe('12 minutes ago');
    expect(relativeTime(hours(1), NOW)).toBe('1 hour ago');
    expect(relativeTime(hours(3), NOW)).toBe('3 hours ago');
    expect(relativeTime(days(1), NOW)).toBe('1 day ago');
    expect(relativeTime(days(6), NOW)).toBe('6 days ago');
    expect(relativeTime(days(14), NOW)).toBe('2 weeks ago');
    expect(relativeTime(days(45), NOW)).toBe('2 months ago' /* 45d / 30d rounds to 2 */);
    expect(relativeTime(days(400), NOW)).toBe('1 year ago');
  });

  it('accepts ISO strings and epoch milliseconds', () => {
    expect(relativeTime('2026-09-29T09:00:00Z', NOW)).toBe('3 hours ago');
    expect(relativeTime(NOW.getTime() - 2 * 3_600_000, NOW.getTime())).toBe('2 hours ago');
  });

  it('describes future instants', () => {
    expect(relativeTime(new Date(NOW.getTime() + 2 * 86_400_000), NOW)).toBe('in 2 days');
  });

  it('degrades gracefully on invalid dates', () => {
    expect(relativeTime('not-a-date', NOW)).toBe('unknown');
  });

  it('builds the "Updated ..." caption', () => {
    expect(updatedRelativeTime(hours(3), NOW)).toBe('Updated 3 hours ago');
  });
});
