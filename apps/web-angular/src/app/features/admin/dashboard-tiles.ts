import type { AdminDashboard } from '@orenji/api-client';

/** One number of the admin dashboard with where it leads. */
export interface DashboardTile {
  id: string;
  label: string;
  icon: string;
  value: number;
  hint: string;
  /** Needs attention (non-zero queue, failures). */
  alert: boolean;
  link: { path: string; query?: Record<string, string> } | null;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Tiles of `GET /admin/dashboard` (administrators). */
export function adminDashboardTiles(d: AdminDashboard): DashboardTile[] {
  return [
    {
      id: 'reports',
      label: 'Open reports',
      icon: 'flag',
      value: d.openReports,
      hint: `${d.unassignedReports} unassigned`,
      alert: d.openReports > 0,
      link: { path: '/admin/reports', query: { status: 'OPEN' } },
    },
    {
      id: 'flags',
      label: 'Moderation flags',
      icon: 'shield',
      value: d.openModerationFlags,
      hint: 'Waiting for a moderator',
      alert: d.openModerationFlags > 0,
      link: { path: '/admin/moderation', query: { tab: 'flags' } },
    },
    {
      id: 'accounts',
      label: 'Accounts',
      icon: 'group',
      value: d.users.total,
      hint: `${d.users.active} active · ${d.users.suspended} suspended · ${d.users.new7d} new this week`,
      alert: false,
      link: { path: '/admin/users' },
    },
    {
      id: 'active',
      label: 'Active collectors (7 days)',
      icon: 'bolt',
      value: d.activeCollectors7d,
      hint: 'Signed in during the last week',
      alert: false,
      link: null,
    },
    {
      id: 'listings',
      label: 'Public listings',
      icon: 'style',
      value: d.publicItems,
      hint: plural(d.publicBinders, 'public binder'),
      alert: false,
      link: { path: '/admin/listings', query: { tab: 'all' } },
    },
    {
      id: 'stale',
      label: 'Stale or hidden listings',
      icon: 'hourglass_bottom',
      value: d.staleItems + d.hiddenItems,
      hint: `${d.staleItems} stale · ${d.hiddenItems} hidden`,
      alert: false,
      link: { path: '/admin/listings' },
    },
    {
      id: 'paused',
      label: 'Collectors with paused listings',
      icon: 'pause_circle',
      value: d.ownersWithPausedListings,
      hint: 'Unresponsive or under review',
      alert: false,
      link: null,
    },
    {
      id: 'notifications',
      label: 'Failed notifications (24 h)',
      icon: 'notifications_off',
      value: d.notificationsFailed24h,
      hint: 'Push or e-mail deliveries that failed',
      alert: d.notificationsFailed24h > 0,
      link: { path: '/admin/notifications' },
    },
    {
      id: 'disputes',
      label: 'Open disputes',
      icon: 'gavel',
      value: d.openDisputes,
      hint: 'Payment protection arrives in Phase 9',
      alert: d.openDisputes > 0,
      link: null,
    },
    {
      id: 'webhooks',
      label: 'Webhook failures (24 h)',
      icon: 'webhook',
      value: d.webhookFailures24h,
      hint: 'Payment webhooks arrive in Phase 9',
      alert: d.webhookFailures24h > 0,
      link: null,
    },
  ];
}

/** Counts a moderator can read (reports and flags only). */
export interface ModeratorCounts {
  open: number;
  underReview: number;
  flags: number;
}

export function moderatorDashboardTiles(counts: ModeratorCounts): DashboardTile[] {
  return [
    {
      id: 'reports',
      label: 'Open reports',
      icon: 'flag',
      value: counts.open,
      hint: 'Waiting for a moderator',
      alert: counts.open > 0,
      link: { path: '/admin/reports', query: { status: 'OPEN' } },
    },
    {
      id: 'review',
      label: 'Under review',
      icon: 'assignment_ind',
      value: counts.underReview,
      hint: 'Assigned and in progress',
      alert: false,
      link: { path: '/admin/reports', query: { status: 'UNDER_REVIEW' } },
    },
    {
      id: 'flags',
      label: 'Moderation flags',
      icon: 'shield',
      value: counts.flags,
      hint: 'Raised by the automatic rules',
      alert: counts.flags > 0,
      link: { path: '/admin/moderation', query: { tab: 'flags' } },
    },
  ];
}
