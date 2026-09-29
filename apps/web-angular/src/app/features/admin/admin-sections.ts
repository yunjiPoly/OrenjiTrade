export interface AdminSection {
  id: string;
  label: string;
  icon: string;
  /** Path relative to `/admin`. */
  path: string;
  /** Roadmap phase that delivers the section; `null` when it already exists. */
  phase: number | null;
}

/** Every admin console section from the product spec (IMPLEMENTATION_STATUS.md, Phase 7). */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '', phase: null },
  { id: 'users', label: 'Users', icon: 'group', path: 'users', phase: 1 },
  { id: 'listings', label: 'Listings', icon: 'style', path: 'listings', phase: 3 },
  { id: 'binders', label: 'Binders', icon: 'menu_book', path: 'binders', phase: 3 },
  { id: 'games', label: 'Games', icon: 'playing_cards', path: 'games', phase: 2 },
  { id: 'cards', label: 'Cards', icon: 'view_carousel', path: 'cards', phase: 2 },
  { id: 'community', label: 'Community', icon: 'forum', path: 'community', phase: 5 },
  { id: 'reports', label: 'Reports', icon: 'flag', path: 'reports', phase: 7 },
  { id: 'moderation', label: 'Moderation', icon: 'shield', path: 'moderation', phase: 7 },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: 'receipt_long',
    path: 'transactions',
    phase: 8,
  },
  { id: 'disputes', label: 'Disputes', icon: 'gavel', path: 'disputes', phase: 9 },
  { id: 'payments', label: 'Payments', icon: 'payments', path: 'payments', phase: 9 },
  { id: 'ratings', label: 'Ratings', icon: 'star', path: 'ratings', phase: 7 },
  { id: 'ads', label: 'Ads', icon: 'campaign', path: 'ads', phase: 10 },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    icon: 'workspace_premium',
    path: 'subscriptions',
    phase: 10,
  },
  { id: 'usage-limits', label: 'Usage limits', icon: 'speed', path: 'usage-limits', phase: 10 },
  { id: 'credits', label: 'Credits', icon: 'toll', path: 'credits', phase: 10 },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: 'notifications',
    path: 'notifications',
    phase: 6,
  },
  { id: 'analytics', label: 'Analytics', icon: 'monitoring', path: 'analytics', phase: 12 },
  {
    id: 'auto-delist-rules',
    label: 'Auto-delist rules',
    icon: 'auto_delete',
    path: 'auto-delist-rules',
    phase: 7,
  },
  {
    id: 'feature-flags',
    label: 'Feature flags',
    icon: 'toggle_on',
    path: 'feature-flags',
    phase: 7,
  },
  { id: 'audit-logs', label: 'Audit logs', icon: 'history', path: 'audit-logs', phase: 7 },
  {
    id: 'system-health',
    label: 'System health',
    icon: 'monitor_heart',
    path: 'system-health',
    phase: 13,
  },
];
