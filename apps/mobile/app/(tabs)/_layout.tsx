import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { TABS } from '@/src/navigation/tabs';
import { useTheme } from '@/src/theme/useTheme';

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
