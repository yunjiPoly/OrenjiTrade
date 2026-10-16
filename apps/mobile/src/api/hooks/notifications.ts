import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { NotificationSettingsResponse } from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/** `GET /api/v1/me/settings/notifications`: channels, category × channel matrix, quiet hours. */
export function useNotificationSettings() {
  const uid = useUid();
  return useQuery<NotificationSettingsResponse, ApiError>({
    queryKey: meKeys.notifications(uid),
    queryFn: async () => required((await api.GET('/api/v1/me/settings/notifications')).data),
    enabled: useIsAuthenticated(),
  });
}

/** `PUT /api/v1/me/settings/notifications` with the full document. */
export function useSaveNotificationSettings() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<NotificationSettingsResponse, ApiError, NotificationSettingsResponse>({
    mutationFn: async (settings) =>
      required(
        (
          await api.PUT('/api/v1/me/settings/notifications', {
            body: {
              pushEnabled: settings.pushEnabled,
              emailEnabled: settings.emailEnabled,
              inAppEnabled: settings.inAppEnabled,
              categories: settings.categories,
              quietHours: settings.quietHours,
              // Without it the API keeps the stored value: the switch of Settings › Notifications
              // and Search › Wishlist never reached the server before stage R5.
              wishlistAlerts: settings.wishlistAlerts,
            },
          })
        ).data
      ),
    onSuccess: (saved) => {
      queryClient.setQueryData(meKeys.notifications(uid), saved);
    },
  });
}
