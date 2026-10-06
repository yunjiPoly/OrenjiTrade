import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '@/src/account/AccountProvider';
import { isApiError, type ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useBlockUser, useUnblockUser } from '@/src/api/hooks/blocks';
import { useRatingEligibility } from '@/src/api/hooks/ratings';
import {
  removeFromInbox,
  restoreToInbox,
  useConversation,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
  useUpdateConversation,
} from '@/src/api/hooks/messaging';
import { useUid } from '@/src/api/hooks/useUid';
import type { ConversationParticipant, ConversationSummary } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { rateableInteractions } from '@/src/features/collectors/ratingLabels';
import { threadMessages } from '@/src/features/messages/conversationCache';
import { MessageComposer } from '@/src/features/messages/MessageComposer';
import {
  draftProblem,
  sendErrorMessage,
  type MessageDraft,
} from '@/src/features/messages/messageDraft';
import {
  ThreadHeader,
  ThreadMenuButton,
  type ThreadMenuAction,
} from '@/src/features/messages/ThreadHeader';
import {
  useOtherTyping,
  useSendTyping,
  useThreadVisible,
} from '@/src/features/messages/threadHooks';
import { ThreadMessageList } from '@/src/features/messages/ThreadMessageList';
import { ratingParams } from '@/src/features/ratings/ratingRoutes';
import { reportParams } from '@/src/features/reports/reportLabels';
import { TradingSafetyNotice } from '@/src/features/safety/TradingSafetyNotice';
import { useKeyboardOverlap } from '@/src/hooks/useKeyboardOverlap';
import { spacing, textStyle, useTheme } from '@/src/theme';

/** Header-less fallback while the conversation summary cannot be read. */
const UNKNOWN_PARTICIPANT: ConversationParticipant = {
  id: '',
  handle: '',
  displayName: 'this collector',
  onlineStatus: 'HIDDEN',
};

