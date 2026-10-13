import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationFeed,
  useUnreadNotificationCount,
} from '@/src/api/hooks/notificationCentre';
import { Button } from '@/src/components/ui/Button';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { Segmented } from '@/src/components/ui/Segmented';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import {
  NotificationEntry,
  useOpenNotification,
} from '@/src/features/notifications/NotificationEntry';
import { groupByDay, isUnread } from '@/src/features/notifications/notificationKinds';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

type FeedView = 'all' | 'unread';

/**
 * The notification centre (the web's `/notifications` and bell menu): every notification grouped
 * by day, newest first with older pages on scroll, All / Unread, a tap opening its screen (and
 * marking it read), a per-row "Mark as read", "Mark all as read" and the preferences. Live over
 * realtime: pushed notifications appear at the top and raise the badge once.
 */
export default function NotificationsScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const [view, setView] = useState<FeedView>('all');
  const feed = useNotificationFeed(view === 'unread');
  const unread = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const open = useOpenNotification();
  const unreadCount = unread.data?.count ?? 0;
  const items = useMemo(
    () => feed.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [feed.data]
  );
  const sections = useMemo(() => groupByDay(items), [items]);

  const markAllRead = async () => {
    try {
      const count = await markAll.mutateAsync();
      snackbar.show(
        count === 1 ? '1 notification marked as read.' : `${count} notifications marked as read.`
      );
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
    }
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.actions}>
        <Button
          label="Mark all as read"
          icon="check-all"
          variant="secondary"
          onPress={() => void markAllRead()}
          disabled={unreadCount === 0}
          loading={markAll.isPending}
          testID="notifications-mark-all"
        />
        <Button
          label="Preferences"
          icon="tune-variant"
          variant="ghost"
          onPress={() => router.push('/settings/notifications')}
          testID="notifications-preferences"
        />
      </View>
      <Segmented
        label="Show notifications"
        options={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: unreadCount > 0 ? `Unread (${unreadCount})` : 'Unread' },
        ]}
        value={view}
        onChange={setView}
        testID="notifications-view"
      />
    </View>
  );

  let content;
  if (!feed.data) {
    content = feed.error ? (
      <View style={styles.padded}>
        {header}
        <ErrorState
          testID="notifications-error"
          error={feed.error}
          title="Notifications could not load"
          onRetry={() => void feed.refetch()}
        />
      </View>
    ) : (
      <View style={styles.padded} accessibilityLabel="Loading notifications" aria-busy>
        {header}
        <SkeletonList rows={5} rowHeight={72} testID="notifications-loading" />
      </View>
    );
  } else {
    content = (
      <SectionList
        testID="notifications-list"
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, styles.grow]}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            onRefresh={() => {
              void feed.refetch();
              void unread.refetch();
            }}
          />
        }
        renderSectionHeader={({ section }) => (
          <Text
            accessibilityRole="header"
            style={[textStyle('sm'), styles.day, { color: palette.textMuted }]}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <View
            style={[
              styles.row,
              {
                borderBottomColor: palette.border,
                backgroundColor: isUnread(item) ? palette.surface : 'transparent',
              },
            ]}
          >
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${item.title}. ${item.body}${isUnread(item) ? '. Unread' : ''}`}
              onPress={() => open(item)}
              testID={`notification-${item.id}`}
              style={({ pressed }) => [styles.link, pressed && styles.pressed]}
            >
              <NotificationEntry notification={item} />
            </Pressable>
            {isUnread(item) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Mark as read: ${item.title}`}
                onPress={() => markRead.mutate(item)}
                hitSlop={8}
                testID={`notification-read-${item.id}`}
                style={styles.read}
              >
                <MaterialCommunityIcons name="check" size={22} color={palette.accent} />
              </Pressable>
            ) : null}
          </View>
        )}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage && !feed.isFetchNextPageError) {
            void feed.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          view === 'unread' ? (
            <EmptyState
              testID="notifications-caught-up"
              icon="check-circle-outline"
              title="You're all caught up"
              description="No unread notifications. New wishlist alerts and messages will appear here."
              actionLabel="Show all notifications"
              onAction={() => setView('all')}
            />
          ) : (
            <EmptyState
              testID="notifications-empty"
              icon="bell-outline"
              title="No notifications yet"
              description="Add cards to your wishlist: we'll tell you when a collector of your region lists one."
              actionLabel="Open my wishlist"
              onAction={() => router.navigate('/wishlist')}
            />
          )
        }
        ListFooterComponent={
          <ListFooter
            loading={feed.isFetchingNextPage}
            failed={feed.isFetchNextPageError}
            onRetry={() => void feed.fetchNextPage()}
            testID="notifications-more"
          />
        }
      />
    );
  }

  return (
    <View
      testID="screen-notifications"
      style={[styles.fill, { backgroundColor: palette.background }]}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  padded: { padding: spacing[4], gap: spacing[4] },
  list: { padding: spacing[4] },
  // Empty states fill (and centre in) the rest of the screen instead of collapsing.
  grow: { flexGrow: 1 },
  header: { gap: spacing[3], marginBottom: spacing[2] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  day: { fontWeight: fontWeight.semibold, marginTop: spacing[3], marginBottom: spacing[1] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  link: { flex: 1 },
  read: { padding: spacing[1] },
  pressed: { opacity: 0.8 },
});
