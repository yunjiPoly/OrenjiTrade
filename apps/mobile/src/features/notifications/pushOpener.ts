import { useQueryClient } from '@tanstack/react-query';
import { isRunningInExpoGo } from 'expo';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { api } from '@/src/api/client';
import { useUid } from '@/src/api/hooks/useUid';
import { meKeys } from '@/src/api/queryKeys';

import { pushTarget } from './notificationRows';

/** What a tapped push notification carries (`NotificationDispatcher`: id, type, deep link). */
export type PushPayload = Record<string, unknown>;

/** The taps on push notifications: the one that opened the app, and the next ones. */
export interface PushResponses {
  last(): Promise<PushPayload | null>;
  subscribe(listener: (payload: PushPayload) => void): () => void;
}

interface ExpoNotificationsModule {
  getLastNotificationResponseAsync(): Promise<{
    notification: { request: { content: { data?: unknown } } };
  } | null>;
  addNotificationResponseReceivedListener(
    listener: (response: { notification: { request: { content: { data?: unknown } } } }) => void
  ): { remove(): void };
}

function payloadOf(data: unknown): PushPayload | null {
  return data && typeof data === 'object' ? (data as PushPayload) : null;
}

/**
 * The phone's taps on push notifications, or null where there are none: the web build, and Expo
 * Go, which receives no push of ours (device push needs a build of our own; until then the bell
 * is the way in). `expo-notifications` is only loaded here: in Expo Go its import alone warns.
 */
export function nativePushResponses(): PushResponses | null {
  if (Platform.OS === 'web' || isRunningInExpoGo()) {
    return null;
  }
  // Loaded here only: in Expo Go the module warns as soon as it is imported.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const notifications = require('expo-notifications') as ExpoNotificationsModule;
  return {
    last: async () =>
      payloadOf(
        (await notifications.getLastNotificationResponseAsync())?.notification.request.content.data
      ),
    subscribe: (listener) => {
      const subscription = notifications.addNotificationResponseReceivedListener((response) => {
        const payload = payloadOf(response.notification.request.content.data);
        if (payload) {
          listener(payload);
        }
      });
      return () => subscription.remove();
    },
  };
}

const ID = /^[\w-]{1,64}$/;

/**
 * A tapped push notification opens the same target as its row in Notifications (stage R9) and
 * marks it read; one without a target, or a freshness reminder, opens Notifications. Each tap is
 * followed once (the one that opened the app included), and only while a collector is signed in.
 */
export function usePushOpener(injected?: PushResponses | null): void {
  // Read once: the module and its listener stay the same for the app's life.
  const [source] = useState(() => (injected === undefined ? nativePushResponses() : injected));
  const router = useRouter();
  const queryClient = useQueryClient();
  const uid = useUid();
  const account = useAccount();
  const ready = account.status === 'ready';
  const handle = account.handle ?? null;
  const followed = useRef(new Set<string>());
  const latest = useRef({ router, handle, uid });
  useEffect(() => {
    latest.current = { router, handle, uid };
  }, [router, handle, uid]);

  useEffect(() => {
    if (!source || !ready) {
      return undefined;
    }
    const open = (payload: PushPayload) => {
      const id = typeof payload['notificationId'] === 'string' ? payload['notificationId'] : '';
      const key = id || JSON.stringify(payload);
      if (followed.current.has(key)) {
        return;
      }
      followed.current.add(key);
      const { router: navigate, handle: own, uid: owner } = latest.current;
      if (ID.test(id)) {
        void api
          .POST('/api/v1/notifications/{id}/read', { params: { path: { id } } })
          .catch(() => undefined)
          .finally(
            () => void queryClient.invalidateQueries({ queryKey: meKeys.notificationCentre(owner) })
          );
      }
      navigate.push(pushTarget(payload, own) as Href);
    };
    let active = true;
    void source.last().then((payload) => {
      if (active && payload) {
        open(payload);
      }
    });
    const unsubscribe = source.subscribe(open);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [queryClient, ready, source]);
}

/** Mounts `usePushOpener` in the root layout (renders nothing). */
export function PushOpener({ source }: { source?: PushResponses | null }) {
  usePushOpener(source);
  return null;
}
