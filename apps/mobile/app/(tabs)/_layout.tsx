import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useMemo } from 'react';

import { useAccount } from '@/src/account/AccountProvider';
import { useConversations } from '@/src/api/hooks/messaging';
import { inboxConversations } from '@/src/features/messages/conversationCache';
import { badgeCount, totalUnread } from '@/src/features/messages/messageText';
import { NotificationBell } from '@/src/features/notifications/NotificationBell';
import { TABS } from '@/src/navigation/tabs';
import { useTheme } from '@/src/theme/useTheme';

/** Unread messages of the inbox (not muted), for the Messages tab badge. */
function useInboxUnread(): number {
  const ready = useAccount().status === 'ready';
  const inbox = useConversations(ready);
  return useMemo(() => totalUnread(inboxConversations(inbox.data)), [inbox.data]);
}

export default function TabLayout() {
  const { palette } = useTheme();
  const unreadMessages = useInboxUnread();

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
      {TABS.map((tab) => {
        const badge =
          tab.name === 'messages' && unreadMessages > 0 ? badgeCount(unreadMessages) : undefined;
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarAccessibilityLabel: badge
                ? `${tab.title} tab, ${unreadMessages} unread`
                : `${tab.title} tab`,
              // Stable selector for the native Maestro flows (resource-id on Android).
              tabBarButtonTestID: `tab-${tab.name}`,
              tabBarBadge: badge,
              // The notification centre is one tap away from every tab (the web's top-bar bell).
              headerRight: () => <NotificationBell testID={`notification-bell-${tab.name}`} />,
              tabBarBadgeStyle: { backgroundColor: palette.primary, color: palette.onPrimary },
              tabBarIcon: ({ color, focused, size }) => (
                <MaterialCommunityIcons
                  name={focused ? tab.iconFocused : tab.icon}
                  color={color}
                  size={size}
                />
              ),
            }}
          />
        );
      })}
    </Tabs>
  );
}
