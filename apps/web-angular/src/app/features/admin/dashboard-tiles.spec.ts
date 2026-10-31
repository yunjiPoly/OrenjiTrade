import type { AdminDashboard } from '@orenji/api-client';
import {
  cacheMeterLine,
  collectorTiles,
  moderatorTiles,
  needsAPersonTiles,
  underReviewLine,
} from './dashboard-tiles';

const DASHBOARD: AdminDashboard = {
  generatedAt: '2026-10-30T12:00:00Z',
  users: { total: 64, active: 61, suspended: 1, new7d: 5 },
  activeCollectors7d: 23,
  publicItems: 1286,
  publicBinders: 41,
  openReports: 5,
  unassignedReports: 2,
  openModerationFlags: 2,
  staleItems: 35,
  hiddenItems: 6,
  ownersWithPausedListings: 2,
  openDisputes: 1,
  notificationsFailed24h: 0,
  webhookFailures24h: 0,
};

describe('Overview tiles (spec 15.3)', () => {
  it('counts what needs a person, Open and Under review together, amber when waiting', () => {
    const tiles = needsAPersonTiles(DASHBOARD, false);
    expect(tiles.map((tile) => tile.id)).toEqual(['reports', 'flags', 'listings', 'notifications']);
    expect(tiles[0]).toMatchObject({
      label: 'Open reports',
      value: 5,
      hint: '2 unassigned · 3 under review',
      alert: true,
      link: { label: 'Review reports', path: '/admin/reports' },
    });
    expect(tiles[2]).toMatchObject({ value: 41, hint: '35 stale · 6 hidden', alert: true });
    expect(tiles[3]).toMatchObject({
      value: 0,
      hint: 'Last 24 hours · every notice was delivered',
      alert: false,
    });
  });

  it('shows the disputes and webhook tiles only while protectedPayments is on', () => {
    expect(needsAPersonTiles(DASHBOARD, true).map((tile) => tile.id)).toEqual([
      'reports',
      'flags',
      'listings',
      'notifications',
      'disputes',
      'webhooks',
    ]);
  });

  it('describes the collectors, deletion pending included', () => {
    const tiles = collectorTiles(DASHBOARD);
    expect(tiles[0].hint).toBe('61 active · 1 suspended · 2 deletion pending · 5 new this week');
    expect(tiles[2].hint).toBe('In 41 public binders');
    expect(tiles.every((tile) => !tile.alert)).toBe(true);
  });

  it("gives a moderator the team's queues, counted like the admin's", () => {
    const tiles = moderatorTiles(
      { reports: 5, unassigned: 2, underReview: 3, flags: 2 },
      '2 with you · 1 with @alex_m',
    );
    expect(tiles.map((tile) => [tile.label, tile.value])).toEqual([
      ['Open reports', 5],
      ['Under review', 3],
      ['Open flags', 2],
    ]);
    expect(tiles[0].hint).toBe('2 unassigned · 3 under review');
    expect(tiles[1].link?.query).toEqual({ status: 'UNDER_REVIEW' });
  });

  it('says who holds the reports under review, the caller first', () => {
    expect(underReviewLine(['jun_p', 'alex_m', 'jun_p', null], 'jun_p')).toBe(
      '2 with you · 1 with @alex_m',
    );
    expect(underReviewLine(['alex_m'], 'jun_p')).toBe('1 with @alex_m');
    expect(underReviewLine([], 'jun_p')).toBe('Nobody is reviewing a report');
  });

  it('reads the card image cache in MB', () => {
    expect(cacheMeterLine(3412.6, 5120)).toBe('3,413 of 5,120 MB');
  });
});
