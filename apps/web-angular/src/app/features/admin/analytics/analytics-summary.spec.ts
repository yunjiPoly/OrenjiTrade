import type { AnalyticsSummary } from '@orenji/api-client';
import { dailyTotals, eventLabel, eventTotals } from './analytics-summary';

const SUMMARY: AnalyticsSummary = {
  source: 'local-aggregate',
  transport: 'log',
  from: '2026-09-28',
  to: '2026-09-30',
  total: 9,
  totals: { search_performed: 4, card_viewed: 4, collector_reported: 1 },
  daily: [
    { day: '2026-09-28', eventType: 'search_performed', count: 2 },
    { day: '2026-09-30', eventType: 'search_performed', count: 2 },
    { day: '2026-09-30', eventType: 'card_viewed', count: 4 },
    { day: '2026-09-30', eventType: 'collector_reported', count: 1 },
  ],
};

describe('analytics summary', () => {
  it('names events, known or not', () => {
    expect(eventLabel('card_viewed')).toBe('Card views');
    expect(eventLabel('offer_created')).toBe('Offer created');
  });

  it('sorts totals and scales them to the largest', () => {
    expect(eventTotals(SUMMARY).map((total) => [total.label, total.count, total.percent])).toEqual([
      ['Card views', 4, 100],
      ['Searches', 4, 100],
      ['Collector reports', 1, 25],
    ]);
    expect(eventTotals(null)).toEqual([]);
  });

  it('fills every day of the period, including empty ones', () => {
    expect(dailyTotals(SUMMARY).map((day) => [day.day, day.count])).toEqual([
      ['2026-09-28', 2],
      ['2026-09-29', 0],
      ['2026-09-30', 7],
    ]);
    expect(dailyTotals(SUMMARY)[2].percent).toBe(100);
    expect(dailyTotals(null)).toEqual([]);
  });
});
