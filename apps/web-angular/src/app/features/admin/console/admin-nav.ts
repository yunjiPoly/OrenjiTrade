import type { AdminIconName } from './admin-icon.component';

/** Who the console is for (spec 15.1): the role pill and what the nav lists. */
export type StaffRole = 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR';

/** The role pill's words. */
export const ROLE_LABELS: Record<StaffRole, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Admin',
  MODERATOR: 'Moderator',
};

/** The highest staff role of a set of roles, or `null` for a collector. */
export function staffRoleOf(roles: readonly string[]): StaffRole | null {
  if (roles.includes('SUPER_ADMIN')) {
    return 'SUPER_ADMIN';
  }
  if (roles.includes('ADMIN')) {
    return 'ADMIN';
  }
  return roles.includes('MODERATOR') ? 'MODERATOR' : null;
}

/** A queue whose open count the nav shows (from the Overview's call, refreshed with it). */
export type AdminCountKey = 'reports' | 'flags';

/** One item of the console's nav. */
export interface AdminNavItem {
  id: string;
  label: string;
  icon: AdminIconName;
  /** Path relative to `/admin` (`''` is the Overview). */
  path: string;
  /** Moderators open the Overview and the MODERATION group; the rest is ADMIN and SUPER_ADMIN's. */
  moderators: boolean;
  count?: AdminCountKey;
}

/** A group of the nav, under its header (none for the Overview). */
export interface AdminNavGroup {
  id: string;
  label: string | null;
  items: readonly AdminNavItem[];
}

/**
 * The nav of spec 15.1 (board A1), replacing the flat list of 22, with stage WH2's new pages (Card
 * data and images, Import limits). PAYMENTS shows only while the `protectedPayments` flag is on
 * (ADR 0018).
 */
export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    id: 'overview',
    label: null,
    items: [{ id: 'overview', label: 'Overview', icon: 'overview', path: '', moderators: true }],
  },
  {
    id: 'moderation',
    label: 'Moderation',
    items: [
      {
        id: 'reports',
        label: 'Reports',
        icon: 'flag',
        path: 'reports',
        moderators: true,
        count: 'reports',
      },
      {
        id: 'flags',
        label: 'Flags and rules',
        icon: 'shieldCheck',
        path: 'moderation',
        moderators: true,
        count: 'flags',
      },
      {
        id: 'community',
        label: 'Community',
        icon: 'messageSquare',
        path: 'community',
        moderators: true,
      },
      { id: 'ratings', label: 'Ratings', icon: 'star', path: 'ratings', moderators: true },
    ],
  },
  {
    id: 'collectors',
    label: 'Collectors',
    items: [
      { id: 'users', label: 'Users', icon: 'users', path: 'users', moderators: false },
      { id: 'listings', label: 'Listings', icon: 'listings', path: 'listings', moderators: false },
      { id: 'binders', label: 'Binders', icon: 'binder', path: 'binders', moderators: false },
    ],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    items: [
      { id: 'cards', label: 'Cards', icon: 'cards', path: 'cards', moderators: false },
      {
        id: 'card-data',
        label: 'Card data and images',
        icon: 'database',
        path: 'card-data',
        moderators: false,
      },
      { id: 'games', label: 'Games', icon: 'games', path: 'games', moderators: false },
    ],
  },
  {
    id: 'rules',
    label: 'Rules',
    items: [
      {
        id: 'usage-limits',
        label: 'Usage limits',
        icon: 'gauge',
        path: 'usage-limits',
        moderators: false,
      },
      {
        id: 'import-limits',
        label: 'Import limits',
        icon: 'download',
        path: 'import-limits',
        moderators: false,
      },
      {
        id: 'wishlist',
        label: 'Wishlist terms',
        icon: 'heart',
        path: 'wishlist',
        moderators: false,
      },
      {
        id: 'auto-delist',
        label: 'Auto-delist',
        icon: 'clock',
        path: 'auto-delist-rules',
        moderators: false,
      },
      {
        id: 'feature-flags',
        label: 'Feature flags',
        icon: 'toggle',
        path: 'feature-flags',
        moderators: false,
      },
      { id: 'regions', label: 'Regions', icon: 'globe', path: 'regions', moderators: false },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      {
        id: 'notifications',
        label: 'Notifications',
        icon: 'bell',
        path: 'notifications',
        moderators: false,
      },
      {
        id: 'system-health',
        label: 'System health',
        icon: 'activity',
        path: 'system-health',
        moderators: false,
      },
      { id: 'analytics', label: 'Analytics', icon: 'chart', path: 'analytics', moderators: false },
      {
        id: 'audit-logs',
        label: 'Audit log',
        icon: 'history',
        path: 'audit-logs',
        moderators: false,
      },
    ],
  },
  {
    id: 'payments',
    label: 'Payments',
    items: [
      {
        id: 'transactions',
        label: 'Transactions',
        icon: 'receipt',
        path: 'transactions',
        moderators: false,
      },
      { id: 'disputes', label: 'Disputes', icon: 'gavel', path: 'disputes', moderators: false },
      { id: 'payments', label: 'Payments', icon: 'card', path: 'payments', moderators: false },
    ],
  },
];

/**
 * The nav a staff member sees: moderators the Overview and the four MODERATION items (5 in all);
 * administrators every group, PAYMENTS only while `protectedPayments` is on.
 */
export function adminNavFor(role: StaffRole | null, paymentsOn: boolean): AdminNavGroup[] {
  if (!role) {
    return [];
  }
  const admin = role !== 'MODERATOR';
  return ADMIN_NAV.filter((group) => group.id !== 'payments' || (admin && paymentsOn))
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => admin || item.moderators),
    }))
    .filter((group) => group.items.length > 0);
}

/** "5 open" for a nav count, read after the item's label. */
export function openCountLabel(count: number): string {
  return `${count} open`;
}
