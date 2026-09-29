import { TestBed } from '@angular/core/testing';
import { RelativeTimePipe, formatRelativeTime } from './relative-time.pipe';

const NOW = new Date('2026-09-29T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe('formatRelativeTime', () => {
  it('says "just now" for timestamps within 45 seconds', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 10_000), NOW)).toBe('just now');
    expect(formatRelativeTime(NOW, NOW)).toBe('just now');
  });

  it('formats minutes, hours and days in the past', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 5 * 60_000), NOW)).toBe('5 minutes ago');
    expect(formatRelativeTime(hoursAgo(3), NOW)).toBe('3 hours ago');
    expect(formatRelativeTime(hoursAgo(24), NOW)).toBe('yesterday');
    expect(formatRelativeTime(hoursAgo(24 * 3), NOW)).toBe('3 days ago');
  });

  it('formats weeks, months and years', () => {
    expect(formatRelativeTime(hoursAgo(24 * 14), NOW)).toBe('2 weeks ago');
    expect(formatRelativeTime(hoursAgo(24 * 61), NOW)).toBe('2 months ago');
    expect(formatRelativeTime(hoursAgo(24 * 365 * 2), NOW)).toBe('2 years ago');
  });

  it('formats the future', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() + 2 * 3_600_000), NOW)).toBe('in 2 hours');
  });

  it('accepts ISO strings and epoch numbers', () => {
    expect(formatRelativeTime(hoursAgo(3).toISOString(), NOW)).toBe('3 hours ago');
    expect(formatRelativeTime(hoursAgo(3).getTime(), NOW.getTime())).toBe('3 hours ago');
  });

  it('returns an empty string for null, undefined or invalid input', () => {
    expect(formatRelativeTime(null, NOW)).toBe('');
    expect(formatRelativeTime(undefined, NOW)).toBe('');
    expect(formatRelativeTime('not a date', NOW)).toBe('');
  });
});

describe('RelativeTimePipe', () => {
  it('uses the application locale and a fixed "now" when provided', () => {
    const pipe = TestBed.runInInjectionContext(() => new RelativeTimePipe());
    expect(pipe.transform(hoursAgo(3), NOW)).toBe('3 hours ago');
  });

  it('defaults "now" to the current time', () => {
    const pipe = TestBed.runInInjectionContext(() => new RelativeTimePipe());
    expect(pipe.transform(new Date())).toBe('just now');
  });
});
