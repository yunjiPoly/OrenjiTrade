import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '@/src/account/AccountProvider';
import { isApiError, type ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useBlockUser, useUnblockUser } from '@/src/api/hooks/blocks';
import {
  removeFromInbox,
  restoreToInbox,
  useConversation,
  useMarkConversationRead,
  useMarkSold,
  useMessages,
  useSendMessage,
  useUndoSale,
  useUpdateConversation,
} from '@/src/api/hooks/messaging';
import { useRatingEligibility } from '@/src/api/hooks/ratings';
import { useUid } from '@/src/api/hooks/useUid';
import type {
  ConversationParticipant,
  ConversationSubject,
  ConversationSummary,
} from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { rateableInteractions } from '@/src/features/collectors/ratingLabels';
import { CHAT_COPY, COMPOSER_COPY, MARK_SOLD_COPY } from '@/src/features/messages/chatCopy';
import { threadMessages } from '@/src/features/messages/conversationCache';
import { chatSide, quickReplies } from '@/src/features/messages/dealRules';
import { MarkSoldSheet } from '@/src/features/messages/MarkSoldSheet';
import { MessageComposer } from '@/src/features/messages/MessageComposer';
import {
  draftProblem,
  sendErrorMessage,
  type MessageDraft,
} from '@/src/features/messages/messageDraft';
import { PinnedBar } from '@/src/features/messages/PinnedBar';
import { ThreadHeader, type ThreadMenuAction } from '@/src/features/messages/ThreadHeader';
import {
  useOtherTyping,
  useSendTyping,
  useThreadVisible,
} from '@/src/features/messages/threadHooks';
import { ThreadMessageList } from '@/src/features/messages/ThreadMessageList';
import { ratingParams } from '@/src/features/ratings/ratingRoutes';
import { reportParams } from '@/src/features/reports/reportLabels';
import { ChatSafetyTip } from '@/src/features/safety/ChatSafetyTip';
import { useKeyboardOverlap } from '@/src/hooks/useKeyboardOverlap';
import { spacing, useTheme } from '@/src/theme';

/** Header-less fallback while the conversation summary cannot be read. */
const UNKNOWN_PARTICIPANT: ConversationParticipant = {
  id: '',
  handle: 'this collector',
  displayName: 'this collector',
  onlineStatus: 'HIDDEN',
};

/** Why Mark as sold or its undo was refused, in the chat's words. */
function saleErrorMessage(error: unknown, handle: string): string {
  if (!isApiError(error)) {
    return 'Something went wrong. Please try again.';
  }
  switch (error.errorCode) {
    case 'NOTHING_LEFT_TO_SELL':
      return MARK_SOLD_COPY.nothingLeft;
    case 'SALE_UNDO_CLOSED':
      return MARK_SOLD_COPY.undoClosed;
    case 'SALE_ALREADY_RATED':
      return MARK_SOLD_COPY.undoRated;
    case 'SUBJECT_CHANGED':
      return MARK_SOLD_COPY.subjectChanged(handle);
    case 'VALIDATION_FAILED':
      return error.message || friendlyMessage(error);
    default:
      return friendlyMessage(error);
  }
}

