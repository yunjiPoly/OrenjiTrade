import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useUnreadNotificationCount } from '@/src/api/hooks/notificationCentre';
import { spacing, useTheme } from '@/src/theme';

import { NOTIFICATIONS_COPY } from './notificationCopy';

/** Accessible name of the bell: "Notifications, {n} new", or "Notifications" (stage R9). */
export function bellLabel(count: number): string {
  return NOTIFICATIONS_COPY.bell(count);
}

/**
 * The bell on the top bars of Home, Search, Inventory, Messages and Profile (stage R9; mockup v50
 * screens 10 to 21): an orange dot while anything is unread (chats left out: Messages has its own
 * badge), opening Notifications.
 */
export function NotificationBell({
  testID = 'notification-bell',
  variant = 'header',
}: {
  testID?: string;
  /** `round`: the 44 pt round button of the screens that draw their own header (mockup v32). */
  variant?: 'header' | 'round';
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const ready = useAccount().status === 'ready';
  const unread = useUnreadNotificationCount();
  if (!ready) {
    return null;
  }
  const count = unread.data?.count ?? 0;
  const round = variant === 'round';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bellLabel(count)}
      onPress={() => router.push('/notifications')}
      hitSlop={8}
      testID={testID}
      style={({ pressed }) => [
        round
          ? [styles.round, { backgroundColor: palette.surface, borderColor: palette.border }]
          : styles.bell,
        pressed && styles.pressed,
      ]}
    >
      <MaterialCommunityIcons name="bell-outline" size={round ? 20 : 24} color={palette.ink} />
      {count > 0 ? (
        <View
          testID={`${testID}-dot`}
          style={[
            styles.dot,
            round ? styles.dotRound : styles.dotHeader,
            { backgroundColor: palette.notifications.dot, borderColor: palette.surface },
          ]}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: { paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Mockup v50: a 9 pt orange dot in a 2 pt ring of the button's colour, top right.
  dot: { position: 'absolute', width: 13, height: 13, borderRadius: 6.5, borderWidth: 2 },
  dotRound: { top: 6, right: 7 },
  dotHeader: { top: 0, right: 8 },
  pressed: { opacity: 0.7 },
});
