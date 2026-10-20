import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type TabIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface TabDefinition {
  /** Route file name inside `app/(tabs)/`. */
  name: string;
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
 * Tab order is a product decision (owner spec 2026-10-14, section 4; CLAUDE.md): Search | Inventory
 * | Messages | Profile since stage R5 (the Map tab became Search's default view and the Wishlist
 * tab its Wishlist segment); stage R7 adds Home as the first of five. The bell is top right on
 * each.
 */
export const TABS: readonly TabDefinition[] = [
  {
    name: 'search',
    title: 'Search',
    icon: 'magnify',
    iconFocused: 'magnify',
    ownHeader: true,
  },
  {
    name: 'inventory',
    title: 'Inventory',
    icon: 'cards-outline',
    iconFocused: 'cards',
    ownHeader: true,
  },
  {
    name: 'messages',
    title: 'Messages',
    icon: 'message-text-outline',
    iconFocused: 'message-text',
    ownHeader: true,
  },
  {
    name: 'profile',
    title: 'Profile',
    icon: 'account-circle-outline',
    iconFocused: 'account-circle',
    // Stage R6: the title, the bell and the gear that opens Settings (mockup screen 21).
    ownHeader: true,
  },
];

/**
 * Routes of `app/(tabs)/` that are not tabs any more: the old Map tab (`index`, the app's first
 * route, `/`) and the old Wishlist tab redirect into Search (stage R5). Hidden from the tab bar.
 */
export const HIDDEN_TAB_ROUTES: readonly string[] = ['index', 'wishlist'];
