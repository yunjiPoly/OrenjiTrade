import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useMemo } from 'react';

import { useAccount } from '@/src/account/AccountProvider';
import { useConversations } from '@/src/api/hooks/messaging';
import { inboxConversations } from '@/src/features/messages/conversationCache';
import { badgeCount, totalUnread } from '@/src/features/messages/messageText';
import { NotificationBell } from '@/src/features/notifications/NotificationBell';
import { HIDDEN_TAB_ROUTES, TABS } from '@/src/navigation/tabs';
import { useTheme } from '@/src/theme/useTheme';

/** Home is the first tab and the app's first screen (stage R7): the `index` route, `/`. */
export const unstable_settings = { initialRouteName: 'index' };

/** Unread chats of the inbox (not muted), for the Messages tab badge (stage R4). */
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
        // The bar keeps its height at every text size, like the stack headers iOS draws itself
        // and the tab bar: a title that followed the largest sizes was cut in half by the bar.
        headerTitleAllowFontScaling: false,
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
              headerShown: !tab.ownHeader,
              tabBarAccessibilityLabel: badge
                ? `${tab.title} tab, ${unreadMessages} unread ${unreadMessages === 1 ? 'chat' : 'chats'}`
                : `${tab.title} tab`,
              // Stable selector for the native Maestro flows (resource-id on Android).
              tabBarButtonTestID: `tab-${tab.id}`,
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
      {HIDDEN_TAB_ROUTES.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null, headerShown: false }} />
      ))}
    </Tabs>
  );
}
