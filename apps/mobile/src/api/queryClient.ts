import NetInfo from '@react-native-community/netinfo';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { isApiError } from './ApiError';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Whether a failed read is tried again by itself: twice, except a 4xx (the answer would be the
 * same) and a request the app gave up after waiting (`isTimeout`: two more waits of the same
 * length would keep the screen on its skeleton for a minute; it shows "Try again" instead).
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && ((error.status >= 400 && error.status < 500) || error.isTimeout)) {
    return false;
  }
  return failureCount < 2;
}

/**
 * Offline-friendly defaults: cached data is shown immediately (and kept for a day), queries do
 * not spin forever when the device is offline or the server does not answer, and 4xx responses
 * are not retried.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1 * MINUTE,
        gcTime: 24 * HOUR,
        networkMode: 'offlineFirst',
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
        retry: shouldRetryQuery,
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
      },
      mutations: {
        networkMode: 'offlineFirst',
        retry: 0,
      },
    },
  });
}

export const queryClient = createQueryClient();

/**
 * Wires TanStack Query's online/focus managers to NetInfo and AppState. Returns an unsubscribe
 * function; call from a root `useEffect`, never at import time.
 */
export function connectQueryManagers(): () => void {
  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    onlineManager.setOnline(state.isConnected !== false && state.isInternetReachable !== false);
  });

  const onAppStateChange = (status: AppStateStatus) => {
    if (Platform.OS !== 'web') {
      focusManager.setFocused(status === 'active');
    }
  };
  const appStateSubscription = AppState.addEventListener('change', onAppStateChange);

  return () => {
    unsubscribeNetInfo();
    appStateSubscription.remove();
  };
}
