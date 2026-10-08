import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useRealtimeClient, useRealtimeEvent } from '@/src/realtime/RealtimeProvider';

import { useActiveConversation } from './activeConversation';

/** How long "is typing" stays after the last typing notice. */
export const TYPING_VISIBLE_MS = 5_000;
/** At most one typing notice per this interval while the caller types. */
export const TYPING_THROTTLE_MS = 3_000;

/**
 * Whether the thread is on screen: its screen is focused (not covered by a card page opened from
 * a link) and the app is in the foreground. While it is, the conversation is the "active" one:
 * pushed messages do not raise its unread count and are marked read instead.
 */
export function useThreadVisible(conversationId: string | null): boolean {
  const [focused, setFocused] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const setActive = useActiveConversation((store) => store.set);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) =>
      setForeground(status === 'active')
    );
    return () => subscription.remove();
  }, []);

  const visible = focused && foreground && !!conversationId;
  useEffect(() => {
    if (!visible || !conversationId) {
      return undefined;
    }
    setActive(conversationId);
    return () => {
      if (useActiveConversation.getState().id === conversationId) {
        setActive(null);
      }
    };
  }, [conversationId, setActive, visible]);

  return visible;
}

/**
 * "… is typing": shown for a few seconds after each typing notice of the other collector, hidden
 * as soon as their message arrives (web: `ThreadStore.applyTyping`).
 */
export function useOtherTyping(conversationId: string | null, selfId: string | null): boolean {
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useRealtimeEvent('typing', (notice) => {
    if (notice.conversationId !== conversationId || notice.userId === selfId) {
      return;
    }
    setTyping(true);
    clear();
    timer.current = setTimeout(() => setTyping(false), TYPING_VISIBLE_MS);
  });

  useRealtimeEvent('message', (message) => {
    if (
      message.conversationId === conversationId &&
      message.senderId &&
      message.senderId !== selfId
    ) {
      clear();
      setTyping(false);
    }
  });

  useEffect(() => clear, [clear]);
  return typing;
}

/** Tells the other collector that the caller types (`/app/typing`, at most every 3 s). */
export function useSendTyping(conversationId: string | null): () => void {
  const realtime = useRealtimeClient();
  const last = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (!conversationId || now - last.current < TYPING_THROTTLE_MS) {
      return;
    }
    last.current = now;
    realtime?.sendTyping(conversationId);
  }, [conversationId, realtime]);
}
