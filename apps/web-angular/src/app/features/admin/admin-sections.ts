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

/** Every admin console section from the product spec (IMPLEMENTATION_STATUS.md, Phase 7). */
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
  { id: 'listings', label: 'Listings', icon: 'style', path: 'listings', phase: 3, area: 'admin' },
  { id: 'binders', label: 'Binders', icon: 'menu_book', path: 'binders', phase: 3, area: 'admin' },
  { id: 'games', label: 'Games', icon: 'playing_cards', path: 'games', phase: 2, area: 'admin' },
  { id: 'cards', label: 'Cards', icon: 'view_carousel', path: 'cards', phase: 2, area: 'admin' },
  {
    id: 'community',
    label: 'Community',
    icon: 'forum',
    path: 'community',
    phase: 5,
    area: 'moderation',
  },
  { id: 'reports', label: 'Reports', icon: 'flag', path: 'reports', phase: 7, area: 'moderation' },
  {
    id: 'moderation',
    label: 'Moderation',
    icon: 'shield',
    path: 'moderation',
    phase: 7,
    area: 'moderation',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: 'receipt_long',
    path: 'transactions',
    phase: 8,
    area: 'admin',
  },
  { id: 'disputes', label: 'Disputes', icon: 'gavel', path: 'disputes', phase: 9, area: 'admin' },
  {
    id: 'payments',
    label: 'Payments',
    icon: 'payments',
    path: 'payments',
    phase: 9,
    area: 'admin',
  },
  { id: 'ratings', label: 'Ratings', icon: 'star', path: 'ratings', phase: 7, area: 'moderation' },
  { id: 'ads', label: 'Ads', icon: 'campaign', path: 'ads', phase: 10, area: 'admin' },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    icon: 'workspace_premium',
    path: 'subscriptions',
    phase: 10,
    area: 'admin',
  },
  {
    id: 'usage-limits',
    label: 'Usage limits',
    icon: 'speed',
    path: 'usage-limits',
    phase: 10,
    area: 'admin',
  },
  { id: 'credits', label: 'Credits', icon: 'toll', path: 'credits', phase: 10, area: 'admin' },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: 'notifications',
    path: 'notifications',
    phase: 6,
    area: 'admin',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: 'monitoring',
    path: 'analytics',
    phase: 12,
    area: 'admin',
  },
  {
    id: 'auto-delist-rules',
    label: 'Auto-delist rules',
    icon: 'auto_delete',
    path: 'auto-delist-rules',
    phase: 7,
    area: 'admin',
  },
  {
    id: 'feature-flags',
    label: 'Feature flags',
    icon: 'toggle_on',
    path: 'feature-flags',
    phase: 7,
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
    phase: 13,
    area: 'admin',
  },
];
