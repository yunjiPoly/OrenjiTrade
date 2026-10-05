import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '@/src/account/AccountProvider';
import { isApiError } from '@/src/api/ApiError';
import { friendlyError } from '@/src/api/errorMessages';
import {
  MESSAGE_MAX_LENGTH,
  useConversation,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
} from '@/src/api/hooks/messaging';
import type { MessageResponse } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { TextField } from '@/src/components/ui/TextField';
import { useKeyboardHeight } from '@/src/hooks/useKeyboardHeight';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * A conversation with another collector (the web's `/messages/:id` thread, minimal for now: the
 * mobile Messages stage adds the inbox, realtime, photos and links): the messages, newest at the
 * bottom with older pages on scroll, a text composer, read markers. Opened from "Message" on the
 * map preview or a profile (`POST /conversations`). Refusals (403 `MESSAGING_BLOCKED`, 422
 * `MESSAGE_BLOCKED`, 429) are explained under the composer.
 */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const selfId = useAccount().me?.id ?? null;
  const conversation = useConversation(id);
  const messages = useMessages(id);
  const send = useSendMessage(id ?? '');
  const markRead = useMarkConversationRead(id ?? '');
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const other = conversation.data?.other ?? null;

  const items = useMemo(
    () => messages.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [messages.data]
  );

  // Read marker: the newest message of the other collector, once.
  const lastMarked = useRef<string | null>(null);
  const markReadMutate = markRead.mutate;
  useEffect(() => {
    const newest = items.find((message) => message.senderId && message.senderId !== selfId);
    if (newest && newest.id !== lastMarked.current) {
      lastMarked.current = newest.id;
      markReadMutate({ lastReadMessageId: newest.id });
    }
  }, [items, selfId, markReadMutate]);

  const body = text.trim();
  const submit = async () => {
    if (!body || send.isPending) {
      return;
    }
    setSendError(null);
    try {
      await send.mutateAsync({ body });
      setText('');
    } catch (error) {
      const friendly = isApiError(error)
        ? friendlyError(error)
        : { title: 'Message not sent', message: 'Please try again.' };
      setSendError(`${friendly.title}. ${friendly.message}`);
    }
  };

  let content;
  if (!messages.data) {
    if (messages.error?.status === 404 || messages.error?.status === 403) {
      content = (
        <EmptyState
          testID="conversation-not-found"
          icon="message-off-outline"
          title="This conversation is not available"
          description="It does not exist, or a block now hides it."
          actionLabel="Back to the map"
          onAction={() => router.navigate('/')}
        />
      );
    } else if (messages.error) {
      content = (
        <ErrorState
          testID="conversation-error"
          error={messages.error}
          title="Messages could not load"
          onRetry={() => void messages.refetch()}
        />
      );
    } else {
      content = (
        <View style={styles.padded}>
          <SkeletonList rows={4} rowHeight={48} testID="conversation-loading" />
        </View>
      );
    }
  } else {
    content = (
      <FlatList
        testID="conversation-messages"
        inverted={items.length > 0}
        data={items}
        keyExtractor={(message) => message.id}
        renderItem={({ item }) => <Bubble message={item} mine={item.senderId === selfId} />}
        contentContainerStyle={styles.messages}
        onEndReached={() => {
          if (messages.hasNextPage && !messages.isFetchingNextPage) {
            void messages.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          <ListFooter
            loading={messages.isFetchingNextPage}
            failed={messages.isFetchNextPageError}
            onRetry={() => void messages.fetchNextPage()}
          />
        }
        ListEmptyComponent={
          <EmptyState
            testID="conversation-empty"
            icon="message-text-outline"
            title="No messages yet"
            description={`Say hello${other ? ` to ${other.displayName}` : ''}. Meetup details always stay private between the two of you.`}
          />
        }
      />
    );
  }

  return (
    <View
      testID="screen-conversation"
      style={[styles.fill, { backgroundColor: palette.background }]}
    >
      <Stack.Screen options={{ title: other?.displayName ?? 'Conversation' }} />
      {other ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`View the profile of ${other.displayName}`}
          onPress={() =>
            router.push({ pathname: '/collectors/[id]', params: { id: other.handle } })
          }
          testID="conversation-profile"
          style={[styles.header, { borderBottomColor: palette.border }]}
        >
          <Avatar src={other.avatarUrl} name={other.displayName} size={36} />
          <View style={styles.grow}>
            <Text style={[textStyle('md'), styles.strong, { color: palette.ink }]}>
              {other.displayName}
            </Text>
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              @{other.handle} · View profile
            </Text>
          </View>
        </Pressable>
      ) : null}
      <View style={styles.fill}>{content}</View>
      <View
        style={[
          styles.composer,
          {
            borderTopColor: palette.border,
            backgroundColor: palette.surface,
            paddingBottom: (keyboard > 0 ? keyboard : insets.bottom) + spacing[2],
          },
        ]}
      >
        {sendError ? (
          <FormMessage tone="error" testID="conversation-send-error">
            {sendError}
          </FormMessage>
        ) : null}
        <View style={styles.composerRow}>
          <TextField
            label="Message"
            value={text}
            onChangeText={(value) => {
              setText(value);
              setSendError(null);
            }}
            multiline
            maxLength={MESSAGE_MAX_LENGTH}
            containerStyle={styles.grow}
            testID="conversation-input"
          />
          <Button
            label="Send"
            icon="send"
            onPress={() => void submit()}
            disabled={!body || !messages.data}
            loading={send.isPending}
            loadingLabel="Sending…"
            testID="conversation-send"
          />
        </View>
      </View>
    </View>
  );
}

