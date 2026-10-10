import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useConversations } from '@/src/api/hooks/messaging';
import type { ConversationSummary } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { inboxConversations } from './conversationCache';
import { badgeCount, listPreview } from './messageText';

/** Accessible name of an inbox row (web: `ConversationListComponent.rowLabel`). */
export function rowLabel(conversation: ConversationSummary, selfId: string | null): string {
  const parts = [conversation.other.displayName];
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rowLabel(conversation, selfId)}
      onPress={onPress}
      testID={`conversation-row-${conversation.other.handle}`}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: palette.border },
        unread && { backgroundColor: palette.surface },
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
        <View style={styles.top}>
          <Text
            numberOfLines={1}
            style={[
              textStyle('md'),
              styles.name,
              unread && styles.unreadName,
              { color: palette.ink },
            ]}
          >
            {conversation.other.displayName}
          </Text>
          <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
            {relativeTime(conversation.lastMessage?.createdAt ?? conversation.createdAt)}
          </Text>
        </View>
        <View style={styles.bottom}>
          <Text
            numberOfLines={1}
            testID={`conversation-preview-${conversation.other.handle}`}
            style={[
              textStyle('sm'),
              styles.preview,
              { color: unread ? palette.ink : palette.textMuted },
            ]}
          >
            {listPreview(conversation, selfId)}
          </Text>
          {conversation.muted ? (
            <MaterialCommunityIcons name="bell-off-outline" size={16} color={palette.textMuted} />
          ) : null}
          {unread ? (
            <View
              testID={`unread-badge-${conversation.other.handle}`}
              style={[styles.badge, { backgroundColor: palette.primary }]}
            >
              <Text style={[textStyle('xs'), styles.badgeText, { color: palette.onPrimary }]}>
                {badgeCount(conversation.unreadCount)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/**
 * The inbox (the web's `app-conversation-list` in the messenger): avatar with online dot, name,
 * time of the last activity, preview ("You: …" for own messages), muted icon and unread badge;
 * older pages on scroll, pull to refresh; skeleton, empty and error-with-retry states.
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
          title="Conversations could not load"
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
          title="No conversations yet"
          description="Find a card or a binder in search, open the collector's profile and press Message to start trading. Meetup details always stay private between the two of you."
          actionLabel="Open search"
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
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  online: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
  },
  main: { flex: 1, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flexShrink: 1, fontWeight: fontWeight.medium },
  unreadName: { fontWeight: fontWeight.bold },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  preview: { flex: 1 },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontWeight: fontWeight.bold },
  pressed: { opacity: 0.8 },
});
