import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useConversations } from '@/src/api/hooks/messaging';
import type { ConversationSummary } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, spacing, useTheme } from '@/src/theme';
import { HandleText } from '@/src/components/ui/HandleText';

import { INBOX_COPY } from './chatCopy';
import { inboxConversations } from './conversationCache';
import { inboxTime } from './dealRules';
import { listPreview } from './messageText';
import { SubjectThumb } from './SubjectThumb';

/** Accessible name of an inbox row (web: `ConversationListComponent.rowLabel`). */
export function rowLabel(conversation: ConversationSummary, selfId: string | null): string {
  const parts = [conversation.other.handle];
  if (conversation.other.onlineStatus === 'ONLINE') {
    parts.push('online');
  }
  if (conversation.unreadCount > 0) {
    parts.push(
      `${conversation.unreadCount} unread ${conversation.unreadCount === 1 ? 'message' : 'messages'}`
    );
  }
  if (conversation.muted) {
    parts.push('muted');
  }
  parts.push(listPreview(conversation, selfId));
  if (conversation.subject) {
    parts.push(INBOX_COPY.about(conversation.subject.name));
  }
  return parts.join(', ');
}

function ConversationRow({
  conversation,
  selfId,
  onPress,
}: {
  conversation: ConversationSummary;
  selfId: string | null;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const unread = conversation.unreadCount > 0;
  const handle = conversation.other.handle;
  // One line each as in the mockup. At large text sizes the time goes under the handle, which
  // gives the handle the width of the row and up to three lines, and the last message two lines
  // (side by side, the handle was cut after a few letters).
  const large = useWindowDimensions().fontScale > 1.3;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rowLabel(conversation, selfId)}
      onPress={onPress}
      testID={`conversation-row-${handle}`}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <View>
        <Avatar
          src={conversation.other.avatarUrl}
          name={conversation.other.displayName}
          size={48}
        />
        {conversation.other.onlineStatus === 'ONLINE' ? (
          <View
            style={[
              styles.online,
              { backgroundColor: palette.online.online, borderColor: palette.background },
            ]}
          />
        ) : null}
      </View>
      <View style={styles.main}>
        <View style={large ? styles.topLarge : styles.top}>
          <HandleText style={[styles.handle, large && styles.handleLarge, { color: palette.ink }]}>
            {handle}
          </HandleText>
          <Text
            testID={`conversation-time-${handle}`}
            style={[styles.time, { color: unread ? palette.primary : palette.textMuted }]}
          >
            {inboxTime(conversation.lastMessage?.createdAt ?? conversation.createdAt)}
          </Text>
        </View>
        <View style={styles.bottom}>
          <Text
            numberOfLines={large ? 2 : 1}
            testID={`conversation-preview-${handle}`}
            style={[
              styles.preview,
              unread && styles.previewUnread,
              { color: unread ? palette.ink : palette.textMuted },
            ]}
          >
            {listPreview(conversation, selfId)}
          </Text>
          {conversation.muted ? (
            <MaterialCommunityIcons
              name="bell-off-outline"
              size={15}
              color={palette.textMuted}
              testID={`conversation-muted-${handle}`}
            />
          ) : null}
          {unread ? (
            <View
              testID={`unread-badge-${handle}`}
              style={[styles.unreadDot, { backgroundColor: palette.primary }]}
            />
          ) : null}
        </View>
      </View>
      {conversation.subject ? (
        <SubjectThumb subject={conversation.subject} testID={`conversation-subject-${handle}`} />
      ) : null}
    </Pressable>
  );
}

/**
 * The inbox (owner spec 2026-10-14, section 10, mockup screen 22): avatar with the online dot, the
 * handle, the time ("2 min", "1 h", "Yesterday", "Mon", "Sep 28"), the last message ("You: " before
 * the caller's, a sale worded for the reader) and, on the right, the picture of the card or deck
 * core the chat is about. Unread chats: bold text, an orange time and an orange dot; muted ones
 * keep the muted icon. Older pages on scroll, pull to refresh; skeleton, empty and error states.
 */
export function InboxView() {
  const router = useRouter();
  const selfId = useAccount().me?.id ?? null;
  const inbox = useConversations();
  const conversations = useMemo(() => inboxConversations(inbox.data), [inbox.data]);

  if (!inbox.data) {
    if (inbox.error) {
      return (
        <ErrorState
          testID="inbox-error"
          error={inbox.error}
          title={INBOX_COPY.loadError}
          onRetry={() => void inbox.refetch()}
        />
      );
    }
    return (
      <View style={styles.padded} accessibilityLabel="Loading conversations" aria-busy>
        <SkeletonList rows={5} rowHeight={64} testID="inbox-loading" />
      </View>
    );
  }

  return (
    <FlatList
      testID="inbox-list"
      accessibilityLabel="Conversations"
      data={conversations}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <ConversationRow
          conversation={item}
          selfId={selfId}
          onPress={() => router.push({ pathname: '/messages/[id]', params: { id: item.id } })}
        />
      )}
      refreshControl={
        <RefreshControl
          refreshing={inbox.isRefetching && !inbox.isFetchingNextPage}
          onRefresh={() => void inbox.refetch()}
        />
      }
      onEndReached={() => {
        if (inbox.hasNextPage && !inbox.isFetchingNextPage && !inbox.isFetchNextPageError) {
          void inbox.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.4}
      ListFooterComponent={
        <ListFooter
          loading={inbox.isFetchingNextPage}
          failed={inbox.isFetchNextPageError}
          onRetry={() => void inbox.fetchNextPage()}
          testID="inbox-footer"
        />
      }
      ListEmptyComponent={
        <EmptyState
          testID="inbox-empty"
          icon="forum-outline"
          title={INBOX_COPY.emptyTitle}
          description={INBOX_COPY.empty}
          actionLabel={INBOX_COPY.emptyAction}
          onAction={() => router.navigate('/search')}
        />
      }
      contentContainerStyle={conversations.length === 0 ? styles.emptyContent : undefined}
    />
  );
}

const styles = StyleSheet.create({
  padded: { padding: spacing[4] },
  emptyContent: { flexGrow: 1, justifyContent: 'center', padding: spacing[4] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 76,
    paddingHorizontal: spacing[4],
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  online: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  main: { flex: 1, minWidth: 0, gap: 3 },
  top: { flexDirection: 'row', alignItems: 'baseline', gap: spacing[2] },
  topLarge: { gap: 2 },
  handle: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  handleLarge: { flex: 0 },
  time: { fontSize: 12, lineHeight: 16 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  preview: { flex: 1, fontSize: 13, lineHeight: 18 },
  previewUnread: { fontWeight: fontWeight.semibold },
  unreadDot: { width: 9, height: 9, borderRadius: 5 },
  pressed: { opacity: 0.8 },
});
