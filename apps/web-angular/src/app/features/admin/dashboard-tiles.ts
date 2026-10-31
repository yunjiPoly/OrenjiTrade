import type { AdminDashboard } from '@orenji/api-client';
import type { AdminIconName } from './console/admin-icon.component';
import type { QueueCounts } from './console/admin-counts.service';

/** One number of the Overview with where it leads (spec 15.3, boards A1 and A24). */
export interface DashboardTile {
  id: string;
  label: string;
  icon: AdminIconName;
  value: number;
  hint: string;
  /** A queue with work waiting: the amber tile. */
  alert: boolean;
  link: { label: string; path: string; query?: Record<string, string> } | null;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "2 unassigned · 3 under review" */
export function reportsHint(counts: QueueCounts): string {
  return `${counts.unassigned} unassigned · ${counts.underReview} under review`;
}

/**
 * "Needs a person" (A1): Open reports (Open and Under review together), Open flags, Listings to
 * review (stale and hidden), Failed notifications (24 h); Open disputes and Webhook failures only
 * while `protectedPayments` is on. Non-zero queues get the amber tile.
 */
export function needsAPersonTiles(d: AdminDashboard, paymentsOn: boolean): DashboardTile[] {
  const reports: QueueCounts = {
    reports: d.openReports,
    unassigned: d.unassignedReports,
    underReview: Math.max(0, d.openReports - d.unassignedReports),
    flags: d.openModerationFlags,
  };
  const review = d.staleItems + d.hiddenItems;
  const tiles: DashboardTile[] = [
    {
      id: 'reports',
      label: 'Open reports',
      icon: 'flag',
      value: d.openReports,
      hint: reportsHint(reports),
      alert: d.openReports > 0,
      link: { label: 'Review reports', path: '/admin/reports' },
    },
    {
      id: 'flags',
      label: 'Open flags',
      icon: 'shieldCheck',
      value: d.openModerationFlags,
      hint: 'Raised by the automatic rules',
      alert: d.openModerationFlags > 0,
      link: { label: 'Review flags', path: '/admin/moderation' },
    },
    {
      id: 'listings',
      label: 'Listings to review',
      icon: 'listings',
      value: review,
      hint: `${d.staleItems} stale · ${d.hiddenItems} hidden`,
      alert: review > 0,
      link: { label: 'Review listings', path: '/admin/listings' },
    },
    {
      id: 'notifications',
      label: 'Failed notifications',
      icon: 'bell',
      value: d.notificationsFailed24h,
      hint:
        d.notificationsFailed24h === 0
          ? 'Last 24 hours · every notice was delivered'
          : 'Last 24 hours · push or email deliveries that failed',
      alert: d.notificationsFailed24h > 0,
      link: { label: 'Notifications', path: '/admin/notifications' },
    },
  ];
  if (paymentsOn) {
    tiles.push(
      {
        id: 'disputes',
        label: 'Open disputes',
        icon: 'gavel',
        value: d.openDisputes,
        hint: 'Payouts on hold until an admin decides',
        alert: d.openDisputes > 0,
        link: { label: 'Disputes', path: '/admin/disputes', query: { status: 'OPEN' } },
      },
      {
        id: 'webhooks',
        label: 'Webhook failures',
        icon: 'activity',
        value: d.webhookFailures24h,
        hint: 'Last 24 hours · refused signatures or failed processing',
        alert: d.webhookFailures24h > 0,
        link: {
          label: 'Webhook events',
          path: '/admin/payments/webhooks',
          query: { status: 'FAILED' },
        },
      },
    );
  }
  return tiles;
}

/** "Collectors" (A1): accounts, active collectors, public listings, paused listings. */
export function collectorTiles(d: AdminDashboard): DashboardTile[] {
  const pending = Math.max(0, d.users.total - d.users.active - d.users.suspended);
  return [
    {
      id: 'accounts',
      label: 'Accounts',
      icon: 'users',
      value: d.users.total,
      hint: `${d.users.active} active · ${d.users.suspended} suspended · ${pending} deletion pending · ${d.users.new7d} new this week`,
      alert: false,
      link: { label: 'Users', path: '/admin/users' },
    },
    {
      id: 'active',
      label: 'Active collectors',
      icon: 'activity',
      value: d.activeCollectors7d,
      hint: 'Signed in during the last 7 days',
      alert: false,
      link: null,
    },
    {
      id: 'public',
      label: 'Public listings',
      icon: 'listings',
      value: d.publicItems,
      hint: `In ${plural(d.publicBinders, 'public binder')}`,
      alert: false,
      link: { label: 'Listings', path: '/admin/listings', query: { tab: 'all' } },
    },
    {
      id: 'paused',
      label: 'Paused listings',
      icon: 'clock',
      value: d.ownersWithPausedListings,
      hint: 'Collectors whose public cards are paused: unanswered chats or a report under review',
      alert: false,
      link: null,
    },
  ];
}

/** "Waiting for the team" (A24): a moderator's queues, counted like A1. */
export function moderatorTiles(counts: QueueCounts, underReviewLine: string): DashboardTile[] {
  return [
    {
      id: 'reports',
      label: 'Open reports',
      icon: 'flag',
      value: counts.reports,
      hint: reportsHint(counts),
      alert: counts.reports > 0,
      link: { label: 'Review reports', path: '/admin/reports' },
    },
    {
      id: 'review',
      label: 'Under review',
      icon: 'flag',
      value: counts.underReview,
      hint: underReviewLine,
      alert: false,
      link: {
        label: 'Reports under review',
        path: '/admin/reports',
        query: { status: 'UNDER_REVIEW' },
      },
    },
    {
      id: 'flags',
      label: 'Open flags',
      icon: 'shieldCheck',
      value: counts.flags,
      hint: 'Raised by the automatic rules',
      alert: counts.flags > 0,
      link: { label: 'Review flags', path: '/admin/moderation' },
    },
  ];
}

/**
 * "2 with you · 1 with @alex_m": who holds the reports under review, the caller first, then by
 * count; "Nobody yet" when none.
 */
export function underReviewLine(
  assignees: readonly (string | null | undefined)[],
  myHandle: string | null,
): string {
  const counts = new Map<string, number>();
  for (const handle of assignees) {
    if (handle) {
      counts.set(handle, (counts.get(handle) ?? 0) + 1);
    }
  }
  if (counts.size === 0) {
    return 'Nobody is reviewing a report';
  }
  const mine = myHandle ? (counts.get(myHandle) ?? 0) : 0;
  const others = [...counts.entries()]
    .filter(([handle]) => handle !== myHandle)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const parts = [];
  if (mine > 0) {
    parts.push(`${mine} with you`);
  }
  for (const [handle, count] of others) {
    parts.push(`${count} with @${handle}`);
  }
  return parts.join(' · ');
}

/** "3,413 of 5,120 MB" */
export function cacheMeterLine(usedMb: number, limitMb: number): string {
  const format = (value: number) => Math.round(value).toLocaleString('en-US');
  return `${format(usedMb)} of ${format(limitMb)} MB`;
}
