import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useAccount } from '@/src/account/AccountProvider';
import { applyMessageToCaches } from '@/src/api/hooks/messaging';
import {
  applyPushedNotification,
  refreshUnreadCountSoon,
} from '@/src/api/hooks/notificationCentre';
import { useUid } from '@/src/api/hooks/useUid';
import { meKeys } from '@/src/api/queryKeys';
import type { ConversationSummary } from '@/src/api/types';
import {
  applyOwnReceipt,
  applyPresence,
  applyReceiptToThread,
  type InboxData,
  type ThreadData,
} from '@/src/features/messages/conversationCache';

import { useRealtimeEvent } from './RealtimeProvider';

/** Notifications that change a trade (its list rows and screen). */
const TRADE_TYPES = new Set<string>([
  'TRADE_UPDATE',
  'OFFER_ACCEPTED',
  'PAYMENT_UPDATE',
  'SHIPMENT_STATUS',
  'DISPUTE_UPDATE',
]);

/**
 * Applies realtime pushes to the react-query caches (the web's stores subscribing to
 * `RealtimeService`): messages into their thread and the inbox, read receipts ("Seen", unread
 * counts), presence dots, notifications (badge once per push, feeds, wishlist match counts, the
 * offers, trades, ratings and reports they announce), and after every (re)connection a quiet
 * re-read of what may have been missed. Renders nothing.
 */
export function RealtimeCacheSync() {
  const queryClient = useQueryClient();
  const uid = useUid();
  const selfId = useAccount().me?.id ?? null;
  const seen = useRef(new Set<string>());

  useEffect(() => {
    // Notification ids counted once per account.
    seen.current = new Set();
  }, [uid]);

  useRealtimeEvent('message', (message) => {
    applyMessageToCaches(queryClient, uid, selfId, message);
  });

  useRealtimeEvent('receipt', (receipt) => {
    if (receipt.userId === selfId) {
      queryClient.setQueryData<InboxData>(meKeys.conversationList(uid), (data) =>
        applyOwnReceipt(data, receipt)
      );
      queryClient.setQueryData<ConversationSummary>(
        meKeys.conversation(uid, receipt.conversationId),
        (current) => (current ? { ...current, unreadCount: 0 } : current)
      );
      refreshUnreadCountSoon(queryClient, uid);
    } else if (selfId) {
      queryClient.setQueryData<ThreadData>(meKeys.messages(uid, receipt.conversationId), (data) =>
        applyReceiptToThread(data, selfId, receipt)
      );
    }
  });

  useRealtimeEvent('presence', (presence) => {
    queryClient.setQueryData<InboxData>(meKeys.conversationList(uid), (data) =>
      applyPresence(data, presence)
    );
    for (const [key, conversation] of queryClient.getQueriesData<ConversationSummary>({
      queryKey: [...meKeys.conversations(uid), 'one'],
    })) {
      if (conversation?.other.id === presence.userId) {
        queryClient.setQueryData(key, {
          ...conversation,
          other: { ...conversation.other, onlineStatus: presence.status },
        });
      }
    }
  });

  useRealtimeEvent('notification', (notification) => {
    if (!applyPushedNotification(queryClient, uid, notification, seen.current)) {
      return;
    }
    if (notification.type === 'WISHLIST_MATCH') {
      // Match counts and the matches of the wish change.
      void queryClient.invalidateQueries({ queryKey: meKeys.wishlist(uid) });
    }
    if (notification.type.startsWith('OFFER_')) {
      // The inbox rows and the negotiation on screen (the offer screen follows a counter-offer).
      void queryClient.invalidateQueries({ queryKey: meKeys.offers(uid) });
    }
    if (TRADE_TYPES.has(notification.type)) {
      void queryClient.invalidateQueries({ queryKey: meKeys.trades(uid) });
    }
    if (notification.type === 'RATING_RECEIVED') {
      // The caller's own profile shows the new rating and summary.
      void queryClient.invalidateQueries({ queryKey: meKeys.collectors(uid) });
    }
    if (notification.type === 'REPORT_DECISION') {
      void queryClient.invalidateQueries({ queryKey: meKeys.reports(uid) });
    }
  });

  useRealtimeEvent('resync', () => {
    // Pushes sent while the socket was down are lost: re-read what screens show (only the
    // queries on screen refetch now; the others when they are next used).
    void queryClient.invalidateQueries({ queryKey: meKeys.conversationList(uid) });
    void queryClient.invalidateQueries({ queryKey: meKeys.allMessages(uid) });
    void queryClient.invalidateQueries({ queryKey: meKeys.notificationCentre(uid) });
    void queryClient.invalidateQueries({ queryKey: meKeys.wishlist(uid) });
    void queryClient.invalidateQueries({ queryKey: meKeys.offers(uid) });
    void queryClient.invalidateQueries({ queryKey: meKeys.trades(uid) });
    void queryClient.invalidateQueries({ queryKey: meKeys.reports(uid) });
  });

  return null;
}
