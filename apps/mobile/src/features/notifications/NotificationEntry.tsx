import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useMarkNotificationRead } from '@/src/api/hooks/notificationCentre';
import type { NotificationResponse } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontWeight, spacing, textStyle, useTheme, type Palette } from '@/src/theme';

import {
  isUnread,
  notificationCard,
  notificationKind,
  notificationTarget,
  type NotificationTone,
} from './notificationKinds';

function toneColor(tone: NotificationTone, palette: Palette): string {
  switch (tone) {
    case 'match':
      return palette.primary;
    case 'message':
      return palette.accent;
    case 'offer':
      return palette.availability.offers;
    case 'trade':
      return palette.info;
    case 'warning':
      return palette.warning;
    default:
      return palette.textMuted;
  }
}

/**
 * One notification as content (the web's `app-notification-entry`): the card it is about (or a
 * tinted icon per type), category and time, title, body and an unread dot.
 */
export function NotificationEntry({ notification }: { notification: NotificationResponse }) {
  const { palette } = useTheme();
  const kind = notificationKind(notification);
  const card = notificationCard(notification);
  const color = toneColor(kind.tone, palette);
  const unread = isUnread(notification);
  return (
    <View style={styles.entry}>
      {card ? (
        <View testID="notification-card-image">
          <CardImage src={card.imageUrl} alt={card.name} game={card.game} size="xs" />
          <View style={[styles.badge, { backgroundColor: color }]}>
            <MaterialCommunityIcons name={kind.icon} size={12} color="#FFFFFF" />
          </View>
        </View>
      ) : (
        <View style={[styles.icon, { backgroundColor: palette.surfaceVariant }]}>
          <MaterialCommunityIcons name={kind.icon} size={22} color={color} />
        </View>
      )}
      <View style={styles.text}>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          <Text style={[styles.strong, { color }]}>{kind.label}</Text> ·{' '}
          {relativeTime(notification.createdAt)}
        </Text>
        <Text style={[textStyle('md'), unread && styles.strong, { color: palette.ink }]}>
          {notification.title}
        </Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{notification.body}</Text>
      </View>
      {unread ? (
        <View
          testID="notification-unread-dot"
          accessibilityLabel="Unread"
          style={[styles.dot, { backgroundColor: palette.primary }]}
        />
      ) : null}
    </View>
  );
}

/**
 * Opening a notification: it is marked read, then its screen opens (the deep link mapped to the
 * app), or a snackbar explains where to follow it when that screen arrives in a later stage.
 */
export function useOpenNotification() {
  const router = useRouter();
  const snackbar = useSnackbar();
  const markRead = useMarkNotificationRead();
  const mutate = markRead.mutate;
  return useCallback(
    (notification: NotificationResponse) => {
      if (isUnread(notification)) {
        mutate(notification);
      }
      const target = notificationTarget(notification);
      if (target.kind === 'route') {
        router.push(target.href as Href);
      } else {
        snackbar.show(target.note, { duration: 6000 });
      }
    },
    [mutate, router, snackbar]
  );
}

const styles = StyleSheet.create({
  entry: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -6,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  strong: { fontWeight: fontWeight.semibold },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
});
