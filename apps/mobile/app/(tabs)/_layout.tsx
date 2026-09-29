import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { useTheme } from '@/src/theme/useTheme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Tab order is a product decision (CLAUDE.md): Map | Inventory | Search | Messages | Wishlist | Profile. */
export const TABS = [
  {
    name: 'index',
    title: 'Map',
    icon: 'map-marker-radius-outline',
    iconFocused: 'map-marker-radius',
  },
  { name: 'inventory', title: 'Inventory', icon: 'cards-outline', iconFocused: 'cards' },
  { name: 'search', title: 'Search', icon: 'magnify', iconFocused: 'magnify' },
  {
    name: 'messages',
    title: 'Messages',
    icon: 'message-text-outline',
    iconFocused: 'message-text',
  },
  { name: 'wishlist', title: 'Wishlist', icon: 'heart-outline', iconFocused: 'heart' },
  {
    name: 'profile',
    title: 'Profile',
    icon: 'account-circle-outline',
    iconFocused: 'account-circle',
  },
] as const satisfies readonly {
  name: string;
  title: string;
  icon: IconName;
  iconFocused: IconName;
}[];

export default function TabLayout() {
  const { palette } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.ink,
        headerShadowVisible: false,
        headerTitleAlign: 'center',
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: `${tab.title} tab`,
            tabBarIcon: ({ color, focused, size }) => (
              <MaterialCommunityIcons
                name={focused ? tab.iconFocused : tab.icon}
                color={color}
                size={size}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