/**
 * A chat (owner spec 2026-10-14, section 10, mockup screens 23 and 24; deals ship by mail and
 * payment stays outside the app, ADR 0018): the top bar (back, the other collector's handle and
 * "Online · {province}", "⋯" with Rate, Mute, Archive, Report and Block); the pinned bar of the card
 * or deck core the chat is about (buying: its price, it opens the card or deck core page; selling:
 * "your card" and "Mark as sold"; "Sold" after a sale); the safety tip of the reader's side at the
 * start; the bubbles (day separators, times, shared cards with their price, photos, the sale
 * message worded per side, old offers as a grey line); the quick replies; the message box with
 * its "+" sheet (the saved address or e-Transfer email, a photo, a card from the inventory, a
 * binder). Mark as sold opens its sheet, then the toast "Marked as sold" with Undo. Live over
 * realtime; the newest message is marked read while the chat is on screen.
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
  const markSold = useMarkSold(conversationId);
  const undoSale = useUndoSale();
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
  const [selling, setSelling] = useState(false);
  // What the Mark as sold sheet shows, kept from the moment it opened: the sale names it, and the
  // server refuses it once the chat is about something else (review fix 1, F1).
  const [saleSubject, setSaleSubject] = useState<ConversationSubject | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  const summary = conversation.data ?? null;
  const other = summary?.other ?? null;
  const handle = other?.handle ?? UNKNOWN_PARTICIPANT.handle;
  const subject = summary?.subject ?? null;
  const side = chatSide(subject, selfId);
  // "Rate …" is offered silently: nothing without an answer (the API refuses anyway).
  const eligibility = useRatingEligibility(other?.id);
  const canRate = rateableInteractions(eligibility.data).length > 0;
  const all = useMemo(() => threadMessages(messages.data), [messages.data]);
  const replies = useMemo(
    () => quickReplies(side, all, selfId, other?.id ?? null),
    [all, other?.id, selfId, side]
  );
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
    const fromOther = newest.senderId !== selfId;
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

  const back = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/messages');
    }
  };

  const onSend = async (draft: MessageDraft): Promise<boolean> => {
    const problem = draftProblem(draft);
    if (problem) {
      setSendError(problem);
      return false;
    }
    setSendError(null);
    try {
      await send.mutateAsync(draft);
      if (draft.attachment?.kind === 'item') {
        // The card shared becomes what the chat is about.
        void conversation.refetch();
      }
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

  const rate = () => {
    if (other) {
      router.push({ pathname: '/ratings/rate', params: ratingParams(other) });
    }
  };

  const rateSale = () => {
    if (other) {
      router.push({ pathname: '/ratings/rate', params: ratingParams(other, { kind: 'SALE' }) });
    }
  };

  const onAction = async (action: ThreadMenuAction) => {
    setMenuOpen(false);
    if (!summary) {
      return;
    }
    const name = summary.other.handle;
    switch (action) {
      case 'mute':
      case 'unmute':
        await changeConversation(
          summary,
          { muted: action === 'mute' },
          action === 'mute' ? CHAT_COPY.mutedToast : CHAT_COPY.unmutedToast
        );
        break;
      case 'archive':
        if (await changeConversation(summary, { archived: true }, CHAT_COPY.archivedToast)) {
          back();
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
        rate();
        break;
      case 'unblock':
        try {
          await unblock.mutateAsync({ id: summary.other.id });
          snackbar.show(CHAT_COPY.unblockedToast(name));
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
      snackbar.show(CHAT_COPY.blockedToast(summary.other.handle));
      setBlockedByMe(true);
      setMessagingBlocked(true);
      removeFromInbox(queryClient, uid, summary.id);
    } catch (error) {
      setConfirmBlock(false);
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error', duration: 6000 });
    }
  };

  const undo = async (saleId: string) => {
    try {
      await undoSale.mutateAsync({ saleId, conversationId });
      snackbar.show(MARK_SOLD_COPY.undone);
    } catch (error) {
      snackbar.show(saleErrorMessage(error, handle), { tone: 'error', duration: 6000 });
    }
  };

  const confirmSale = async (sale: { quantity: number; trackingNumber: string | null }) => {
    const shown = saleSubject ?? subject;
    if (!shown) {
      return;
    }
    setSaleError(null);
    try {
      const created = await markSold.mutateAsync({
        quantity: sale.quantity,
        ...(sale.trackingNumber ? { trackingNumber: sale.trackingNumber } : {}),
        ...(shown.kind === 'DECK_CORE'
          ? { subjectBinderId: shown.id }
          : { subjectItemId: shown.id }),
      });
      setSelling(false);
      snackbar.show(MARK_SOLD_COPY.toast, {
        icon: 'success',
        action: {
          label: MARK_SOLD_COPY.undo,
          onPress: () => void undo(created.id),
          testID: 'mark-sold-undo',
        },
      });
    } catch (error) {
      if (isApiError(error) && error.errorCode === 'SUBJECT_CHANGED') {
        // The buyer pinned another listing: the bar shows it once read again.
        setSelling(false);
        void conversation.refetch();
        snackbar.show(saleErrorMessage(error, handle), { tone: 'error', duration: 6000 });
        return;
      }
      setSaleError(saleErrorMessage(error, handle));
    }
  };

  const openSubject = () => {
    if (!subject) {
      return;
    }
    if (subject.kind === 'DECK_CORE') {
      router.push({ pathname: '/binders/[id]', params: { id: subject.id } });
    } else if (subject.cardId) {
      router.push({
        pathname: '/cards/[id]',
        params: subject.printingId
          ? { id: subject.cardId, printing: subject.printingId }
          : { id: subject.cardId },
      });
    }
  };

  const cannotSend = blockedByMe || messagingBlocked || unavailable;
  const tip = blockedByMe ? null : <ChatSafetyTip side={side} />;

  let body;
  if (!messages.data) {
    if (unavailable) {
      body = (
        <EmptyState
          testID="conversation-not-found"
          icon="message-off-outline"
          title={CHAT_COPY.notFoundTitle}
          description={CHAT_COPY.notFoundBody}
          actionLabel={CHAT_COPY.notFoundAction}
          onAction={() => router.navigate('/messages')}
        />
      );
    } else if (messages.error) {
      body = (
        <ErrorState
          testID="conversation-error"
          error={messages.error}
          title={CHAT_COPY.loadError}
          onRetry={() => void messages.refetch()}
        />
      );
    } else {
      body = (
        <View
          style={styles.skeleton}
          testID="conversation-loading"
          accessibilityLabel={CHAT_COPY.loading}
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
      <View style={styles.fill}>
        {tip}
        <EmptyState
          testID="conversation-empty"
          icon="hand-wave-outline"
          title={CHAT_COPY.emptyTitle(handle)}
          description={CHAT_COPY.emptyBody}
        />
      </View>
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
        onRate={rateSale}
        start={tip}
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
      <Stack.Screen options={{ headerShown: false, title: other?.handle ?? 'Conversation' }} />
      {summary ? (
        <ThreadHeader
          conversation={summary}
          typing={typing}
          blocked={blockedByMe}
          canRate={canRate}
          menuOpen={menuOpen}
          topInset={insets.top}
          onBack={back}
          onOpenMenu={() => setMenuOpen(true)}
          onCloseMenu={() => setMenuOpen(false)}
          onProfile={() =>
            router.push({ pathname: '/collectors/[id]', params: { id: summary.other.handle } })
          }
          onAction={(action) => void onAction(action)}
        />
      ) : (
        <View style={[styles.placeholderBar, { paddingTop: insets.top }]} />
      )}
      {subject && !blockedByMe ? (
        <PinnedBar
          subject={subject}
          side={side}
          onOpen={openSubject}
          onMarkSold={() => {
            setSaleError(null);
            setSaleSubject(subject);
            setSelling(true);
          }}
        />
      ) : null}
      {blockedByMe ? (
        <View
          testID="conversation-blocked-banner"
          accessibilityRole="summary"
          style={[styles.banner, { backgroundColor: palette.primaryContainer }]}
        >
          <MaterialCommunityIcons name="cancel" size={20} color={palette.onPrimaryContainer} />
          <Text style={[styles.bannerText, { color: palette.onPrimaryContainer }]}>
            {CHAT_COPY.youBlocked(handle)}
          </Text>
          <Button
            label={CHAT_COPY.unblockAction}
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
          <Text style={[styles.bannerText, { color: palette.ink }]}>
            {CHAT_COPY.cannotMessage(handle)}
          </Text>
        </View>
      ) : null}
      <View style={styles.fill}>{body}</View>
      <View
        style={[
          styles.composer,
          {
            backgroundColor: palette.background,
            paddingBottom: (keyboardOverlap > 0 ? keyboardOverlap : insets.bottom) + spacing[2],
          },
        ]}
      >
        <MessageComposer
          busy={send.isPending}
          disabled={cannotSend || !messages.data}
          error={sendError}
          placeholder={cannotSend ? COMPOSER_COPY.cannotSend(handle) : COMPOSER_COPY.placeholder}
          side={side}
          quickReplies={replies}
          onSend={onSend}
          onTyping={sendTyping}
          onDismissError={() => setSendError(null)}
        />
      </View>
      {subject && side === 'selling' ? (
        <MarkSoldSheet
          visible={selling}
          subject={saleSubject ?? subject}
          buyer={handle}
          busy={markSold.isPending}
          error={saleError}
          onConfirm={(sale) => void confirmSale(sale)}
          onClose={() => setSelling(false)}
        />
      ) : null}
      <ConfirmDialog
        visible={confirmBlock}
        title={CHAT_COPY.blockTitle(handle)}
        message={CHAT_COPY.blockBody}
        confirmLabel={CHAT_COPY.blockConfirm}
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
  skeleton: { padding: spacing[4], gap: spacing[3] },
  ownSkeleton: { alignSelf: 'flex-end' },
  placeholderBar: { minHeight: 60 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  composer: {
    paddingHorizontal: 12,
    paddingTop: 6,
  },
});
