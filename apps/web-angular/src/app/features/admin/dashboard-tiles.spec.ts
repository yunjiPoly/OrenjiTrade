import type { AdminDashboard } from '@orenji/api-client';
import { adminDashboardTiles, moderatorDashboardTiles } from './dashboard-tiles';

const DASHBOARD: AdminDashboard = {
  generatedAt: '2026-09-30T12:00:00Z',
  users: { total: 120, active: 118, suspended: 2, new7d: 9 },
  activeCollectors7d: 64,
  publicItems: 310,
  publicBinders: 1,
  openReports: 3,
  unassignedReports: 2,
  openModerationFlags: 0,
  staleItems: 4,
  hiddenItems: 1,
  ownersWithPausedListings: 1,
  openDisputes: 0,
  notificationsFailed24h: 0,
  webhookFailures24h: 0,
};

describe('dashboard tiles', () => {
  it('turns the admin dashboard into linked tiles that flag work waiting', () => {
    const tiles = adminDashboardTiles(DASHBOARD);
    const byId = Object.fromEntries(tiles.map((tile) => [tile.id, tile]));
    expect(byId['reports']).toMatchObject({
      value: 3,
      hint: '2 unassigned',
      alert: true,
      link: { path: '/admin/reports', query: { status: 'OPEN' } },
    });
    expect(byId['flags'].alert).toBe(false);
    expect(byId['accounts'].hint).toBe('118 active · 2 suspended · 9 new this week');
    expect(byId['listings'].hint).toBe('1 public binder');
    expect(byId['stale']).toMatchObject({ value: 5, hint: '4 stale · 1 hidden' });
    expect(byId['disputes'].hint).toContain('Phase 9');
    expect(tiles).toHaveLength(10);
  });

  it('gives moderators their queues only', () => {
    const tiles = moderatorDashboardTiles({ open: 2, underReview: 1, flags: 0 });
    expect(tiles.map((tile) => [tile.id, tile.value, tile.alert])).toEqual([
      ['reports', 2, true],
      ['review', 1, false],
      ['flags', 0, false],
    ]);
  });
});
