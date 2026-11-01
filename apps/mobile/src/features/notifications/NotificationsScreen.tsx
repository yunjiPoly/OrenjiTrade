import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '@/src/account/AccountProvider';
import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useConfirmBinder, useMyBinders } from '@/src/api/hooks/binders';
import {
  NOTIFICATIONS_PAGE,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationFeed,
  useUnreadNotificationCount,
} from '@/src/api/hooks/notificationCentre';
import type { NotificationResponse } from '@/src/api/types';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import {
  fontFamily,
  fontWeight,
  PINNED_MAX_FONT_SCALE,
  TITLE_MAX_FONT_SCALE,
  useTheme,
} from '@/src/theme';

import { NOTIFICATIONS_COPY } from './notificationCopy';
import { NotificationRow } from './NotificationRow';
import {
  isFreshnessRow,
  listRows,
  openedFromNotifications,
  reminderBinderId,
  reminderState,
  rowTarget,
  type ListRow,
} from './notificationRows';

/** How often the rows' times ("5 min") are worked out again while the screen is open. */
const CLOCK_MS = 60_000;

/**
 * Notifications (owner prompt of 2026-10-19, section R9; mockup v50 screen 31), opened by the bell
 * of every tab: back, the title and a gear (Settings › Notifications); "New" with the unread
 * notifications and "Mark all as read", "Earlier" with the rest, newest first, older pages on
 * scroll (New's first, when more are unread than one page holds). Chats are left out
 * (`excludeTypes=MESSAGE`): Messages has its own badge. Tapping a row marks it read and opens its
 * target; a freshness reminder is answered in place. Pull to refresh, a skeleton, an error with
 * "Try again", the empty state.
 */
