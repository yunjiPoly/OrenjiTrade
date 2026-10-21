import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type TabIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface TabDefinition {
  /** Route file name inside `app/(tabs)/`. */
  name: string;
  /** Stable id of the tab button (`tab-<id>`, the native flows' selector). */
  id: string;
  title: string;
  icon: TabIconName;
  iconFocused: TabIconName;
  /**
   * The screen draws its own header (a large title, the bell and its main button: the Inventory,
   * the Messages and the Profile of the 2026-10-14 redesign); the tab bar shows no navigation
   * header over it.
   */
  ownHeader?: boolean;
}

/**
 * Tab order is a product decision (owner spec 2026-10-14, section 4; CLAUDE.md): Home | Search |
 * Inventory | Messages | Profile since stage R7 (Home is the app's first screen, the `index`
 * route); since stage R5 the Map tab is Search's default view and the Wishlist tab its Wishlist
 * segment. The bell is top right on each.
 */
export const TABS: readonly TabDefinition[] = [
  {
    name: 'index',
    id: 'home',
    title: 'Home',
    icon: 'home-outline',
    iconFocused: 'home',
    // Stage R7: the region and game pills with the bell, then the search field (mockup 10).
    ownHeader: true,
  },
  {
    name: 'search',
    id: 'search',
    title: 'Search',
    icon: 'magnify',
    iconFocused: 'magnify',
    ownHeader: true,
  },
  {
    name: 'inventory',
    id: 'inventory',
    title: 'Inventory',
    icon: 'cards-outline',
    iconFocused: 'cards',
    ownHeader: true,
  },
  {
    name: 'messages',
    id: 'messages',
    title: 'Messages',
    icon: 'message-text-outline',
    iconFocused: 'message-text',
    ownHeader: true,
  },
  {
    name: 'profile',
    id: 'profile',
    title: 'Profile',
    icon: 'account-circle-outline',
    iconFocused: 'account-circle',
    // Stage R6: the title, the bell and the gear that opens Settings (mockup screen 21).
    ownHeader: true,
  },
];

/**
 * Routes of `app/(tabs)/` that are not tabs any more: the old Wishlist tab redirects into Search
 * (stage R5). Hidden from the tab bar. (`index`, the old Map tab, is Home since stage R7; its old
 * links still open Search's map.)
 */
export const HIDDEN_TAB_ROUTES: readonly string[] = ['wishlist'];