/**
 * One conversation (the web's `/messages/:id` thread view): the header with the conversation
 * options (mute, archive, rate the collector when an interaction can still be rated, block /
 * unblock with confirmation, report the collector), the history (day separators, links to cards,
 * binders and offers, photos, "Sent" / "Seen", "… is typing", older pages on scroll) and the
 * composer (text, card, binder or offer link, photo). Live over realtime; the newest message is
 * marked read while the thread is on screen. Refusals (403 `MESSAGING_BLOCKED`, 413 / 415 photos,
 * 422 `MESSAGE_BLOCKED`, 429) are explained under the composer. The dismissible trading safety
 * notice sits under the header until dismissed (never over the composer; hidden once the thread
 * is blocked).
 */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = id ?? '';
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const uid = useUid();
  const { ref: rootRef, overlap: keyboardOverlap, onLayout: onRootLayout } = useKeyboardOverlap();
  const selfId = useAccount().me?.id ?? null;
  const conversation = useConversation(id);
  const messages = useMessages(id);
  const send = useSendMessage(conversationId, selfId);
  const markRead = useMarkConversationRead(conversationId);
  const update = useUpdateConversation();
  const block = useBlockUser();
  const unblock = useUnblockUser();
  const visible = useThreadVisible(id ?? null);
  const typing = useOtherTyping(id ?? null, selfId);
  const sendTyping = useSendTyping(id ?? null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [messagingBlocked, setMessagingBlocked] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const summary = conversation.data ?? null;
  const other = summary?.other ?? null;
  // "Rate …" is offered silently: nothing without an answer (the API refuses anyway).
  const eligibility = useRatingEligibility(other?.id);
  const canRate = rateableInteractions(eligibility.data).length > 0;
  const all = useMemo(() => threadMessages(messages.data), [messages.data]);
  const unavailable =
    !messages.data && (messages.error?.status === 404 || messages.error?.status === 403);

  // Read marker: the newest message, while the thread is on screen (web: `ThreadStore.markRead`).
  const lastMarked = useRef<string | null>(null);
  const markReadMutate = markRead.mutate;
  const unreadCount = summary?.unreadCount ?? 0;
  useEffect(() => {
    const newest = all.at(-1);
    if (!visible || !newest || newest.id === lastMarked.current) {
      return;
    }
    const fromOther = !!newest.senderId && newest.senderId !== selfId;
    if (!fromOther && unreadCount === 0) {
      return;
    }
    lastMarked.current = newest.id;
    markReadMutate(
      { lastReadMessageId: newest.id },
      {
        onError: () => {
          lastMarked.current = null;
        },
      }
    );
  }, [all, markReadMutate, selfId, unreadCount, visible]);

  const onSend = async (draft: MessageDraft): Promise<boolean> => {
    const problem = draftProblem(draft);
    if (problem) {
      setSendError(problem);
      return false;
    }
    setSendError(null);
    try {
      await send.mutateAsync(draft);
      return true;
    } catch (error) {
      const apiError = isApiError(error) ? error : null;
      if (apiError?.errorCode === 'MESSAGING_BLOCKED') {
        setMessagingBlocked(true);
      }
      setSendError(apiError ? sendErrorMessage(apiError) : 'Message not sent. Please try again.');
      return false;
    }
  };

  const changeConversation = async (
    target: ConversationSummary,
    changes: { muted?: boolean; archived?: boolean },
    confirmation: string
  ): Promise<boolean> => {
    try {
      await update.mutateAsync({ id: target.id, changes });
      snackbar.show(confirmation);
      return true;
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error', duration: 6000 });
      return false;
    }
  };

  const onAction = async (action: ThreadMenuAction) => {
    setMenuOpen(false);
    if (!summary) {
      return;
    }
    const name = summary.other.displayName;
    switch (action) {
      case 'mute':
      case 'unmute':
        await changeConversation(
          summary,
          { muted: action === 'mute' },
          action === 'mute' ? 'Conversation muted.' : 'Conversation unmuted.'
        );
        break;
      case 'archive':
        if (
          await changeConversation(
            summary,
            { archived: true },
            'Conversation archived. A new message brings it back.'
          )
        ) {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/messages');
          }
        }
        break;
      case 'block':
        setConfirmBlock(true);
        break;
      case 'report':
        router.push({
          pathname: '/report',
          params: reportParams(summary.other, {
            source: 'CONVERSATION',
            conversationId: summary.id,
          }),
        });
        break;
      case 'rate':
        router.push({ pathname: '/ratings/rate', params: ratingParams(summary.other) });
        break;
      case 'unblock':
        try {
          await unblock.mutateAsync({ id: summary.other.id });
          snackbar.show(`${name} is unblocked.`);
          setBlockedByMe(false);
          setMessagingBlocked(false);
          setSendError(null);
          restoreToInbox(queryClient, uid, summary);
          void messages.refetch();
        } catch (error) {
          snackbar.show(friendlyMessage(error as ApiError), { tone: 'error', duration: 6000 });
        }
        break;
    }
  };

  const confirmBlocking = async () => {
    if (!summary) {
      return;
    }
    try {
      await block.mutateAsync({ id: summary.other.id });
      setConfirmBlock(false);
      snackbar.show(`${summary.other.displayName} is blocked.`);
      setBlockedByMe(true);
      setMessagingBlocked(true);
      removeFromInbox(queryClient, uid, summary.id);
    } catch (error) {
      setConfirmBlock(false);
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error', duration: 6000 });
    }
  };

  const cannotSend = blockedByMe || messagingBlocked || unavailable;
  const name = other?.displayName ?? 'this collector';

  let body;
  if (!messages.data) {
    if (unavailable) {
      body = (
        <EmptyState
          testID="conversation-not-found"
          icon="message-off-outline"
          title="This conversation is not available"
          description="It may be hidden because of a block, or the collector left OrenjiTrade."
          actionLabel="Back to messages"
          onAction={() => router.navigate('/messages')}
        />
      );
    } else if (messages.error) {
      body = (
        <ErrorState
          testID="conversation-error"
          error={messages.error}
          title="Messages could not load"
          onRetry={() => void messages.refetch()}
        />
      );
    } else {
      body = (
        <View
          style={styles.skeleton}
          testID="conversation-loading"
          accessibilityLabel="Loading messages"
          aria-busy
        >
          <Skeleton width="55%" height={40} />
          <Skeleton width="45%" height={40} style={styles.ownSkeleton} />
          <Skeleton width="62%" height={56} />
          <Skeleton width="38%" height={40} style={styles.ownSkeleton} />
        </View>
      );
    }
  } else if (all.length === 0) {
    body = (
      <EmptyState
        testID="conversation-empty"
        icon="hand-wave-outline"
        title={`Say hello to ${name}`}
        description="Ask about a card, share one from the catalog or one of your public binders. Meetup details always stay private between the two of you."
      />
    );
  } else {
    body = (
      <ThreadMessageList
        messages={all}
        other={other ?? UNKNOWN_PARTICIPANT}
        selfId={selfId}
        hasOlder={!!messages.hasNextPage}
        loadingOlder={messages.isFetchingNextPage}
        olderFailed={messages.isFetchNextPageError}
        typing={typing}
        onLoadOlder={() => void messages.fetchNextPage()}
      />
    );
  }

  return (
    <View
      ref={rootRef}
      onLayout={onRootLayout}
      testID="screen-conversation"
      style={[styles.fill, { backgroundColor: palette.background }]}
    >
      <Stack.Screen
        options={{
          title: other?.displayName ?? 'Conversation',
          headerRight: other
            ? () => <ThreadMenuButton name={other.displayName} onPress={() => setMenuOpen(true)} />
            : undefined,
        }}
      />
      {summary ? (
        <ThreadHeader
          conversation={summary}
          typing={typing}
          blocked={blockedByMe}
          canRate={canRate}
          menuOpen={menuOpen}
          onCloseMenu={() => setMenuOpen(false)}
          onProfile={() =>
            router.push({ pathname: '/collectors/[id]', params: { id: summary.other.handle } })
          }
          onAction={(action) => void onAction(action)}
        />
      ) : null}
      {summary && !blockedByMe ? (
        <View style={styles.notice}>
          <TradingSafetyNotice
            context="conversation"
            otherName={summary.other.displayName}
            onReport={() => void onAction('report')}
            onBlock={() => setConfirmBlock(true)}
          />
        </View>
      ) : null}
      {blockedByMe ? (
        <View
          testID="conversation-blocked-banner"
          accessibilityRole="summary"
          style={[styles.banner, { backgroundColor: palette.primaryContainer }]}
        >
          <MaterialCommunityIcons name="cancel" size={20} color={palette.onPrimaryContainer} />
          <Text style={[textStyle('sm'), styles.grow, { color: palette.onPrimaryContainer }]}>
            You blocked {name}. Neither of you can send messages and this conversation is hidden
            from your inbox.
          </Text>
          <Button
            label="Unblock"
            variant="ghost"
            onPress={() => void onAction('unblock')}
            loading={unblock.isPending}
            testID="conversation-banner-unblock"
          />
        </View>
      ) : messagingBlocked ? (
        <View
          testID="conversation-cannot-message"
          accessibilityRole="summary"
          style={[styles.banner, { backgroundColor: palette.surfaceVariant }]}
        >
          <MaterialCommunityIcons name="message-off-outline" size={20} color={palette.textMuted} />
          <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
            You can no longer message {name}.
          </Text>
        </View>
      ) : null}
      <View style={styles.fill}>{body}</View>
      <View
        style={[
          styles.composer,
          {
            borderTopColor: palette.border,
            backgroundColor: palette.surface,
            paddingBottom: (keyboardOverlap > 0 ? keyboardOverlap : insets.bottom) + spacing[2],
          },
        ]}
      >
        <MessageComposer
          busy={send.isPending}
          disabled={cannotSend || !messages.data}
          error={sendError}
          placeholder={cannotSend ? `You cannot message ${name}` : `Message ${name}`}
          onSend={onSend}
          onTyping={sendTyping}
          onDismissError={() => setSendError(null)}
          otherId={other?.id ?? null}
          otherName={name}
        />
      </View>
      <ConfirmDialog
        visible={confirmBlock}
        title={`Block ${name}?`}
        message="You will stop seeing each other on the map, in search and in the community, and neither of you can send messages. They are not told. You can unblock them from this conversation or from Settings → Blocked users."
        confirmLabel="Block"
        tone="danger"
        busy={block.isPending}
        onConfirm={() => void confirmBlocking()}
        onCancel={() => setConfirmBlock(false)}
        testID="block-dialog"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  skeleton: { padding: spacing[4], gap: spacing[3] },
  ownSkeleton: { alignSelf: 'flex-end' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  notice: { paddingHorizontal: spacing[3], paddingTop: spacing[2] },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
  },
});