export function NotificationsScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const snackbar = useSnackbar();
  const ownHandle = useAccount().handle ?? null;
  const fresh = useNotificationFeed(true);
  const all = useNotificationFeed(false);
  const unread = useUnreadNotificationCount();
  const binders = useMyBinders();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const confirmBinder = useConfirmBinder();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_MS);
    return () => clearInterval(timer);
  }, []);

  const freshItems = useMemo(
    () => fresh.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [fresh.data]
  );
  const allItems = useMemo(
    () => all.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [all.data]
  );
  // New lists every unread notification before Earlier begins: it pages too (review fix 1, F4).
  const freshComplete = !fresh.hasNextPage;
  const rows = useMemo(
    () => listRows(freshItems, allItems, freshComplete),
    [freshItems, allItems, freshComplete]
  );
  const earlierCount = useMemo(
    () => rows.filter((row) => row.kind === 'notification' && !row.fresh).length,
    [rows]
  );

  // The list read on scroll: New while it has pages left, then the whole list (Earlier).
  const paging = freshComplete ? all : fresh;
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = paging;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchNextPageError, isFetchingNextPage]);

  // A first page of the whole list may hold only notifications "New" already shows: once New is
  // whole, the next pages are read until "Earlier" has a page of its own (or nothing is left).
  // New's own pages load on scroll only.
  useEffect(() => {
    if (all.data && freshComplete && earlierCount < NOTIFICATIONS_PAGE) {
      loadMore();
    }
  }, [all.data, earlierCount, freshComplete, loadMore]);

  const back = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const markOne = (notification: NotificationResponse) => {
    if (!notification.readAt) {
      markRead.mutate(notification);
    }
  };

  const openRow = (notification: NotificationResponse, target: string | null) => {
    markOne(notification);
    if (target) {
      router.push(openedFromNotifications(target) as Href);
    }
  };

  const markEverything = () => {
    markAll.mutate(undefined, {
      onSuccess: () => AccessibilityInfo.announceForAccessibility(NOTIFICATIONS_COPY.markAllDone),
      onError: (error) => snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' }),
    });
  };

  const confirm = (notification: NotificationResponse, binderId: string) => {
    markOne(notification);
    setConfirmingId(notification.id);
    confirmBinder.mutate(binderId, {
      onSuccess: () =>
        AccessibilityInfo.announceForAccessibility(NOTIFICATIONS_COPY.reminder.confirmed),
      onError: () => snackbar.show(NOTIFICATIONS_COPY.reminder.confirmError, { tone: 'error' }),
      onSettled: () => setConfirmingId(null),
    });
  };

  const review = (notification: NotificationResponse, binderId: string | null) => {
    markOne(notification);
    router.push((binderId ? `/binders/${binderId}?from=notifications` : '/inventory') as Href);
  };

  const refresh = () => {
    void fresh.refetch();
    void all.refetch();
    void unread.refetch();
    void binders.refetch();
  };

  const renderRow = ({ item }: { item: ListRow }) => {
    if (item.kind === 'heading') {
      return (
        <View style={styles.heading} testID={`notifications-section-${item.section}`}>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.headingText, { color: palette.textMuted }]}
          >
            {NOTIFICATIONS_COPY.sections[item.section]}
          </Text>
          {item.markAll ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={NOTIFICATIONS_COPY.markAll}
              disabled={markAll.isPending}
              onPress={markEverything}
              testID="notifications-mark-all"
              style={({ pressed }) => [styles.markAll, pressed && styles.pressed]}
            >
              <Text
                maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
                style={[styles.markAllText, { color: palette.accent }]}
              >
                {NOTIFICATIONS_COPY.markAll}
              </Text>
            </Pressable>
          ) : null}
        </View>
      );
    }
    const notification = item.notification;
    if (isFreshnessRow(notification)) {
      const binderId = reminderBinderId(notification);
      return (
        <NotificationRow
          notification={notification}
          now={now}
          target={null}
          onOpen={openRow}
          reminder={{
            state: reminderState(notification, binders.data),
            confirming: confirmingId === notification.id,
            onConfirm: () => {
              if (binderId) {
                confirm(notification, binderId);
              }
            },
            onReview: () => review(notification, binderId),
          }}
        />
      );
    }
    return (
      <NotificationRow
        notification={notification}
        now={now}
        target={rowTarget(notification, ownHandle)}
        onOpen={openRow}
      />
    );
  };

  const loaded = !!fresh.data && !!all.data;
  const failed = (!fresh.data && fresh.error) || (!all.data && all.error) || null;

  let content;
  if (failed) {
    content = (
      <View style={styles.padded}>
        <ErrorState
          testID="notifications-error"
          error={failed}
          title={NOTIFICATIONS_COPY.loadError}
          onRetry={refresh}
        />
      </View>
    );
  } else if (!loaded) {
    content = (
      <View
        testID="notifications-loading"
        accessibilityLabel={NOTIFICATIONS_COPY.loading}
        aria-busy
        style={styles.loading}
      >
        {[0, 1, 2, 3, 4].map((index) => (
          <View
            key={index}
            style={[styles.skeletonRow, { borderBottomColor: palette.notifications.rowBorder }]}
          >
            <Skeleton width={40} height={40} radius={12} />
            <View style={styles.skeletonText}>
              <Skeleton width="85%" height={14} />
              <Skeleton width="60%" height={12} />
              <Skeleton width={40} height={10} />
            </View>
          </View>
        ))}
      </View>
    );
  } else {
    content = (
      <FlatList
        testID="notifications-list"
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        extraData={[now, confirmingId, binders.data, markAll.isPending, ownHandle]}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 16 }]}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={
              (fresh.isRefetching || all.isRefetching) &&
              !all.isFetchingNextPage &&
              !fresh.isFetchingNextPage
            }
            onRefresh={refresh}
            tintColor={palette.primary}
          />
        }
        ListEmptyComponent={
          paging.hasNextPage ? null : (
            <EmptyState
              testID="notifications-empty"
              icon="bell-outline"
              title={NOTIFICATIONS_COPY.emptyTitle}
              description={NOTIFICATIONS_COPY.emptyText}
            />
          )
        }
        ListFooterComponent={
          <ListFooter
            loading={paging.isFetchingNextPage}
            failed={paging.isFetchNextPageError}
            onRetry={() => void paging.fetchNextPage()}
            testID="notifications-more"
          />
        }
      />
    );
  }

  return (
    <View
      key={`text-size-${fontScale}`}
      testID="screen-notifications"
      style={[styles.fill, { backgroundColor: palette.background, paddingTop: insets.top }]}
    >
      <Stack.Screen options={{ headerShown: false, title: NOTIFICATIONS_COPY.title }} />
      <View style={[styles.top, { borderBottomColor: palette.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={NOTIFICATIONS_COPY.back}
          onPress={back}
          // The id of the navigation header's back button: the flows go back the same way.
          testID="BackButton"
          style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="chevron-left" size={28} color={palette.ink} />
        </Pressable>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          numberOfLines={1}
          style={[styles.title, { color: palette.ink }]}
        >
          {NOTIFICATIONS_COPY.title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={NOTIFICATIONS_COPY.settings}
          onPress={() => router.push('/settings/notifications')}
          testID="notifications-settings"
          style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="cog-outline" size={22} color={palette.ink} />
        </Pressable>
      </View>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 8,
    borderBottomWidth: 1,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },
  pressed: { opacity: 0.7 },
  padded: { padding: 16 },
  list: { flexGrow: 1 },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    minHeight: 44,
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  headingText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  markAll: { minHeight: 44, justifyContent: 'center' },
  markAllText: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  loading: { paddingTop: 8 },
  skeletonRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  skeletonText: { flex: 1, gap: 6 },
});
