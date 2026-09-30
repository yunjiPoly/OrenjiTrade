export interface AdminSection {
  id: string;
  label: string;
  icon: string;
  /** Path relative to `/admin`. */
  path: string;
  /** Roadmap phase that delivers the section; `null` when it already exists. */
  phase: number | null;
  /** `moderation` sections are open to moderators; `admin` ones to ADMIN/SUPER_ADMIN only. */
  area: 'admin' | 'moderation';
}

/**
 * Every admin console section from the product spec (Phase 7 contract). Sections whose phase is
 * still ahead stay listed but disabled until their phase lands; transactions, disputes and
 * payments arrived with Phase 9, ads, subscriptions, plans, credits and donations with Phase 10.
 */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    path: '',
    phase: null,
    area: 'moderation',
  },
  { id: 'users', label: 'Users', icon: 'group', path: 'users', phase: null, area: 'admin' },
  {
    id: 'listings',
    label: 'Listings',
    icon: 'style',
    path: 'listings',
    phase: null,
    area: 'admin',
  },
  {
    id: 'binders',
    label: 'Binders',
    icon: 'menu_book',
    path: 'binders',
    phase: null,
    area: 'admin',
  },
  { id: 'games', label: 'Games', icon: 'playing_cards', path: 'games', phase: null, area: 'admin' },
  { id: 'cards', label: 'Cards', icon: 'view_carousel', path: 'cards', phase: null, area: 'admin' },
  {
    id: 'community',
    label: 'Community',
    icon: 'forum',
    path: 'community',
    phase: null,
    area: 'moderation',
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: 'flag',
    path: 'reports',
    phase: null,
    area: 'moderation',
  },
  {
    id: 'moderation',
    label: 'Moderation',
    icon: 'shield',
    path: 'moderation',
    phase: null,
    area: 'moderation',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: 'receipt_long',
    path: 'transactions',
    phase: null,
    area: 'admin',
  },
  {
    id: 'disputes',
    label: 'Disputes',
    icon: 'gavel',
    path: 'disputes',
    phase: null,
    area: 'admin',
  },
  {
    id: 'payments',
    label: 'Payments',
    icon: 'payments',
    path: 'payments',
    phase: null,
    area: 'admin',
  },
  {
    id: 'ratings',
    label: 'Ratings',
    icon: 'star',
    path: 'ratings',
    phase: null,
    area: 'moderation',
  },
  { id: 'ads', label: 'Ads', icon: 'campaign', path: 'ads', phase: null, area: 'admin' },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    icon: 'workspace_premium',
    path: 'subscriptions',
    phase: null,
    area: 'admin',
  },
  { id: 'plans', label: 'Plans', icon: 'sell', path: 'plans', phase: null, area: 'admin' },
  {
    id: 'usage-limits',
    label: 'Usage limits',
    icon: 'speed',
    path: 'usage-limits',
    phase: null,
    area: 'admin',
  },
  { id: 'credits', label: 'Credits', icon: 'toll', path: 'credits', phase: null, area: 'admin' },
  {
    id: 'donations',
    label: 'Donations',
    icon: 'volunteer_activism',
    path: 'donations',
    phase: null,
    area: 'admin',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: 'notifications',
    path: 'notifications',
    phase: null,
    area: 'admin',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: 'monitoring',
    path: 'analytics',
    phase: null,
    area: 'admin',
  },
  {
    id: 'auto-delist-rules',
    label: 'Auto-delist rules',
    icon: 'auto_delete',
    path: 'auto-delist-rules',
    phase: null,
    area: 'admin',
  },
  {
    id: 'feature-flags',
    label: 'Feature flags',
    icon: 'toggle_on',
    path: 'feature-flags',
    phase: null,
    area: 'admin',
  },
  {
    id: 'audit-logs',
    label: 'Audit logs',
    icon: 'history',
    path: 'audit-logs',
    phase: null,
    area: 'admin',
  },
  {
    id: 'system-health',
    label: 'System health',
    icon: 'monitor_heart',
    path: 'system-health',
    phase: null,
    area: 'admin',
  },
];
