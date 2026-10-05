import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';

import { useAccount } from '@/src/account/AccountProvider';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { NotificationPage, NotificationResponse, UnreadNotificationCount } from '../types';
import { useUid } from './useUid';

/** Notifications per page of `GET /notifications`. */
export const NOTIFICATIONS_PAGE = 20;
/** Pause before re-reading the unread count after the caller read a conversation. */
export const RECEIPT_REFRESH_MS = 800;

type Uid = string | null;
type FeedData = InfiniteData<NotificationPage>;

/** A collector with a ready account is signed in (the notification centre is active). */
function useCentreEnabled(): boolean {
  return useAccount().status === 'ready';
}

/**
 * `GET /api/v1/notifications/unread-count`: the badge of the notification bell (web:
 * `NotificationCenter.unreadCount`). Kept live by realtime pushes (see `applyPushedNotification`)
 * and re-read after every reconnection.
 */
export function useUnreadNotificationCount() {
  const uid = useUid();
  return useQuery<UnreadNotificationCount, ApiError>({
    queryKey: meKeys.notificationUnread(uid),
    queryFn: async () => required((await api.GET('/api/v1/notifications/unread-count')).data),
    enabled: useCentreEnabled(),
    staleTime: 30_000,
  });
}

/** `GET /api/v1/notifications` newest first, cursor pages, optionally unread ones only. */
export function useNotificationFeed(unreadOnly: boolean) {
  const uid = useUid();
  return useInfiniteQuery<NotificationPage, ApiError>({
    queryKey: meKeys.notificationFeed(uid, unreadOnly),
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/notifications', {
            params: {
              query: {
                cursor: (pageParam as string | null) ?? undefined,
                limit: NOTIFICATIONS_PAGE,
                unreadOnly,
              },
            },
          })
        ).data
      ),
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    enabled: useCentreEnabled(),
    staleTime: 0,
  });
}

/** Applies `change` to every cached feed page (all and unread views). */
function updateFeeds(
  queryClient: QueryClient,
  uid: Uid,
  change: (items: NotificationResponse[], unreadOnly: boolean) => NotificationResponse[]
): void {
  for (const unreadOnly of [false, true]) {
    queryClient.setQueryData<FeedData>(meKeys.notificationFeed(uid, unreadOnly), (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: change(page.items ?? [], unreadOnly),
            })),
          }
        : data
    );
  }
}

function adjustCount(queryClient: QueryClient, uid: Uid, change: (count: number) => number) {
  queryClient.setQueryData<UnreadNotificationCount>(meKeys.notificationUnread(uid), (data) =>
    data ? { ...data, count: Math.max(0, change(data.count ?? 0)) } : data
  );
}

/**
 * A notification pushed on `/user/queue/notifications`: one more unread (each push counted once,
 * `seen` tracks the ids), prepended to the loaded feeds. Returns false for a repeat.
 */
export function applyPushedNotification(
  queryClient: QueryClient,
  uid: Uid,
  notification: NotificationResponse,
  seen: Set<string>
): boolean {
  if (seen.has(notification.id)) {
    return false;
  }
  seen.add(notification.id);
  if (!notification.readAt) {
    adjustCount(queryClient, uid, (count) => count + 1);
  }
  queryClient.setQueryData<FeedData>(meKeys.notificationFeed(uid, false), (data) =>
    prepend(data, notification)
  );
  if (!notification.readAt) {
    queryClient.setQueryData<FeedData>(meKeys.notificationFeed(uid, true), (data) =>
      prepend(data, notification)
    );
  }
  return true;
}

function prepend(data: FeedData | undefined, notification: NotificationResponse) {
  if (!data || data.pages.length === 0) {
    return data;
  }
  const pages = data.pages.map((page) => ({
    ...page,
    items: (page.items ?? []).filter((item) => item.id !== notification.id),
  }));
  const [first, ...rest] = pages;
  return first
    ? { ...data, pages: [{ ...first, items: [notification, ...(first.items ?? [])] }, ...rest] }
    : data;
}

const receiptTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Reading a conversation marks its MESSAGE notifications read on the server: the badge is
 * re-read shortly after (debounced), like the web's `scheduleCountRefresh`.
 */
export function refreshUnreadCountSoon(queryClient: QueryClient, uid: Uid): void {
  const key = uid ?? 'anonymous';
  const pending = receiptTimers.get(key);
  if (pending) {
    clearTimeout(pending);
  }
  receiptTimers.set(
    key,
    setTimeout(() => {
      receiptTimers.delete(key);
      void queryClient.invalidateQueries({ queryKey: meKeys.notificationUnread(uid) });
    }, RECEIPT_REFRESH_MS)
  );
}

/** `POST /api/v1/notifications/{id}/read`, optimistic (no-op when already read). */
export function useMarkNotificationRead() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, NotificationResponse>({
    mutationFn: async (notification) => {
      if (notification.readAt) {
        return;
      }
      await api.POST('/api/v1/notifications/{id}/read', {
        params: { path: { id: notification.id } },
      });
    },
    onMutate: (notification) => {
      if (notification.readAt) {
        return;
      }
      const readAt = new Date().toISOString();
      updateFeeds(queryClient, uid, (items) =>
        items.map((item) =>
          item.id === notification.id && !item.readAt ? { ...item, readAt } : item
        )
      );
      adjustCount(queryClient, uid, (count) => count - 1);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: meKeys.notificationCentre(uid) });
    },
  });
}

/** `POST /api/v1/notifications/read-all`; resolves how many were unread. */
export function useMarkAllNotificationsRead() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<number, ApiError, void>({
    mutationFn: async () =>
      required((await api.POST('/api/v1/notifications/read-all')).data).updated ?? 0,
    onSuccess: () => {
      const readAt = new Date().toISOString();
      updateFeeds(queryClient, uid, (items, unreadOnly) =>
        unreadOnly ? [] : items.map((item) => (item.readAt ? item : { ...item, readAt }))
      );
      queryClient.setQueryData<UnreadNotificationCount>(meKeys.notificationUnread(uid), (data) =>
        data ? { ...data, count: 0 } : { count: 0 }
      );
    },
  });
}
