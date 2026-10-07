import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { ConversationParticipant, MessageResponse } from '@/src/api/types';
import { ListFooter } from '@/src/components/ui/ListFooter';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

import { MessageBubble } from './MessageBubble';
import { buildThreadItems, type ThreadItem } from './threadItems';

export interface ThreadMessageListProps {
  /** Oldest first. */
  messages: readonly MessageResponse[];
  other: ConversationParticipant;
  selfId: string | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  olderFailed: boolean;
  typing: boolean;
  onLoadOlder: () => void;
}

/**
 * The message history (the web's `app-message-list`): day separators, sender groups, "Sent" /
 * "Seen" under the caller's newest message and the typing indicator, newest at the bottom
 * (inverted list); scrolling up loads older pages. Announced politely to screen readers.
 */
export function ThreadMessageList({
  messages,
  other,
  selfId,
  hasOlder,
  loadingOlder,
  olderFailed,
  typing,
  onLoadOlder,
}: ThreadMessageListProps) {
  const { palette } = useTheme();
  // Inverted list: the newest item first.
  const items = useMemo(() => buildThreadItems(messages, selfId).reverse(), [messages, selfId]);

  const renderItem = ({ item }: { item: ThreadItem }) => {
    if (item.kind === 'day') {
      return (
        <View accessibilityRole="header" style={styles.day}>
          <Text style={[textStyle('xs'), styles.dayText, { color: palette.textMuted }]}>
            {item.label}
          </Text>
        </View>
      );
    }
    return (
      <View style={item.firstOfGroup ? styles.groupStart : null}>
        <MessageBubble message={item.message} own={item.own} showTime={item.lastOfGroup} />
        {item.status ? (
          <Text
            testID={`receipt-${item.status}`}
            style={[textStyle('xs'), styles.receipt, { color: palette.textMuted }]}
          >
            {item.status === 'seen' ? 'Seen' : 'Sent'}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <FlatList
      testID="conversation-messages"
      accessibilityLabel={`Messages with ${other.displayName}`}
      accessibilityLiveRegion="polite"
      inverted
      data={items}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      onEndReached={() => {
        if (hasOlder && !loadingOlder && !olderFailed) {
          onLoadOlder();
        }
      }}
      onEndReachedThreshold={0.3}
      // Inverted: the header sits at the bottom (typing), the footer at the top (older pages).
      ListHeaderComponent={
        typing ? (
          <Text
            testID="typing-indicator"
            style={[textStyle('sm'), styles.typing, { color: palette.textMuted }]}
          >
            {other.displayName} is typing…
          </Text>
        ) : undefined
      }
      ListFooterComponent={
        hasOlder ? (
          <ListFooter
            loading={loadingOlder}
            failed={olderFailed}
            onRetry={onLoadOlder}
            testID="conversation-older"
          />
        ) : (
          <Text
            testID="conversation-start"
            style={[textStyle('xs'), styles.start, { color: palette.textMuted }]}
          >
            This is the beginning of your conversation with {other.displayName}.
          </Text>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing[3], paddingVertical: spacing[3], gap: spacing[1] },
  groupStart: { marginTop: spacing[2] },
  day: { alignItems: 'center', marginVertical: spacing[2] },
  dayText: { fontWeight: fontWeight.semibold },
  receipt: { alignSelf: 'flex-end', marginTop: 2 },
  typing: { fontStyle: 'italic', marginTop: spacing[1] },
  start: { textAlign: 'center', marginBottom: spacing[3] },
});
