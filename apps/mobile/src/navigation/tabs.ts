import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type TabIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface TabDefinition {
  /** Route file name inside `app/(tabs)/` (`index` = Map). */
  name: string;
  title: string;
  icon: TabIconName;
  iconFocused: TabIconName;
  /**
   * The screen draws its own header (a large title, the bell and its main button: the Inventory
   * and the Messages of the 2026-10-14 redesign); the tab bar shows no navigation header over it.
   */
  ownHeader?: boolean;
}

/** Tab order is a product decision (CLAUDE.md): Map | Inventory | Search | Messages | Wishlist | Profile. */
export const TABS: readonly TabDefinition[] = [
  {
    name: 'index',
    title: 'Map',
    icon: 'map-marker-radius-outline',
    iconFocused: 'map-marker-radius',
  },
  {
    name: 'inventory',
    title: 'Inventory',
    icon: 'cards-outline',
    iconFocused: 'cards',
    ownHeader: true,
  },
  { name: 'search', title: 'Search', icon: 'magnify', iconFocused: 'magnify' },
  {
    name: 'messages',
    title: 'Messages',
    icon: 'message-text-outline',
    iconFocused: 'message-text',
    ownHeader: true,
  },
  { name: 'wishlist', title: 'Wishlist', icon: 'heart-outline', iconFocused: 'heart' },
  {
    name: 'profile',
    title: 'Profile',
    icon: 'account-circle-outline',
    iconFocused: 'account-circle',
  },
];