function Bubble({ message, mine }: { message: MessageResponse; mine: boolean }) {
  const { palette } = useTheme();
  const router = useRouter();
  const card = message.payload?.card;
  const binder = message.payload?.binder;
  let text = message.body;
  let onPress: (() => void) | undefined;
  if (message.moderationState === 'REMOVED') {
    text = 'This message was removed.';
  } else if (message.kind === 'CARD_LINK' && card) {
    text = `Card: ${card.name}${card.printingCode ? ` (${card.printingCode})` : ''}${message.body ? `\n${message.body}` : ''}`;
    onPress = () => router.push({ pathname: '/cards/[id]', params: { id: card.cardId } });
  } else if (message.kind === 'BINDER_LINK' && binder) {
    text = `Binder: ${binder.name}${message.body ? `\n${message.body}` : ''}`;
    onPress = () => router.push({ pathname: '/binders/[id]', params: { id: binder.id } });
  } else if (message.kind === 'IMAGE') {
    text = `Photo${message.body ? `: ${message.body}` : ''} (open it on the website for now)`;
  } else if (message.kind === 'OFFER_LINK') {
    text = `Offer${message.body ? `: ${message.body}` : ''}`;
  }
  if (message.kind === 'SYSTEM') {
    return (
      <Text style={[textStyle('xs'), styles.system, { color: palette.textMuted }]}>{text}</Text>
    );
  }
  const bubble = (
    <View
      testID={`message-${message.id}`}
      style={[
        styles.bubble,
        mine
          ? { alignSelf: 'flex-end', backgroundColor: palette.primaryContainer }
          : { alignSelf: 'flex-start', backgroundColor: palette.surfaceVariant },
      ]}
    >
      <Text
        style={[
          textStyle('md'),
          { color: mine ? palette.onPrimaryContainer : palette.ink },
          onPress ? styles.link : null,
        ]}
      >
        {text}
      </Text>
      <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
        {relativeTime(message.createdAt)}
        {mine ? (message.readByOther ? ' · Seen' : ' · Sent') : ''}
      </Text>
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="link" onPress={onPress}>
      {bubble}
    </Pressable>
  ) : (
    bubble
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  strong: { fontWeight: fontWeight.semibold },
  padded: { padding: spacing[4] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  messages: { padding: spacing[4], gap: spacing[2], flexGrow: 1 },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: 2,
  },
  link: { textDecorationLine: 'underline' },
  system: { textAlign: 'center', fontStyle: 'italic' },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    gap: spacing[2],
  },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2] },
});
