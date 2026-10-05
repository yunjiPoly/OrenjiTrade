import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useUnreadNotificationCount } from '@/src/api/hooks/notificationCentre';
import { badgeCount } from '@/src/features/messages/messageText';
import { fontWeight, radius, spacing, useTheme } from '@/src/theme';

/** Accessible name of the bell (web: "Notifications, N unread"). */
export function bellLabel(count: number): string {
  return count > 0 ? `Notifications, ${count} unread` : 'Notifications';
}

/**
 * The notification bell in the tab headers (the web's top-bar bell): a live unread badge
 * ("99+"), opening the notification centre.
 */
export function NotificationBell() {
  const { palette } = useTheme();
  const router = useRouter();
  const ready = useAccount().status === 'ready';
  const unread = useUnreadNotificationCount();
  if (!ready) {
    return null;
  }
  const count = unread.data?.count ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bellLabel(count)}
      onPress={() => router.push('/notifications')}
      hitSlop={8}
      testID="notification-bell"
      style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons
        name={count > 0 ? 'bell-badge-outline' : 'bell-outline'}
        size={24}
        color={palette.ink}
      />
      {count > 0 ? (
        <View
          testID="notification-badge"
          style={[styles.badge, { backgroundColor: palette.danger }]}
        >
          <Text style={styles.badgeText}>{badgeCount(count)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: { paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  badge: {
    position: 'absolute',
    top: -2,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontWeight: fontWeight.bold },
  pressed: { opacity: 0.7 },
});
