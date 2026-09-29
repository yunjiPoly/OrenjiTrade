export interface NavLink {
  label: string;
  path: string;
  /** Material Symbols name. */
  icon: string;
}

/** Desktop top-bar links (>= 960px). */
export const PRIMARY_NAV_LINKS: readonly NavLink[] = [
  { label: 'Map', path: '/map', icon: 'map' },
  { label: 'Inventory', path: '/inventory', icon: 'style' },
  { label: 'Community', path: '/community', icon: 'forum' },
  { label: 'Wishlist', path: '/wishlist', icon: 'favorite' },
];

/** Bottom navigation (< 960px): mirrors the mobile app's tabs. */
export const MOBILE_NAV_LINKS: readonly NavLink[] = [
  { label: 'Map', path: '/map', icon: 'map' },
  { label: 'Inventory', path: '/inventory', icon: 'style' },
  { label: 'Search', path: '/search', icon: 'search' },
  { label: 'Messages', path: '/messages', icon: 'chat' },
  { label: 'Wishlist', path: '/wishlist', icon: 'favorite' },
  { label: 'Profile', path: '/settings', icon: 'person' },
];
