import NetInfo from '@react-native-community/netinfo';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { getIdToken } from '@/src/auth/tokenProvider';
import { useSession } from '@/src/auth/session';
import { appConfig } from '@/src/config/env';

import {
  RealtimeClient,
  realtimeEndpoint,
  type RealtimeClientOptions,
  type RealtimeEvent,
  type RealtimeEventMap,
  type RealtimeState,
} from './realtimeClient';

const RealtimeContext = createContext<RealtimeClient | null>(null);

export interface RealtimeProviderProps {
  children: ReactNode;
  /** Tests pass a client with a fake connector. */
  client?: RealtimeClient;
}

function defaultOptions(): RealtimeClientOptions {
  return {
    tokenSource: (forceRefresh) => getIdToken(forceRefresh),
    endpointFor: (token) => realtimeEndpoint(appConfig.apiBaseUrl, token, Platform.OS),
    // React Native's WebSocket drops the NUL that ends STOMP frames; browsers keep it.
    nulSafeFrames: Platform.OS !== 'web',
  };
}

/**
 * Starts the realtime channel while a collector with a ready account is signed in (the web's
 * `provideRealtime()`): it follows the session, pauses in the background and resumes in the
 * foreground (`AppState`), and skips the backoff wait when the network comes back (NetInfo).
 * Offline, the app keeps working on its cached data; `resync` re-reads it after reconnecting.
 */
export function RealtimeProvider({ children, client: given }: RealtimeProviderProps) {
  const [client] = useState(() => given ?? new RealtimeClient(defaultOptions()));
  const session = useSession();
  const account = useAccount();
  const uid = session.user?.uid ?? null;
  const ready = account.status === 'ready' && !!uid;

  useEffect(() => {
    client.follow(ready ? uid : null);
  }, [client, ready, uid]);

  useEffect(() => {
    if (AppState.currentState === 'background') {
      client.pause();
    }
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        client.resume();
      } else if (status === 'background') {
        client.pause();
      }
    });
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected !== false && state.isInternetReachable !== false) {
        client.reconnectNow();
      }
    });
    return () => {
      subscription.remove();
      unsubscribeNetInfo();
    };
  }, [client]);

  useEffect(() => () => client.dispose(), [client]);

  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>;
}

/** The app's realtime client (null outside the provider, e.g. in isolated screen tests). */
export function useRealtimeClient(): RealtimeClient | null {
  return useContext(RealtimeContext);
}

const noopSubscribe = () => () => undefined;

/** The connection state, for status indicators ("Live", "Reconnecting…"). */
export function useRealtimeState(): RealtimeState {
  const client = useRealtimeClient();
  return useSyncExternalStore(
    client ? (listener) => client.on('state', listener) : noopSubscribe,
    () => client?.state ?? 'disabled',
    () => client?.state ?? 'disabled'
  );
}

/**
 * Calls `handler` for every `event` pushed while the component is mounted. The latest handler is
 * used (no resubscription on every render).
 */
export function useRealtimeEvent<K extends RealtimeEvent>(
  event: K,
  handler: (payload: RealtimeEventMap[K]) => void
): void {
  const client = useRealtimeClient();
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!client) {
      return undefined;
    }
    return client.on(event, (payload) => latest.current(payload));
  }, [client, event]);
}
